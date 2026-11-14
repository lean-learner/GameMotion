import { LANE } from './physics'

/**
 * How a lane is drawn over the camera picture (no Phaser): seen from behind the
 * bowler, the foul line at the bottom of the frame and the pins far away near the top.
 */
export interface LaneView {
  /** Middle of the lane on screen, px. */
  cx: number
  /** Half the lane's width at the foul line, px. */
  nearHalf: number
  /** Screen y of the foul line and of the head pin. */
  bottom: number
  farY: number
}

/** Things at the pins are drawn this much smaller than at the foul line. */
const FAR = 0.42
const DEPTH = (1 / FAR - 1) / LANE.length
/** The ball can start this far from the middle of the lane, m. */
export const AIM_MAX = 0.45

/** One lane in the middle for one player; a lane each, side by side, for two. */
export function laneView(player: number, count: number): LaneView {
  if (count < 2) return { cx: 640, nearHalf: 230, bottom: 700, farY: 215 }
  return { cx: player === 0 ? 320 : 960, nearHalf: 150, bottom: 700, farY: 215 }
}

/** Where a point on the lane (metres) is on screen, and how many pixels a metre is there. */
export function project(
  v: LaneView,
  x: number,
  y: number
): { x: number; y: number; scale: number } {
  const s = 1 / (1 + y * DEPTH)
  const horizon = (v.farY - v.bottom * FAR) / (1 - FAR)
  const scale = (v.nearHalf / LANE.half) * s
  return { x: v.cx + x * scale, y: horizon + (v.bottom - horizon) * s, scale }
}

/** Where the ball starts for a player standing at screen x: right under them. */
export function aimAt(v: LaneView, bodyX: number): number {
  const x = ((bodyX - v.cx) / v.nearHalf) * LANE.half
  return Math.max(-AIM_MAX, Math.min(AIM_MAX, x))
}
