import type { Side, Vec2 } from '../../input/types'
import type { BodyInput } from '../poses'
import { leader, RoundFlow } from '../roundFlow'

/**
 * Punch Fly rules (no Phaser), so they can be unit-tested.
 * Flies buzz in on the beat and stop beside each player: left or right, high
 * or at shoulder height. Punch each one as it arrives. Punch on the beat for
 * more points, and both land the same beat for a team bonus.
 * Distances are in game pixels; fly spots are in shoulder widths. Time in ms.
 */
export const ROUND_MS = 60_000
/** Beats per minute at the start and the end of the round. */
export const BPM: [number, number] = [84, 126]
/** How long a fly takes to arrive, at the start and the end of the round. */
export const FLY_MS: [number, number] = [1300, 900]
/** A fly can be punched from this long before it arrives until this long after. */
export const EARLY_MS = 200
export const LATE_MS = 320
/** Punching within this of the beat is a perfect hit. */
export const PERFECT_MS = 110
export const POINTS = { perfect: 100, good: 50 }
/** Each hit in a row adds this much, up to the cap. */
const COMBO_BONUS = 5
const COMBO_CAP = 10
/** Both players landing the same beat earn this each. */
export const TOGETHER_BONUS = 50
/** Share of beats that send no fly, so there is a rhythm rather than a drill. */
const REST_CHANCE = 0.2
/** A fly's size: a hand within this many shoulder widths of it is a hit. */
export const FLY_REACH = 0.62
/**
 * A hand must have been off the spot at some point in this long before the
 * fly arrives, so you have to punch rather than park a hand there.
 */
const ARM_MS = 600

export type Height = 'high' | 'mid' | 'top'
export type Quality = 'perfect' | 'good'

/** Where a fly stops, from the middle of the shoulders, in shoulder widths. */
const SPOTS: Record<Height, Vec2> = {
  mid: { x: 1.65, y: -0.1 },
  high: { x: 1.2, y: -1.3 },
  // Straight overhead: used between two players, so they never punch into each other.
  top: { x: 0.3, y: -1.8 }
}
/** The game frame, and the room kept clear at its top for the score plates. */
const FRAME = { width: 1280, top: 90 }

export interface Fly {
  id: number
  player: number
  /** The beat it belongs to (the same for both players' flies on one beat). */
  beat: number
  side: Side
  height: Height
  /** Play time it appeared, and when it arrives. */
  from: number
  arrives: number
  /** Seen with no hand on its spot recently, so a hand arriving now is a punch. */
  armed: boolean
}

export interface Puncher {
  score: number
  combo: number
  bestCombo: number
  hits: number
  misses: number
}

export type GameEvent =
  | { type: 'beat'; beat: number }
  | { type: 'hit'; player: number; quality: Quality; points: number; x: number; y: number }
  | { type: 'miss'; player: number; x: number; y: number }
  | { type: 'together'; beat: number }

export class PunchFlyLogic {
  readonly flow = new RoundFlow()
  players: Puncher[] = []
  flies: Fly[] = []
  /** Where each player was last seen (flies stop beside them). */
  bodies: (BodyInput | null)[] = []
  private nextBeatAt = 0
  private beat = 0
  private nextId = 1
  /** Players who landed each recent beat. */
  private landed = new Map<number, Set<number>>()

  constructor(private readonly random: () => number = Math.random) {}

  prepare(count: number): void {
    this.players = Array.from({ length: count }, () => ({
      score: 0,
      combo: 0,
      bestCombo: 0,
      hits: 0,
      misses: 0
    }))
    this.bodies = Array.from({ length: count }, () => null)
  }

  start(now: number, count: number): void {
    this.prepare(count)
    this.flies = []
    this.landed.clear()
    this.beat = 0
    this.nextBeatAt = 600
    this.flow.start(now)
  }

  scores(): number[] {
    return this.players.map((p) => p.score)
  }

  winner(): number | null {
    return leader(this.scores())
  }

  remaining(): number {
    return Math.max(0, ROUND_MS - this.flow.elapsed)
  }

  /** How far through the round we are, 0..1. */
  private k(): number {
    return Math.min(1, this.flow.elapsed / ROUND_MS)
  }

  /** Time between beats right now. */
  beatMs(): number {
    return 60_000 / (BPM[0] + (BPM[1] - BPM[0]) * this.k())
  }

