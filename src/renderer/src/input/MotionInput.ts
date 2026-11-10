import type { TrackingFrame } from '../tracking/types'
import { measureBody } from './body'
import { Calibrator, type Calibration } from './calibration'
import { CursorTracker, DEFAULT_REACH, type HandRelative, type ReachZone } from './cursor'
import { PostureDetector } from './posture'
import { SwipeDetector } from './swipe'
import type { InputEvent, MotionSnapshot, Side, Vec2 } from './types'

/**
 * Swipes are tracked only while the wrist is above lower-chest height (this many
 * shoulder widths below the shoulders). Raising a hand to shoulder height to
 * start using a cursor is then never a swipe; a fast stroke up past the head is.
 */
const RAISED_LIMIT = 0.6

/**
 * The Motion Input layer: turns tracking frames into game input. Games use
 * this class (and the types in ./types) only; they never see MediaPipe data.
 *
 *   const input = new MotionInput(16 / 9)
 *   tracker.onFrame = (f) => handle(input.update(f))   // events, state
 *   requestAnimationFrame((now) => input.predictCursor('right', now))  // smooth cursor
 */
export class MotionInput {
  private readonly calibrator = new Calibrator()
  private readonly posture = new PostureDetector()
  private readonly cursors: Record<Side, CursorTracker> = {
    left: new CursorTracker('left'),
    right: new CursorTracker('right')
  }
  private readonly swipes: Record<Side, SwipeDetector> = {
    left: new SwipeDetector('left'),
    right: new SwipeDetector('right')
  }

  /** @param aspect camera width / height, so distances are measured evenly. */
  constructor(public aspect: number) {}

  update(frame: TrackingFrame): MotionSnapshot {
    const t = frame.frameTime
    const events: InputEvent[] = []
    const body = measureBody(frame.pose, frame.hands, this.aspect)

    if (this.calibrator.update(body, t)) events.push({ type: 'calibrated', time: t })
    const ref = this.calibrator.reference
    this.posture.update(body, ref, t, events)
    const sw = ref?.shoulderWidth ?? body?.shoulderWidth ?? 0
    for (const side of ['left', 'right'] as const) {
      this.cursors[side].update(body, t)
      const wrist = body?.wrists[side] ?? null
      const raised = !!body && !!wrist && wrist.y <= body.shoulderMid.y + RAISED_LIMIT * sw
      this.swipes[side].update(raised ? wrist : null, sw, t, events)
    }

    return {
      time: t,
      tracked: body !== null,
      calibration: { status: this.calibrator.status, progress: this.calibrator.progress },
      cursors: { left: this.cursors.left.state, right: this.cursors.right.state },
      lean: this.posture.lean,
      crouching: this.posture.crouching,
      crouchAmount: this.posture.crouchAmount,
      events
    }
  }

  /** Cursor position extrapolated to `now`, for drawing at display rate. */
  predictCursor(side: Side, now: number): Vec2 | null {
    return this.cursors[side].predict(now)
  }

  /** Uses a player's own reach zone (from Reach setup); null restores the default. */
  setReach(zone: ReachZone | null): void {
    for (const side of ['left', 'right'] as const) this.cursors[side].zone = zone ?? DEFAULT_REACH
  }

  /** A hand's position relative to its shoulder, in shoulder widths (for Reach setup). */
  handRelative(side: Side): HandRelative | null {
    return this.cursors[side].relative
  }

  /** Unclamped reach-zone position of a hand (0..1 = on screen), for diagnostics. */
  cursorRaw(side: Side): Vec2 | null {
    return this.cursors[side].raw
  }

  /** The calibrated neutral posture, in player space (null until calibrated). */
  get calibrationReference(): Calibration | null {
    return this.calibrator.reference
  }

  /** Forget the current calibration; the player is asked to hold still again. */
  recalibrate(): void {
    this.calibrator.reset()
    this.posture.reset()
  }

  /** Clears all state, e.g. when tracking stops. */
  reset(): void {
    this.recalibrate()
    for (const side of ['left', 'right'] as const) {
      this.cursors[side].reset()
      this.swipes[side].reset()
    }
  }
}
