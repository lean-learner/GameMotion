import type { MotionSnapshot, Side, Vec2 } from '../../input/types'
import { distToSegment } from '../geometry'

/**
 * Balloon Pop rules, independent of Phaser so they can be unit-tested.
 * Units are game pixels on a 1280x720 field; time is in ms.
 * Supports one player, or several sharing the same sky (versus).
 */
export type Phase = 'menu' | 'countdown' | 'playing' | 'paused' | 'gameover'
export type BalloonKind = 'normal' | 'golden'

export interface Balloon {
  id: number
  kind: BalloonKind
  color: number
  /** Current centre (includes the sideways wobble, so hits match what's drawn). */
  x: number
  y: number
  r: number
  baseX: number
  speed: number
  wobblePhase: number
}

/** One hand cursor this frame, in game pixels (null when the hand is down or lost). */
export interface HandInput {
  player: number
  hand: Side
  pos: Vec2 | null
}

export interface PopEvent {
  balloon: Balloon
  player: number
  hand: Side
  points: number
  combo: number
}

/** A hand touched a balloon but moved too slowly to pop it (draw a wobble). */
export interface BumpEvent {
  balloon: Balloon
  player: number
  hand: Side
}

export interface UpdateResult {
  pops: PopEvent[]
  bumps: BumpEvent[]
}

export const FIELD = { width: 1280, height: 720 }
export const ROUND_MS = 60_000
export const COUNTDOWN_MS = 3_000
/** Radius of a hand cursor for hit testing (generous: whole-arm gestures aren't precise). */
export const CURSOR_RADIUS = 38
/** Consecutive pops within this window build a combo. */
export const COMBO_WINDOW_MS = 1200
export const BALLOON_COLORS = 6
/**
 * A hand must be moving at least this fast (game px/s, about a third of the
 * screen width per second) to pop: a slight swipe, not a resting hand.
 */
export const MIN_POP_SPEED = 400
/** Hand speed is measured over this window, to smooth out frame-to-frame jitter. */
const SPEED_WINDOW_MS = 120
/** A balloon wobbles at most this often when bumped. */
const BUMP_COOLDOWN_MS = 600

const GOLDEN_CHANCE = 0.08
const BASE_POINTS: Record<BalloonKind, number> = { normal: 10, golden: 50 }

/** Combo multiplier: x1, then +1 for every 3 pops in a row, up to x4. */
export function comboMultiplier(combo: number): number {
  return Math.min(4, 1 + Math.floor(Math.max(0, combo - 1) / 3))
}

const key = (h: HandInput): string => `${h.player}:${h.hand}`

export class BalloonPopLogic {
  phase: Phase = 'menu'
  players = 1
  scores: number[] = [0]
  combos: number[] = [0]
  popped: number[] = [0]
  best = 0
  escaped = 0
  /** Why the game is paused, for the pause screen. */
  pauseReason: 'player' | 'out-of-view' | null = null
  balloons: Balloon[] = []

  private phaseStart = 0
  private elapsedMs = 0 // playing time only (pauses don't count)
  private lastUpdate = 0
  private nextSpawnAt = 0
  private lastPopAt: number[] = [-Infinity]
  private nextId = 1
  private prev = new Map<string, Vec2>()
  private trail = new Map<string, { t: number; p: Vec2 }[]>()
  private bumpedAt = new Map<number, number>()

  constructor(private readonly random: () => number = Math.random) {}

  /** Single-player conveniences. */
  get score(): number {
    return this.scores[0]
  }
  get combo(): number {
    return this.combos[0]
  }

