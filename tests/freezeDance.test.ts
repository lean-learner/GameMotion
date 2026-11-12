import { describe, expect, it } from 'vitest'
import {
  DANCE_RATE,
  FREEZE_BONUS,
  FreezeDanceLogic,
  FULL_SPEED,
  GRACE_MS,
  LIVES,
  MOVE_LIMIT,
  ROUND_MS,
  type GameEvent
} from '../src/renderer/src/games/freezeDance/logic'
import { COUNTDOWN_MS } from '../src/renderer/src/games/roundFlow'
import { run } from './helpers/poseInput'

function playing(players = 1): { g: FreezeDanceLogic; t: number } {
  const g = new FreezeDanceLogic(() => 0.5)
  g.start(0, players)
  g.update(COUNTDOWN_MS, [])
  expect(g.flow.phase).toBe('playing')
  return { g, t: COUNTDOWN_MS }
}

/** Runs until `until` is true (or 30 s pass), with each player's speed given by `speeds`. */
function runUntil(
  g: FreezeDanceLogic,
  from: number,
  until: () => boolean,
  speeds: () => number[]
): { t: number; events: GameEvent[] } {
  const events: GameEvent[] = []
  let t = from
  for (; t < from + 30_000 && !until(); t += 16) events.push(...g.update(t, speeds()))
  return { t, events }
}

const FAST = MOVE_LIMIT * 2

describe('Freeze Dance', () => {
  it('pays for dancing on green, by how hard you dance', () => {
    const { g, t } = playing(2)
    run(t, 2000, (now) => g.update(now, [FULL_SPEED * 2, FULL_SPEED / 2]))
    expect(g.players[0].score).toBeCloseTo(DANCE_RATE * 2, -1)
    expect(g.players[1].score).toBeCloseTo(DANCE_RATE, -1)
    expect(g.winner()).toBe(0)
  })

  it('pays nothing for standing still on green', () => {
    const { g, t } = playing()
    run(t, 2000, (now) => g.update(now, [0]))
    expect(g.players[0].score).toBe(0)
  })

  it('turns red, and gives a moment to stop before judging', () => {
    const { g, t } = playing()
    const a = runUntil(
      g,
      t,
      () => g.light === 'stop',
      () => [FAST]
    )
    expect(a.events).toContainEqual({ type: 'light', light: 'stop' })
    expect(g.judging()).toBe(false)
    // Still moving for most of the grace time, then still.
    run(a.t, GRACE_MS - 100, (now) => g.update(now, [FAST]))
    const b = runUntil(
      g,
      a.t + GRACE_MS - 100,
      () => g.light === 'go',
      () => [0]
    )
    expect(g.players[0].lives).toBe(LIVES)
    expect(b.events).toContainEqual({ type: 'froze', player: 0, points: FREEZE_BONUS })
  })

  it('takes one life, not one per frame, for moving on red', () => {
    const { g, t } = playing()
    const a = runUntil(
      g,
      t,
      () => g.light === 'stop',
      () => [0]
    )
    const b = runUntil(
      g,
      a.t,
      () => g.light === 'go',
      () => [FAST]
    )
    expect(b.events.filter((e) => e.type === 'caught')).toHaveLength(1)
    expect(g.players[0].lives).toBe(LIVES - 1)
    expect(b.events.some((e) => e.type === 'froze')).toBe(false)
    // No bonus: only the dance points of the single frame after the light went green.
    expect(g.players[0].score).toBeLessThan(1)
  })

  it('judges each player on their own', () => {
    const { g, t } = playing(2)
    const a = runUntil(
      g,
      t,
      () => g.light === 'stop',
      () => [0, 0]
    )
    runUntil(
      g,
      a.t,
      () => g.light === 'go',
      () => [0, FAST]
    )
    expect(g.players[0].lives).toBe(LIVES)
    expect(g.players[1].lives).toBe(LIVES - 1)
    expect(g.players[0].score).toBe(FREEZE_BONUS)
  })

  it('ends when the only player is out of lives', () => {
    const { g, t } = playing()
    const events: GameEvent[] = []
    run(t, ROUND_MS, (now) => events.push(...g.update(now, [FAST])))
    expect(g.players[0].alive).toBe(false)
    expect(events).toContainEqual({ type: 'out', player: 0 })
    expect(g.flow.phase).toBe('gameover')
    expect(g.flow.elapsed).toBeLessThan(ROUND_MS)
  })

  it('ends when the time is up', () => {
    const { g, t } = playing()
    run(t, ROUND_MS + 200, (now) => g.update(now, [0]))
    expect(g.flow.phase).toBe('gameover')
    expect(g.players[0].lives).toBe(LIVES)
    expect(Number.isInteger(g.scores()[0])).toBe(true)
  })
})
