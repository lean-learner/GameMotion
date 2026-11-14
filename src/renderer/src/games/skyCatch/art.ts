import type Phaser from 'phaser'
import { BASKET, type Item } from './logic'

type G = Phaser.GameObjects.Graphics

const FRUIT = [0xe63946, 0xff9f1c, 0x8ac926]

export function drawItem(g: G, item: Pick<Item, 'kind' | 'x' | 'y' | 'r' | 'vx' | 'look'>): void {
  const { x, y, r } = item
  switch (item.kind) {
    case 'bomb':
      g.fillStyle(0xff3030, 0.28)
      g.fillCircle(x, y, r * 1.5)
      g.fillStyle(0x1b1b1b, 1)
      g.fillCircle(x, y, r)
      g.lineStyle(r * 0.14, 0xff3030, 1)
      g.strokeCircle(x, y, r)
      g.lineStyle(r * 0.16, 0xd9b38c, 1)
      g.lineBetween(x + r * 0.5, y - r * 0.8, x + r * 0.85, y - r * 1.35)
      g.fillStyle(0xffe14d, 1)
      g.fillCircle(x + r * 0.9, y - r * 1.42, r * 0.22)
      g.fillStyle(0xffffff, 0.9)
      g.fillRect(x - r * 0.45, y - r * 0.08, r * 0.9, r * 0.16)
      break
    case 'comet': {
      // A tail streaming out behind it.
      const back = item.vx > 0 ? -1 : 1
      for (let i = 4; i >= 1; i--) {
        g.fillStyle(0x7fdbff, 0.16 * (5 - i))
        g.fillCircle(x + back * r * 0.75 * i, y, r * (1 - i * 0.16))
      }
      g.fillStyle(0xffffff, 1)
      g.fillCircle(x, y, r)
      g.lineStyle(r * 0.2, 0x7fdbff, 1)
      g.strokeCircle(x, y, r)
      break
    }
    default: {
      const gold = item.kind === 'gold'
      if (gold) {
        g.fillStyle(0xffe14d, 0.3)
        g.fillCircle(x, y, r * 1.5)
      }
      g.fillStyle(gold ? 0xffd60a : FRUIT[item.look % FRUIT.length], 1)
      g.fillCircle(x, y, r)
      g.fillStyle(0xffffff, 0.4)
      g.fillEllipse(x - r * 0.35, y - r * 0.4, r * 0.5, r * 0.32)
      g.lineStyle(r * 0.14, 0x5a2f0c, 1)
      g.lineBetween(x, y - r * 0.9, x + r * 0.15, y - r * 1.3)
      g.fillStyle(0x2f9e44, 1)
      g.fillEllipse(x + r * 0.42, y - r * 1.15, r * 0.5, r * 0.26)
    }
  }
}

/** The basket at a player's chest; (x, y) is the middle of the shoulders. */
export function drawBasket(g: G, x: number, y: number, sw: number, color: number): void {
  const top = y - BASKET.above * sw
  const bottom = y + BASKET.below * sw
  const wide = BASKET.half * sw
  const narrow = wide * 0.72
  g.fillStyle(0x9c6b30, 0.82)
  g.fillTriangle(x - wide, top, x + wide, top, x + narrow, bottom)
  g.fillTriangle(x - wide, top, x + narrow, bottom, x - narrow, bottom)
  g.lineStyle(2, 0x5a2f0c, 0.8)
  for (let i = 1; i < 4; i++) {
    const ly = top + ((bottom - top) * i) / 4
    const half = wide + ((narrow - wide) * i) / 4
    g.lineBetween(x - half, ly, x + half, ly)
  }
  g.lineStyle(Math.max(4, sw * 0.06), color, 1)
  g.lineBetween(x - wide, top, x + wide, top)
  g.lineBetween(x - wide, top, x - narrow, bottom)
  g.lineBetween(x + wide, top, x + narrow, bottom)
  g.lineBetween(x - narrow, bottom, x + narrow, bottom)
}
