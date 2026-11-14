import type { BodyInput } from './poses'

// All in shoulder widths, so they work at any distance from the camera.
/** Shoulders this far above standing height: off the ground. Lands below JUMP_OFF. */
const JUMP_ON = 0.25
const JUMP_OFF = 0.12
/** Shoulders this far below standing height: ducking. Up again above DUCK_OFF. */
const DUCK_ON = 0.45
const DUCK_OFF = 0.25
/** Within this of standing height the player counts as standing. */
const STILL = 0.12
/** Standing height follows slow drift with this much smoothing. */
const FOLLOW_MS = 600
/** Held steady at a new height this long: the player moved, so that is standing now. */
const SETTLE_MS = 3000

/**
 * Jumping and ducking from the height of the shoulders (no Phaser, no
 * calibration step). It learns the standing height as the player stands and
 * reports when the shoulders go clearly above or below it.
 */
export class Vertical {
  /** Off the ground. */
  air = false
  /** Ducking. */
  low = false
  /** How far the shoulders are above standing height, in shoulder widths. */
  rise = 0
  /** Standing shoulder height in game pixels (null until the player is seen). */
  base: number | null = null
  private last = 0
  private away: { y: number; since: number } | null = null

  reset(): void {
    this.air = false
    this.low = false
    this.rise = 0
    this.base = null
    this.away = null
  }

  /** Call once per frame. True on the frame the player leaves the ground. */
  update(now: number, body: BodyInput | null): boolean {
    if (!body || body.sw <= 0) return false // hold the last state through drop-outs
    const dt = Math.max(0, Math.min(now - this.last, 100))
    this.last = now
    this.base ??= body.y
    let rise = (this.base - body.y) / body.sw
    if (Math.abs(rise) < STILL) {
      this.base += (body.y - this.base) * (1 - Math.exp(-dt / FOLLOW_MS))
      this.away = null
    } else if (!this.away || Math.abs(body.y - this.away.y) > STILL * body.sw) {
      this.away = { y: body.y, since: now }
    } else if (now - this.away.since >= SETTLE_MS) {
      this.base = body.y
      this.away = null
      rise = 0
    }
    this.rise = rise
    const wasAir = this.air
    this.air = rise > (this.air ? JUMP_OFF : JUMP_ON)
    this.low = -rise > (this.low ? DUCK_OFF : DUCK_ON)
    return this.air && !wasAir
  }
}
