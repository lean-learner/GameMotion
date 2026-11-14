/**
 * A bowling lane seen from above (no Phaser): a heavy ball and ten pins as
 * circles. Metres and seconds; x is across the lane (0 = middle, + = right),
 * y is down the lane from the foul line (0) to the pins.
 */
export const LANE = {
  /** Half the width of the wood; beyond it is the gutter. */
  half: 0.53,
  /** Foul line to the head pin. */
  length: 18.29,
  /** Where the ball drops out of sight. */
  end: 19.7
}
export const BALL_R = 0.108
export const PIN_R = 0.06
/** A fallen pin lies on its side and sweeps a wider path. */
const DOWN_R = 0.1
const PIN_GAP = 0.3048
const ROW_GAP = 0.264
const BALL_MASS = 6.8
const PIN_MASS = 1.6
const BALL_BOUNCE = 0.7
const PIN_BOUNCE = 0.55
/** How hard a sliding pin must hit a standing one to knock it over, m/s. */
const TOPPLE = 0.45
/** Sliding pins slow down this fast, m/s². */
const PIN_DRAG = 5.5
/** The hook only bites on the dry far part of the lane. */
const HOOK_FROM = 0.55
const STEP = 1 / 250
/** Pins have this long to settle after the ball first touches one, s. */
const SETTLE = 3

export interface Pin {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  down: boolean
  /** Slid off the deck. */
  gone: boolean
}

export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  /** Sideways pull once the ball reaches the dry boards, m/s². */
  spin: number
  gutter: boolean
  gone: boolean
}

/** How a ball is sent off. */
export interface Throw {
  /** Where it starts across the lane, m. */
  x: number
  /** m/s down the lane. */
  speed: number
  /** Direction, radians; + is to the right. */
  angle: number
  spin: number
}

/** Ten pins in a triangle, head pin nearest. `random` nudges each a few millimetres. */
export function rack(random: () => number = () => 0.5): Pin[] {
  const pins: Pin[] = []
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      pins.push({
        id: pins.length + 1,
        x: (i - row / 2) * PIN_GAP + (random() - 0.5) * 0.008,
        y: LANE.length + row * ROW_GAP + (random() - 0.5) * 0.008,
        vx: 0,
        vy: 0,
        down: false,
        gone: false
      })
    }
  }
  return pins
}

export type RollEvent = { type: 'crash'; pins: number } | { type: 'gutter' }

/** One ball rolling down a lane into whatever pins stand on it. */
export class Roll {
  readonly ball: Ball
  done = false
  private time = 0
  private firstHit: number | null = null
  private carry = 0

  constructor(
    thrown: Throw,
    readonly pins: Pin[]
  ) {
    this.ball = {
      x: thrown.x,
      y: 0,
      vx: Math.sin(thrown.angle) * thrown.speed,
      vy: Math.cos(thrown.angle) * thrown.speed,
      spin: thrown.spin,
      gutter: false,
      gone: false
    }
  }

  /** Pins knocked over so far (including any that were already down). */
  get knocked(): number {
    return this.pins.filter((p) => p.down).length
  }

  /** Moves everything on by `ms`. */
  step(ms: number): RollEvent[] {
    const events: RollEvent[] = []
    this.carry += ms / 1000
    while (this.carry >= STEP && !this.done) {
      this.carry -= STEP
      const before = this.knocked
      const wasGutter = this.ball.gutter
      this.tick()
      if (!wasGutter && this.ball.gutter && this.firstHit === null) events.push({ type: 'gutter' })
      const fell = this.knocked - before
      if (fell > 0) events.push({ type: 'crash', pins: fell })
    }
    return events
  }

  private tick(): void {
    const h = STEP
    const b = this.ball
    this.time += h

    if (!b.gone) {
      if (!b.gutter) {
        const bite = Math.max(0, Math.min(1, (b.y / LANE.length - HOOK_FROM) / (1 - HOOK_FROM)))
        b.vx += b.spin * bite * h
      }
      b.x += b.vx * h
      b.y += b.vy * h
      if (!b.gutter && Math.abs(b.x) > LANE.half) {
        b.gutter = true
        b.x = Math.sign(b.x) * (LANE.half + BALL_R * 0.8)
        b.vx = 0
      }
      if (b.y > LANE.end || Math.hypot(b.vx, b.vy) < 0.3) b.gone = true
    }

    // Ball into pins.
    if (!b.gone && !b.gutter) {
      for (const p of this.pins) {
        if (p.gone) continue
        const dx = p.x - b.x
        const dy = p.y - b.y
        const d = Math.hypot(dx, dy)
        const reach = BALL_R + PIN_R
        if (d >= reach || d === 0) continue
        const nx = dx / d
        const ny = dy / d
        const closing = (p.vx - b.vx) * nx + (p.vy - b.vy) * ny
        if (closing < 0) {
          const j = (-(1 + BALL_BOUNCE) * closing) / (1 / BALL_MASS + 1 / PIN_MASS)
          b.vx -= (j / BALL_MASS) * nx
          b.vy -= (j / BALL_MASS) * ny
          p.vx += (j / PIN_MASS) * nx
          p.vy += (j / PIN_MASS) * ny
          p.down = true
          this.firstHit ??= this.time
        }
        p.x = b.x + nx * reach
        p.y = b.y + ny * reach
      }
    }

    // Pins slide, slow down, and knock into each other.
    for (const p of this.pins) {
      if (p.gone) continue
      const v = Math.hypot(p.vx, p.vy)
      if (v === 0) continue
      const slowed = Math.max(0, v - PIN_DRAG * h)
      p.vx *= slowed / v
      p.vy *= slowed / v
      p.x += p.vx * h
      p.y += p.vy * h
      if (Math.abs(p.x) > LANE.half + 0.13 || p.y > LANE.end || p.y < LANE.length - 1.2) {
        p.gone = true
        p.vx = p.vy = 0
      }
    }
    for (let i = 0; i < this.pins.length; i++) {
      const a = this.pins[i]
      if (a.gone) continue
      for (let k = i + 1; k < this.pins.length; k++) {
        const c = this.pins[k]
        if (c.gone) continue
        if (a.vx === 0 && a.vy === 0 && c.vx === 0 && c.vy === 0) continue
        const dx = c.x - a.x
        const dy = c.y - a.y
        const d = Math.hypot(dx, dy)
        const reach = (a.down ? DOWN_R : PIN_R) + (c.down ? DOWN_R : PIN_R)
        if (d >= reach || d === 0) continue
        const nx = dx / d
        const ny = dy / d
        const closing = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny
        if (closing >= 0) continue
        if (-closing < TOPPLE && !(a.down && c.down)) {
          // Too soft to topple the standing one: the sliding pin just bounces off.
          const mover = a.down ? a : c
          const sign = a.down ? 1 : -1
          const vn = (mover.vx * nx + mover.vy * ny) * sign
          mover.vx -= (1 + 0.3) * vn * nx * sign
          mover.vy -= (1 + 0.3) * vn * ny * sign
          continue
        }
        const j = (-(1 + PIN_BOUNCE) * closing) / 2
        a.vx -= j * nx
        a.vy -= j * ny
        c.vx += j * nx
        c.vy += j * ny
        a.down = c.down = true
      }
    }

    const still = this.pins.every((p) => p.gone || Math.hypot(p.vx, p.vy) < 0.08)
    const settled = this.firstHit !== null && this.time - this.firstHit > SETTLE
    if ((b.gone && still) || settled || this.time > 14) {
      for (const p of this.pins) p.vx = p.vy = 0
      this.done = true
    }
  }
}
