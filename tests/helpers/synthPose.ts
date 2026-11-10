import type { Point, TrackingFrame } from '../../src/renderer/src/tracking/types'
import type { Vec2 } from '../../src/renderer/src/input/types'

export const ASPECT = 16 / 9

/** A posed body described in player space (mirrored, x in 0..ASPECT, y in 0..1). */
export interface PoseSpec {
  cx?: number // shoulder midpoint
  cy?: number
  sw?: number // shoulder width
  tiltDeg?: number // + = right shoulder lower (lean right)
  hips?: boolean
  hipOffset?: number // shoulders this many sw to the right of the hips
  leftWrist?: Vec2 | null // default: arm hanging down
  rightWrist?: Vec2 | null
  hands?: TrackingFrame['hands']
}

/** Builds a TrackingFrame whose landmarks are in raw (unmirrored) camera space. */
export function synthFrame(spec: PoseSpec, t: number): TrackingFrame {
  const { cx = 0.89, cy = 0.35, sw = 0.25, tiltDeg = 0, hips = true, hipOffset = 0 } = spec
  const a = (tiltDeg * Math.PI) / 180
  const half = { x: (Math.cos(a) * sw) / 2, y: (Math.sin(a) * sw) / 2 }
  const ls = { x: cx - half.x, y: cy - half.y }
  const rs = { x: cx + half.x, y: cy + half.y }
  const lw =
    spec.leftWrist === undefined ? { x: ls.x - 0.1 * sw, y: cy + 1.4 * sw } : spec.leftWrist
  const rw =
    spec.rightWrist === undefined ? { x: rs.x + 0.1 * sw, y: cy + 1.4 * sw } : spec.rightWrist
  const hipMid = { x: cx - hipOffset * sw, y: cy + 1.3 * sw }

  const pose: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }))
  const put = (i: number, p: Vec2 | null): void => {
    if (p) pose[i] = { x: 1 - p.x / ASPECT, y: p.y, z: 0, visibility: 0.99 }
  }
  put(0, { x: cx, y: cy - 0.6 * sw })
  put(11, ls)
  put(12, rs)
  for (const i of [15, 17, 19]) put(i, lw)
  for (const i of [16, 18, 20]) put(i, rw)
  if (hips) {
    put(23, { x: hipMid.x - 0.35 * sw, y: hipMid.y })
    put(24, { x: hipMid.x + 0.35 * sw, y: hipMid.y })
  }
  return { frameTime: t, pose, poses: [pose], hands: spec.hands ?? [], poseMs: 0, handsMs: 0 }
}

/** Runs `spec(i, t)` at 30 fps for `ms` starting at `t0`; returns the frames. */
export function sequence(t0: number, ms: number, spec: (t: number) => PoseSpec): TrackingFrame[] {
  const out: TrackingFrame[] = []
  for (let t = t0; t <= t0 + ms; t += 1000 / 30) out.push(synthFrame(spec(t), t))
  return out
}
