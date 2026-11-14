import type { Side } from '../../input/types'
import type { BodyInput } from '../poses'
import type { Throw } from './physics'

/**
 * Spots a bowling swing (no Phaser): a hand that is down by the hip and then
 * comes up quickly in front of the body. Heights are below the shoulders, in
 * shoulder widths; time in ms.
 */
export const SWING = {
  /** A hand at least this far below the shoulders is "down", ready to swing. */
  low: 0.9,
  /** The ball leaves the hand as it comes up past here. */
  release: 0.3,
  /** The hand must get from down to the release within this long. */
  windowMs: 650,
  /** Upward speed, shoulder widths per second: slower is not a throw, `full` is full power. */
  minSpeed: 2,
  fullSpeed: 7
}

export interface Swing {
  /** 0..1 */
  power: number
  /** How far the hand drifted sideways per unit it rose; + is to the right of the screen. */
  slant: number
}

export class SwingDetector {
  private low: Record<Side, { t: number; x: number; dy: number } | null> = {
    left: null,
    right: null
  }
  /** A hand is down right now: the next upswing will bowl. */
  armed = false

  reset(): void {
    this.low = { left: null, right: null }
    this.armed = false
  }

  /** Feed every frame; returns the swing on the frame the ball is let go. */
  update(t: number, body: BodyInput | null): Swing | null {
    this.armed = false
    if (!body) return null
    for (const side of ['left', 'right'] as const) {
      const hand = body.hands[side]
      if (!hand) continue
      const dy = (hand.y - body.y) / body.sw
      if (dy > SWING.low) {
        this.low[side] = { t, x: hand.x, dy }
        this.armed = true
        continue
      }
      const from = this.low[side]
      if (!from || dy >= SWING.release) continue
      this.low[side] = null
      const ms = t - from.t
      if (ms <= 0 || ms > SWING.windowMs) continue
      const rise = from.dy - dy
      const speed = rise / (ms / 1000)
      if (speed < SWING.minSpeed) continue
      this.reset()
      return {
        power: Math.min(1, (speed - SWING.minSpeed) / (SWING.fullSpeed - SWING.minSpeed)),
        slant: (hand.x - from.x) / body.sw / rise
      }
    }
    return null
  }
}

/** Ball speed at no power and at full power, m/s. */
export const BALL_SPEED: [number, number] = [5, 9.5]
/** A swing this straight sends the ball dead straight. */
const STRAIGHT = 0.06
const MAX_SLANT = 0.6
/** Radians of direction per unit of slant. */
const ANGLE = 0.06
/** A slanted swing also spins the ball, so it curves back the other way near the pins. */
const HOOK = 45

/**
 * Turns a swing into a throw from `x`: speed from how fast the arm came up,
 * direction from which way it leaned, and a hook that brings a leaning ball
 * back towards the middle. Slow balls hook more, as on a real lane.
 */
export function toThrow(x: number, swing: Swing): Throw {
  const lean =
    Math.abs(swing.slant) < STRAIGHT ? 0 : Math.max(-MAX_SLANT, Math.min(MAX_SLANT, swing.slant))
  const angle = lean * ANGLE
  return {
    x,
    speed: BALL_SPEED[0] + (BALL_SPEED[1] - BALL_SPEED[0]) * swing.power,
    angle,
    spin: -angle * HOOK
  }
}
