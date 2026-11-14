import type { Vec2 } from '../../input/types'

export const ROUNDS = 10
export const SHOTS = 3
export const SETTLE_MS = 450

/** All positions are in radii of the first target, independent of player count. */
export function targetAt(round: number, t: number): Vec2 & { r: number } {
  return {
    x: round >= 6 ? Math.sin(t / (1500 - (round - 6) * 110)) * 0.45 : 0,
    y: 0,
    r: 1 - Math.floor(round / 2) * 0.1
  }
}
export function ringScore(hit: Vec2, target: Vec2 & { r: number }): number {
  const distance = Math.hypot(hit.x - target.x, hit.y - target.y) / target.r
  return distance > 1 ? 0 : Math.min(10, Math.max(1, Math.ceil(10 * (1 - distance))))
}
export function rangeView(player: number, count: number): { x: number; y: number; scale: number } {
  return { x: count > 1 ? (player === 0 ? 150 : 1130) : 1040, y: 290, scale: count > 1 ? 95 : 145 }
}
