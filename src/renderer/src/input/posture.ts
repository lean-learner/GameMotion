import type { BodyFrame } from './body'
import type { Calibration } from './calibration'
import { OneEuroFilter } from './oneEuro'
import type { InputEvent, Side } from './types'

// All distances in shoulder widths (scale-free: works at any distance).
/** Shoulder drop that starts a crouch / ends it (hysteresis avoids flicker). */
const CROUCH_ENTER = 0.45
const CROUCH_EXIT = 0.25
/** Shoulder drop that counts as a full crouch (crouchAmount = 1). */
const CROUCH_FULL = 0.9
/** Shoulder-line tilt that counts as a full lean, degrees. */
const LEAN_FULL_DEG = 20
/** Sideways shoulders-over-hips offset that counts as a full lean. */
const LEAN_FULL_OFFSET = 0.5
const LEAN_ENTER = 0.5
const LEAN_EXIT = 0.3
/**
 * A new lean direction must hold this long before it is reported, so a
 * jittery body near the threshold can't fire a stream of events. The
 * continuous `lean` value is not delayed.
 */
const LEAN_DEBOUNCE_MS = 100

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * Crouch and lean from the upper body only (the knees are often out of frame).
 *  - Crouch: shoulders drop below their calibrated height.
 *  - Lean: shoulder-line tilt, blended with shoulders-over-hips offset when the
 *    hips are visible. Needs no calibration.
 */
export class PostureDetector {
  lean = 0
  leanDirection: Side | 'center' = 'center'
  crouching = false
  crouchAmount = 0
  private readonly leanFilter = new OneEuroFilter(2, 0.5)
  private pendingLean: { dir: Side | 'center'; since: number } | null = null

  reset(): void {
    this.lean = 0
    this.leanDirection = 'center'
    this.crouching = false
    this.crouchAmount = 0
    this.leanFilter.reset()
    this.pendingLean = null
  }

  update(body: BodyFrame | null, ref: Calibration | null, t: number, events: InputEvent[]): void {
    if (!body) return // hold the last state through short tracking drop-outs

    // Lean. Player space is mirrored, y down: leaning to the player's right
    // drops the right shoulder (positive dy) and moves the shoulders right.
    const dx = body.rightShoulder.x - body.leftShoulder.x
    const dy = body.rightShoulder.y - body.leftShoulder.y
    const tilt = clamp((Math.atan2(dy, dx) * 180) / Math.PI / LEAN_FULL_DEG, -1, 1)
    let raw = tilt
    if (body.hipMid) {
      const offset = (body.shoulderMid.x - body.hipMid.x) / body.shoulderWidth
      raw = (tilt + clamp(offset / LEAN_FULL_OFFSET, -1, 1)) / 2
    }
    this.lean = clamp(this.leanFilter.filter(raw, t), -1, 1)
    const dir: Side | 'center' =
      this.leanDirection === 'center'
        ? this.lean > LEAN_ENTER
          ? 'right'
          : this.lean < -LEAN_ENTER
            ? 'left'
            : 'center'
        : Math.abs(this.lean) < LEAN_EXIT
          ? 'center'
          : this.leanDirection
    if (dir === this.leanDirection) {
      this.pendingLean = null
    } else {
      if (this.pendingLean?.dir !== dir) this.pendingLean = { dir, since: t }
      if (t - this.pendingLean.since >= LEAN_DEBOUNCE_MS) {
        this.leanDirection = dir
        this.pendingLean = null
        events.push({ type: 'lean', direction: dir, time: t })
      }
    }

    // Crouch (needs the calibrated standing height).
    if (!ref) {
      this.crouchAmount = 0
      if (this.crouching) {
        this.crouching = false
        events.push({ type: 'crouch', active: false, time: t })
      }
      return
    }
    const drop = (body.shoulderMid.y - ref.shoulderMid.y) / ref.shoulderWidth
    this.crouchAmount = clamp(drop / CROUCH_FULL, 0, 1)
    const crouching = this.crouching ? drop > CROUCH_EXIT : drop > CROUCH_ENTER
    if (crouching !== this.crouching) {
      this.crouching = crouching
      events.push({ type: 'crouch', active: crouching, time: t })
    }
  }
}
