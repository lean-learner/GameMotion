import { describe, expect, it } from 'vitest'
import { BladeAim } from '../src/renderer/src/games/blade'
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

  it('lobs some fruit in from the left and right edges, towards the player', () => {
    const g = new FruitChopLogic(seeded(5))
    let t = playing(g)
    const starts = new Map<number, { x: number; vx: number }>()
    for (; t < COUNTDOWN_MS + 30_000; t += 16) {
      g.update(t, [])
      g.lives = LIVES // keep the round going
      for (const it of g.items) if (!starts.has(it.id)) starts.set(it.id, { x: it.x, vx: it.vx })
    }
    const fromLeft = [...starts.values()].filter((s) => s.x < 0)
    const fromRight = [...starts.values()].filter((s) => s.x > FIELD.width)
    expect(fromLeft.length).toBeGreaterThan(0)
    expect(fromRight.length).toBeGreaterThan(0)
    for (const s of fromLeft) expect(s.vx).toBeGreaterThan(0)
    for (const s of fromRight) expect(s.vx).toBeLessThan(0)
  })

  it('aims fruit at where the player can reach, and sizes it to the player', () => {
    const g = new FruitChopLogic(seeded(7))
    // A small (far away) player standing on the left of the picture.
    const area = { x0: 150, x1: 550, top: 250, bottom: 520, scale: 0.7 }
    g.areas = [area]
    let t = playing(g)
    const peak = new Map<number, { x: number; y: number; r: number }>()
    for (; t < COUNTDOWN_MS + 20_000; t += 16) {
      g.update(t, [])
      g.lives = LIVES
      for (const it of g.items) {
        const p = peak.get(it.id)
        if (!p || it.y < p.y) peak.set(it.id, { x: it.x, y: it.y, r: it.r })
      }
    }
    expect(peak.size).toBeGreaterThan(5)
    for (const p of peak.values()) {
      expect(p.x).toBeGreaterThan(area.x0 - 130)
      expect(p.x).toBeLessThan(area.x1 + 130)
      expect(p.y).toBeGreaterThan(area.top - 30)
      expect(p.y).toBeLessThan(area.bottom)
      expect(p.r).toBeLessThan(50)
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
    // The rest of the lives go on fruit falling out of the bottom.
    const xs = Array.from({ length: LIVES - 1 }, (_, i) => 200 + i * 200)
    const items = place(g, 'fruit', xs, FIELD.height - 10)
    for (const it of items) it.vy = 400
    t = r.t
    let dropped = 0
    for (let i = 0; i < 30 && g.phase === 'playing'; i++, t += 16) {
      dropped += g.update(t, []).dropped.length
    }
    expect(dropped).toBe(LIVES - 1)
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
