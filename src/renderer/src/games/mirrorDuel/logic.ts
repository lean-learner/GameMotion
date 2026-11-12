import { matchesPose, randomPose, type BodyInput, type Pose } from '../poses'
import { leader, RoundFlow } from '../roundFlow'

/**
 * Mirror Duel rules (no Phaser), so they can be unit-tested.
 * A pose appears; the first player to strike it takes the points. Each pose
 * comes a little quicker than the last. One player races the clock instead.
 * Time in ms.
 */
export const POSES_PER_ROUND = 12
/** A pose must be held this long to count, so a hand flying past doesn't. */
export const HOLD_MS = 250
/** Points for a pose, plus up to this much again for speed. */
export const POSE_POINTS = 100
/** Time to strike the first pose and the last one. */
export const FIRST_LIMIT_MS = 5000
export const LAST_LIMIT_MS = 2600
/** The gap between poses: time to laugh and get your arms down. */
export const BREAK_MS = 1400

export type Stage = 'break' | 'pose'

export type GameEvent =
  | { type: 'pose'; pose: Pose; index: number }
  | { type: 'point'; player: number; points: number; pose: Pose }
  | { type: 'timeout'; pose: Pose }

export interface Duelist {
  score: number
  /** Poses won. */
  wins: number
  /** When the current pose was first held (null while not holding it). */
  holdingSince: number | null
}

export class MirrorDuelLogic {
  readonly flow = new RoundFlow()
  players: Duelist[] = []
  stage: Stage = 'break'
  pose: Pose | null = null
  /** How many poses have been shown this round. */
  shown = 0
  /** Who took the last pose (null: nobody, or none yet). */
  lastWinner: number | null = null
  /** Play time at which the current stage ends. */
  private stageEnds = 0
  private stageStarted = 0

  constructor(private readonly random: () => number = Math.random) {}

  prepare(count: number): void {
    this.players = Array.from({ length: count }, () => ({ score: 0, wins: 0, holdingSince: null }))
  }

  start(now: number, count: number): void {
    this.prepare(count)
    this.stage = 'break'
    this.pose = null
    this.shown = 0
    this.lastWinner = null
    this.stageStarted = 0
    this.stageEnds = BREAK_MS
    this.flow.start(now)
  }

  scores(): number[] {
    return this.players.map((p) => p.score)
  }

  winner(): number | null {
    return leader(this.scores())
  }

  /** Time allowed for the pose now showing. */
  limit(): number {
    const k = POSES_PER_ROUND > 1 ? (this.shown - 1) / (POSES_PER_ROUND - 1) : 0
    return FIRST_LIMIT_MS + (LAST_LIMIT_MS - FIRST_LIMIT_MS) * Math.max(0, Math.min(1, k))
  }

  /** Share of the current pose's time that is left, 1..0 (0 outside a pose). */
  timeLeft(): number {
    if (this.stage !== 'pose') return 0
    const span = this.stageEnds - this.stageStarted
    return Math.max(0, Math.min(1, (this.stageEnds - this.flow.elapsed) / span))
  }

  /** How far player `i` is through holding the pose, 0..1. */
  holdProgress(i: number): number {
    const since = this.players[i]?.holdingSince
    if (since === null || since === undefined) return 0
    return Math.max(0, Math.min(1, (this.flow.elapsed - since) / HOLD_MS))
  }

  update(now: number, inputs: (BodyInput | null)[]): GameEvent[] {
    const events: GameEvent[] = []
    if (this.flow.tick(now) <= 0) return events
    const t = this.flow.elapsed

    if (this.stage === 'break') {
      if (t < this.stageEnds) return events
      if (this.shown >= POSES_PER_ROUND) {
        this.flow.finish(now)
        return events
      }
      this.pose = randomPose(this.random, this.pose)
      this.shown++
      this.stage = 'pose'
      this.stageStarted = t
      this.stageEnds = t + this.limit()
      for (const p of this.players) p.holdingSince = null
      events.push({ type: 'pose', pose: this.pose, index: this.shown })
      return events
    }

    const pose = this.pose!
    // Whoever has held the pose long enough, earliest first.
    let first: number | null = null
    this.players.forEach((p, i) => {
      if (!matchesPose(pose, inputs[i] ?? null)) {
        p.holdingSince = null
        return
      }
      p.holdingSince ??= t
      if (t - p.holdingSince < HOLD_MS) return
      if (first === null || p.holdingSince < this.players[first].holdingSince!) first = i
    })
    if (first !== null) {
      const p = this.players[first]
      const points = POSE_POINTS + Math.round((POSE_POINTS * this.timeLeft()) / 10) * 10
      p.score += points
      p.wins++
      this.lastWinner = first
      events.push({ type: 'point', player: first, points, pose })
      this.rest(t)
    } else if (t >= this.stageEnds) {
      this.lastWinner = null
      events.push({ type: 'timeout', pose })
      this.rest(t)
    }
    return events
  }

  private rest(t: number): void {
    this.stage = 'break'
    this.stageStarted = t
    this.stageEnds = t + BREAK_MS
    for (const p of this.players) p.holdingSince = null
  }
}
