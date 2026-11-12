import type { BodyFrame } from './body'
import { OneEuroFilter } from './oneEuro'
import type { CursorState, HandCursor, Side, Vec2 } from './types'

/**
 * Reach zone per hand, in shoulder widths relative to that hand's shoulder:
 * a comfortable box from slightly across the body to arm's length out, from
 * head height down to the waist. It maps onto the whole screen, so players
 * never have to reach the edges of a narrow camera view. Players can fit
 * their own with Reach setup (see reach.ts).
 */
export interface ReachZone {
  /** Across the body, past the centre line. */
  inward: number
  outward: number
  up: number
  down: number
}

export const DEFAULT_REACH: ReachZone = { inward: 0.8, outward: 1.2, up: 0.7, down: 0.8 }

/** A hand's position relative to its own shoulder, in shoulder widths. */
export interface HandRelative {
  /** Positive = away from the body (outward). */
  out: number
  /** Positive = below the shoulder. */
  down: number
}

export function handRelative(side: Side, hand: Vec2, body: BodyFrame): HandRelative {
  const shoulder = side === 'left' ? body.leftShoulder : body.rightShoulder
  const dx = (hand.x - shoulder.x) / body.shoulderWidth
  return { out: side === 'right' ? dx : -dx, down: (hand.y - shoulder.y) / body.shoulderWidth }
}
/** A hand below the zone (arm resting) hides its cursor; small margin avoids flicker. */
const LOWERED_MARGIN = 0.15
/** How quickly the drawn hand direction follows the tracked one (per tracking frame). */
const DIR_SMOOTHING = 0.4
/** Tracking frames a changed grip (open/fist) must persist before it counts. */
const FIST_FRAMES = 2
/** Prediction is capped so a sudden stop can't overshoot visibly. */
const MAX_PREDICT_MS = 60

