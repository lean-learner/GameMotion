import type { Vec2 } from '../../input/types'
import type { BodyInput } from '../poses'

export interface Goal {
  x: number
  y: number
  sw: number
  left: number
  right: number
  top: number
  bottom: number
}

/** Anchor once, so stepping and crouching move the keeper, not the goal. */
export function goalView(body: BodyInput, player: number, count: number): Goal {
  const left = count > 1 ? player * 640 + 22 : 22
  const right = count > 1 ? (player + 1) * 640 - 22 : 1258
  const sw = Math.max(30, Math.min(body.sw, (right - left) / 4.4, 570 / 3.3))
  const x = Math.max(left + 2.2 * sw, Math.min(right - 2.2 * sw, body.x))
  const y = Math.max(100 + 1.3 * sw, Math.min(700 - 2 * sw, body.y))
  return {
    x,
    y,
    sw,
    left: x - 2.2 * sw,
    right: x + 2.2 * sw,
    top: y - 1.3 * sw,
    bottom: y + 2 * sw
  }
}

export function goalSpot(goal: Goal, offset: Vec2): Vec2 {
  return { x: goal.x + offset.x * goal.sw, y: goal.y + offset.y * goal.sw }
}

export function canSave(body: BodyInput | null, spot: Vec2): boolean {
  if (!body || body.sw <= 0) return false
  if (
    Object.values(body.hands).some(
      (h) => h && Math.hypot(h.x - spot.x, h.y - spot.y) <= body.sw * 0.45
    )
  )
    return true
  // The standing torso ends above low shots. Crouching moves the shoulders down.
  return (
    Math.abs(spot.x - body.x) <= body.sw * 0.55 &&
    spot.y >= body.y - body.sw * 0.2 &&
    spot.y <= body.y + body.sw * (body.crouching ? 0.9 : 1.1)
  )
}

export interface Flight {
  from: number
  duration: number
  offset: Vec2
  curve: number
}
export function ballPosition(
  goal: Goal,
  shot: Flight,
  elapsed: number
): Vec2 & { r: number; progress: number } {
  const progress = Math.max(0, Math.min(1, (elapsed - shot.from) / shot.duration))
  const spot = goalSpot(goal, shot.offset)
  return {
    x: goal.x + (spot.x - goal.x) * progress + Math.sin(progress * Math.PI) * shot.curve * goal.sw,
    y: goal.top + (spot.y - goal.top) * progress,
    r: goal.sw * (0.045 + 0.13 * progress * progress),
    progress
  }
}