  get timeLeftMs(): number {
    return Math.max(0, ROUND_MS - this.elapsedMs)
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

  /** Whether a hand is currently moving fast enough to pop (for cursor feedback). */
  isArmed(player: number, hand: Side, now: number): boolean {
    return this.speed(`${player}:${hand}`, now) >= MIN_POP_SPEED
  }

  start(now: number, players = this.players): void {
    this.players = players
    this.scores = Array(players).fill(0)
    this.combos = Array(players).fill(0)
    this.popped = Array(players).fill(0)
    this.lastPopAt = Array(players).fill(-Infinity)
    this.escaped = 0
    this.balloons = []
    this.elapsedMs = 0
    this.nextSpawnAt = 0
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
    this.balloons = []
    this.setPhase('menu', now)
  }

  /** Advances the game; returns the balloons popped (and bumped) on this update. */
  update(now: number, hands: HandInput[]): UpdateResult {
    const result: UpdateResult = { pops: [], bumps: [] }
    const dt = Math.min(now - this.lastUpdate, 100) // clamp: a stall shouldn't teleport balloons
    this.lastUpdate = now
    if (this.phase === 'countdown' && now - this.phaseStart >= COUNTDOWN_MS) {
      this.setPhase('playing', now)
    }
    this.recordTrails(now, hands) // also during menus, so cursors show "armed" feedback
    if (this.phase !== 'playing') {
      this.prev.clear()
      return result
    }

    this.elapsedMs += dt
    if (this.elapsedMs >= ROUND_MS) {
      if (this.players === 1) this.best = Math.max(this.best, this.scores[0])
      this.balloons = []
      this.setPhase('gameover', now)
      return result
    }

    this.spawn()
    this.move(dt)
    this.hitTest(now, hands, result)
    return result
  }

  private spawn(): void {
    // Difficulty ramps over the round: more balloons, rising faster. More
    // players share the sky, so a few more balloons for each.
    const k = this.elapsedMs / ROUND_MS
    const density = this.players > 1 ? 0.7 : 1
    while (this.elapsedMs >= this.nextSpawnAt) {
      const golden = this.random() < GOLDEN_CHANCE
      const r = golden ? 36 : 46 + this.random() * 14
      const baseX = r + this.random() * (FIELD.width - 2 * r)
      const speed = (110 + 150 * k + this.random() * 40) * (golden ? 1.6 : 1)
      this.balloons.push({
        id: this.nextId++,
        kind: golden ? 'golden' : 'normal',
        color: Math.floor(this.random() * BALLOON_COLORS),
        x: baseX,
        y: FIELD.height + r,
        r,
        baseX,
        speed,
        wobblePhase: this.random() * Math.PI * 2
      })
      this.nextSpawnAt += (900 - 450 * k) * density
    }
  }

  private move(dt: number): void {
    const t = this.elapsedMs / 1000
    for (const b of this.balloons) {
      b.y -= (b.speed * dt) / 1000
      b.x = b.baseX + Math.sin(t * 1.6 + b.wobblePhase) * 18
    }
    const before = this.balloons.length
    this.balloons = this.balloons.filter((b) => b.y > -b.r)
    if (this.balloons.length < before) {
      this.escaped += before - this.balloons.length
      this.combos.fill(0)
    }
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

  private hitTest(now: number, hands: HandInput[], out: UpdateResult): void {
    for (const h of hands) {
      const k = key(h)
      const cur = h.pos
      const prev = this.prev.get(k) ?? cur
      if (cur) this.prev.set(k, cur)
      else this.prev.delete(k)
      if (!cur || !prev) continue
      const armed = this.speed(k, now) >= MIN_POP_SPEED
      // Test the whole path since the last update, so fast swipes still pop.
      const hit = this.balloons.filter((b) => distToSegment(b, prev, cur) <= b.r + CURSOR_RADIUS)
      if (!armed) {
        for (const b of hit) {
          if (now - (this.bumpedAt.get(b.id) ?? -Infinity) < BUMP_COOLDOWN_MS) continue
          this.bumpedAt.set(b.id, now)
          out.bumps.push({ balloon: b, player: h.player, hand: h.hand })
        }
        continue
      }
      for (const b of hit) {
        const p = h.player
        this.combos[p] = now - this.lastPopAt[p] <= COMBO_WINDOW_MS ? this.combos[p] + 1 : 1
        this.lastPopAt[p] = now
        const points = BASE_POINTS[b.kind] * comboMultiplier(this.combos[p])
        this.scores[p] += points
        this.popped[p]++
        out.pops.push({ balloon: b, player: p, hand: h.hand, points, combo: this.combos[p] })
      }
      if (hit.length) {
        const ids = new Set(hit.map((b) => b.id))
        this.balloons = this.balloons.filter((b) => !ids.has(b.id))
      }
    }
  }

  private resetHands(): void {
    this.prev.clear()
    this.trail.clear()
  }

  private setPhase(phase: Phase, now: number): void {
    this.phase = phase
    this.phaseStart = now
    this.lastUpdate = now
  }
}

/** Tracking data older than this counts as "not tracked" (camera or tracker stalled). */
export const STALE_MS = 1000

/**
 * Is the player in view? No data yet counts as yes: tracking is still warming
 * up, which must not pause the game. Stale data counts as no.
 */
export function playerInView(snap: MotionSnapshot | null, now: number): boolean {
  return !snap || (snap.tracked && now - snap.time < STALE_MS)
}
