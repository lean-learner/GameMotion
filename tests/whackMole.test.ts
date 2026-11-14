import { describe, expect, it } from 'vitest'
import {
  MAX_UP,
  POINTS,
  RISE_MS,
  ROUND_MS,
  UP_MS,
  WhackMoleLogic,
  type GameEvent,
  type Mole
} from '../src/renderer/src/games/whackMole/logic'
import type { BodyInput } from '../src/renderer/src/games/poses'
import { COUNTDOWN_MS } from '../src/renderer/src/games/roundFlow'
import { standing } from './helpers/poseInput'

type Inputs = (BodyInput | null)[]

function playing(random: () => number = () => 0.5, players = 1): WhackMoleLogic {
  const g = new WhackMoleLogic(random)
  g.start(0, players)
  g.update(COUNTDOWN_MS, players > 1 ? [standing(350), standing(930)] : [standing()])
  expect(g.flow.phase).toBe('playing')
  return g
}

/** A seeded random, so a whole round is repeatable. */
function seeded(seed = 7): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/** Steps 16 ms frames from `from` until `done` says so (or 10 s pass). */
function until(
  g: WhackMoleLogic,
  from: number,
  inputs: () => Inputs,
  done: (events: GameEvent[]) => boolean
): { t: number; events: GameEvent[] } {
  const events: GameEvent[] = []
  let t = from
  for (; t < from + 10_000; t += 16) {
    events.push(...g.update(t, inputs()))
    if (done(events)) break
  }
  return { t, events }
}

function handOn(g: WhackMoleLogic, mole: Mole, x = 640): BodyInput {
  const spot = g.spot(mole)!
  return { ...standing(x), hands: { left: null, right: { x: spot.x, y: spot.y } } }
}

const idle = (): Inputs => [standing()]

