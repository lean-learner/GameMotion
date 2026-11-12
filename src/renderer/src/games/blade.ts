import type { Vec2 } from '../input/types'

/** Drawn blade length, in game pixels. */
export const BLADE_LENGTH = 170
/** The hand must move this far (game pixels) between frames for its direction to count. */
const MIN_MOVE = 4
/** How quickly the blade turns to a new direction of motion (per rendered frame). */
const TURN = 0.35

/**
 * "Karate chop" blades point along the hand's own motion: the direction a
 * hand is travelling is solid even on a blurry webcam, whereas which way the
 * fingers point is not (an edge-on hand is nearly a dot to the camera).
 * A still hand keeps its last direction.
 */
export class BladeAim {
  private readonly hands = new Map<string, { pos: Vec2; dir: Vec2 | null }>()

  /** @returns the blade angle (radians, 0 = right, PI/2 = down) for this frame. */
  aim(key: string, pos: Vec2 | null, fallback = -Math.PI / 2): number {
    if (!pos) {
      this.hands.delete(key)
      return fallback
    }
    const h = this.hands.get(key)
    if (!h) {
      this.hands.set(key, { pos, dir: null })
      return fallback
    }
    const dx = pos.x - h.pos.x
    const dy = pos.y - h.pos.y
    const d = Math.hypot(dx, dy)
    if (d >= MIN_MOVE) {
      const ux = dx / d
      const uy = dy / d
      // Turn towards the new direction; snap on a reversal rather than spin through.
      h.dir =
        h.dir && h.dir.x * ux + h.dir.y * uy > 0
          ? { x: h.dir.x + TURN * (ux - h.dir.x), y: h.dir.y + TURN * (uy - h.dir.y) }
          : { x: ux, y: uy }
      h.pos = pos
    }
    return h.dir ? Math.atan2(h.dir.y, h.dir.x) : fallback
  }

  reset(): void {
    this.hands.clear()
  }
}
