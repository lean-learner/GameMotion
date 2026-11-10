import type { HandResult, Point } from '../tracking/types'
import type { Side, Vec2 } from './types'

/** MediaPipe pose landmark indices (subject's own left/right). */
export const POSE = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftHip: 23,
  rightHip: 24
} as const

const MIN_VISIBILITY = 0.5
/** Hand landmarks averaged for the palm centre: wrist + finger bases. */
const PALM = [0, 5, 9, 13, 17]

/**
 * Converts a camera-normalised landmark into player space: mirrored, and with
 * x scaled by the image aspect ratio so distances are the same in x and y.
 */
export function toPlayer(p: Point, aspect: number): Vec2 {
  return { x: (1 - p.x) * aspect, y: p.y }
}

function seen(p: Point | undefined): p is Point {
  return !!p && (p.visibility ?? 1) >= MIN_VISIBILITY
}

const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Body measurements for one frame, in player space. */
export interface BodyFrame {
  leftShoulder: Vec2
  rightShoulder: Vec2
  shoulderMid: Vec2
  /** The unit for all body-relative thresholds. */
  shoulderWidth: number
  hipMid: Vec2 | null
  /** Pose wrists only: one consistent source, used for fast gestures such as swipes. */
  wrists: Record<Side, Vec2 | null>
  /** Best available hand position per side: palm from hand tracking, else from pose (cursors). */
  hands: Record<Side, { pos: Vec2; source: 'hand' | 'pose' } | null>
}

/** Null when the shoulders aren't both visible: nothing body-relative works without them. */
export function measureBody(
  pose: Point[] | null,
  hands: HandResult[],
  aspect: number
): BodyFrame | null {
  if (!pose) return null
  const ls = pose[POSE.leftShoulder]
  const rs = pose[POSE.rightShoulder]
  if (!seen(ls) || !seen(rs)) return null
  const leftShoulder = toPlayer(ls, aspect)
  const rightShoulder = toPlayer(rs, aspect)
  const shoulderWidth = dist(leftShoulder, rightShoulder)
  if (shoulderWidth < 1e-3) return null

  const lh = pose[POSE.leftHip]
  const rh = pose[POSE.rightHip]
  const hipMid = seen(lh) && seen(rh) ? mid(toPlayer(lh, aspect), toPlayer(rh, aspect)) : null

  return {
    leftShoulder,
    rightShoulder,
    shoulderMid: mid(leftShoulder, rightShoulder),
    shoulderWidth,
    hipMid,
    wrists: {
      left: seen(pose[POSE.leftWrist]) ? toPlayer(pose[POSE.leftWrist], aspect) : null,
      right: seen(pose[POSE.rightWrist]) ? toPlayer(pose[POSE.rightWrist], aspect) : null
    },
    hands: {
      left: handPosition('left', pose, hands, aspect),
      right: handPosition('right', pose, hands, aspect)
    }
  }
}

function handPosition(
  side: Side,
  pose: Point[],
  hands: HandResult[],
  aspect: number
): { pos: Vec2; source: 'hand' | 'pose' } | null {
  const label = side === 'left' ? 'Left' : 'Right'
  const hand = hands.find((h) => h.handedness === label)
  if (hand) {
    const pts = PALM.map((i) => hand.landmarks[i]).filter((p): p is Point => !!p)
    if (pts.length) {
      const avg = pts.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y, z: 0 }), { x: 0, y: 0, z: 0 })
      return {
        pos: toPlayer({ x: avg.x / pts.length, y: avg.y / pts.length, z: 0 }, aspect),
        source: 'hand'
      }
    }
  }
  // Fallback: pose wrist/index/pinky. Survives motion blur that defeats hand tracking.
  const ids =
    side === 'left'
      ? [POSE.leftWrist, POSE.leftIndex, POSE.leftPinky]
      : [POSE.rightWrist, POSE.rightIndex, POSE.rightPinky]
  const pts = ids.map((i) => pose[i]).filter(seen)
  if (pts.length === 0) return null
  const sx = pts.reduce((a, p) => a + p.x, 0) / pts.length
  const sy = pts.reduce((a, p) => a + p.y, 0) / pts.length
  return { pos: toPlayer({ x: sx, y: sy, z: 0 }, aspect), source: 'pose' }
}
