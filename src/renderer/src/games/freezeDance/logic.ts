import { leader, RoundFlow } from '../roundFlow'

/**
 * Freeze Dance rules (no Phaser), so they can be unit-tested.
 * While the light is green, dance: the more you move, the more you score.
 * When it turns red, freeze. Move on red and you lose a life.
 * Speeds are in shoulder widths per second (see MotionMeter). Time in ms.
 */
export const ROUND_MS = 75_000
export const LIVES = 3
/** Dancing at this speed or faster earns the full rate. */
export const FULL_SPEED = 2.2
/** Points per second at full speed. */
export const DANCE_RATE = 40
/** On red, moving faster than this is a foul. */
export const MOVE_LIMIT = 0.55
/**
 * Time to come to a stop after the light turns red, before anyone is judged.
 * Generous on purpose: the camera sees a movement a little after it happens,
 * and speed is measured over the last quarter second.
 */
export const GRACE_MS = 1200
/** Points for holding still through a whole red light. */
export const FREEZE_BONUS = 50
/** Green lights last between these, getting shorter as the round goes on. */
const GO_MS: [number, number] = [5000, 9000]
const GO_SHRINK = 0.6
/** Red lights last between these. */
const STOP_MS: [number, number] = [2600, 4600]

export type Light = 'go' | 'stop'

export interface Dancer {
  score: number
  lives: number
  alive: boolean
  /** How hard they are dancing, 0..1 (for the meter). */
  energy: number
  /** Already caught moving during this red light. */
  caught: boolean
}

export type GameEvent =
  | { type: 'light'; light: Light }
  | { type: 'caught'; player: number; livesLeft: number }
  | { type: 'froze'; player: number; points: number }
  | { type: 'out'; player: number }

export class FreezeDanceLogic {
  readonly flow = new RoundFlow()
  players: Dancer[] = []
  light: Light = 'go'
  /** Play time the light last changed, and when it changes next. */
  private lightSince = 0
  private lightUntil = 0

  constructor(private readonly random: () => number = Math.random) {}

  prepare(count: number): void {
    this.players = Array.from({ length: count }, () => ({
      score: 0,
      lives: LIVES,
      alive: true,
      energy: 0,
      caught: false
    }))
  }

  start(now: number, count: number): void {
    this.prepare(count)
    this.flow.start(now)
    this.light = 'go'
    this.lightSince = 0
    this.lightUntil = this.span('go')
  }

  scores(): number[] {
    return this.players.map((p) => Math.round(p.score))
  }

  winner(): number | null {
    return leader(this.scores())
  }

  /** Time left in the round. */
  remaining(): number {
    return Math.max(0, ROUND_MS - this.flow.elapsed)
  }

  /** True once players are being judged on a red light (the grace time has passed). */
  judging(): boolean {
    return this.light === 'stop' && this.flow.elapsed - this.lightSince >= GRACE_MS
  }

  /** `speeds[i]` is how fast player i is moving; null while they aren't seen. */
  update(now: number, speeds: (number | null)[]): GameEvent[] {
    const events: GameEvent[] = []
    const dt = this.flow.tick(now)
    if (dt <= 0) return events
    const t = this.flow.elapsed

    if (t >= this.lightUntil) this.switchLight(t, events)

    this.players.forEach((p, i) => {
      const speed = speeds[i] ?? 0
      p.energy = Math.max(0, Math.min(1, speed / FULL_SPEED))
      if (!p.alive) return
      if (this.light === 'go') {
        p.score += (DANCE_RATE * p.energy * dt) / 1000
      } else if (this.judging() && !p.caught && speed > MOVE_LIMIT) {
        p.caught = true
        p.lives--
        events.push({ type: 'caught', player: i, livesLeft: p.lives })
        if (p.lives <= 0) {
          p.alive = false
          events.push({ type: 'out', player: i })
        }
      }
    })

    if (t >= ROUND_MS || this.players.every((p) => !p.alive)) {
      for (const p of this.players) p.score = Math.round(p.score)
      this.flow.finish(now)
    }
    return events
  }

  private switchLight(t: number, events: GameEvent[]): void {
    if (this.light === 'stop') {
      // Everyone who held still through the red light gets the bonus.
      this.players.forEach((p, i) => {
        if (p.alive && !p.caught) {
          p.score += FREEZE_BONUS
          events.push({ type: 'froze', player: i, points: FREEZE_BONUS })
        }
        p.caught = false
      })
    }
    this.light = this.light === 'go' ? 'stop' : 'go'
    this.lightSince = t
    this.lightUntil = t + this.span(this.light)
    events.push({ type: 'light', light: this.light })
  }

  private span(light: Light): number {
    const [lo, hi] = light === 'go' ? GO_MS : STOP_MS
    const length = lo + this.random() * (hi - lo)
    if (light === 'stop') return length
    const k = Math.min(1, this.flow.elapsed / ROUND_MS)
    return length * (1 - (1 - GO_SHRINK) * k)
  }
}
