import type { Vec2 } from '../../input/types'
import type { BodyInput } from '../poses'
import { RoundFlow } from '../roundFlow'
import { canSave, goalSpot, goalView, type Flight, type Goal } from './geometry'
export * from './geometry'

export const LEVEL_MS = 15_000
export const ROUND_MS = 5 * LEVEL_MS
export const SAVE_WINDOW_MS = 150
export const levelAt = (t: number): number => Math.min(5, Math.floor(t / LEVEL_MS) + 1)
export const SPOTS: Vec2[] = [
  { x: -1.8, y: -0.9 },
  { x: 1.8, y: -0.9 },
  { x: -1.85, y: 0.25 },
  { x: 1.85, y: 0.25 },
  { x: -1.45, y: 1.7 },
  { x: 1.45, y: 1.7 },
  { x: 0, y: 0.6 }
]
export interface Keeper {
  goal: Goal | null
  score: number
  lives: number
  combo: number
  saves: number
}
export interface Shot extends Flight {
  id: number
  judged: boolean[]
  covered: number[]
}
export type GameEvent =
  | { type: 'shot' }
  | { type: 'level'; level: number }
  | { type: 'save' | 'goal'; player: number; x: number; y: number; points: number }

export class GoalkeeperLogic {
  readonly flow = new RoundFlow()
  keepers: Keeper[] = []
  shots: Shot[] = []
  private next = 900
  private pair: { at: number; offset: Vec2 } | null = null
  private level = 1
  private serial = 0
  private lastSpot = -1

  constructor(private readonly random: () => number = Math.random) {}

  prepare(count: number): void {
    this.keepers = Array.from({ length: count }, () => ({
      goal: null,
      score: 0,
      lives: 3,
      combo: 0,
      saves: 0
    }))
    this.shots = []
    this.next = 900
    this.pair = null
    this.level = 1
    this.serial = 0
    this.lastSpot = -1
  }

  start(now: number, count: number): void {
    this.prepare(count)
    this.flow.start(now)
  }
  scores(): number[] {
    return this.keepers.map((k) => k.score)
  }

  update(now: number, inputs: (BodyInput | null)[]): GameEvent[] {
    const events: GameEvent[] = []
    if (this.flow.tick(now) <= 0) return events
    const t = this.flow.elapsed
    this.keepers.forEach((k, i) => {
      if (!k.goal && inputs[i]) k.goal = goalView(inputs[i]!, i, this.keepers.length)
    })
    const level = levelAt(t)
    if (level !== this.level) {
      this.level = level
      events.push({ type: 'level', level })
    }
    const launch = (offset: Vec2): void => {
      this.shots.push({
        id: this.serial++,
        offset,
        from: t,
        duration: 1600 - (level - 1) * 200,
        curve: level >= 3 ? (this.random() - 0.5) * 1.8 : 0,
        judged: this.keepers.map((k) => k.lives <= 0),
        covered: this.keepers.map(() => -Infinity)
      })
      events.push({ type: 'shot' })
    }
    if (t < ROUND_MS && this.keepers.every((k) => k.goal)) {
      if (this.pair && t >= this.pair.at) {
        launch(this.pair.offset)
        this.pair = null
      }
      if (t >= this.next) {
        // Never repeat a spot, including with a constant test random.
        const index =
          (this.lastSpot + 1 + Math.floor(this.random() * (SPOTS.length - 1))) % SPOTS.length
        this.lastSpot = index
        launch(SPOTS[index])
        if (level >= 4) this.pair = { at: t + 460, offset: SPOTS[(index + 3) % SPOTS.length] }
        this.next = t + 2600 - (level - 1) * 220
      }
    }
    for (const shot of this.shots) {
      const arrival = shot.from + shot.duration
      this.keepers.forEach((k, i) => {
        if (shot.judged[i] || !k.goal) return
        if (k.lives <= 0) {
          shot.judged[i] = true
          return
        }
        const spot = goalSpot(k.goal, shot.offset)
        if (t >= arrival - SAVE_WINDOW_MS && canSave(inputs[i], spot)) shot.covered[i] = t
        if (t < arrival) return
        shot.judged[i] = true
        const saved = shot.covered[i] >= arrival - SAVE_WINDOW_MS
        const points = saved ? 50 + 5 * Math.min(k.combo, 10) : 0
        if (saved) {
          k.score += points
          k.combo++
          k.saves++
        } else {
          k.lives--
          k.combo = 0
        }
        events.push({ type: saved ? 'save' : 'goal', player: i, ...spot, points })
      })
    }
    this.shots = this.shots.filter((s) => !s.judged.every(Boolean))
    if (this.keepers.every((k) => k.lives <= 0) || (t >= ROUND_MS && !this.shots.length))
      this.flow.finish(now)
    return events
  }
}
