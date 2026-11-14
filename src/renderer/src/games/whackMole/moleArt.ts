import type Phaser from 'phaser'
import { FRAME, type Edge } from './holes'

type G = Phaser.GameObjects.Graphics
interface Spot {
  x: number
  y: number
  r: number
}

/** Which way a hole's side of the picture lies: [across, down]. */
const TOWARDS: Record<Edge, [number, number]> = { left: [-1, 0], right: [1, 0], bottom: [0, 1] }

/** A hole, with a trail of dug earth leading to it from its side of the picture. */
export function drawHole(g: G, spot: Spot, edge: Edge, color: number): void {
  const ex = edge === 'left' ? 0 : edge === 'right' ? FRAME.width : spot.x
  const ey = edge === 'bottom' ? FRAME.height : spot.y
  const n = Math.max(1, Math.floor(Math.hypot(ex - spot.x, ey - spot.y) / (spot.r * 0.7)))
  g.fillStyle(0x6b4423, 0.55)
  for (let i = 0; i < n; i++) {
    const k = i / n
    g.fillCircle(ex + (spot.x - ex) * k, ey + (spot.y - ey) * k, spot.r * 0.22)
  }
  g.fillStyle(0x2b1a0e, 0.8)
  g.fillEllipse(spot.x, spot.y, spot.r * 2, spot.r * 1.5)
  g.lineStyle(5, color, 0.9)
  g.strokeEllipse(spot.x, spot.y, spot.r * 2, spot.r * 1.5)
}

/** A mole coming out of its hole from its side of the picture; `shown` is 0 (hidden) to 1 (fully out). */
export function drawMole(g: G, spot: Spot, edge: Edge, shown: number, gold: boolean): void {
  if (shown <= 0) return
  const [dx, dy] = TOWARDS[edge]
  const s = spot.r * (0.55 + 0.45 * shown)
  const x = spot.x + dx * spot.r * 0.9 * (1 - shown)
  const y = spot.y + dy * spot.r * 0.9 * (1 - shown)
  const fur = gold ? 0xffc93c : 0x8d5a2b
  // ears, then head
  g.fillStyle(fur, 1)
  g.fillCircle(x - s * 0.55, y - s * 0.5, s * 0.16)
  g.fillCircle(x + s * 0.55, y - s * 0.5, s * 0.16)
  g.fillCircle(x, y, s * 0.72)
  // snout
  g.fillStyle(gold ? 0xfff1b8 : 0xe2b98a, 1)
  g.fillEllipse(x, y + s * 0.22, s * 0.62, s * 0.44)
  // teeth
  g.fillStyle(0xffffff, 1)
  g.fillRect(x - s * 0.07, y + s * 0.26, s * 0.14, s * 0.16)
  // nose
  g.fillStyle(0xd94f70, 1)
  g.fillCircle(x, y + s * 0.1, s * 0.11)
  // eyes
  g.fillStyle(0x1b1b1b, 1)
  g.fillCircle(x - s * 0.26, y - s * 0.2, s * 0.08)
  g.fillCircle(x + s * 0.26, y - s * 0.2, s * 0.08)
}