  /** Where a fly stops, in game pixels, and how big it is. Null until its player has been seen. */
  spot(fly: Fly): { x: number; y: number; r: number } | null {
    const body = this.bodies[fly.player]
    if (!body) return null
    const s = SPOTS[fly.height]
    const r = FLY_REACH * body.sw
    const x = body.x + (fly.side === 'left' ? -s.x : s.x) * body.sw
    // Kept inside the picture, where a hand can be seen.
    return {
      x: Math.max(r, Math.min(FRAME.width - r, x)),
      y: Math.max(FRAME.top + r, body.y + s.y * body.sw),
      r
    }
  }

  /** How far a fly has come, 0 (just appeared) .. 1 (arrived), and beyond while it lingers. */
  progress(fly: Fly): number {
    return (this.flow.elapsed - fly.from) / (fly.arrives - fly.from)
  }

  update(now: number, inputs: (BodyInput | null)[]): GameEvent[] {
    const events: GameEvent[] = []
    inputs.forEach((b, i) => {
      if (b && i < this.bodies.length) this.bodies[i] = b
    })
    if (this.flow.tick(now) <= 0) return events
    const t = this.flow.elapsed

    while (t >= this.nextBeatAt) {
      this.beat++
      events.push({ type: 'beat', beat: this.beat })
      // No new flies once there is no time left to punch them before the round ends.
      const flyMs = FLY_MS[0] + (FLY_MS[1] - FLY_MS[0]) * this.k()
      const inTime = this.nextBeatAt + flyMs + LATE_MS < ROUND_MS
      if (inTime && this.random() >= REST_CHANCE) {
        const side: Side = this.random() < 0.5 ? 'left' : 'right'
        const height: Height = this.random() < 0.4 ? 'high' : 'mid'
        const duo = this.players.length > 1
        this.players.forEach((_, player) => {
          // Two players mirror each other, so they punch outwards or inwards together.
          const own: Side = player % 2 === 0 ? side : side === 'left' ? 'right' : 'left'
          // Player 1 stands on the left of the picture: their right is the middle.
          const inward = duo && own === (player % 2 === 0 ? 'right' : 'left')
          this.flies.push({
            id: this.nextId++,
            player,
            beat: this.beat,
            side: own,
            height: inward ? 'top' : height,
            from: this.nextBeatAt,
            arrives: this.nextBeatAt + flyMs,
            armed: false
          })
        })
      }
      this.nextBeatAt += this.beatMs()
    }

    this.flies = this.flies.filter((fly) => {
      const p = this.players[fly.player]
      const spot = this.spot(fly)
      const body = inputs[fly.player]
      const touching =
        !!spot &&
        !!body &&
        (['left', 'right'] as const).some((side) => {
          const hand = body.hands[side]
          return !!hand && Math.hypot(hand.x - spot.x, hand.y - spot.y) < spot.r
        })
      if (!touching && t >= fly.arrives - ARM_MS) fly.armed = true
      if (touching && fly.armed && t >= fly.arrives - EARLY_MS) {
        const quality: Quality = Math.abs(t - fly.arrives) <= PERFECT_MS ? 'perfect' : 'good'
        const points = POINTS[quality] + COMBO_BONUS * Math.min(p.combo, COMBO_CAP)
        p.score += points
        p.combo++
        p.bestCombo = Math.max(p.bestCombo, p.combo)
        p.hits++
        events.push({ type: 'hit', player: fly.player, quality, points, x: spot.x, y: spot.y })
        this.land(fly, events)
        return false
      }
      if (t > fly.arrives + LATE_MS) {
        p.combo = 0
        p.misses++
        events.push({ type: 'miss', player: fly.player, x: spot?.x ?? 0, y: spot?.y ?? 0 })
        return false
      }
      return true
    })

    if (t >= ROUND_MS) this.flow.finish(now)
    return events
  }

  /** Notes a landed punch; when every player has landed the beat, they all get the bonus. */
  private land(fly: Fly, events: GameEvent[]): void {
    if (this.players.length < 2) return
    const who = this.landed.get(fly.beat) ?? new Set<number>()
    who.add(fly.player)
    this.landed.set(fly.beat, who)
    if (who.size === this.players.length) {
      for (const p of this.players) p.score += TOGETHER_BONUS
      events.push({ type: 'together', beat: fly.beat })
    }
    // Only the last few beats can still be completed.
    for (const beat of this.landed.keys()) if (beat < fly.beat - 8) this.landed.delete(beat)
  }
}
