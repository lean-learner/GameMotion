import type Phaser from 'phaser'
import { BALL_R, LANE, type Ball, type Pin } from './physics'
import { project, type LaneView } from './view'

type G = Phaser.GameObjects.Graphics

const WOOD = 0xd9a55b
const DECK = 0xf0cf94
const GUTTER = 0x15131f
const GUTTER_W = 0.2

function quad(g: G, v: LaneView, x0: number, x1: number, y0: number, y1: number): void {
  const a = project(v, x0, y0)
  const b = project(v, x1, y0)
  const c = project(v, x1, y1)
  const d = project(v, x0, y1)
  g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y)
  g.fillTriangle(a.x, a.y, c.x, c.y, d.x, d.y)
}

/** The lane, see-through so the player still sees themselves standing on it. */
export function drawLane(g: G, v: LaneView, color: number): void {
  const near = -0.9
  const far = LANE.end - 0.3
  g.fillStyle(GUTTER, 0.6)
  quad(g, v, -LANE.half - GUTTER_W, -LANE.half, near, far)
  quad(g, v, LANE.half, LANE.half + GUTTER_W, near, far)
  g.fillStyle(WOOD, 0.5)
  quad(g, v, -LANE.half, LANE.half, near, LANE.length - 0.5)
  g.fillStyle(DECK, 0.6)
  quad(g, v, -LANE.half, LANE.half, LANE.length - 0.5, far)
  // Boards, to give the eye something to aim along.
  g.lineStyle(1, 0x7a5327, 0.35)
  for (let i = -3; i <= 3; i++) {
    const a = project(v, (i * LANE.half) / 4, 0)
    const b = project(v, (i * LANE.half) / 4, LANE.length - 0.5)
    g.lineBetween(a.x, a.y, b.x, b.y)
  }
  // Aiming arrows a quarter of the way down.
  g.fillStyle(0x7a2e2e, 0.75)
  for (let i = -2; i <= 2; i++) {
    const y = 4.6 - Math.abs(i) * 0.45
    const tip = project(v, i * 0.19, y + 0.5)
    const l = project(v, i * 0.19 - 0.035, y)
    const r = project(v, i * 0.19 + 0.035, y)
    g.fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y)
  }
  // Foul line in the player's colour, and the lane's edges.
  const fl = project(v, -LANE.half, 0)
  const fr = project(v, LANE.half, 0)
  g.lineStyle(6, color, 0.95)
  g.lineBetween(fl.x, fl.y, fr.x, fr.y)
  g.lineStyle(3, 0xffffff, 0.5)
  for (const side of [-1, 1]) {
    const a = project(v, side * LANE.half, near)
    const b = project(v, side * LANE.half, far)
    g.lineBetween(a.x, a.y, b.x, b.y)
  }
}

/** A pin: standing, or lying where it fell. */
export function drawPin(g: G, v: LaneView, pin: Pin, alpha = 1): void {
  const p = project(v, pin.x, pin.y)
  const s = p.scale
  if (pin.down) {
    g.fillStyle(0xe8e6df, 0.85 * alpha)
    g.fillEllipse(p.x, p.y - 0.05 * s, 0.34 * s, 0.13 * s)
    g.fillStyle(0xd62839, 0.85 * alpha)
    g.fillRect(p.x + 0.07 * s, p.y - 0.105 * s, 0.03 * s, 0.11 * s)
    return
  }
  g.fillStyle(0x000000, 0.25 * alpha)
  g.fillEllipse(p.x, p.y, 0.2 * s, 0.07 * s)
  g.fillStyle(0xffffff, alpha)
  g.fillEllipse(p.x, p.y - 0.13 * s, 0.17 * s, 0.26 * s)
  g.fillRect(p.x - 0.03 * s, p.y - 0.31 * s, 0.06 * s, 0.1 * s)
  g.fillCircle(p.x, p.y - 0.33 * s, 0.052 * s)
  g.fillStyle(0xd62839, alpha)
  g.fillRect(p.x - 0.032 * s, p.y - 0.285 * s, 0.064 * s, 0.022 * s)
  g.fillRect(p.x - 0.032 * s, p.y - 0.25 * s, 0.064 * s, 0.014 * s)
}

/** The ball, its finger holes turning as it rolls. */
export function drawBall(g: G, v: LaneView, ball: Pick<Ball, 'x' | 'y'>, color: number): void {
  const p = project(v, ball.x, ball.y)
  const r = BALL_R * p.scale
  g.fillStyle(0x000000, 0.3)
  g.fillEllipse(p.x, p.y + r * 0.1, r * 2.1, r * 0.6)
  g.fillStyle(color, 1)
  g.fillCircle(p.x, p.y - r, r)
  g.fillStyle(0xffffff, 0.35)
  g.fillCircle(p.x - r * 0.35, p.y - r * 1.4, r * 0.28)
  const turn = ball.y / BALL_R
  if (Math.sin(turn) > -0.3) {
    const oy = -Math.cos(turn) * r * 0.6
    g.fillStyle(0x10101a, 0.9)
    g.fillCircle(p.x - r * 0.18, p.y - r + oy, r * 0.1)
    g.fillCircle(p.x + r * 0.18, p.y - r + oy, r * 0.1)
    g.fillCircle(p.x, p.y - r + oy + r * 0.24, r * 0.1)
  }
}
