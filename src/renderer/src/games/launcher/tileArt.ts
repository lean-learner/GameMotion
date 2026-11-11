import type Phaser from 'phaser'
import type { Button } from '../ui'

type Art = NonNullable<Button['art']>
type G = Phaser.GameObjects.Graphics

const gradient = (
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  top: number,
  bottom: number
): void => {
  g.fillGradientStyle(top, top, bottom, bottom, 1, 1, 1, 1)
  g.fillRect(x, y, w, h)
}

/** Cover pictures for the launcher's game tiles, drawn with shapes (no image files). */
const ART: Record<string, Art> = {
  'fruit-chop': (g, x, y, w, h) => {
    gradient(g, x, y, w, h, 0x1b1033, 0xc2496b)
    const s = Math.min(w, h) / 240
    const fruit = (fx: number, fy: number, r: number, skin: number): void => {
      g.fillStyle(skin, 1)
      g.fillCircle(x + w * fx, y + h * fy, r * s)
      g.fillStyle(0xffffff, 0.3)
      g.fillEllipse(x + w * fx - r * s * 0.35, y + h * fy - r * s * 0.4, r * s * 0.5, r * s * 0.3)
    }
    fruit(0.26, 0.4, 34, 0xd92b3a)
    fruit(0.55, 0.26, 40, 0x2f9e44)
    fruit(0.78, 0.46, 30, 0xff8c1a)
    // The chop.
    g.lineStyle(10 * s, 0xffffff, 0.25)
    g.lineBetween(x + w * 0.08, y + h * 0.62, x + w * 0.94, y + h * 0.12)
    g.lineStyle(4 * s, 0xffffff, 0.95)
    g.lineBetween(x + w * 0.08, y + h * 0.62, x + w * 0.94, y + h * 0.12)
  },
  'balloon-pop': (g, x, y, w, h) => {
    gradient(g, x, y, w, h, 0x3d9be9, 0xbfe6ff)
    const s = Math.min(w, h) / 240
    const balloon = (bx: number, by: number, r: number, color: number): void => {
      const cx = x + w * bx
      const cy = y + h * by
      g.lineStyle(2, 0xffffff, 0.8)
      g.lineBetween(cx, cy + r * s * 1.1, cx + 5 * s, cy + r * s * 2.1)
      g.fillStyle(color, 1)
      g.fillEllipse(cx, cy, r * s * 1.8, r * s * 2.2)
      g.fillStyle(0xffffff, 0.35)
      g.fillEllipse(cx - r * s * 0.3, cy - r * s * 0.45, r * s * 0.4, r * s * 0.6)
    }
    balloon(0.25, 0.36, 30, 0xff4d6d)
    balloon(0.52, 0.26, 36, 0xffe14d)
    balloon(0.78, 0.4, 28, 0x4dd17a)
  },
  'meteor-dodge': (g, x, y, w, h) => {
    gradient(g, x, y, w, h, 0x050816, 0x1b2a5a)
    const s = Math.min(w, h) / 240
    g.fillStyle(0xffffff, 0.8)
    for (let i = 0; i < 14; i++) {
      // Fixed pseudo-random star positions, so they don't flicker between frames.
      g.fillCircle(x + w * ((i * 0.37) % 1), y + h * 0.6 * ((i * 0.61) % 1), 1.6 * s)
    }
    const meteor = (mx: number, my: number, r: number): void => {
      const cx = x + w * mx
      const cy = y + h * my
      g.lineStyle(r * s * 0.9, 0xffb347, 0.55)
      g.lineBetween(cx, cy, cx + 46 * s, cy - 60 * s)
      g.fillStyle(0x7a5c48, 1)
      g.fillCircle(cx, cy, r * s)
      g.fillStyle(0x5a4234, 1)
      g.fillCircle(cx - r * s * 0.3, cy + r * s * 0.2, r * s * 0.35)
    }
    meteor(0.3, 0.3, 20)
    meteor(0.68, 0.42, 26)
    // The player, leaning out of the way.
    g.fillStyle(0x4da3ff, 1)
    g.fillCircle(x + w * 0.46, y + h * 0.56, 11 * s)
    g.fillRect(x + w * 0.46 - 9 * s, y + h * 0.56 + 11 * s, 18 * s, 22 * s)
  }
}

export const tileArt = (gameId: string): Art | undefined => ART[gameId]
