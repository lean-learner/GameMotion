import type Phaser from 'phaser'
import type { Vec2 } from '../../input/types'

export function drawTarget(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
  g.fillStyle(0x000000, 0.3)
  g.fillCircle(x + 6, y + 8, r + 5)
  const colors = [
    0xf5f2e8, 0xf5f2e8, 0x202c38, 0x202c38, 0x339ae7, 0x339ae7, 0xe4444a, 0xe4444a, 0xffd34d,
    0xffd34d
  ]
  for (let i = 0; i < 10; i++) {
    g.fillStyle(colors[i], 1)
    g.fillCircle(x, y, (r * (10 - i)) / 10)
    g.lineStyle(1, 0x081320, 0.5)
    g.strokeCircle(x, y, (r * (10 - i)) / 10)
  }
  g.lineStyle(1, 0x081320, 0.8)
  g.lineBetween(x - 4, y, x + 4, y)
  g.lineBetween(x, y - 4, x, y + 4)
}

/** A small hole with a bright rim, visible on every target ring. */
export function drawHit(g: Phaser.GameObjects.Graphics, p: Vec2, color: number, size = 1): void {
  g.fillStyle(0x07121c, 1)
  g.fillCircle(p.x, p.y, 5 * size)
  g.lineStyle(2 * size, color, 1)
  g.strokeCircle(p.x, p.y, 7 * size)
}
