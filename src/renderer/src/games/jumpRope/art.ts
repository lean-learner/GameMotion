import type Phaser from 'phaser'

/** The rope's handles, and how far its middle swings above and below them. */
const LEFT = { x: 40, y: 410 }
const RIGHT = { x: 1240, y: 410 }
const SWING = 285
const STEPS = 28

/**
 * The rope at `turn` of the way round: 0 and 1 under the feet, 0.5 overhead.
 * It goes up behind the players (thin and faint) and comes down in front of
 * them (thick and bright), so its speed can be read at a glance.
 */
export function drawRope(g: Phaser.GameObjects.Graphics, turn: number, color: number): void {
  const angle = turn * Math.PI * 2
  const front = Math.sin(angle) < 0 // second half of the turn: coming down in front
  const near = (1 + Math.cos(angle)) / 2 // 1 at the floor
  // A curve through the handles whose middle sits SWING * cos(angle) below them.
  const cy = LEFT.y + 2 * SWING * Math.cos(angle)
  const point = (k: number): { x: number; y: number } => ({
    x: LEFT.x + (RIGHT.x - LEFT.x) * k,
    y: (1 - k) * (1 - k) * LEFT.y + 2 * k * (1 - k) * cy + k * k * RIGHT.y
  })
  // A shadow on the floor that darkens as the rope comes down.
  g.fillStyle(0x000000, 0.12 + 0.25 * near)
  g.fillEllipse(640, 700, 760 + 200 * near, 16)
  const width = front ? 9 + 5 * near : 5
  for (const [w, c, a] of [
    [width + 6, 0x0b1020, front ? 0.6 : 0.25],
    [width, front ? color : 0xffffff, front ? 1 : 0.45]
  ] as const) {
    g.lineStyle(w, c, a)
    for (let i = 0; i < STEPS; i++) {
      const p = point(i / STEPS)
      const q = point((i + 1) / STEPS)
      g.lineBetween(p.x, p.y, q.x, q.y)
    }
  }
  for (const h of [LEFT, RIGHT]) {
    g.fillStyle(0xffe14d, 1)
    g.fillCircle(h.x, h.y, 16)
    g.lineStyle(4, 0x0b1020, 1)
    g.strokeCircle(h.x, h.y, 16)
  }
}
