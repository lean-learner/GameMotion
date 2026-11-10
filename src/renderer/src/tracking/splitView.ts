import type { HandResult, Point } from './types'

/**
 * Split-view tracking for two players. MediaPipe's person detector shrinks the
 * whole frame to ~224 px, so two people standing far enough back to share a
 * narrow webcam's view become too small to detect (measured: whole-frame
 * detection found 1 of 6 test people, per-half detection found 6 of 6). Each
 * half is therefore tracked separately, by its own models.
 *
 * Halves overlap a little so someone near the middle is never cut in two; a
 * person or hand seen by both halves is kept once.
 */
export interface View {
  /** Horizontal extent of the crop, as fractions of the frame width. */
  x0: number
  x1: number
}

export const FULL_VIEW: View = { x0: 0, x1: 1 }
export const SPLIT_VIEWS: View[] = [
  { x0: 0, x1: 0.55 },
  { x0: 0.45, x1: 1 }
]

/** Converts crop-normalised landmarks to full-frame normalised coordinates. */
export function toFullFrame(points: Point[], view: View): Point[] {
  const w = view.x1 - view.x0
  // MediaPipe's z uses the same scale as x (relative to image width).
  return points.map((p) => ({ ...p, x: view.x0 + p.x * w, z: p.z * w }))
}

const shoulderMid = (pose: Point[]): { x: number; y: number; width: number } | null => {
  const a = pose[11]
  const b = pose[12]
  if (!a || !b) return null
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, width: Math.hypot(a.x - b.x, a.y - b.y) }
}

/**
 * Drops a body seen twice (once by each half, in the overlap). The copy kept is
 * the one from the half its shoulders are actually in.
 */
export function dedupePoses(found: { pose: Point[]; view: View }[]): Point[][] {
  const kept: { pose: Point[]; view: View }[] = []
  for (const f of found) {
    const m = shoulderMid(f.pose)
    const twin = kept.findIndex((k) => {
      const n = shoulderMid(k.pose)
      return m && n && Math.hypot(m.x - n.x, m.y - n.y) < Math.max(m.width, n.width)
    })
    if (twin < 0) {
      kept.push(f)
      continue
    }
    // Same person: prefer the half whose centre side they are on.
    const inOwnHalf = (v: View, x: number): boolean => (v.x0 === 0 ? x < 0.5 : x >= 0.5)
    if (m && inOwnHalf(f.view, m.x) && !inOwnHalf(kept[twin].view, m.x)) kept[twin] = f
  }
  return kept.map((k) => k.pose)
}

/** Drops a hand seen twice (palms within a few percent of the frame). */
export function dedupeHands(hands: HandResult[]): HandResult[] {
  const palm = (h: HandResult): Point => h.landmarks[9] ?? h.landmarks[0]
  const kept: HandResult[] = []
  for (const h of hands) {
    const p = palm(h)
    if (!kept.some((k) => Math.hypot(palm(k).x - p.x, palm(k).y - p.y) < 0.03)) kept.push(h)
  }
  return kept
}
