import type { BodyInput } from '../poses'
import { RoundFlow } from '../roundFlow'
import { Vertical } from '../vertical'

/**
 * Jump Rope rules (no Phaser), so they can be unit-tested.
 * A long rope turns around the players. Be off the ground each time it
 * sweeps under the feet. Every level it turns faster, and from level 3 it
 * changes speed without warning. Three trips end a player's run; the round
 * lasts until everyone is out. Time in ms.
 */
export const LIVES = 3
export const TURNS_PER_LEVEL = 10
/** The rope's first sweep comes this long into the round. */
export const FIRST_MS = 2200
/** A jump counts from this long before the rope passes until this long after. */
export const EARLY_MS = 240
export const LATE_MS = 120
/** After a trip the rope takes this much longer to come round again. */
export const TRIP_PAUSE_MS = 900
/** Quick and slow turns start at this level. */
export const TRICK_LEVEL = 3
export const POINTS = { jump: 10, streakCap: 20 }
const FASTEST_MS = 520

/** Time for one turn of the rope at a level. */
export const periodAt = (level: number): number => Math.max(560, 1500 * 0.88 ** (level - 1))

export interface Jumper {
  score: number
  lives: number
  streak: number
  best: number
  jumps: number
  /** Has been off the ground during the current sweep. */
  cleared: boolean
  vertical: Vertical
}

export type GameEvent =
  | { type: 'level'; level: number }
  | { type: 'sweep' }
  | { type: 'jump'; player: number; points: number }
  | { type: 'trip'; player: number }
  | { type: 'out'; player: number }

export class JumpRopeLogic {
  readonly flow = new RoundFlow()
  jumpers: Jumper[] = []
  level = 1
  turns = 0
  /** Play time of the last sweep under the feet, and of the next. */
  from = 0
  at = FIRST_MS

  constructor(private readonly random: () => number = Math.random) {}

  prepare(count: number): void {
    this.jumpers = Array.from({ length: count }, () => ({
      score: 0,
      lives: LIVES,
      streak: 0,
      best: 0,
      jumps: 0,
      cleared: false,
      vertical: new Vertical()
    }))
    this.level = 1
    this.turns = 0
    this.from = 0
    this.at = FIRST_MS
  }

  start(now: number, count: number): void {
    this.prepare(count)
    this.flow.start(now)
  }

  scores(): number[] {
    return this.jumpers.map((j) => j.score)
  }

  /** Where the rope is in its turn: 0 under the feet, 0.5 overhead, 1 under the feet again. */
  turn(): number {
    return (this.flow.elapsed - this.from) / (this.at - this.from)
  }

  update(now: number, inputs: (BodyInput | null)[]): GameEvent[] {
    const events: GameEvent[] = []
    // Standing height is learnt during the countdown too.
    this.jumpers.forEach((j, i) => j.vertical.update(now, inputs[i] ?? null))
    if (this.flow.tick(now) <= 0) return events
    const t = this.flow.elapsed

    if (t >= this.at - EARLY_MS) for (const j of this.jumpers) if (j.vertical.air) j.cleared = true
    if (t < this.at + LATE_MS) return events

    // The rope has passed: everyone still in is either over it or caught.
    events.push({ type: 'sweep' })
    let tripped = false
    this.jumpers.forEach((j, i) => {
      if (j.lives <= 0) return
      if (j.cleared) {
        const points = POINTS.jump + Math.min(j.streak, POINTS.streakCap)
        j.score += points
        j.streak++
        j.jumps++
        j.best = Math.max(j.best, j.streak)
        events.push({ type: 'jump', player: i, points })
      } else {
        tripped = true
        j.lives--
        j.streak = 0
        events.push({ type: 'trip', player: i })
        if (j.lives <= 0) events.push({ type: 'out', player: i })
      }
      j.cleared = false
    })
    if (this.jumpers.every((j) => j.lives <= 0)) {
      this.flow.finish(now)
      return events
    }

    this.turns++
    const level = 1 + Math.floor(this.turns / TURNS_PER_LEVEL)
    if (level > this.level) {
      this.level = level
      events.push({ type: 'level', level })
    }
    let period = periodAt(level)
    if (level >= TRICK_LEVEL) {
      const roll = this.random()
      period *= roll < 0.2 ? 1.4 : roll < 0.4 ? 0.8 : 1
    }
    this.from = this.at
    this.at += Math.max(FASTEST_MS, period) + (tripped ? TRIP_PAUSE_MS : 0)
    return events
  }
}
