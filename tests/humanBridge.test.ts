import { describe, expect, it } from 'vitest'
import {
  bridged,
  FIRST_APPROACH_MS,
  GAP_MS,
  HumanBridgeLogic,
  LAYERS_FROM,
  LIVES,
  WALL_POINTS,
  type GameEvent
} from '../src/renderer/src/games/humanBridge/logic'
import type { BodyInput, Pose } from '../src/renderer/src/games/poses'
import { COUNTDOWN_MS } from '../src/renderer/src/games/roundFlow'
import { holding, run, standing, SW } from './helpers/poseInput'

/** A game with its first wall on the way. `random` 0.5 never asks for a bridge. */
function walled(players = 1, random = () => 0.5): { g: HumanBridgeLogic; t: number } {
  const g = new HumanBridgeLogic(random)
  g.start(0, players)
  g.update(COUNTDOWN_MS, [])
  const t = run(COUNTDOWN_MS, GAP_MS + 40, (now) => g.update(now, []))
  expect(g.wall).not.toBeNull()
  return { g, t }
}

function play(
  g: HumanBridgeLogic,
  from: number,
  ms: number,
  inputs: () => (BodyInput | null)[]
): { t: number; events: GameEvent[] } {
  const events: GameEvent[] = []
  const t = run(from, ms, (now) => events.push(...g.update(now, inputs())))
  return { t, events }
}

/** Two players reaching for each other: their inner hands `gap` pixels apart. */
function reaching(gap: number): BodyInput[] {
  const a = standing(400)
  const b = standing(900)
  a.hands.right = { x: 650 - gap / 2, y: 280 }
  b.hands.left = { x: 650 + gap / 2, y: 280 }
  return [a, b]
}

describe('Human Bridge', () => {
  it('passes the wall when the player is in the pose as it arrives', () => {
    const { g, t } = walled()
    const pose = g.wall!.shapes[0] as Pose
    const { events } = play(g, t, FIRST_APPROACH_MS, () => [holding(pose)])
    expect(events.find((e) => e.type === 'pass')).toMatchObject({
      points: WALL_POINTS,
      streak: 1,
      layersLeft: 0
    })
    expect(g.score).toBe(WALL_POINTS)
    expect(g.lives).toBe(LIVES)
  })

  it('crashes when the pose was dropped before the wall arrived', () => {
    const { g, t } = walled()
    const pose = g.wall!.shapes[0] as Pose
    const a = play(g, t, FIRST_APPROACH_MS / 2, () => [holding(pose)])
    const { events } = play(g, a.t, FIRST_APPROACH_MS / 2, () => [standing()])
    expect(events.find((e) => e.type === 'crash')).toMatchObject({
      missed: [0],
      livesLeft: LIVES - 1
    })
    expect(g.score).toBe(0)
  })

  it('needs every player: one missing the pose crashes the team', () => {
    const { g, t } = walled(2)
    const [p0] = g.wall!.shapes as Pose[]
    const { events } = play(g, t, FIRST_APPROACH_MS, () => [holding(p0, 400), standing(900)])
    expect(events.find((e) => e.type === 'crash')).toMatchObject({ missed: [1] })
    expect(g.scores()).toEqual([0, 0])
  })

  it('pays more for walls passed in a row, and speeds up', () => {
    const { g, t } = walled()
    const first = g.wall!.arrives - g.wall!.from
    const a = play(g, t, FIRST_APPROACH_MS, () => [holding((g.wall?.shapes[0] as Pose) ?? 'wide')])
    const b = play(g, a.t, GAP_MS + FIRST_APPROACH_MS, () =>
      g.wall ? [holding(g.wall.shapes[0] as Pose)] : [standing()]
    )
    const passes = [...a.events, ...b.events].filter((e) => e.type === 'pass')
    expect(passes).toHaveLength(2)
    expect(passes[1]).toMatchObject({ streak: 2 })
    expect(g.score).toBeGreaterThan(2 * WALL_POINTS)
    const second = [...b.events].find((e) => e.type === 'wall')
    expect(second && second.type === 'wall' && second.wall.arrives - second.wall.from).toBeLessThan(
      first
    )
  })

  it('ends when the team runs out of lives', () => {
    const { g, t } = walled()
    play(g, t, 60_000, () => [standing()])
    expect(g.lives).toBe(0)
    expect(g.flow.phase).toBe('gameover')
  })

  it('asks two players for a bridge, passed by joining hands', () => {
    const { g, t } = walled(2, () => 0.1)
    expect(g.wall!.shapes).toEqual(['bridge', 'bridge'])
    const { events } = play(g, t, FIRST_APPROACH_MS, () => reaching(SW * 0.4))
    expect(events.some((e) => e.type === 'pass')).toBe(true)
  })

  it('only counts hands that actually meet', () => {
    expect(bridged(reaching(SW * 0.4))).toBe(true)
    expect(bridged(reaching(SW * 2))).toBe(false)
    expect(bridged([standing(400), standing(900)])).toBe(false)
    expect(bridged([standing(400), null])).toBe(false)
    // It doesn't matter which player is on which side of the picture.
    expect(bridged(reaching(SW * 0.4).reverse())).toBe(true)
  })

  it('sends later walls in layers: one pose straight after another', () => {
    const { g, t } = walled()
    const events: GameEvent[] = []
    const first = g.wall!
    // Always in whatever pose the wall wants, until a layered wall has gone by.
    let now = t
    for (; now < t + 60_000 && g.passed < LAYERS_FROM[0]; now += 16) {
      events.push(...g.update(now, [g.wall ? holding(g.wall.shapes[0] as Pose) : standing()]))
    }
    const walls = [first, ...events.flatMap((e) => (e.type === 'wall' ? [e.wall] : []))]
    const layered = walls[LAYERS_FROM[0] - 1]
    expect(first.layers).toHaveLength(1)
    expect(layered.layers).toHaveLength(2)
    expect(layered.layers[1][0]).not.toBe(layered.layers[0][0])
    // The second layer arrives much sooner than a fresh wall would.
    expect(layered.gap).toBeLessThan(FIRST_APPROACH_MS / 2)
    const passes = events.filter((e) => e.type === 'pass')
    expect(passes).toHaveLength(LAYERS_FROM[0] + 1)
    expect(passes[passes.length - 2]).toMatchObject({ layersLeft: 1 })
    expect(g.lives).toBe(LIVES)
  })

  it('crashes the whole wall when the second layer is missed', () => {
    const { g, t } = walled()
    const events: GameEvent[] = []
    let now = t
    // Pass every first layer, never change pose for a second one.
    for (; now < t + 60_000 && g.lives === LIVES; now += 16) {
      const wall = g.wall
      events.push(...g.update(now, [wall ? holding(wall.layers[0][0] as Pose) : standing()]))
    }
    expect(g.passed).toBe(LAYERS_FROM[0] - 1)
    expect(g.wall).toBeNull()
    expect(g.streak).toBe(0)
  })

  it('never asks a lone player for a bridge', () => {
    const { g } = walled(1, () => 0.1)
    expect(g.wall!.shapes).not.toContain('bridge')
  })
})
