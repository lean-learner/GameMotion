import { describe, expect, it } from 'vitest'
import {
  BREAK_MS,
  FIRST_LIMIT_MS,
  HOLD_MS,
  MirrorDuelLogic,
  POSE_POINTS,
  POSES_PER_ROUND,
  type GameEvent
} from '../src/renderer/src/games/mirrorDuel/logic'
import type { BodyInput } from '../src/renderer/src/games/poses'
import { COUNTDOWN_MS } from '../src/renderer/src/games/roundFlow'
import { holding, run, standing } from './helpers/poseInput'

/** A game with its first pose on the card. */
function posed(players = 1): { g: MirrorDuelLogic; t: number } {
  const g = new MirrorDuelLogic(() => 0.5)
  g.start(0, players)
  g.update(COUNTDOWN_MS, [])
  const t = run(COUNTDOWN_MS, BREAK_MS + 40, (now) => g.update(now, []))
  expect(g.stage).toBe('pose')
  return { g, t }
}

function play(
  g: MirrorDuelLogic,
  from: number,
  ms: number,
  inputs: () => (BodyInput | null)[]
): { t: number; events: GameEvent[] } {
  const events: GameEvent[] = []
  const t = run(from, ms, (now) => events.push(...g.update(now, inputs())))
  return { t, events }
}

describe('Mirror Duel', () => {
  it('scores when the pose is held, with a bonus for being quick', () => {
    const { g, t } = posed()
    const { events } = play(g, t, HOLD_MS + 60, () => [holding(g.pose!)])
    const point = events.find((e) => e.type === 'point')
    expect(point).toMatchObject({ player: 0 })
    expect(g.players[0].score).toBeGreaterThan(POSE_POINTS)
    expect(g.players[0].score).toBeLessThanOrEqual(POSE_POINTS * 2)
    expect(g.stage).toBe('break')
  })

  it('does not count a pose that is only flashed', () => {
    const { g, t } = posed()
    const pose = g.pose!
    const a = play(g, t, HOLD_MS / 2, () => [holding(pose)])
    play(g, a.t, HOLD_MS, () => [standing()])
    expect(g.players[0].score).toBe(0)
    expect(g.stage).toBe('pose')
  })

  it('times out when nobody strikes the pose', () => {
    const { g, t } = posed()
    const { events } = play(g, t, FIRST_LIMIT_MS + 100, () => [standing()])
    expect(events.some((e) => e.type === 'timeout')).toBe(true)
    expect(g.players[0].score).toBe(0)
    expect(g.lastWinner).toBeNull()
  })

  it('gives the pose to the first of two players to strike it', () => {
    const { g, t } = posed(2)
    const pose = g.pose!
    // Player 2 strikes it first; player 1 joins a moment later.
    const a = play(g, t, 100, () => [standing(400), holding(pose, 900)])
    play(g, a.t, HOLD_MS, () => [holding(pose, 400), holding(pose, 900)])
    expect(g.players[1].wins).toBe(1)
    expect(g.players[0].wins).toBe(0)
    expect(g.winner()).toBe(1)
  })

  it('gives less time for each pose and ends after the last', () => {
    const { g, t } = posed()
    const first = g.limit()
    const { t: t2 } = play(g, t, 120_000, () => [standing()])
    expect(g.shown).toBe(POSES_PER_ROUND)
    expect(g.limit()).toBeLessThan(first)
    expect(g.flow.phase).toBe('gameover')
    expect(t2).toBeGreaterThan(0)
  })
})
