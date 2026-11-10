import type { BodyFrame } from './body'
import { OneEuroFilter } from './oneEuro'
import type { CursorState, Side, Vec2 } from './types'

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

  constructor(private readonly side: Side) {}

  reset(): void {
    this.state = null
    this.raw = null
    this.relative = null
    this.fx.reset()
    this.fy.reset()
    this.vel = { x: 0, y: 0 }
    this.last = null
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
    this.state = { x: p.x, y: p.y, source: hand.source }
    return this.state
  }

  /**
   * Position extrapolated to `now` (e.g. the display frame time), which hides
   * camera and processing latency and lets cursors move at display rate.
   */
  predict(now: number): Vec2 | null {
    if (!this.last || !this.state) return null
    const ahead = Math.min(Math.max(now - this.last.t, 0), MAX_PREDICT_MS) / 1000
    return {
      x: clamp01(this.last.p.x + this.vel.x * ahead),
      y: clamp01(this.last.p.y + this.vel.y * ahead)
    }
  }
}
