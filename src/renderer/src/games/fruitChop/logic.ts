import type { Side, Vec2 } from '../../input/types'
import { distToSegment } from '../geometry'

/**
 * Fruit Chop rules, independent of Phaser so they can be unit-tested.
 * Units are game pixels on a 1280x720 field; time is in ms.
 *
 * Fruit is tossed up from below in waves and falls back down. Chop it with a
 * fast hand before it drops out of the bottom.
 * - Solo: 3 lives. A dropped fruit or a chopped bomb costs one. No time limit.
 * - Versus: 60 seconds on a shared field. A chopped bomb costs points.
 */
export type Phase = 'menu' | 'countdown' | 'playing' | 'paused' | 'gameover'

/** Index into FRUITS, or a bomb / a rare star fruit worth extra. */
export type ItemKind = 'fruit' | 'star' | 'bomb'

export interface FruitType {
  name: string
  r: number
  skin: number
  flesh: number
}

export const FRUITS: FruitType[] = [
  { name: 'apple', r: 50, skin: 0xd92b3a, flesh: 0xfff3d6 },
  { name: 'orange', r: 52, skin: 0xff8c1a, flesh: 0xffc266 },
  { name: 'melon', r: 68, skin: 0x2f9e44, flesh: 0xff5c6c },
  { name: 'lime', r: 44, skin: 0x7bc62d, flesh: 0xdff5a8 },
  { name: 'plum', r: 46, skin: 0x7b3fa0, flesh: 0xffd98a },
  { name: 'peach', r: 50, skin: 0xffa07a, flesh: 0xffe0a3 }
]
export const STAR_R = 40
export const BOMB_R = 48

export interface Item {
  id: number
  kind: ItemKind
  /** Index into FRUITS (fruit only). */
  type: number
  x: number
  y: number
  vx: number
  vy: number
  r: number
  /** Rotation in radians, and its speed in rad/s. */
  rot: number
  spin: number
}

/** One hand's striking point this frame, in game pixels (null when the hand is down or lost). */
export interface HandInput {
  player: number
  hand: Side
  pos: Vec2 | null
}

export interface ChopEvent {
  item: Item
  player: number
  hand: Side
  points: number
  /** Direction the hand was moving (radians), so the fruit splits along the chop. */
  angle: number
}

export interface BombEvent {
  item: Item
  player: number
  hand: Side
  /** Points lost (versus). */
  penalty: number
}

export interface ChopBonus {
  player: number
  hand: Side
  count: number
  points: number
  x: number
  y: number
}

export interface UpdateResult {
  chops: ChopEvent[]
  bombs: BombEvent[]
  /** Fruit that fell out of the bottom unchopped. */
  dropped: Item[]
  /** Several fruits in one stroke. */
  bonuses: ChopBonus[]
  /** Hands that just started a fast stroke (for a swoosh sound). */
  strokes: { player: number; hand: Side }[]
}

export const FIELD = { width: 1280, height: 720 }
export const COUNTDOWN_MS = 3_000
export const VERSUS_MS = 60_000
export const LIVES = 3
export const GRAVITY = 950
/** Radius of the blade's striking point. */
export const BLADE_RADIUS = 34
/** The hand must be at least this fast (px/s) to chop; slower hands pass through. */
export const MIN_CHOP_SPEED = 450
/** Hand speed is measured over this window, to smooth out frame-to-frame jitter. */
const SPEED_WINDOW_MS = 120
export const FRUIT_POINTS = 10
export const STAR_POINTS = 50
/** Fruits in one stroke needed for a bonus, and the bonus per fruit. */
export const COMBO_MIN = 3
export const COMBO_POINTS = 10
export const BOMB_PENALTY = 50
/** No bombs this early, so new players learn to chop first. */
const BOMB_FREE_MS = 8_000
/** Difficulty reaches its maximum after this much play. */
const RAMP_MS = 90_000

const key = (h: HandInput): string => `${h.player}:${h.hand}`

export class FruitChopLogic {
  phase: Phase = 'menu'
  players = 1
  scores: number[] = [0]
  chopped: number[] = [0]
  /** Solo only. */
  lives = LIVES
  pauseReason: 'player' | 'out-of-view' | null = null
  items: Item[] = []

  private phaseStart = 0
  private elapsedMs = 0 // playing time only (pauses don't count)
  private lastUpdate = 0
  private nextWaveAt = 0
  private nextId = 1
  private prev = new Map<string, Vec2>()
  private trail = new Map<string, { t: number; p: Vec2 }[]>()
  /** Current fast stroke per hand: fruits chopped so far and where the last one was. */
  private stroke = new Map<string, { count: number; x: number; y: number }>()

  constructor(private readonly random: () => number = Math.random) {}

  get versus(): boolean {
    return this.players > 1
  }

