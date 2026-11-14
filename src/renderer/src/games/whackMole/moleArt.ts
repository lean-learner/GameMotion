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

/** A hedgehog (do not hit): a ring of pale-tipped spikes round a dark body, so it never reads as a mole. */
export function drawHedgehog(g: G, spot: Spot, edge: Edge, shown: number): void {
  if (shown <= 0) return
  const [dx, dy] = TOWARDS[edge]
  const s = spot.r * (0.55 + 0.45 * shown)
  const x = spot.x + dx * spot.r * 0.9 * (1 - shown)
  const y = spot.y + dy * spot.r * 0.9 * (1 - shown)
  // spikes: all round except under the chin
  const SPIKES = 13
  for (let i = 0; i < SPIKES; i++) {
    const a = Math.PI * (0.85 + (1.3 * i) / (SPIKES - 1))
    const w = 0.17
    const tipX = x + Math.cos(a) * s * 1.02
    const tipY = y + Math.sin(a) * s * 1.02
    g.fillStyle(0x3d3a4b, 1)
    g.fillTriangle(
      x + Math.cos(a - w) * s * 0.6,
      y + Math.sin(a - w) * s * 0.6,
      x + Math.cos(a + w) * s * 0.6,
      y + Math.sin(a + w) * s * 0.6,
      tipX,
      tipY
    )
    g.fillStyle(0xf2e9e4, 1)
    g.fillCircle(tipX, tipY, s * 0.05)
  }
  // body, then a pale face
  g.fillStyle(0x3d3a4b, 1)
  g.fillCircle(x, y, s * 0.68)
  g.fillStyle(0xf2d6b3, 1)
  g.fillEllipse(x, y + s * 0.2, s * 0.8, s * 0.66)
  // nose
  g.fillStyle(0x1b1b1b, 1)
  g.fillCircle(x, y + s * 0.34, s * 0.09)
  // eyes
  g.fillCircle(x - s * 0.2, y + s * 0.06, s * 0.07)
  g.fillCircle(x + s * 0.2, y + s * 0.06, s * 0.07)
  // red warning ring
  g.lineStyle(Math.max(3, s * 0.07), 0xe63946, 0.9 * shown)
  g.strokeCircle(x, y, s * 1.1)
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
