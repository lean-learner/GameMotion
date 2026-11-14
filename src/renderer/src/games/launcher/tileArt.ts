import type Phaser from 'phaser'
import { drawFigure } from '../poseArt'
import type { Button } from '../ui'
import { drawBasket, drawItem } from '../skyCatch/art'
import { drawFootball } from '../goalkeeper/art'
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
  'obstacle-run': (g, x, y, w, h) => {
    gradient(g, x, y, w, h, 0x1d1a3a, 0xc2542d)
    // A small three-lane track, seen from where the runner stands.
    const cx = x + w / 2
    const at = (lane: number, s: number): { x: number; y: number } => ({
      x: cx + lane * w * 0.3 * s,
      y: y + h * (0.04 + 0.52 * s)
    })
    for (const edge of [-1.5, -0.5, 0.5, 1.5]) {
      const far = at(edge, 0.15)
      const near = at(edge, 1)
      g.lineStyle(Math.abs(edge) > 1 ? 3 : 2, 0xffffff, Math.abs(edge) > 1 ? 0.8 : 0.45)
      g.lineBetween(far.x, far.y, near.x, near.y)
    }
    // A hurdle further off.
    const hl = at(-1.5, 0.5)
    const hr = at(1.5, 0.5)
    for (let i = 0; i < 7; i++) {
      g.fillStyle(i % 2 ? 0xffffff : 0xe63946, 1)
      g.fillRect(
        hl.x + ((hr.x - hl.x) * i) / 7,
        hl.y - h * 0.08,
        (hr.x - hl.x) / 7 + 0.5,
        h * 0.035
      )
    }
    g.lineStyle(2, 0xffffff, 1)
    g.lineBetween(hl.x, hl.y - h * 0.08, hl.x, hl.y)
    g.lineBetween(hr.x, hr.y - h * 0.08, hr.x, hr.y)
    // A crate up close in one lane, a coin in another.
    const c = at(-1, 0.9)
    const cw = w * 0.2
    g.fillStyle(0xb5651d, 1)
    g.fillRect(c.x - cw / 2, c.y - cw * 0.8, cw, cw * 0.8)
    g.lineStyle(3, 0x5a2f0c, 1)
    g.strokeRect(c.x - cw / 2, c.y - cw * 0.8, cw, cw * 0.8)
    g.lineBetween(c.x - cw / 2, c.y - cw * 0.8, c.x + cw / 2, c.y)
    g.lineBetween(c.x + cw / 2, c.y - cw * 0.8, c.x - cw / 2, c.y)
    const coin = at(1, 0.85)
    g.fillStyle(0xffe14d, 1)
    g.fillCircle(coin.x, coin.y - h * 0.1, w * 0.05)
    g.lineStyle(2, 0xb8860b, 1)
    g.strokeCircle(coin.x, coin.y - h * 0.1, w * 0.033)
  },
  'jump-rope': (g, x, y, w, h) => {
    gradient(g, x, y, w, h, 0x14324a, 0x2a9d8f)
    const s = Math.min(w, h) / 240
    const cx = x + w / 2
    const rope = (cy: number, width: number, color: number, alpha: number): void => {
      g.lineStyle(width * s, color, alpha)
      let px = x + w * 0.1
      let py = y + h * 0.35
      for (let i = 1; i <= 16; i++) {
        const t = i / 16
        const nx = x + w * (0.1 + 0.8 * t)
        const ny =
          (1 - t) * (1 - t) * (y + h * 0.35) + 2 * t * (1 - t) * cy + t * t * (y + h * 0.35)
        g.lineBetween(px, py, nx, ny)
        px = nx
        py = ny
      }
    }
    rope(y - h * 0.25, 3, 0xffffff, 0.45)
    drawFigure(g, cx, y + h * 0.26, 20 * s, 'hands-up', { color: 0xffffff })
    rope(y + h * 0.8, 6, 0xff7eb6, 1)
  },
  'sky-catch': (g, x, y, w, h) => {
    gradient(g, x, y, w, h, 0x1c4e80, 0x3a7d44)
    const s = Math.min(w, h) / 240
    const item = (kind: 'fruit' | 'gold' | 'bomb', ix: number, iy: number, look = 0): void =>
      drawItem(g, { kind, x: x + w * ix, y: y + h * iy, r: 22 * s, vx: 0, look })
    item('fruit', 0.2, 0.2)
    item('bomb', 0.8, 0.22)
    item('gold', 0.5, 0.16)
    drawBasket(g, x + w * 0.5, y + h * 0.42, 70 * s, 0xffd166)
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
  },
  goalkeeper: (g, x, y, w, h) => {
    gradient(g, x, y, w, h, 0x071d29, 0x17623b)
    const s = Math.min(w, h) / 240
    g.lineStyle(4 * s, 0xffffff, 1)
    g.strokeRect(x + w * 0.12, y + h * 0.12, w * 0.76, h * 0.65)
    g.lineStyle(1, 0xffffff, 0.3)
    for (let i = 1; i < 6; i++) {
      const px = x + w * (0.12 + (i * 0.76) / 6)
      g.lineBetween(px, y + h * 0.12, px, y + h * 0.77)
    }
    drawFootball(g, x + w * 0.65, y + h * 0.4, 33 * s)
    drawFigure(g, x + w * 0.35, y + h * 0.48, 26 * s, 'hands-up', { color: 0xa5f56b })
  },

  bowling: (g, x, y, w, h) => {
    gradient(g, x, y, w, h, 0x160f33, 0x43206b)
    const s = Math.min(w, h) / 240
    // A lane running away to the pins.
    g.fillStyle(0xd9a55b, 1)
    g.fillTriangle(x + w * 0.2, y + h, x + w * 0.8, y + h, x + w * 0.6, y + h * 0.12)
    g.fillTriangle(x + w * 0.2, y + h, x + w * 0.6, y + h * 0.12, x + w * 0.4, y + h * 0.12)
    // Pins: back row first.
    const rows: [number, number[]][] = [
      [0.2, [-1.5, -0.5, 0.5, 1.5]],
      [0.26, [-1, 0, 1]],
      [0.32, [-0.5, 0.5]],
      [0.38, [0]]
    ]
    for (const [fy, across] of rows) {
      for (const a of across) {
        const px = x + w * 0.5 + a * 20 * s
        const py = y + h * fy
        g.fillStyle(0xffffff, 1)
        g.fillEllipse(px, py, 13 * s, 24 * s)
        g.fillCircle(px, py - 15 * s, 5 * s)
        g.fillStyle(0xd62839, 1)
        g.fillRect(px - 4 * s, py - 11 * s, 8 * s, 3 * s)
      }
    }
    // The ball on its way.
    g.fillStyle(0x3ddad7, 1)
    g.fillCircle(x + w * 0.56, y + h * 0.68, 26 * s)
    g.fillStyle(0x160f33, 1)
    g.fillCircle(x + w * 0.56 - 7 * s, y + h * 0.68 - 9 * s, 3.5 * s)
    g.fillCircle(x + w * 0.56 + 6 * s, y + h * 0.68 - 10 * s, 3.5 * s)
    g.fillCircle(x + w * 0.56, y + h * 0.68 - 1 * s, 3.5 * s)
  }
}

export const tileArt = (gameId: string): Art | undefined => ART[gameId]
