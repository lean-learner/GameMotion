import type { BodyInput } from '../poses'
import { RoundFlow } from '../roundFlow'
import { Vertical } from '../vertical'

/**
 * Obstacle Run rules (no Phaser), so they can be unit-tested.
 * Each player runs on a three-lane track drawn around them. Rows of
 * obstacles come down the track: step to a free lane for crates, jump the
 * hurdles, duck the beams, and pick up coins on the way. Five levels, each
 * faster. Time in ms, positions in game pixels on a 1280x720 frame.
 */
export const LEVELS = 5
export const LEVEL_MS = 18_000
export const ROUND_MS = LEVELS * LEVEL_MS
export const LIVES = 3
/** How long a row takes to come down the track, per level. */
export const TRAVEL_MS = [2400, 2100, 1800, 1550, 1350]
/** Time between rows, per level. */
export const GAP_MS = [1900, 1600, 1350, 1150, 1000]
/** Chance that crates block two lanes, per level. */
const DOUBLE = [0, 0.3, 0.45, 0.55, 0.65]
/** Rows closer together than this never ask for a jump straight after a duck, or the reverse. */
const SWITCH_MS = 1400
/** A jump or duck counts from this long before a row arrives... */
export const EARLY_MS = { hurdle: 260, bar: 200 }
/** ...until this long after, to allow for tracking delay. */
export const LATE_MS = 120
export const POINTS = { row: 10, streak: 2, streakCap: 10, coin: 25, heart: 50 }
const LANES = [-1, 0, 1]

export const levelAt = (t: number): number =>
  Math.min(LEVELS, Math.floor(Math.max(0, t) / LEVEL_MS) + 1)

export type Kind = 'crate' | 'hurdle' | 'bar'

/** A player's track: three lanes centred where they stood at the start. */
export interface Track {
  /** Middle of the centre lane. */
  cx: number
  laneW: number
  /** The player's standing shoulder height and width when the track was laid. */
  y: number
  sw: number
}

export interface Row {
  id: number
  kind: Kind
  /** Lanes the crates are in (hurdles and beams cross all three). */
  lanes: number[]
  /** Lane of the coin, if there is one. */
  coin: number | null
  /** Play time it set off and the time it reaches the players. */
  from: number
  at: number
  /** Per player: got past it (so far), took the coin, has been judged. */
  ok: boolean[]
  got: boolean[]
  done: boolean[]
}

export interface Runner {
  track: Track | null
  lane: number
  score: number
  lives: number
  streak: number
  coins: number
  passed: number
  vertical: Vertical
}

export type GameEvent =
  | { type: 'level'; level: number }
  | { type: 'jump'; player: number }
  | { type: 'pass'; player: number; kind: Kind; points: number }
  | { type: 'hit'; player: number; kind: Kind }
  | { type: 'coin'; player: number; lane: number }
  | { type: 'out'; player: number }

/** Lays a track around the player, kept inside their part of the frame. */
export function trackView(body: BodyInput, player: number, count: number): Track {
  const left = count > 1 ? player * 640 + 16 : 16
  const right = count > 1 ? (player + 1) * 640 - 16 : 1264
  const laneW = Math.max(100, Math.min(1.4 * body.sw, (right - left) / 3))
  const cx = Math.max(left + 1.5 * laneW, Math.min(right - 1.5 * laneW, body.x))
  return { cx, laneW, y: body.y, sw: body.sw }
}

/** The lane a player is in. They must go clearly past the line to change lane. */
export function laneOf(track: Track, x: number, current: number): number {
  const raw = (x - track.cx) / track.laneW
  if (Math.abs(raw - current) <= 0.62) return current
  return Math.max(-1, Math.min(1, Math.round(raw)))
}

/** How far down the track a row is: 0 at the horizon, 1 at the players. */
export function progress(row: Row, t: number): number {
  return Math.max(0, (t - row.from) / (row.at - row.from))
}

export class ObstacleRunLogic {
  readonly flow = new RoundFlow()
  runners: Runner[] = []
  rows: Row[] = []
  private next = 0
  private nextId = 1
  private lastLevel = 1
  private lastKind: Kind = 'crate'
  private lastSafe: number[] = LANES
  private finished = false

  constructor(private readonly random: () => number = Math.random) {}

  prepare(count: number): void {
    this.runners = Array.from({ length: count }, () => ({
      track: null,
      lane: 0,
      score: 0,
      lives: LIVES,
      streak: 0,
      coins: 0,
      passed: 0,
      vertical: new Vertical()
    }))
    this.rows = []
    this.next = 1200
    this.lastLevel = 1
    this.lastKind = 'crate'
    this.lastSafe = LANES
    this.finished = false
  }

  start(now: number, count: number): void {
    this.prepare(count)
    this.flow.start(now)
  }

  scores(): number[] {
    return this.runners.map((r) => r.score)
  }

  level(): number {
    return levelAt(this.flow.elapsed)
  }

  remaining(): number {
    return Math.max(0, ROUND_MS - this.flow.elapsed)
  }