  /** Versus only: time left in the round. */
  get timeLeftMs(): number {
    return Math.max(0, VERSUS_MS - this.elapsedMs)
  }

  /** 3..1 during the countdown, else 0. */
  countdown(now: number): number {
    return this.phase === 'countdown'
      ? Math.ceil((COUNTDOWN_MS - (now - this.phaseStart)) / 1000)
      : 0
  }

  /** Index of the leading player, or null on a draw. */
  winner(): number | null {
    const top = Math.max(...this.scores)
    const leaders = this.scores.flatMap((s, i) => (s === top ? [i] : []))
    return leaders.length === 1 ? leaders[0] : null
  }

  /** Whether a hand is currently moving fast enough to chop (for blade feedback). */
  isArmed(player: number, hand: Side, now: number): boolean {
    return this.speed(`${player}:${hand}`, now) >= MIN_CHOP_SPEED
  }

  start(now: number, players = this.players): void {
    this.players = players
    this.scores = Array(players).fill(0)
    this.chopped = Array(players).fill(0)
    this.lives = LIVES
    this.items = []
    this.elapsedMs = 0
    this.nextWaveAt = 0
    this.pauseReason = null
    this.resetHands()
    this.setPhase('countdown', now)
  }

  pause(now: number, reason: 'player' | 'out-of-view'): void {
    if (this.phase !== 'playing' && this.phase !== 'countdown') return
    this.pauseReason = reason
    this.setPhase('paused', now)
  }

  /** Resumes with a fresh countdown so players can get back into position. */
  resume(now: number): void {
    if (this.phase !== 'paused') return
    this.pauseReason = null
    this.resetHands()
    this.setPhase('countdown', now)
  }

  toMenu(now: number): void {
    this.items = []
    this.setPhase('menu', now)
  }

  update(now: number, hands: HandInput[]): UpdateResult {
    const result: UpdateResult = { chops: [], bombs: [], dropped: [], bonuses: [], strokes: [] }
    const dt = Math.min(now - this.lastUpdate, 100) // clamp: a stall shouldn't teleport fruit
    this.lastUpdate = now
    if (this.phase === 'countdown' && now - this.phaseStart >= COUNTDOWN_MS) {
      this.setPhase('playing', now)
    }
    this.recordTrails(now, hands) // also during menus, so blades show "armed" feedback
    if (this.phase !== 'playing') {
      this.prev.clear()
      return result
    }

    this.elapsedMs += dt
    if (this.versus && this.elapsedMs >= VERSUS_MS) {
      this.items = []
      this.setPhase('gameover', now)
      return result
    }

    this.spawn()
    this.move(dt, result)
    this.trackStrokes(now, hands, result)
    this.hitTest(now, hands, result)
    this.endStrokes(now, hands, result)
    if (!this.versus && this.lives <= 0) {
      this.items = []
      this.setPhase('gameover', now)
    }
    return result
  }

  /** 0 at the start of a round, 1 once difficulty has fully ramped up. */
  private get ramp(): number {
    return Math.min(1, this.elapsedMs / (this.versus ? VERSUS_MS : RAMP_MS))
  }

  private spawn(): void {
    const k = this.ramp
    while (this.elapsedMs >= this.nextWaveAt) {
      // Waves grow from 1-2 items to 2-5, and come a little faster.
      const size = 1 + Math.floor(this.random() * (2 + 3 * k)) + (this.versus ? 1 : 0)
      for (let i = 0; i < size; i++) this.toss(k)
      this.nextWaveAt += 2100 - 900 * k + this.random() * 400
    }
  }

  /** Throws one item up from below the field so that it peaks in the upper part and falls back. */
  private toss(k: number): void {
    const roll = this.random()
    const bombChance = this.elapsedMs < BOMB_FREE_MS ? 0 : 0.06 + 0.1 * k
    const kind: ItemKind = roll < bombChance ? 'bomb' : roll < bombChance + 0.04 ? 'star' : 'fruit'
    const type = Math.floor(this.random() * FRUITS.length)
    const r = kind === 'bomb' ? BOMB_R : kind === 'star' ? STAR_R : FRUITS[type].r
    const x = FIELD.width * (0.12 + 0.76 * this.random())
    // Peak between 22% and 55% of the way down the screen.
    const peakY = FIELD.height * (0.22 + 0.33 * this.random())
    const rise = FIELD.height + r - peakY
    const vy = -Math.sqrt(2 * GRAVITY * rise)
    // Drift towards the middle, so fruit stays in reach.
    const towardCentre = (FIELD.width / 2 - x) / (FIELD.width / 2)
    const vx = towardCentre * 140 + (this.random() - 0.5) * 160
    this.items.push({
      id: this.nextId++,
      kind,
      type,
      x,
      y: FIELD.height + r,
      vx,
      vy: kind === 'star' ? vy * 1.08 : vy,
      r,
      rot: this.random() * Math.PI * 2,
      spin: (this.random() - 0.5) * 6
    })
  }

