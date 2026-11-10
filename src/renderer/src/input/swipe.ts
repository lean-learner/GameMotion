import type { InputEvent, Side, Vec2 } from './types'

// Distances in shoulder widths, so swipes feel the same at any distance.
/** Look-back window for a swipe. */
const WINDOW_MS = 350
/** Minimum travel along the main axis. */
const MIN_DISTANCE = 0.9
/** Minimum average speed, shoulder widths per second. */
const MIN_SPEED = 2.5
/** Main axis must dominate the other one by this factor. */
const AXIS_RATIO = 2
/** No new swipe from the same hand right after one (the arm's return stroke). */
const COOLDOWN_MS = 500
/**
 * A real swipe spreads over several camera frames. If one frame-to-frame step
 * holds more than this share of the travel, it's a tracking jump, not a swipe.
 */
const MAX_SINGLE_STEP_SHARE = 0.6

/**
 * Detects quick straight hand strokes (left/right/up/down) for one hand.
 * The caller passes null while the hand is lowered, so raising an arm from the
 * side never counts as an upward swipe.
 */
export class SwipeDetector {
  private history: { t: number; p: Vec2 }[] = []
  private cooldownUntil = 0

  constructor(private readonly hand: Side) {}

  reset(): void {
    this.history = []
  }

  private isGlitch(axis: 'x' | 'y'): boolean {
    const h = this.history
    const total = Math.abs(h[h.length - 1].p[axis] - h[0].p[axis])
    let maxStep = 0
    for (let i = 1; i < h.length; i++) {
      maxStep = Math.max(maxStep, Math.abs(h[i].p[axis] - h[i - 1].p[axis]))
    }
    return maxStep > MAX_SINGLE_STEP_SHARE * total
  }

  update(pos: Vec2 | null, shoulderWidth: number, t: number, events: InputEvent[]): void {
    if (!pos) {
      this.history = []
      return
    }
    this.history.push({ t, p: pos })
    while (this.history.length && t - this.history[0].t > WINDOW_MS) this.history.shift()
    if (t < this.cooldownUntil || this.history.length < 3) return

    const first = this.history[0]
    const dt = (t - first.t) / 1000
    if (dt <= 0) return
    const dx = (pos.x - first.p.x) / shoulderWidth
    const dy = (pos.y - first.p.y) / shoulderWidth
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    let direction: 'left' | 'right' | 'up' | 'down' | null = null
    if (ax >= MIN_DISTANCE && ax >= AXIS_RATIO * ay && ax / dt >= MIN_SPEED) {
      direction = dx > 0 ? 'right' : 'left'
    } else if (ay >= MIN_DISTANCE && ay >= AXIS_RATIO * ax && ay / dt >= MIN_SPEED) {
      direction = dy > 0 ? 'down' : 'up'
    }
    if (direction && this.isGlitch(direction === 'left' || direction === 'right' ? 'x' : 'y')) {
      direction = null
    }
    if (direction) {
      events.push({ type: 'swipe', hand: this.hand, direction, time: t })
      this.cooldownUntil = t + COOLDOWN_MS
      this.history = []
    }
  }
}