  update(now: number, inputs: (BodyInput | null)[]): GameEvent[] {
    const events: GameEvent[] = []
    // Standing height is learnt during the countdown too.
    const jumped = this.runners.map((r, i) => r.vertical.update(now, inputs[i] ?? null))
    if (this.flow.tick(now) <= 0) return events
    const t = this.flow.elapsed

    this.runners.forEach((r, i) => {
      const body = inputs[i]
      if (!body) return
      r.track ??= trackView(body, i, this.runners.length)
      r.lane = laneOf(r.track, body.x, r.lane)
      if (jumped[i] && r.lives > 0) events.push({ type: 'jump', player: i })
    })

    const level = levelAt(t)
    if (level > this.lastLevel) {
      this.lastLevel = level
      events.push({ type: 'level', level })
    }

    if (t >= this.next && t < ROUND_MS && this.runners.every((r) => r.track)) {
      this.rows.push(this.makeRow(t, level))
      this.next = t + GAP_MS[level - 1]
    }

    for (const row of this.rows) this.judge(row, t, events)
    this.rows = this.rows.filter((row) => !row.done.every(Boolean))

    const allOut = this.runners.every((r) => r.lives <= 0)
    if (!this.finished && (allOut || (t >= ROUND_MS && this.rows.length === 0))) {
      this.finished = true
      // Hearts left at the finish line are worth points.
      if (!allOut) for (const r of this.runners) r.score += POINTS.heart * Math.max(0, r.lives)
      this.flow.finish(now)
    }
    return events
  }

  private makeRow(t: number, level: number): Row {
    const alive = this.runners.filter((r) => r.lives > 0)
    const pick = <T>(from: readonly T[]): T =>
      from[Math.min(from.length - 1, Math.floor(this.random() * from.length))]
    // Crates are aimed at a lane someone is standing in, so there is always a reason to move.
    const aim = alive.length && this.random() < 0.75 ? pick(alive).lane : pick(LANES)
    const roll = this.random()
    let kind: Kind =
      level === 1
        ? roll < 0.6
          ? 'crate'
          : 'hurdle'
        : roll < 0.45
          ? 'crate'
          : roll < 0.75
            ? 'hurdle'
            : 'bar'
    const upDown = (k: Kind): boolean => k !== 'crate'
    if (
      GAP_MS[level - 1] < SWITCH_MS &&
      upDown(kind) &&
      upDown(this.lastKind) &&
      kind !== this.lastKind
    )
      kind = this.lastKind

    let lanes: number[] = []
    let safe: number[] = LANES
    if (kind === 'crate') {
      if (this.random() < DOUBLE[level - 1]) {
        // One free lane, never more than one step from a lane that was free last time.
        const reachable = LANES.filter((l) => this.lastSafe.some((s) => Math.abs(s - l) <= 1))
        const away = reachable.filter((l) => l !== aim)
        safe = [pick(away.length ? away : reachable)]
      } else {
        safe = LANES.filter((l) => l !== aim)
      }
      lanes = LANES.filter((l) => !safe.includes(l))
    }
    const coin = this.random() < (kind === 'crate' ? 0.5 : 0.35) ? pick(safe) : null
    this.lastKind = kind
    this.lastSafe = safe
    return {
      id: this.nextId++,
      kind,
      lanes,
      coin,
      from: t,
      at: t + TRAVEL_MS[level - 1],
      ok: this.runners.map(() => false),
      got: this.runners.map(() => false),
      done: this.runners.map((r) => r.lives <= 0)
    }
  }

  private judge(row: Row, t: number, events: GameEvent[]): void {
    this.runners.forEach((r, i) => {
      if (row.done[i]) return
      if (r.lives <= 0) {
        row.done[i] = true
        return
      }
      const early = row.kind === 'crate' ? 0 : EARLY_MS[row.kind]
      if (t < row.at - Math.max(early, LATE_MS)) return
      if (row.coin !== null && !row.got[i] && r.lane === row.coin && t >= row.at - LATE_MS) {
        row.got[i] = true
        r.coins++
        r.score += POINTS.coin
        events.push({ type: 'coin', player: i, lane: row.coin })
      }
      if (row.kind === 'crate') {
        // Crates are judged the moment they arrive.
        if (t < row.at) return
        row.ok[i] = !row.lanes.includes(r.lane)
      } else {
        // Jumps and ducks get a little longer, to allow for tracking delay.
        if (t >= row.at - early && (row.kind === 'hurdle' ? r.vertical.air : r.vertical.low))
          row.ok[i] = true
        if (t < row.at || (!row.ok[i] && t < row.at + LATE_MS)) return
      }
      row.done[i] = true
      if (row.ok[i]) {
        const points = POINTS.row + POINTS.streak * Math.min(r.streak, POINTS.streakCap)
        r.score += points
        r.streak++
        r.passed++
        events.push({ type: 'pass', player: i, kind: row.kind, points })
      } else {
        r.lives--
        r.streak = 0
        events.push({ type: 'hit', player: i, kind: row.kind })
        if (r.lives <= 0) events.push({ type: 'out', player: i })
      }
    })
  }
}