describe('Whack-a-Mole rules', () => {
  it('pops the first mole 600 ms in, beside the player', () => {
    const g = playing()
    const { events } = until(g, COUNTDOWN_MS + 16, idle, () => g.moles.length > 0)
    expect(g.flow.elapsed).toBeGreaterThanOrEqual(600)
    expect(g.flow.elapsed).toBeLessThan(640)
    expect(events).toEqual([{ type: 'pop', player: 0, gold: false }])
    const mole = g.moles[0]
    // Random 0.5 picks the fourth of the six holes: right edge, lower lane.
    expect(mole).toMatchObject({ player: 0, edge: 'right', lane: 1, gold: false, from: 600 })
    expect(mole.leaves - mole.from).toBeGreaterThan(UP_MS[0] - 30)
    expect(mole.leaves - mole.from).toBeLessThanOrEqual(UP_MS[0])
    const spot = g.spot(mole)!
    expect(spot.x).toBeCloseTo(640 + 1.7 * 180)
    expect(spot.y).toBeCloseTo(300 + 0.3 * 180)
    expect(spot.r).toBeCloseTo(0.5 * 180)
  })

  it('scores a whack and removes the mole', () => {
    const g = playing()
    const { t } = until(g, COUNTDOWN_MS + 16, idle, () => g.moles.length > 0)
    const mole = g.moles[0]
    const events = g.update(t + 16, [handOn(g, mole)])
    const spot = { x: 640 + 1.7 * 180, y: 300 + 0.3 * 180 }
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'hit', player: 0, gold: false, points: POINTS.mole })
    expect((events[0] as { x: number }).x).toBeCloseTo(spot.x)
    expect((events[0] as { y: number }).y).toBeCloseTo(spot.y)
    expect(g.moles).toHaveLength(0)
    expect(g.players[0]).toMatchObject({ score: 50, combo: 1, bestCombo: 1, hits: 1, misses: 0 })
    expect(g.scores()).toEqual([50])
  })

  it('does not count a hand that was parked on the spot', () => {
    const g = playing()
    const parked: BodyInput = {
      ...standing(),
      hands: { left: { x: 640 + 1.7 * 180, y: 300 + 0.3 * 180 }, right: null }
    }
    const { events } = until(
      g,
      COUNTDOWN_MS + 16,
      () => [parked],
      (e) => e.some((x) => x.type === 'miss')
    )
    expect(events.some((e) => e.type === 'hit')).toBe(false)
    expect(g.players[0].hits).toBe(0)
    expect(g.players[0].misses).toBe(1)
  })

  it('a mole left alone goes back down: a miss that ends the run', () => {
    const g = playing()
    const a = until(g, COUNTDOWN_MS + 16, idle, () => g.moles.length > 0)
    const first = g.moles[0]
    g.update(a.t + 16, [handOn(g, first)])
    expect(g.players[0].combo).toBe(1)
    // The next mole is left alone.
    const b = until(g, a.t + 32, idle, () => g.moles.length > 0)
    const second = g.moles[0]
    const c = until(g, b.t + 16, idle, (e) => e.some((x) => x.type === 'miss'))
    const miss = c.events.find((e) => e.type === 'miss')!
    expect(miss).toMatchObject({ type: 'miss', player: 0 })
    expect(g.flow.elapsed).toBeGreaterThan(second.leaves)
    expect(g.flow.elapsed).toBeLessThan(second.leaves + 40)
    expect(g.moles.some((m) => m.id === second.id)).toBe(false)
    expect(g.players[0]).toMatchObject({ combo: 0, bestCombo: 1, hits: 1, misses: 1 })
  })

  it('pays more for each whack in a row', () => {
    const g = playing()
    let t = COUNTDOWN_MS + 16
    const points: number[] = []
    for (let i = 0; i < 3; i++) {
      const a = until(g, t, idle, () => g.moles.length > 0)
      const events = g.update(a.t + 16, [handOn(g, g.moles[0])])
      points.push((events.find((e) => e.type === 'hit') as { points: number }).points)
      t = a.t + 32
    }
    expect(points).toEqual([50, 55, 60])
    expect(g.players[0].score).toBe(165)
  })

  it('pops a golden mole worth more', () => {
    // The first random number of a pop decides gold; the next picks the spot.
    const queue = [0.01, 0.5]
    const g = playing(() => queue.shift() ?? 0.5)
    const a = until(g, COUNTDOWN_MS + 16, idle, () => g.moles.length > 0)
    expect(a.events).toEqual([{ type: 'pop', player: 0, gold: true }])
    expect(g.moles[0]).toMatchObject({ gold: true, edge: 'right', lane: 1 })
    const events = g.update(a.t + 16, [handOn(g, g.moles[0])])
    expect(events[0]).toMatchObject({ type: 'hit', gold: true, points: POINTS.gold })
    expect(POINTS.gold).toBeGreaterThan(POINTS.mole)
  })

  it('rises out of the ground and sinks back', () => {
    const g = playing()
    const a = until(g, COUNTDOWN_MS + 16, idle, () => g.moles.length > 0)
    const mole = g.moles[0]
    expect(g.shown(mole)).toBeLessThan(0.3)
    until(g, a.t + 16, idle, () => g.flow.elapsed >= mole.from + RISE_MS + 16)
    expect(g.shown(mole)).toBe(1)
    until(g, a.t + 16, idle, () => g.flow.elapsed >= mole.leaves - RISE_MS / 2)
    expect(g.shown(mole)).toBeGreaterThan(0.2)
    expect(g.shown(mole)).toBeLessThan(0.8)
  })

  it('comes from the left, right and bottom, never the top, and never two in one hole', () => {
    const g = playing(seeded())
    const edges = new Set<string>()
    let most = 0
    for (let t = COUNTDOWN_MS + 16; g.flow.phase === 'playing'; t += 16) {
      g.update(t, idle())
      most = Math.max(most, g.moles.length)
      const holes = new Set(g.moles.map((m) => `${m.edge}${m.lane}`))
      expect(holes.size).toBe(g.moles.length)
      for (const m of g.moles) {
        edges.add(m.edge)
        const spot = g.spot(m)!
        expect(['left', 'right', 'bottom']).toContain(m.edge)
        if (m.edge === 'left') expect(spot.x).toBeLessThan(640 - 180)
        if (m.edge === 'right') expect(spot.x).toBeGreaterThan(640 + 180)
        if (m.edge === 'bottom') {
          expect(spot.y).toBeGreaterThan(300 + 180)
          expect([-1, 1]).toContain(m.lane)
        } else {
          expect([-1, 1]).toContain(m.lane)
          // Never above the head.
          expect(spot.y).toBeGreaterThan(300 - 1.2 * 180)
        }
        // Inside the picture, below the score plates.
        expect(spot.x).toBeGreaterThanOrEqual(spot.r)
        expect(spot.x).toBeLessThanOrEqual(1280 - spot.r)
        expect(spot.y).toBeGreaterThanOrEqual(90 + spot.r)
        expect(spot.y).toBeLessThanOrEqual(720 - spot.r)
      }
    }
    expect([...edges].sort()).toEqual(['bottom', 'left', 'right'])
    expect(most).toBeGreaterThan(1)
    expect(most).toBeLessThanOrEqual(MAX_UP)
    expect(g.players[0].misses).toBeGreaterThan(40)
  })

  it('keeps holes inside the picture for a player near its edge', () => {
    const g = playing(seeded(3))
    const body = { ...standing(120), y: 560 }
    for (let t = COUNTDOWN_MS + 16; t < COUNTDOWN_MS + 20_000; t += 16) {
      g.update(t, [body])
      for (const m of g.moles) {
        const spot = g.spot(m)!
        expect(spot.x).toBeGreaterThanOrEqual(spot.r)
        expect(spot.y).toBeLessThanOrEqual(720 - spot.r)
      }
    }
  })

  it('ends after the round time and stops popping moles that could not be whacked', () => {
    const g = playing(seeded(11))
    let t = COUNTDOWN_MS + 16
    for (; g.flow.phase === 'playing' && t < COUNTDOWN_MS + ROUND_MS + 1000; t += 16) {
      g.update(t, idle())
      for (const m of g.moles) expect(m.leaves).toBeLessThan(ROUND_MS)
    }
    expect(g.flow.phase).toBe('gameover')
    expect(g.flow.elapsed).toBeGreaterThanOrEqual(ROUND_MS)
    expect(g.remaining()).toBe(0)
    expect(g.winner()).toBeNull()
  })

  it('with two players, gives each a mole on their own side, never between them', () => {
    const g = playing(seeded(5), 2)
    const both = (): Inputs => [standing(350), standing(930)]
    const seen: Set<string>[] = [new Set(), new Set()]
    let pops: GameEvent[] = []
    let t = COUNTDOWN_MS + 16
    for (; t < COUNTDOWN_MS + 30_000; t += 16) {
      const events = g.update(t, both())
      const popped = events.filter((e) => e.type === 'pop')
      // Every pop sends one mole to each player, both gold or both plain.
      if (popped.length) {
        expect(popped.map((e) => (e as { player: number }).player)).toEqual([0, 1])
        expect((popped[0] as { gold: boolean }).gold).toBe((popped[1] as { gold: boolean }).gold)
      }
      pops = pops.concat(popped)
      for (const m of g.moles) seen[m.player].add(m.edge)
    }
    expect(pops.length).toBeGreaterThan(20)
    expect([...seen[0]].sort()).toEqual(['bottom', 'left'])
    expect([...seen[1]].sort()).toEqual(['bottom', 'right'])
    // Player 1 whacks one; player 2 does not: player 1 leads.
    // (A real mole: by now hedgehogs pop up too.)
    const real = (m: Mole): boolean => m.player === 0 && !m.decoy && g.shown(m) > 0
    const a = until(g, t, both, () => g.moles.some(real))
    const mole = g.moles.find(real)!
    const before = g.scores()[0]
    g.update(a.t + 16, [handOn(g, mole, 350), standing(930)])
    expect(g.scores()[0]).toBeGreaterThan(before)
    expect(g.scores()[1]).toBe(0)
    expect(g.winner()).toBe(0)
  })
})
