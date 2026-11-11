import type { HandResult, Point } from '../tracking/types'
import type { Side, Vec2 } from './types'

/** MediaPipe pose landmark indices (subject's own left/right). */
export const POSE = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
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
const HAND_WRIST = 0
const HAND_MIDDLE_BASE = 9

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
  hands: Record<Side, HandPoint | null>
}

/** Where a hand is and which way it points (used by games that treat the hand as a blade). */
export interface HandPoint {
  pos: Vec2
  /** Unit vector from the wrist towards the fingers; null when it can't be told. */
  dir: Vec2 | null
  /** Closed into a fist? Null when the fingers can't be seen (pose fallback). */
  fist: boolean | null
  source: 'hand' | 'pose'
}

/** Finger [tip, middle joint] landmark pairs: index, middle, ring, pinky. */
const FINGERS = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18]
]
/** This many of the four fingers must be curled for a fist. */
const FIST_FINGERS = 3

/**
 * A fist: most fingertips are no further from the wrist than their own middle
 * joints (a curled finger folds its tip back towards the palm). Null when the
 * landmarks are incomplete.
 */
export function isFist(landmarks: Point[], aspect: number): boolean | null {
  const wristPt = landmarks[HAND_WRIST]
  if (!wristPt) return null
  const wrist = toPlayer(wristPt, aspect)
  let curled = 0
  for (const [tip, joint] of FINGERS) {
    const t = landmarks[tip]
    const j = landmarks[joint]
    if (!t || !j) return null
    if (dist(toPlayer(t, aspect), wrist) <= dist(toPlayer(j, aspect), wrist) * 1.05) curled++
  }
  return curled >= FIST_FINGERS
}

function unit(from: Vec2, to: Vec2): Vec2 | null {
  const d = dist(from, to)
  return d < 1e-4 ? null : { x: (to.x - from.x) / d, y: (to.y - from.y) / d }
}

function mean(pts: Vec2[]): Vec2 {
  return {
    x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
    y: pts.reduce((a, p) => a + p.y, 0) / pts.length
  }
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
): HandPoint | null {
  const label = side === 'left' ? 'Left' : 'Right'
  const hand = hands.find((h) => h.handedness === label)
  if (hand) {
    const pts = PALM.map((i) => hand.landmarks[i]).filter((p): p is Point => !!p)
    if (pts.length) {
      const wrist = hand.landmarks[HAND_WRIST]
      const base = hand.landmarks[HAND_MIDDLE_BASE]
      return {
        pos: mean(pts.map((p) => toPlayer(p, aspect))),
        dir: wrist && base ? unit(toPlayer(wrist, aspect), toPlayer(base, aspect)) : null,
        fist: isFist(hand.landmarks, aspect),
        source: 'hand'
      }
    }
  }
  // Fallback: pose wrist/index/pinky. Survives motion blur that defeats hand tracking.
  const left = side === 'left'
  const wristPt = pose[left ? POSE.leftWrist : POSE.rightWrist]
  const elbowPt = pose[left ? POSE.leftElbow : POSE.rightElbow]
  const wrist = seen(wristPt) ? toPlayer(wristPt, aspect) : null
  const knuckles = [
    left ? POSE.leftIndex : POSE.rightIndex,
    left ? POSE.leftPinky : POSE.rightPinky
  ]
    .map((i) => pose[i])
    .filter(seen)
    .map((p) => toPlayer(p, aspect))
  const pts = wrist ? [wrist, ...knuckles] : knuckles
  if (pts.length === 0) return null
  // Direction: wrist to knuckles, else along the forearm.
  const dir =
    wrist && knuckles.length
      ? unit(wrist, mean(knuckles))
      : wrist && seen(elbowPt)
        ? unit(toPlayer(elbowPt, aspect), wrist)
        : null
  return { pos: mean(pts), dir, fist: null, source: 'pose' }
}
