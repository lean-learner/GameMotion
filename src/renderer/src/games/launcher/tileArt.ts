import type Phaser from 'phaser'
import { drawFigure } from '../poseArt'
import type { Button } from '../ui'
import { drawMole } from '../whackMole/moleArt'

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
  },
  'human-bridge': (g, x, y, w, h) => {
    gradient(g, x, y, w, h, 0x5b2a86, 0xff8a3d)
    const s = Math.min(w, h) / 240
    const sw = 26 * s
    const cy = y + h * 0.36
    // Two people joining hands in the middle.
    const reach = (w * 0.2) / sw
    drawFigure(
      g,
      x + w * 0.3,
      cy,
      sw,
      'left-up',
      { color: 0xffffff },
      {
        left: { x: -0.75, y: 1.25 },
        right: { x: reach, y: -0.3 }
      }
    )
    drawFigure(
      g,
      x + w * 0.7,
      cy,
      sw,
      'right-up',
      { color: 0xffffff },
      {
        left: { x: -reach, y: -0.3 },
        right: { x: 0.75, y: 1.25 }
      }
    )
    g.fillStyle(0xffe14d, 1)
    g.fillCircle(x + w * 0.5, cy - 0.3 * sw, 9 * s)
    g.fillStyle(0xffe14d, 0.3)
    g.fillCircle(x + w * 0.5, cy - 0.3 * sw, 18 * s)
  },
  'mirror-duel': (g, x, y, w, h) => {
    gradient(g, x, y, w, h, 0x12b3a8, 0x0b2545)
    const s = Math.min(w, h) / 240
    const sw = 26 * s
    // The same pose on both sides of the mirror.
    drawFigure(g, x + w * 0.28, y + h * 0.4, sw, 'disco-right', { color: 0xffffff })
    drawFigure(g, x + w * 0.72, y + h * 0.4, sw, 'disco-left', { color: 0xfff3b0 })
    g.lineStyle(3 * s, 0xffffff, 0.7)
    g.lineBetween(x + w * 0.5, y + h * 0.06, x + w * 0.5, y + h * 0.72)
  },
  'freeze-dance': (g, x, y, w, h) => {
    gradient(g, x, y, w, h, 0x2a0a4a, 0xd6336c)
    const s = Math.min(w, h) / 240
    drawFigure(g, x + w * 0.36, y + h * 0.4, 26 * s, 'disco-left', { color: 0xffffff })
    // The light: green to dance, red to freeze.
    const lx = x + w * 0.74
    g.fillStyle(0x000000, 0.55)
    g.fillRoundedRect(lx - 26 * s, y + h * 0.12, 52 * s, 104 * s, 26 * s)
    g.fillStyle(0x3ddc84, 1)
    g.fillCircle(lx, y + h * 0.12 + 28 * s, 18 * s)
    g.fillStyle(0xff4d4d, 1)
    g.fillCircle(lx, y + h * 0.12 + 76 * s, 18 * s)
  },
  'punch-fly': (g, x, y, w, h) => {
    gradient(g, x, y, w, h, 0x1b4332, 0x74c69d)
    const s = Math.min(w, h) / 240
    const fly = (fx: number, fy: number, r: number): void => {
      const cx = x + w * fx
      const cy = y + h * fy
      g.fillStyle(0xffffff, 0.65)
      g.fillEllipse(cx - r * s * 0.9, cy - r * s * 0.8, r * s * 1.6, r * s)
      g.fillEllipse(cx + r * s * 0.9, cy - r * s * 0.8, r * s * 1.6, r * s)
      g.fillStyle(0x1f2a1f, 1)
      g.fillCircle(cx, cy, r * s)
      g.fillStyle(0xd62828, 1)
      g.fillCircle(cx - r * s * 0.4, cy - r * s * 0.2, r * s * 0.28)
      g.fillCircle(cx + r * s * 0.4, cy - r * s * 0.2, r * s * 0.28)
    }
    fly(0.24, 0.26, 13)
    fly(0.52, 0.5, 16)
    // A glove swinging in from the right.
    g.lineStyle(4 * s, 0xffffff, 0.7)
    g.lineBetween(x + w * 0.9, y + h * 0.22, x + w * 0.97, y + h * 0.18)
    g.lineBetween(x + w * 0.91, y + h * 0.34, x + w * 0.98, y + h * 0.34)
    g.fillStyle(0xe63946, 1)
    g.fillCircle(x + w * 0.78, y + h * 0.28, 26 * s)
    g.fillCircle(x + w * 0.7, y + h * 0.36, 11 * s)
    g.fillStyle(0xffffff, 0.3)
    g.fillCircle(x + w * 0.75, y + h * 0.22, 8 * s)
  },
  'whack-mole': (g, x, y, w, h) => {
    gradient(g, x, y, w, h, 0x3b2a1a, 0x8fbf5a)
    const s = Math.min(w, h) / 240
    // Holes on the left, the right and at the bottom; a mole is out of two of them.
    const holes: [number, number, boolean][] = [
      [0.2, 0.34, true],
      [0.8, 0.3, false],
      [0.5, 0.62, true]
    ]
    for (const [fx, fy, up] of holes) {
      const spot = { x: x + w * fx, y: y + h * fy, r: 30 * s }
      g.fillStyle(0x2b1a0e, 0.85)
      g.fillEllipse(spot.x, spot.y, spot.r * 2, spot.r * 1.5)
      if (up) drawMole(g, spot, 'bottom', 1, fx === 0.5)
    }
    // A mallet coming down on the empty hole.
    g.lineStyle(7 * s, 0xe9d8a6, 1)
    g.lineBetween(x + w * 0.95, y + h * 0.04, x + w * 0.84, y + h * 0.2)
    g.fillStyle(0xb5651d, 1)
    g.fillRoundedRect(x + w * 0.72, y + h * 0.14, 46 * s, 30 * s, 8 * s)
  }
}

export const tileArt = (gameId: string): Art | undefined => ART[gameId]