  private move(dt: number, out: UpdateResult): void {
    const s = dt / 1000
    const gone = new Set<number>()
    for (const it of this.items) {
      it.vy += GRAVITY * s
      it.x += it.vx * s
      it.y += it.vy * s
      it.rot += it.spin * s
      // Keep items on the field sideways.
      if ((it.x < it.r && it.vx < 0) || (it.x > FIELD.width - it.r && it.vx > 0)) it.vx = -it.vx
      if (it.vy > 0 && it.y > FIELD.height + it.r) {
        gone.add(it.id)
        if (it.kind === 'fruit') {
          out.dropped.push(it)
          if (!this.versus) this.lives = Math.max(0, this.lives - 1)
        }
      }
    }
    if (gone.size) this.items = this.items.filter((it) => !gone.has(it.id))
  }

  private recordTrails(now: number, hands: HandInput[]): void {
    for (const h of hands) {
      const k = key(h)
      if (!h.pos) {
        this.trail.delete(k)
        continue
      }
      const trail = this.trail.get(k) ?? []
      trail.push({ t: now, p: h.pos })
      while (trail.length > 2 && now - trail[0].t > SPEED_WINDOW_MS) trail.shift()
      this.trail.set(k, trail)
    }
  }

  /** Hand speed in px/s over the recent window. */
  private speed(k: string, now: number): number {
    const trail = this.trail.get(k)
    if (!trail || trail.length < 2) return 0
    const a = trail[0]
    const b = trail[trail.length - 1]
    if (now - b.t > SPEED_WINDOW_MS) return 0 // stale: the hand stopped reporting
    const dt = (b.t - a.t) / 1000
    return dt > 0 ? Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y) / dt : 0
  }

  /** A stroke starts when a hand gets fast enough to chop. */
  private trackStrokes(now: number, hands: HandInput[], out: UpdateResult): void {
    for (const h of hands) {
      const k = key(h)
      if (h.pos && !this.stroke.has(k) && this.speed(k, now) >= MIN_CHOP_SPEED) {
        this.stroke.set(k, { count: 0, x: h.pos.x, y: h.pos.y })
        out.strokes.push({ player: h.player, hand: h.hand })
      }
    }
  }

  /** A stroke ends when the hand slows down or disappears; big strokes earn a bonus. */
  private endStrokes(now: number, hands: HandInput[], out: UpdateResult): void {
    for (const h of hands) {
      const k = key(h)
      const s = this.stroke.get(k)
      if (!s || (h.pos && this.speed(k, now) >= MIN_CHOP_SPEED)) continue
      this.stroke.delete(k)
      if (s.count >= COMBO_MIN) {
        const points = s.count * COMBO_POINTS
        this.scores[h.player] += points
        out.bonuses.push({ player: h.player, hand: h.hand, count: s.count, points, x: s.x, y: s.y })
      }
    }
  }

  private hitTest(now: number, hands: HandInput[], out: UpdateResult): void {
    for (const h of hands) {
      const k = key(h)
      const cur = h.pos
      const prev = this.prev.get(k) ?? cur
      if (cur) this.prev.set(k, cur)
      else this.prev.delete(k)
      if (!cur || !prev || this.speed(k, now) < MIN_CHOP_SPEED) continue
      // Test the whole path since the last update, so fast chops still connect.
      const hit = this.items.filter((it) => distToSegment(it, prev, cur) <= it.r + BLADE_RADIUS)
      if (!hit.length) continue
      const p = h.player
      const angle = Math.atan2(cur.y - prev.y, cur.x - prev.x)
      for (const item of hit) {
        if (item.kind === 'bomb') {
          const penalty = this.versus ? Math.min(BOMB_PENALTY, this.scores[p]) : 0
          this.scores[p] -= penalty
          if (!this.versus) this.lives = Math.max(0, this.lives - 1)
          this.stroke.delete(k) // a bomb ruins the stroke's bonus
          out.bombs.push({ item, player: p, hand: h.hand, penalty })
          continue
        }
        const points = item.kind === 'star' ? STAR_POINTS : FRUIT_POINTS
        this.scores[p] += points
        this.chopped[p]++
        out.chops.push({ item, player: p, hand: h.hand, points, angle })
        const s = this.stroke.get(k)
        if (s) Object.assign(s, { count: s.count + 1, x: item.x, y: item.y })
      }
      const ids = new Set(hit.map((it) => it.id))
      this.items = this.items.filter((it) => !ids.has(it.id))
    }
  }

  private resetHands(): void {
    this.prev.clear()
    this.trail.clear()
    this.stroke.clear()
  }

  private setPhase(phase: Phase, now: number): void {
    this.phase = phase
    this.phaseStart = now
    this.lastUpdate = now
  }
}
