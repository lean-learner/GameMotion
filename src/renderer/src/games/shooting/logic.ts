import type { Vec2 } from '../../input/types'
import { RoundFlow } from '../roundFlow'
import { AimDetector, type ShooterInput } from './aim'
import { SHOTS, ringScore, ROUNDS, SETTLE_MS, targetAt } from './target'
export * from './target'
export * from './aim'

export interface Hit {
  hit: Vec2
  /** Hit marks move with the target face. Misses stay in the field. */
  offset: Vec2 | null
  score: number
}
export interface Shooter {
  round: number
  score: number
  results: number[]
  shots: Hit[]
  phase: 'aim' | 'settle' | 'done'
  since: number
  aiming: AimDetector
}
export type GameEvent =
  | { type: 'ready' | 'fire'; player: number }
  | { type: 'hit'; player: number; score: number; hit: Vec2 }
  | { type: 'round'; player: number; round: number }

/** Instant target hits: where the sight points when the shot fires is where it lands. */
export class ShootingLogic {
  readonly flow = new RoundFlow()
  shooters: Shooter[] = []
  prepare(count: number): void {
    this.shooters = Array.from({ length: count }, () => ({
      round: 0,
      score: 0,
      results: [],
      shots: [],
      phase: 'aim',
      since: 0,
      aiming: new AimDetector()
    }))
  }
  start(now: number, count: number): void {
    this.prepare(count)
    this.flow.start(now)
  }
  scores(): number[] {
    return this.shooters.map((s) => s.score)
  }
  update(now: number, inputs: ShooterInput[]): GameEvent[] {
    const events: GameEvent[] = []
    if (this.flow.tick(now) <= 0) return events
    const t = this.flow.elapsed
    this.shooters.forEach((s, player) => {
      if (s.phase !== 'aim' && s.aiming.mustLower)
        s.aiming.update(t, inputs[player] ?? { body: null })
      if (s.phase === 'aim') {
        const wasReady = s.aiming.ready
        const shot = s.aiming.update(t, inputs[player] ?? { body: null })
        if (!wasReady && s.aiming.ready) events.push({ type: 'ready', player })
        if (!shot) return
        const hit = shot.aim
        const target = targetAt(s.round, t)
        const score = ringScore(hit, target)
        const offset = score ? { x: hit.x - target.x, y: hit.y - target.y } : null
        s.shots.push({ hit, offset, score })
        s.results.push(score)
        s.score += score
        s.phase = 'settle'
        s.since = t
        events.push({ type: 'fire', player }, { type: 'hit', player, hit, score })
      } else if (s.phase === 'settle' && t - s.since >= SETTLE_MS) {
        if (s.shots.length === SHOTS) {
          if (s.round === ROUNDS - 1) {
            s.phase = 'done'
            return
          }
          s.round++
          s.shots = []
          events.push({ type: 'round', player, round: s.round + 1 })
        }
        s.phase = 'aim'
      }
    })
    if (this.shooters.every((s) => s.phase === 'done')) this.flow.finish(now)
    return events
  }
}
