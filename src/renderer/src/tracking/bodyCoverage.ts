import type { Point } from './types'

/**
 * How much of the body the camera sees, from the pose landmarks. Used to judge
 * framing (narrow webcams often cut off below the waist) and, later, to decide
 * which gestures can be detected reliably.
 */
export type BodyExtent = 'none' | 'head' | 'shoulders' | 'hips' | 'knees' | 'ankles'

const MIN_VISIBILITY = 0.6
/** Landmark pairs (left, right) from top to bottom, MediaPipe pose topology. */
const LEVELS: [Exclude<BodyExtent, 'none'>, number[]][] = [
  ['head', [0]],
  ['shoulders', [11, 12]],
  ['hips', [23, 24]],
  ['knees', [25, 26]],
  ['ankles', [27, 28]]
]

function inView(p: Point | undefined): boolean {
  return (
    !!p && (p.visibility ?? 0) >= MIN_VISIBILITY && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
  )
}

/** Lowest body level that is fully in frame, counting down from the head without gaps. */
export function bodyExtent(pose: Point[] | null): BodyExtent {
  if (!pose) return 'none'
  let extent: BodyExtent = 'none'
  for (const [level, indices] of LEVELS) {
    // One side is enough: people often stand slightly turned.
    if (!indices.some((i) => inView(pose[i]))) break
    extent = level
  }
  return extent
}
