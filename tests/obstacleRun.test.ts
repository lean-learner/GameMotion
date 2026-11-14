import { describe, expect, it } from 'vitest'
import {
  EARLY_MS,
  laneOf,
  LATE_MS,
  LIVES,
  ObstacleRunLogic,
  POINTS,
  ROUND_MS,
  trackView,
  type GameEvent
} from '../src/renderer/src/games/obstacleRun/logic'
import type { BodyInput } from '../src/renderer/src/games/poses'
import { run, standing, SW } from './helpers/poseInput'

/** A repeatable random number source. */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Where a player who does everything right would be this frame. */
function perfect(logic: ObstacleRunLogic, player: number, home: number): BodyInput {
  const body = standing(home)
  const r = logic.runners[player]
  const t = logic.flow.elapsed
  if (!r.track) return body
  const next = logic.rows.filter((row) => !row.done[player]).sort((a, b) => a.at - b.at)[0]
  let lane = r.lane
  if (next?.kind === 'crate') {
    const free = [-1, 0, 1].filter((l) => !next.lanes.includes(l))
    lane = free.includes(next.coin ?? 9)
      ? next.coin!
      : free.sort((a, b) => Math.abs(a - r.lane) - Math.abs(b - r.lane))[0]
  }
  body.x = r.track.cx + lane * r.track.laneW
  if (next && next.kind !== 'crate' && Math.abs(next.at - t) < 150)
    body.y += (next.kind === 'hurdle' ? -0.45 : 0.6) * SW
  return body
}

describe('obstacle run track', () => {
  it("keeps all three lanes inside the player's part of the frame", () => {
    for (const count of [1, 2])
      for (let player = 0; player < count; player++)
        for (const x of [0, 200, 640, 1000, 1280])
          for (const sw of [60, 120, 180, 320]) {
            const track = trackView({ ...standing(x), sw }, player, count)
            const left = count > 1 ? player * 640 : 0
            const right = count > 1 ? (player + 1) * 640 : 1280
            expect(track.cx - 1.5 * track.laneW).toBeGreaterThanOrEqual(left)
            expect(track.cx + 1.5 * track.laneW).toBeLessThanOrEqual(right)
          }
  })

  it('changes lane only when the player is clearly past the line', () => {
    const track = trackView(standing(640), 0, 1)
    expect(laneOf(track, 640 + track.laneW * 0.55, 0)).toBe(0)
    expect(laneOf(track, 640 + track.laneW * 0.7, 0)).toBe(1)
    expect(laneOf(track, 640 + track.laneW * 0.45, 1)).toBe(1)
    expect(laneOf(track, 640 - track.laneW * 5, 1)).toBe(-1)
  })
})

describe('obstacle run round', () => {
  it('aims crates at a player who stands still, and ends after three hits', () => {
    const logic = new ObstacleRunLogic(() => 0.1)
    logic.start(0, 1)
    const events: GameEvent[] = []
    run(0, 20_000, (t) => events.push(...logic.update(t, [standing()])))
    expect(events.filter((e) => e.type === 'hit')).toHaveLength(LIVES)
    expect(events.filter((e) => e.type === 'out')).toHaveLength(1)
    expect(logic.flow.phase).toBe('gameover')
    expect(logic.scores()).toEqual([0])
  })

  it('can be finished without a hit, through all five levels', () => {
    for (const seed of [1, 2, 3]) {
      const logic = new ObstacleRunLogic(seeded(seed))
      logic.start(0, 1)
      const events: GameEvent[] = []
      run(0, ROUND_MS + 8000, (t) => events.push(...logic.update(t, [perfect(logic, 0, 640)])))
      const r = logic.runners[0]
      expect(events.filter((e) => e.type === 'hit')).toEqual([])
      expect(logic.flow.phase).toBe('gameover')
      expect(
        events.filter((e) => e.type === 'level').map((e) => e.type === 'level' && e.level)
      ).toEqual([2, 3, 4, 5])
      const kinds = new Set(events.flatMap((e) => (e.type === 'pass' ? [e.kind] : [])))
      expect([...kinds].sort()).toEqual(['bar', 'crate', 'hurdle'])
      expect(r.passed).toBeGreaterThan(55)
      expect(r.coins).toBeGreaterThan(5)
      // Rows, streak bonuses, coins, and hearts kept to the end.
      expect(r.score).toBeGreaterThan(r.passed * POINTS.row + r.coins * POINTS.coin + 100)
    }
  })

  it('needs a jump for hurdles and a duck for beams, close to the moment they arrive', () => {
    for (const [roll, kind, dy] of [
      [0.7, 'hurdle', -0.45],
      [0.9, 'bar', 0.6]
    ] as const) {
      for (const offset of [-EARLY_MS[kind] + 60, 0, LATE_MS - 40, -900]) {
        // Rolls in order per row: aim, lane pick, kind, coin.
        const logic = new ObstacleRunLogic(() => roll)
        logic.start(0, 1)
        const events: GameEvent[] = []
        // Level 2 has beams: skip ahead by playing level 1 as a lucky ghost.
        run(0, 3000, (t) => logic.update(t, [standing()]))
        logic.flow.elapsed = 18_000
        logic.rows = []
        run(3000, 6000, (t) => {
          const body = standing()
          const row = logic.rows.find((o) => !o.done[0])
          if (events.some((e) => e.type === 'pass' || e.type === 'hit')) return
          if (row && Math.abs(logic.flow.elapsed - (row.at + offset)) < 40) body.y += dy * SW
          events.push(...logic.update(t, [body]))
        })
        const first = events.find((e) => e.type === 'pass' || e.type === 'hit')
        expect(first).toMatchObject({ type: offset === -900 ? 'hit' : 'pass', kind })
      }
    }
  })

  it('gives two players the same rows and lets the survivor run on', () => {
    const logic = new ObstacleRunLogic(seeded(7))
    logic.start(0, 2)
    run(0, ROUND_MS + 8000, (t) => logic.update(t, [perfect(logic, 0, 320), standing(960)]))
    expect(logic.runners[0].lives).toBe(LIVES)
    expect(logic.runners[1].lives).toBe(0)
    expect(logic.runners[0].passed).toBeGreaterThan(55)
    expect(logic.flow.phase).toBe('gameover')
  })

  it('stops the track while paused', () => {
    const logic = new ObstacleRunLogic(seeded(4))
    logic.start(0, 1)
    const t = run(0, 6000, (now) => logic.update(now, [perfect(logic, 0, 640)]))
    logic.flow.pause(t, 'player')
    const state = JSON.stringify(logic.rows)
    expect(logic.update(t + 60_000, [standing()])).toEqual([])
    expect(JSON.stringify(logic.rows)).toBe(state)
  })
})
