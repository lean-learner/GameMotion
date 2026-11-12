import type Phaser from 'phaser'
import type { Side, Vec2 } from '../input/types'
import { poseHands, type Pose } from './poses'

/** How a stick figure is drawn. */
export interface FigureStyle {
  color: number
  alpha?: number
  /** Line thickness as a share of the shoulder width. */
  weight?: number
}

/**
 * Draws a stick figure holding a pose, like a mirror image of the player:
 * the figure's left hand is on the left of the screen.
 * (x, y) is the middle of the shoulders and `sw` the shoulder width in pixels,
 * so a figure can be laid exactly over a player in the camera view.
 * `hands` overrides where the hands go (offsets in shoulder widths).
 */
export function drawFigure(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  sw: number,
  pose: Pose,
  style: FigureStyle,
  hands: Partial<Record<Side, Vec2>> = {}
): void {
  const duck = pose === 'duck'
  const at = (dx: number, dy: number): Vec2 => ({ x: x + dx * sw, y: y + dy * sw })
  const line = (a: Vec2, b: Vec2): void => {
    g.lineBetween(a.x, a.y, b.x, b.y)
  }
  // A ducking figure sits lower with bent knees.
  const drop = duck ? 0.7 : 0
  const shoulder = { left: at(-0.5, drop), right: at(0.5, drop) }
  const hip = at(0, drop + 1.45)
  const weight = (style.weight ?? 0.16) * sw
  g.lineStyle(weight, style.color, style.alpha ?? 1)
  g.fillStyle(style.color, style.alpha ?? 1)

  // Head, shoulders, spine.
  // (A very thick outline is drawn as a solid head: it is being used as a cut-out.)
  const headY = y + (drop - 0.78) * sw
  if (weight > 0.3 * sw) g.fillCircle(x, headY, 0.4 * sw + weight / 2)
  else g.strokeCircle(x, headY, 0.4 * sw)
  line(shoulder.left, shoulder.right)
  line(at(0, drop), hip)

  // Legs: straight when standing, knees out when ducking.
  for (const side of [-1, 1]) {
    const foot = at(side * 0.5, 3.1)
    if (duck) {
      const knee = at(side * 0.95, drop + 1.75)
      line(hip, knee)
      line(knee, foot)
    } else {
      line(hip, foot)
    }
  }

  // Arms, with a slight bend at the elbow.
  const target = { ...poseHands(pose), ...hands }
  for (const side of ['left', 'right'] as const) {
    const s = shoulder[side]
    const hand = at(target[side].x, target[side].y + drop)
    const elbow = {
      x: (s.x + hand.x) / 2 + (side === 'left' ? -0.12 : 0.12) * sw,
      y: (s.y + hand.y) / 2 + 0.1 * sw
    }
    line(s, elbow)
    line(elbow, hand)
    g.fillCircle(hand.x, hand.y, weight * 0.9)
  }
  // Round the joints so thick lines don't show gaps.
  for (const p of [shoulder.left, shoulder.right, hip]) g.fillCircle(p.x, p.y, weight / 2)
}
