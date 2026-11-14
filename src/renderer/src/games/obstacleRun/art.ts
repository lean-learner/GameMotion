import type Phaser from 'phaser'
import type { Vec2 } from '../../input/types'
import type { Track } from './logic'

type G = Phaser.GameObjects.Graphics

/** Top of the track (the horizon) and where it reaches the players. */
export const HORIZON = 150
export const FLOOR = 704
/** How much smaller things are at the horizon. */
const FAR = 6

/** Size of something `p` of the way down the track (1 at the players). */
export const scaleAt = (p: number): number => 1 / (1 + FAR * (1 - Math.min(p, 1.03)))

/** A point on the track floor: `lane` in lane widths from the middle, `p` down the track. */
export function spot(track: Track, lane: number, p: number): Vec2 & { s: number } {
  const s = scaleAt(p)
  return { x: track.cx + lane * track.laneW * s, y: HORIZON + (FLOOR - HORIZON) * s, s }
}

/** A height above the floor that reaches screen height `y` at the players. */
const raised = (y: number, s: number): number => HORIZON + (y - HORIZON) * s

export function drawTrack(g: G, track: Track, lane: number | null, color: number): void {
  if (lane !== null) {
    // The lane the player is in, lit up near them.
    const a = spot(track, lane - 0.5, 0.86)
    const b = spot(track, lane + 0.5, 0.86)
    const c = spot(track, lane + 0.5, 1)
    const d = spot(track, lane - 0.5, 1)
    g.fillStyle(color, 0.22)
    g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y)
    g.fillTriangle(a.x, a.y, c.x, c.y, d.x, d.y)
  }
  for (const edge of [-1.5, -0.5, 0.5, 1.5]) {
    const far = spot(track, edge, 0)
    const near = spot(track, edge, 1)
    g.lineStyle(Math.abs(edge) > 1 ? 5 : 3, 0xffffff, Math.abs(edge) > 1 ? 0.7 : 0.4)
    g.lineBetween(far.x, far.y, near.x, near.y)
  }
}

export function drawCrate(g: G, track: Track, lane: number, p: number, alpha = 1): void {
  const at = spot(track, lane, p)
  const w = track.laneW * at.s * 0.8
  const h = w * 0.8
  const x = at.x - w / 2
  const y = at.y - h
  g.fillStyle(0x000000, 0.3 * alpha)
  g.fillEllipse(at.x, at.y, w * 1.1, h * 0.18)
  g.fillStyle(0xb5651d, alpha)
  g.fillRect(x, y, w, h)
  g.lineStyle(Math.max(2, w * 0.07), 0x5a2f0c, alpha)
  g.strokeRect(x, y, w, h)
  g.lineBetween(x, y, x + w, y + h)
  g.lineBetween(x + w, y, x, y + h)
}

export function drawHurdle(g: G, track: Track, p: number, alpha = 1): void {
  const left = spot(track, -1.5, p)
  const right = spot(track, 1.5, p)
  const h = track.laneW * left.s * 0.2
  const top = left.y - h * 2.2
  const stripes = 9
  const w = (right.x - left.x) / stripes
  for (let i = 0; i < stripes; i++) {
    g.fillStyle(i % 2 ? 0xffffff : 0xe63946, alpha)
    g.fillRect(left.x + i * w, top, w + 0.5, h)
  }
  g.lineStyle(Math.max(2, h * 0.3), 0xffffff, alpha)
  g.lineBetween(left.x, top, left.x, left.y)
  g.lineBetween(right.x, top, right.x, right.y)
}

export function drawBar(g: G, track: Track, p: number, alpha = 1): void {
  const left = spot(track, -1.5, p)
  const right = spot(track, 1.5, p)
  // Arrives at face height: only ducking gets under it.
  const y = raised(track.y - 0.55 * track.sw, left.s)
  const h = track.sw * left.s * 0.34
  g.lineStyle(Math.max(2, h * 0.25), 0x8d99ae, alpha)
  g.lineBetween(left.x, y, left.x, left.y)
  g.lineBetween(right.x, y, right.x, right.y)
  const stripes = 12
  const w = (right.x - left.x) / stripes
  for (let i = 0; i < stripes; i++) {
    g.fillStyle(i % 2 ? 0x1b1b1b : 0xffd60a, alpha)
    g.fillRect(left.x + i * w, y - h / 2, w + 0.5, h)
  }
}

export function drawCoin(g: G, track: Track, lane: number, p: number, alpha = 1): void {
  const at = spot(track, lane, p)
  const y = raised(track.y + 0.25 * track.sw, at.s)
  const r = track.laneW * at.s * 0.17
  g.fillStyle(0xffe14d, alpha)
  g.fillCircle(at.x, y, r)
  g.lineStyle(Math.max(1.5, r * 0.18), 0xb8860b, alpha)
  g.strokeCircle(at.x, y, r * 0.7)
}
