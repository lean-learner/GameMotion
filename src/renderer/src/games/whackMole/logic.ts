import type { BodyInput } from '../poses'
import { leader, RoundFlow } from '../roundFlow'
import {
  allowedHoles,
  COMBO_BONUS,
  COMBO_CAP,
  GAP_MS,
  GOLD_CHANCE,
  holeSpot,
  MAX_UP,
  POINTS,
  RISE_MS,
  ROUND_MS,
  UP_MS,
  type GameEvent,
  type Mole,
  type Whacker
} from './holes'
export * from './holes'

/** Whack-a-Mole rules (no Phaser), so they can be unit-tested. Moles pop out of holes to the left, right and below each player, never above. Whack one with a hand before it goes back down; golden moles are worth more. */
export class WhackMoleLogic {
  readonly flow = new RoundFlow()
  players: Whacker[] = []
  moles: Mole[] = []
  bodies: (BodyInput | null)[] = [] // where each player was last seen
  private nextPopAt = 0
  private nextId = 1
  constructor(private readonly random: () => number = Math.random) {}

  /** Prepare the game with the given number of players. */
  prepare(count: number): void {
    this.players = Array.from({ length: count }, () => ({
      score: 0,
      combo: 0,
      bestCombo: 0,
      hits: 0,
      misses: 0
    }))
    this.bodies = Array.from({ length: count }, () => null)
  }

  /** Start the game with the given number of players. */
  start(now: number, count: number): void {
    this.prepare(count)
    this.moles = []
    this.nextPopAt = 600
    this.flow.start(now)
  }

  /** Get the scores of all players. */
  scores(): number[] {
    return this.players.map((p) => p.score)
  }

  /** Get the index of the player with the highest score. */
  winner(): number | null {
    return leader(this.scores())
  }

  /** Get the remaining time in the round. */
  remaining(): number {
    return Math.max(0, ROUND_MS - this.flow.elapsed)
  }

  /** Calculate the progress of the round. */
  private k(): number {
    return Math.min(1, this.flow.elapsed / ROUND_MS)
  }

  /** Get the position of a mole. */
  spot(mole: Mole): { x: number; y: number; r: number } | null {
    const body = this.bodies[mole.player]
    return body ? holeSpot(body, mole.edge, mole.lane) : null
  }

  /** Get how far out of its hole a mole is. */
  shown(mole: Mole): number {
    const t = this.flow.elapsed
    return Math.max(0, Math.min(1, (t - mole.from) / RISE_MS, (mole.leaves - t) / RISE_MS))
  }

  /** Update the game state based on the current time and player inputs. */
  update(now: number, inputs: (BodyInput | null)[]): GameEvent[] {
    const events: GameEvent[] = []

    // Update player positions
    inputs.forEach((b, i) => {
      if (b && i < this.bodies.length) this.bodies[i] = b
    })

    // Tick the round flow
    if (this.flow.tick(now) <= 0) return events
    const t = this.flow.elapsed

    // Pop moles
    while (t >= this.nextPopAt) {
      const k = this.k()
      const upMs = UP_MS[0] + (UP_MS[1] - UP_MS[0]) * k
      if (this.nextPopAt + upMs < ROUND_MS) {
        const gold = this.random() < GOLD_CHANCE
        for (let player = 0; player < this.players.length; player++) {
          const mine = this.moles.filter((m) => m.player === player)
          if (mine.length >= MAX_UP) continue
          const free = allowedHoles(player, this.players.length).filter(
            (h) => !mine.some((m) => m.edge === h.edge && m.lane === h.lane)
          )
          if (free.length === 0) continue
          const hole = free[Math.floor(this.random() * free.length)]
          this.moles.push({
            id: this.nextId++,
            player,
            edge: hole.edge,
            lane: hole.lane,
            gold,
            from: this.nextPopAt,
            leaves: this.nextPopAt + upMs,
            armed: false
          })
          events.push({ type: 'pop', player, gold })
        }
      }
      this.nextPopAt += GAP_MS[0] + (GAP_MS[1] - GAP_MS[0]) * k
    }

    // Handle mole interactions
    this.moles = this.moles.filter((mole) => {
      const p = this.players[mole.player]
      const spot = this.spot(mole)
      const body = inputs[mole.player]
      const touching =
        !!spot &&
        !!body &&
        (['left', 'right'] as const).some((side) => {
          const hand = body.hands[side]
          return !!hand && Math.hypot(hand.x - spot.x, hand.y - spot.y) < spot.r
        })
      // A hand parked on the hole does not count: it has to arrive.
      if (!touching) mole.armed = true
      if (touching && spot && mole.armed) {
        const points =
          (mole.gold ? POINTS.gold : POINTS.mole) + COMBO_BONUS * Math.min(p.combo, COMBO_CAP)
        p.score += points
        p.combo++
        p.bestCombo = Math.max(p.bestCombo, p.combo)
        p.hits++
        events.push({
          type: 'hit',
          player: mole.player,
          gold: mole.gold,
          points,
          x: spot.x,
          y: spot.y
        })
        return false
      }
      if (t > mole.leaves) {
        p.combo = 0
        p.misses++
        events.push({ type: 'miss', player: mole.player, x: spot?.x ?? 0, y: spot?.y ?? 0 })
        return false
      }
      return true
    })

    if (t >= ROUND_MS) this.flow.finish(now)
    return events
  }
}
