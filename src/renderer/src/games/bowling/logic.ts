import type { BodyInput } from '../poses'
import { leader, RoundFlow } from '../roundFlow'
import { rack, Roll, type Pin } from './physics'
import { scoreGame, PINS, type Card } from './scoring'
import { SwingDetector, toThrow } from './swing'
import { aimAt, laneView } from './view'
export * from './physics'
export * from './scoring'
export * from './swing'
export * from './view'

/** The pins stay where they fell this long before the next ball, ms. */
export const SETTLE_MS = 1500
/** How quickly the ball follows the player sideways while they line up, ms. */
const AIM_FOLLOW_MS = 120

export type ResultKind = 'strike' | 'spare' | 'gutter' | 'open'
export type GameEvent =
  | { type: 'throw'; player: number; power: number }
  | { type: 'crash'; player: number; pins: number }
  | { type: 'gutter'; player: number }
  /** A ball finished: `streak` counts strikes in a row, this one included. */
  | { type: 'result'; player: number; knocked: number; kind: ResultKind; streak: number }

export interface Lane {
  /** Pins knocked by each ball so far. */
  rolls: number[]
  pins: Pin[]
  /** The ball on its way (kept while the pins settle). */
  roll: Roll | null
  phase: 'aim' | 'rolling' | 'settle' | 'done'
  /** Play time when the phase began. */
  since: number
  /** Where the ball will start across the lane, m. */
  aimX: number
  /** All ten pins were standing for this ball. */
  fresh: boolean
  swing: SwingDetector
}

/**
 * Bowling rules (no Phaser), so they can be unit-tested. Each player has their
 * own lane and bowls ten frames at their own pace: stand where the ball should
 * start, lower an arm and swing it up. The round ends when every lane is done.
 */
export class BowlingLogic {
  readonly flow = new RoundFlow()
  lanes: Lane[] = []

  constructor(private readonly random: () => number = Math.random) {}

  prepare(count: number): void {
    this.lanes = Array.from({ length: count }, () => ({
      rolls: [],
      pins: rack(this.random),
      roll: null,
      phase: 'aim',
      since: 0,
      aimX: 0,
      fresh: true,
      swing: new SwingDetector()
    }))
  }

  start(now: number, count: number): void {
    this.prepare(count)
    this.flow.start(now)
  }

  card(player: number): Card {
    return scoreGame(this.lanes[player]?.rolls ?? [])
  }

  scores(): number[] {
    return this.lanes.map((_, i) => this.card(i).total)
  }

  winner(): number | null {
    return leader(this.scores())
  }

  update(now: number, inputs: (BodyInput | null)[]): GameEvent[] {
    const events: GameEvent[] = []
    const dt = this.flow.tick(now)
    if (dt <= 0) return events
    const t = this.flow.elapsed

    this.lanes.forEach((lane, player) => {
      const body = inputs[player] ?? null
      switch (lane.phase) {
        case 'aim': {
          if (body) {
            const target = aimAt(laneView(player, this.lanes.length), body.x)
            lane.aimX += (target - lane.aimX) * Math.min(1, dt / AIM_FOLLOW_MS)
          }
          const swing = lane.swing.update(t, body)
          if (!swing) break
          lane.roll = new Roll(toThrow(lane.aimX, swing), lane.pins)
          lane.phase = 'rolling'
          lane.since = t
          events.push({ type: 'throw', player, power: swing.power })
          break
        }
        case 'rolling': {
          const roll = lane.roll!
          for (const e of roll.step(dt)) events.push({ ...e, player })
          if (!roll.done) break
          const knocked = roll.knocked
          lane.rolls.push(knocked)
          const kind: ResultKind =
            lane.fresh && knocked === PINS
              ? 'strike'
              : lane.pins.every((p) => p.down)
                ? 'spare'
                : knocked === 0 && roll.ball.gutter
                  ? 'gutter'
                  : 'open'
          let streak = 0
          if (kind === 'strike')
            for (let i = lane.rolls.length - 1; i >= 0 && lane.rolls[i] === PINS; i--) streak++
          lane.phase = 'settle'
          lane.since = t
          events.push({ type: 'result', player, knocked, kind, streak })
          break
        }
        case 'settle': {
          if (t - lane.since < SETTLE_MS) break
          const next = this.card(player).next
          lane.roll = null
          lane.since = t
          if (!next) {
            lane.phase = 'done'
            break
          }
          lane.pins = next.fresh ? rack(this.random) : lane.pins.filter((p) => !p.down)
          lane.fresh = next.fresh
          lane.swing.reset()
          lane.phase = 'aim'
          break
        }
      }
    })

    if (this.lanes.every((l) => l.phase === 'done')) this.flow.finish(now)
    return events
  }
}
