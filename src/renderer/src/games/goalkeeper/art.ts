import type Phaser from 'phaser'
import type { Goal } from './geometry'

export function drawGoal(g: Phaser.GameObjects.Graphics, v: Goal, color: number): void {
  const w = v.right - v.left
  const h = v.bottom - v.top
  g.fillStyle(0x104027, 0.12)
  g.fillRect(v.left, v.top, w, h)
  g.lineStyle(1.5, 0xffffff, 0.22)
  for (let i = 1; i < 10; i++) {
    const x = v.left + (w * i) / 10
    g.lineBetween(x, v.top, x, v.bottom)
  }
  for (let i = 1; i < 7; i++) {
    const y = v.top + (h * i) / 7
    g.lineBetween(v.left, y, v.right, y)
  }
  g.lineStyle(12, color, 0.3)
  g.strokeRect(v.left, v.top, w, h)
  g.lineStyle(5, 0xffffff, 1)
  g.lineBetween(v.left, v.bottom, v.left, v.top)
  g.lineBetween(v.left, v.top, v.right, v.top)
  g.lineBetween(v.right, v.top, v.right, v.bottom)
}

export function drawFootball(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  r: number
): void {
  g.fillStyle(0x000000, 0.25)
  g.fillCircle(x + r * 0.15, y + r * 0.2, r)
  g.fillStyle(0xffffff, 1)
  g.fillCircle(x, y, r)
  g.lineStyle(2, 0x14263b, 1)
  g.strokeCircle(x, y, r)
  g.fillStyle(0x14263b, 1)
  g.fillCircle(x, y, r * 0.33)
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5
    g.fillCircle(x + Math.cos(angle) * r * 0.83, y + Math.sin(angle) * r * 0.83, r * 0.18)
  }
}
