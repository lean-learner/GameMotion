import type { Side, Vec2 } from '../input/types'

/**
 * Body poses the camera can tell apart (no Phaser), shared by the pose games.
 * A pose is judged from the hands relative to the shoulders, measured in
 * shoulder widths, so it works at any distance from the camera.
 *
 * "Left" and "right" are the player's own sides. The picture is a mirror, so
 * the player's left hand is on the left of the screen.
 */
export type Pose =
  'hands-up' | 'wide' | 'left-up' | 'right-up' | 'disco-left' | 'disco-right' | 'duck'

export const POSES: readonly Pose[] = [
  'hands-up',
  'wide',
  'left-up',
  'right-up',
  'disco-left',
  'disco-right',
  'duck'
]

/** What to call each pose on screen. */
export const POSE_NAMES: Record<Pose, string> = {
  'hands-up': 'Hands up',
  wide: 'Arms wide',
  'left-up': 'Left hand up',
  'right-up': 'Right hand up',
  'disco-left': 'Disco left',
  'disco-right': 'Disco right',
  duck: 'Duck'
}

/** A player as the camera sees them, in game pixels. */
export interface BodyInput {
  /** Middle of the shoulders. */
  x: number
  y: number
  /** Shoulder width: the unit for every distance here. */
  sw: number
  /** Null while a hand is out of sight. */
  hands: Record<Side, Vec2 | null>
  crouching: boolean
}

/** A hand this far above the shoulders is "up" (about the top of the head). */
const UP = 0.8
/** A hand this far out from the body's middle is "out" to the side... */
const OUT = 1.15
/** ...as long as it is within this much of shoulder height. */
const OUT_BAND = 0.75
/** A hand lower than this (just above the shoulders) is "down". Unseen hands are down too. */
const DOWN = -0.25

type HandPlace = 'up' | 'out' | 'down' | 'between'

/** Where a hand is, relative to the shoulders. */
export function handPlace(body: BodyInput, side: Side): HandPlace {
  const hand = body.hands[side]
  if (!hand) return 'down'
  const dx = (hand.x - body.x) / body.sw
  const dy = (hand.y - body.y) / body.sw
  if (dy < -UP) return 'up'
  const outward = side === 'left' ? -dx : dx
  if (outward > OUT && Math.abs(dy) < OUT_BAND) return 'out'
  if (dy > DOWN) return 'down'
  return 'between'
}

/** Is the player holding this pose right now? */
export function matchesPose(pose: Pose, body: BodyInput | null): boolean {
  if (!body) return false
  if (pose === 'duck') return body.crouching
  const left = handPlace(body, 'left')
  const right = handPlace(body, 'right')
  switch (pose) {
    case 'hands-up':
      return left === 'up' && right === 'up'
    case 'wide':
      return left === 'out' && right === 'out'
    case 'left-up':
      return left === 'up' && right === 'down'
    case 'right-up':
      return right === 'up' && left === 'down'
    case 'disco-left':
      return left === 'up' && right === 'out'
    case 'disco-right':
      return right === 'up' && left === 'out'
  }
}

/**
 * Where the hands go for a pose, as offsets from the middle of the shoulders
 * in shoulder widths (x to the player's right, y down). Used to draw the pose.
 */
export function poseHands(pose: Pose): Record<Side, Vec2> {
  const up = (side: Side): Vec2 => ({ x: side === 'left' ? -0.75 : 0.75, y: -1.5 })
  const out = (side: Side): Vec2 => ({ x: side === 'left' ? -1.7 : 1.7, y: -0.05 })
  const down = (side: Side): Vec2 => ({ x: side === 'left' ? -0.75 : 0.75, y: 1.25 })
  switch (pose) {
    case 'hands-up':
      return { left: up('left'), right: up('right') }
    case 'wide':
      return { left: out('left'), right: out('right') }
    case 'left-up':
      return { left: up('left'), right: down('right') }
    case 'right-up':
      return { left: down('left'), right: up('right') }
    case 'disco-left':
      return { left: up('left'), right: out('right') }
    case 'disco-right':
      return { left: out('left'), right: up('right') }
    case 'duck':
      return { left: down('left'), right: down('right') }
  }
}

/** A pose chosen at random, never the same as `not` (so the players always have to move). */
export function randomPose(
  random: () => number,
  not: Pose | null = null,
  from: readonly Pose[] = POSES
): Pose {
  const choices = from.filter((p) => p !== not)
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]
}
