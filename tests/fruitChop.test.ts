import { describe, expect, it } from 'vitest'
import { BladeAim, bladePoint } from '../src/renderer/src/games/blade'
import {
  BOMB_PENALTY,
  COMBO_MIN,
  COMBO_POINTS,
  COUNTDOWN_MS,
  FIELD,
  FruitChopLogic,
  FRUIT_POINTS,
  LIVES,
  STAR_POINTS,
  VERSUS_MS,
  type HandInput,
  type Item,
  type ItemKind
} from '../src/renderer/src/games/fruitChop/logic'
import type { Vec2 } from '../src/renderer/src/input/types'

/** Deterministic pseudo-random numbers. */
function seeded(seed = 1): () => number {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

const right = (pos: Vec2 | null, player = 0): HandInput => ({ player, hand: 'right', pos })

/** Starts a game and runs the countdown; returns the time play began. */
function playing(g: FruitChopLogic, players = 1): number {
  g.start(0, players)
  g.update(COUNTDOWN_MS, [])
  expect(g.phase).toBe('playing')
  return COUNTDOWN_MS
}

/** A still item hanging in the air, replacing whatever was spawned. */
function place(g: FruitChopLogic, kind: ItemKind, xs: number[], y = 300): Item[] {
  g.items = xs.map((x, i) => ({
    id: 1000 + i,
    kind,
    type: 0,
    x,
    y,
    vx: 0,
    vy: -50,
    r: 50,
    rot: 0,
    spin: 0
  }))
  return g.items
}

/** Sweeps the right hand from x0 to x1 at height y over `ms`; returns everything that happened. */
function sweep(
  g: FruitChopLogic,
  t0: number,
  x0: number,
  x1: number,
  ms: number,
  y = 300,
  player = 0
): { chops: number; bombs: number; bonuses: number; t: number } {
  const all = { chops: 0, bombs: 0, bonuses: 0 }
  const steps = Math.max(1, Math.round(ms / 16))
  let t = t0
  for (let i = 0; i <= steps; i++, t += ms / steps) {
    const r = g.update(t, [right({ x: x0 + ((x1 - x0) * i) / steps, y }, player)])
    all.chops += r.chops.length
    all.bombs += r.bombs.length
    all.bonuses += r.bonuses.length
  }
  // Hand stops: the stroke ends and any bonus is paid.
  for (let i = 0; i < 12; i++, t += 16) {
    all.bonuses += g.update(t, [right({ x: x1, y }, player)]).bonuses.length
  }
  return { ...all, t }
}

describe('Fruit Chop', () => {
  it('tosses fruit up from below so it peaks on screen and falls back', () => {
    const g = new FruitChopLogic(seeded(3))
    let t = playing(g)
    const minY = new Map<number, number>()
    for (; t < COUNTDOWN_MS + 2500; t += 16) {
      g.update(t, [])
      for (const it of g.items) minY.set(it.id, Math.min(minY.get(it.id) ?? Infinity, it.y))
    }
    expect(minY.size).toBeGreaterThan(0)
    for (const y of minY.values()) {
      expect(y).toBeGreaterThan(FIELD.height * 0.1)
      expect(y).toBeLessThan(FIELD.height * 0.65)
    }
  })

  it('chops with a fast hand but not a slow one', () => {
    const g = new FruitChopLogic(seeded())
    const t = playing(g)
    place(g, 'fruit', [640])
    const slow = sweep(g, t + 16, 400, 880, 3000) // 160 px/s
    expect(slow.chops).toBe(0)
    place(g, 'fruit', [640])
    const fast = sweep(g, slow.t, 400, 880, 250) // 1920 px/s
    expect(fast.chops).toBe(1)
    expect(g.scores[0]).toBe(FRUIT_POINTS)
    expect(g.chopped[0]).toBe(1)
  })

  it('pays a bonus for several fruits in one stroke, and more for a star', () => {
    const g = new FruitChopLogic(seeded())
    const t = playing(g)
    place(g, 'fruit', [400, 600, 800])
    const r = sweep(g, t + 16, 200, 1000, 300)
    expect(r.chops).toBe(COMBO_MIN)
    expect(r.bonuses).toBe(1)
    expect(g.scores[0]).toBe(3 * FRUIT_POINTS + 3 * COMBO_POINTS)
    place(g, 'star', [640])
    sweep(g, r.t, 400, 880, 250)
    expect(g.scores[0]).toBe(3 * FRUIT_POINTS + 3 * COMBO_POINTS + STAR_POINTS)
  })

  it('solo: dropped fruit and chopped bombs cost lives; no lives ends the game', () => {
    const g = new FruitChopLogic(seeded())
    let t = playing(g)
    place(g, 'bomb', [640])
    const r = sweep(g, t + 16, 400, 880, 250)
    expect(r.bombs).toBe(1)
    expect(g.lives).toBe(LIVES - 1)
    // Two fruits fall out of the bottom.
    const items = place(g, 'fruit', [300, 900], FIELD.height - 10)
    for (const it of items) it.vy = 400
    t = r.t
    let dropped = 0
    for (let i = 0; i < 30 && g.phase === 'playing'; i++, t += 16) {
      dropped += g.update(t, []).dropped.length
    }
    expect(dropped).toBe(2)
    expect(g.lives).toBe(0)
    expect(g.phase).toBe('gameover')
  })

  it('a dropped bomb costs nothing', () => {
    const g = new FruitChopLogic(seeded())
    let t = playing(g)
    const [bomb] = place(g, 'bomb', [640], FIELD.height - 10)
    bomb.vy = 400
    for (let i = 0; i < 20; i++, t += 16) g.update(t, [])
    expect(g.lives).toBe(LIVES)
  })

  it('versus: bombs cost points (never below zero) and the round is timed', () => {
    const g = new FruitChopLogic(seeded())
    const t = playing(g, 2)
    place(g, 'bomb', [640])
    const r = sweep(g, t + 16, 400, 880, 250, 300, 1)
    expect(r.bombs).toBe(1)
    expect(g.scores).toEqual([0, 0])
    g.scores[1] = 80
    place(g, 'bomb', [640])
    const r2 = sweep(g, r.t, 400, 880, 250, 300, 1)
    expect(g.scores[1]).toBe(80 - BOMB_PENALTY)
    expect(g.lives).toBe(LIVES)
    g.scores[0] = 100
    let tt = r2.t
    for (; g.phase === 'playing' && tt < r2.t + VERSUS_MS + 1000; tt += 50) g.update(tt, [])
    expect(g.phase).toBe('gameover')
    expect(g.winner()).toBe(0)
  })

  it('pauses and resumes with a fresh countdown', () => {
    const g = new FruitChopLogic(seeded())
    const t = playing(g)
    g.pause(t + 100, 'out-of-view')
    expect(g.phase).toBe('paused')
    g.resume(t + 500)
    expect(g.countdown(t + 500)).toBe(3)
  })
})

describe('chop blade', () => {
  it('strikes at the mirror-mapped hand, which may be off screen', () => {
    const cursor = { x: 1, y: 0.5, play: { x: 1.2, y: 0.5 } }
    expect(bladePoint(cursor, 1280, 720)).toEqual({ x: 1536, y: 360 })
  })

  it('falls back to the menu cursor without a game mapping', () => {
    expect(bladePoint({ x: 0.25, y: 0.5 }, 1280, 720)).toEqual({ x: 320, y: 360 })
    expect(bladePoint(null, 1280, 720)).toBeNull()
  })

  it('points along the motion, keeps its direction when still, and snaps on a reversal', () => {
    const aim = new BladeAim()
    expect(aim.aim('h', { x: 100, y: 100 })).toBeCloseTo(-Math.PI / 2) // no motion yet
    let a = 0
    for (let x = 120; x <= 300; x += 20) a = aim.aim('h', { x, y: 100 })
    expect(a).toBeCloseTo(0) // moving right
    expect(aim.aim('h', { x: 301, y: 100 })).toBeCloseTo(0) // barely moving: unchanged
    expect(Math.abs(aim.aim('h', { x: 260, y: 100 }))).toBeCloseTo(Math.PI) // back to the left
    expect(aim.aim('h', null)).toBeCloseTo(-Math.PI / 2)
  })
})