/** Maps a hand position into 0..1 screen space using its reach zone. Unclamped. */
export function zoneMap(
  side: Side,
  hand: Vec2,
  body: BodyFrame,
  zone: ReachZone = DEFAULT_REACH
): Vec2 {
  const sw = body.shoulderWidth
  const shoulder = side === 'left' ? body.leftShoulder : body.rightShoulder
  // In player space the player's left side is on the left (smaller x).
  const left = side === 'left' ? shoulder.x - zone.outward * sw : shoulder.x - zone.inward * sw
  const width = (zone.inward + zone.outward) * sw
  const top = shoulder.y - zone.up * sw
  const height = (zone.up + zone.down) * sw
  return { x: (hand.x - left) / width, y: (hand.y - top) / height }
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** One hand's cursor: zone mapping, One-Euro smoothing and short-term prediction. */
export class CursorTracker {
  state: CursorState | null = null
  /** Last reach-zone position before clamping/smoothing (for diagnostics; may exceed 0..1). */
  raw: Vec2 | null = null
  /** Last hand position relative to its shoulder (for Reach setup), even while lowered. */
  relative: HandRelative | null = null
  /** This player's reach zone. */
  zone: ReachZone = DEFAULT_REACH
  private readonly fx = new OneEuroFilter(1.2, 4)
  private readonly fy = new OneEuroFilter(1.2, 4)
  private vel: Vec2 = { x: 0, y: 0 }
  private last: { t: number; p: Vec2 } | null = null
  /** Smoothed hand direction (wrist to fingers), so the drawn blade doesn't twitch. */
  private dir: Vec2 | null = null
  /** Debounced grip: the reported value changes only after it has been seen FIST_FRAMES times in a row. */
  private fist: boolean | null = null
  private fistPending = 0

  constructor(private readonly side: Side) {}

  reset(): void {
    this.state = null
    this.raw = null
    this.relative = null
    this.fx.reset()
    this.fy.reset()
    this.vel = { x: 0, y: 0 }
    this.last = null
    this.dir = null
    this.fist = null
    this.fistPending = 0
  }

  update(body: BodyFrame | null, t: number): CursorState | null {
    const hand = body?.hands[this.side]
    if (!body || !hand) {
      this.reset()
      return null
    }
    const relative = handRelative(this.side, hand.pos, body)
    const m = zoneMap(this.side, hand.pos, body, this.zone)
    if (m.y > 1 + LOWERED_MARGIN) {
      this.reset()
      this.relative = relative
      return null
    }
    this.relative = relative
    this.raw = m
    const p = { x: clamp01(this.fx.filter(m.x, t)), y: clamp01(this.fy.filter(m.y, t)) }
    if (this.last) {
      const dt = (t - this.last.t) / 1000
      if (dt > 0) {
        // Lightly smoothed velocity of the filtered cursor, for prediction.
        this.vel.x += 0.5 * ((p.x - this.last.p.x) / dt - this.vel.x)
        this.vel.y += 0.5 * ((p.y - this.last.p.y) / dt - this.vel.y)
      }
    }
    this.last = { t, p }
    if (hand.dir) {
      this.dir = this.dir
        ? {
            x: this.dir.x + DIR_SMOOTHING * (hand.dir.x - this.dir.x),
            y: this.dir.y + DIR_SMOOTHING * (hand.dir.y - this.dir.y)
          }
        : hand.dir
    }
    this.state = { x: p.x, y: p.y, source: hand.source }
    if (this.dir) this.state.angle = Math.atan2(this.dir.y, this.dir.x)
    if (hand.fist === null) {
      this.fist = null
      this.fistPending = 0
    } else if (this.fist === null) {
      this.fist = hand.fist
    } else if (hand.fist !== this.fist) {
      if (++this.fistPending >= FIST_FRAMES) {
        this.fist = hand.fist
        this.fistPending = 0
      }
    } else {
      this.fistPending = 0
    }
    if (this.fist !== null) this.state.fist = this.fist
    return this.state
  }

  /**
   * Position extrapolated to `now` (e.g. the display frame time), which hides
   * camera and processing latency and lets cursors move at display rate.
   */
  predict(now: number): HandCursor | null {
    if (!this.last || !this.state) return null
    const ahead = Math.min(Math.max(now - this.last.t, 0), MAX_PREDICT_MS) / 1000
    return {
      x: clamp01(this.last.p.x + this.vel.x * ahead),
      y: clamp01(this.last.p.y + this.vel.y * ahead),
      angle: this.state.angle,
      fist: this.state.fist
    }
  }
}

/**
 * One hand's position in the camera picture itself, for games played over the
 * camera view: where the hand is drawn is where the player sees their own
 * hand. Mirrored like the picture, 0..1 across and down it, smoothed and
 * predicted like a cursor, but with no reach zone, no clamping, and no hiding
 * of a lowered hand: if the camera sees the hand, it has a position.
 */
export class ViewTracker {
  private readonly fx = new OneEuroFilter(1.5, 5)
  private readonly fy = new OneEuroFilter(1.5, 5)
  private vel: Vec2 = { x: 0, y: 0 }
  private last: { t: number; p: Vec2 } | null = null

  constructor(private readonly side: Side) {}

  reset(): void {
    this.fx.reset()
    this.fy.reset()
    this.vel = { x: 0, y: 0 }
    this.last = null
  }

  /** @param aspect picture width / height (player space has x scaled by it). */
  update(body: BodyFrame | null, aspect: number, t: number): void {
    const hand = body?.hands[this.side]
    if (!hand) {
      this.reset()
      return
    }
    const p = { x: this.fx.filter(hand.pos.x / aspect, t), y: this.fy.filter(hand.pos.y, t) }
    if (this.last) {
      const dt = (t - this.last.t) / 1000
      if (dt > 0) {
        this.vel.x += 0.5 * ((p.x - this.last.p.x) / dt - this.vel.x)
        this.vel.y += 0.5 * ((p.y - this.last.p.y) / dt - this.vel.y)
      }
    }
    this.last = { t, p }
  }

  /** Position extrapolated to `now` (capped), to hide camera and processing latency. */
  predict(now: number): Vec2 | null {
    if (!this.last) return null
    const ahead = Math.min(Math.max(now - this.last.t, 0), MAX_PREDICT_MS) / 1000
    return { x: this.last.p.x + this.vel.x * ahead, y: this.last.p.y + this.vel.y * ahead }
  }
}
