import { describe, expect, it } from 'vitest'
import {
  DECOY_PENALTY,
  LEVEL_MS,
  LEVELS,
  levelAt,
  ROUND_MS,
  UP_MS,
  WhackMoleLogic,
  type GameEvent,
  type Mole
} from '../src/renderer/src/games/whackMole/logic'
import type { BodyInput } from '../src/renderer/src/games/poses'
import { COUNTDOWN_MS } from '../src/renderer/src/games/roundFlow'
import { standing } from './helpers/poseInput'

function playing(random: () => number): WhackMoleLogic {
  const g = new WhackMoleLogic(random)
  g.start(0, 1)
  g.update(COUNTDOWN_MS, [standing()])
  expect(g.flow.phase).toBe('playing')
  return g
}

/** Steps idle 16 ms frames from `from` while the round runs, until `done`. Returns the time reached. */
function idleUntil(
  g: WhackMoleLogic,
  from: number,
  done: (frame: GameEvent[]) => boolean,
  seen: GameEvent[] = []
): number {
  let t = from
  for (; g.flow.phase === 'playing'; t += 16) {
    const frame = g.update(t, [standing()])
    seen.push(...frame)
    if (done(frame)) break
  }
  return t
}

function handOn(g: WhackMoleLogic, mole: Mole): BodyInput {
  const spot = g.spot(mole)!
  return { ...standing(), hands: { left: null, right: { x: spot.x, y: spot.y } } }
}

const START = COUNTDOWN_MS + 16

describe('Whack-a-Mole levels', () => {
  it('has five levels of equal length', () => {
    expect(LEVELS).toBe(5)
    expect(ROUND_MS).toBe(LEVELS * LEVEL_MS)
    expect(levelAt(0)).toBe(1)
    expect(levelAt(LEVEL_MS - 1)).toBe(1)
    expect(levelAt(LEVEL_MS)).toBe(2)
    expect(levelAt(4 * LEVEL_MS)).toBe(5)
    expect(levelAt(ROUND_MS - 1)).toBe(5)
    expect(levelAt(ROUND_MS * 10)).toBe(5)
    expect(levelAt(-5)).toBe(1)
  })

  it('announces each new level once, in order', () => {
    const g = playing(() => 0.5)
    expect(g.level()).toBe(1)
    const seen: GameEvent[] = []
    idleUntil(g, START, (f) => f.some((e) => e.type === 'level'), seen)
    expect(g.flow.elapsed).toBeGreaterThanOrEqual(LEVEL_MS)
    expect(g.flow.elapsed).toBeLessThan(LEVEL_MS + 40)
    expect(g.level()).toBe(2)
    idleUntil(g, COUNTDOWN_MS + g.flow.elapsed + 16, () => false, seen)
    expect(g.flow.phase).toBe('gameover')
    expect(seen.filter((e) => e.type === 'level')).toEqual([
      { type: 'level', level: 2 },
      { type: 'level', level: 3 },
      { type: 'level', level: 4 },
      { type: 'level', level: 5 }
    ])
    // 0.5 is neither gold nor a hedgehog at any level.
    expect(seen.some((e) => e.type === 'peek')).toBe(false)
  })

  it('moles stay up for less time on each level', () => {
    const g = playing(() => 0.5)
    const up = new Map<number, number>()
    for (let t = START; g.flow.phase === 'playing'; t += 16) {
      g.update(t, [standing()])
      for (const m of g.moles) up.set(levelAt(m.from), m.leaves - m.from)
    }
    expect(up.get(1)).toBeCloseTo(UP_MS[0])
    expect(up.get(2)).toBeCloseTo(UP_MS[0] + (UP_MS[1] - UP_MS[0]) * 0.25)
    expect(up.get(3)).toBeCloseTo(UP_MS[0] + (UP_MS[1] - UP_MS[0]) * 0.5)
    expect(up.get(4)).toBeCloseTo(UP_MS[0] + (UP_MS[1] - UP_MS[0]) * 0.75)
    expect(up.get(5)).toBeCloseTo(UP_MS[1])
  })
})

describe('Whack-a-Mole hedgehogs', () => {
  it('never appear on level 1, then pop up from level 2', () => {
    const g = playing(() => 0.99)
    const seen: GameEvent[] = []
    idleUntil(g, START, (f) => f.some((e) => e.type === 'peek'), seen)
    expect(g.flow.phase).toBe('playing')
    expect(g.flow.elapsed).toBeGreaterThanOrEqual(LEVEL_MS)
    expect(seen.filter((e) => e.type === 'pop').length).toBeGreaterThan(5)
    expect(seen.filter((e) => e.type === 'peek')).toEqual([{ type: 'peek', player: 0 }])
    const hog = g.moles.filter((m) => m.decoy)
    expect(hog.length).toBe(1)
    expect(hog[0].gold).toBe(false)
    expect(hog[0].from).toBeGreaterThanOrEqual(LEVEL_MS)
  })

  it('hitting one costs points and the run, never below zero', () => {
    const g = playing(() => 0.99)
    let t = idleUntil(g, START, (f) => f.some((e) => e.type === 'peek'))
    const p = g.players[0]
    p.score = 130
    p.combo = 3
    let hog = g.moles.find((m) => m.decoy)!
    let events = g.update(t + 16, [handOn(g, hog)])
    expect(events.filter((e) => e.type === 'ouch')).toEqual([
      { type: 'ouch', player: 0, points: DECOY_PENALTY, x: g.spot(hog)!.x, y: g.spot(hog)!.y }
    ])
    expect(events.some((e) => e.type === 'hit')).toBe(false)
    expect(p.score).toBe(130 - DECOY_PENALTY)
    expect(p.combo).toBe(0)
    expect(p.ouches).toBe(1)
    expect(p.hits).toBe(0)
    expect(g.moles.includes(hog)).toBe(false)

    t = idleUntil(g, t + 32, (f) => f.some((e) => e.type === 'peek'))
    hog = g.moles.find((m) => m.decoy)!
    events = g.update(t + 16, [handOn(g, hog)])
    expect(events.find((e) => e.type === 'ouch')).toMatchObject({ points: 30 })
    expect(p.score).toBe(0)
    expect(p.ouches).toBe(2)
  })

  it('leaving one alone is not a miss and keeps the run', () => {
    const g = playing(() => 0.99)
    // Into level 2, after every level-1 mole has gone back down.
    const t = idleUntil(g, START, () => g.flow.elapsed > LEVEL_MS + 2000)
    const p = g.players[0]
    const misses = p.misses
    p.combo = 4
    const seen: GameEvent[] = []
    idleUntil(g, t + 16, () => g.flow.elapsed > 2 * LEVEL_MS - 100, seen)
    expect(seen.filter((e) => e.type === 'peek').length).toBeGreaterThan(3)
    expect(seen.some((e) => e.type === 'miss' || e.type === 'pop')).toBe(false)
    expect(p.misses).toBe(misses)
    expect(p.combo).toBe(4)
    expect(p.ouches).toBe(0)
  })

  it('a golden roll is still a golden mole on the last level', () => {
    const g = playing(() => 0.01)
    idleUntil(g, START, () => g.flow.elapsed > 4 * LEVEL_MS + 3000)
    expect(g.moles.length).toBeGreaterThan(0)
    for (const m of g.moles) expect(m).toMatchObject({ gold: true, decoy: false })
  })
})
