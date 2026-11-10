import { dist, type BodyFrame } from './body'
import type { CalibrationStatus, Vec2 } from './types'

/** The player's neutral standing posture: the reference for crouch and lean. */
export interface Calibration {
  shoulderMid: Vec2
  shoulderWidth: number
  hipMid: Vec2 | null
}

const HOLD_MS = 1500
/** Max shoulder movement while "holding still", in shoulder widths. */
const STILL_TOLERANCE = 0.15
/** Max shoulder-width change while holding still (also rejects turning). */
const SCALE_TOLERANCE = 0.1
/** Distance change (shoulder-width ratio) that invalidates the calibration... */
const RESCALE_RATIO = 0.3
/** ...if it lasts this long (player stepped closer or further away). */
const RESCALE_MS = 1000
/**
 * Shoulders this far *above* the calibrated height (shoulder widths), for
 * RESCALE_MS, mean the calibration was taken while slouching or crouched:
 * recalibrate, or crouching could never be detected.
 */
const RISE_LIMIT = 0.3

/**
 * Calibrates automatically: whenever the player holds still for 1.5 s with
 * shoulders visible. Recalibrates when they move to a new distance.
 */
export class Calibrator {
  status: CalibrationStatus = 'waiting'
  progress = 0
  reference: Calibration | null = null

  private samples: { t: number; body: BodyFrame }[] = []
  private rescaleSince: number | null = null
  private riseSince: number | null = null

  reset(): void {
    this.status = 'waiting'
    this.progress = 0
    this.reference = null
    this.samples = []
    this.rescaleSince = null
    this.riseSince = null
  }

  /** @returns true on the frame calibration completes. */
  update(body: BodyFrame | null, t: number): boolean {
    if (this.status === 'calibrated') {
      this.checkDistance(body, t)
      if (this.status === 'calibrated') return false
    }
    if (!body) {
      this.samples = []
      this.status = 'waiting'
      this.progress = 0
      return false
    }
    const anchor = this.samples[0]?.body
    if (
      anchor &&
      (dist(body.shoulderMid, anchor.shoulderMid) > STILL_TOLERANCE * anchor.shoulderWidth ||
        Math.abs(body.shoulderWidth / anchor.shoulderWidth - 1) > SCALE_TOLERANCE)
    ) {
      this.samples = [] // moved: start the hold again from here
    }
    this.samples.push({ t, body })
    this.status = 'holding'
    const held = t - this.samples[0].t
    this.progress = Math.min(1, held / HOLD_MS)
    if (held < HOLD_MS) return false

    const n = this.samples.length
    const avg = (f: (b: BodyFrame) => number): number =>
      this.samples.reduce((a, s) => a + f(s.body), 0) / n
    const hips = this.samples.filter((s) => s.body.hipMid)
    this.reference = {
      shoulderMid: { x: avg((b) => b.shoulderMid.x), y: avg((b) => b.shoulderMid.y) },
      shoulderWidth: avg((b) => b.shoulderWidth),
      hipMid:
        hips.length > n / 2
          ? {
              x: hips.reduce((a, s) => a + s.body.hipMid!.x, 0) / hips.length,
              y: hips.reduce((a, s) => a + s.body.hipMid!.y, 0) / hips.length
            }
          : null
    }
    this.samples = []
    this.status = 'calibrated'
    this.progress = 1
    return true
  }

  private checkDistance(body: BodyFrame | null, t: number): void {
    const ref = this.reference
    if (!ref || !body) {
      this.rescaleSince = null
      this.riseSince = null
      return
    }
    if (ref.shoulderMid.y - body.shoulderMid.y > RISE_LIMIT * ref.shoulderWidth) {
      this.riseSince ??= t
      if (t - this.riseSince >= RESCALE_MS) {
        this.reset()
        return
      }
    } else {
      this.riseSince = null
    }
    if (Math.abs(body.shoulderWidth / ref.shoulderWidth - 1) > RESCALE_RATIO) {
      this.rescaleSince ??= t
      if (t - this.rescaleSince >= RESCALE_MS) this.reset()
    } else {
      this.rescaleSince = null
    }
  }
}
