import { poseHands, type BodyInput, type Pose } from '../../src/renderer/src/games/poses'

export const SW = 180

/** A player at (x, 300) holding a pose, as the camera would report them. */
export function holding(pose: Pose, x = 640): BodyInput {
  const h = poseHands(pose)
  return {
    x,
    y: 300,
    sw: SW,
    hands: {
      left: { x: x + h.left.x * SW, y: 300 + h.left.y * SW },
      right: { x: x + h.right.x * SW, y: 300 + h.right.y * SW }
    },
    crouching: pose === 'duck'
  }
}

/** A player standing with their hands out of sight. */
export function standing(x = 640): BodyInput {
  return { x, y: 300, sw: SW, hands: { left: null, right: null }, crouching: false }
}

/** Steps a game forward in 16 ms frames; `frame` runs each step and gets the time. */
export function run(from: number, ms: number, frame: (t: number) => void): number {
  let t = from
  for (; t < from + ms; t += 16) frame(t)
  return t
}
