import { HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { Point, TrackingFrame } from '../tracking/types'

const POSE_CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS
const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS

/** Pose landmarks 0-10 are the face; drawn smaller to keep the skeleton readable. */
const FACE_LAST_INDEX = 10
const MIN_VISIBILITY = 0.5
/** Landmarks averaged to mark the palm centre: wrist + finger bases. */
const PALM_POINTS = [0, 5, 9, 13, 17]

const COLORS = {
  bone: 'rgba(255, 255, 255, 0.85)',
  joint: '#36d1ff',
  left: '#ffb02e',
  right: '#7cff6b'
}

/**
 * Draws tracking results on a canvas laid over the (mirrored) video. Landmarks
 * arrive in unmirrored image coordinates; the mirror is applied here so the
 * overlay lines up with what the player sees.
 */
export class OverlayRenderer {
  private readonly ctx: CanvasRenderingContext2D

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas not available')
    this.ctx = ctx
  }

  resize(width: number, height: number): void {
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  draw(frame: TrackingFrame): void {
    this.clear()
    const { width: w, height: h } = this.canvas
    const scale = Math.max(1, w / 1280)
    for (const pose of frame.poses) this.drawPose(pose, w, h, scale)
    for (const hand of frame.hands) {
      const color = hand.handedness === 'Left' ? COLORS.left : COLORS.right
      this.drawHand(hand.landmarks, hand.handedness, color, w, h, scale)
    }
  }

  /** Mirrored x in canvas pixels. */
  private px(p: Point, w: number): number {
    return (1 - p.x) * w
  }

  private drawPose(points: Point[], w: number, h: number, s: number): void {
    const ctx = this.ctx
    const visible = (p: Point | undefined): p is Point =>
      !!p && (p.visibility ?? 1) >= MIN_VISIBILITY

    ctx.strokeStyle = COLORS.bone
    ctx.lineWidth = 4 * s
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const { start, end } of POSE_CONNECTIONS) {
      const a = points[start]
      const b = points[end]
      if (start <= FACE_LAST_INDEX || !visible(a) || !visible(b)) continue
      ctx.moveTo(this.px(a, w), a.y * h)
      ctx.lineTo(this.px(b, w), b.y * h)
    }
    ctx.stroke()

    ctx.fillStyle = COLORS.joint
    points.forEach((p, i) => {
      if (!visible(p)) return
      const r = (i <= FACE_LAST_INDEX ? 3 : 6) * s
      ctx.beginPath()
      ctx.arc(this.px(p, w), p.y * h, r, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  private drawHand(
    points: Point[],
    label: string,
    color: string,
    w: number,
    h: number,
    s: number
  ): void {
    const ctx = this.ctx
    ctx.strokeStyle = color
    ctx.lineWidth = 3 * s
    ctx.beginPath()
    for (const { start, end } of HAND_CONNECTIONS) {
      const a = points[start]
      const b = points[end]
      if (!a || !b) continue
      ctx.moveTo(this.px(a, w), a.y * h)
      ctx.lineTo(this.px(b, w), b.y * h)
    }
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    for (const p of points) {
      ctx.beginPath()
      ctx.arc(this.px(p, w), p.y * h, 3.5 * s, 0, Math.PI * 2)
      ctx.fill()
    }

    // Palm-centre marker: the point future hand cursors will follow.
    const palm = PALM_POINTS.map((i) => points[i]).filter(Boolean)
    if (palm.length === 0) return
    const cx = palm.reduce((a, p) => a + this.px(p, w), 0) / palm.length
    const cy = palm.reduce((a, p) => a + p.y * h, 0) / palm.length
    ctx.lineWidth = 4 * s
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, 22 * s, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, 6 * s, 0, Math.PI * 2)
    ctx.fill()

    ctx.font = `600 ${18 * s}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.lineWidth = 4 * s
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    const text = `${label} hand`
    ctx.strokeText(text, cx, cy - 28 * s)
    ctx.fillText(text, cx, cy - 28 * s)
  }
}
