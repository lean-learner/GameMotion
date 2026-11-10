import { describe, expect, it } from 'vitest'
import {
  BalloonPopLogic,
  comboMultiplier,
  COMBO_WINDOW_MS,
  COUNTDOWN_MS,
  FIELD,
  MIN_POP_SPEED,
  MULTI_SLICE_MIN,
  playerInView,
  ROUND_MS,
  type Balloon,
  type HandInput
} from '../src/renderer/src/games/balloonPop/logic'
import { distToSegment } from '../src/renderer/src/games/geometry'
import type { MotionSnapshot, Vec2 } from '../src/renderer/src/input/types'

/** Deterministic pseudo-random numbers. */
function seeded(seed = 1): () => number {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

const right = (pos: Vec2 | null, player = 0): HandInput => ({ player, hand: 'right', pos })

/** Starts a game and runs the countdown; returns the time play began. */
function playing(g: BalloonPopLogic, players = 1): number {
  g.start(0, players)
  g.update(COUNTDOWN_MS, [])
  expect(g.phase).toBe('playing')
  return COUNTDOWN_MS
}

/** Advances in 33 ms steps with no hands. */
function advance(g: BalloonPopLogic, from: number, ms: number): number {
  let t = from
  for (; t < from + ms; t += 33) g.update(t, [])
  return t
}

/**
 * Moves a hand horizontally through a balloon at `speed` px/s (16 ms frames),
 * starting 160 px to its left. Returns the pops/bumps and the end time.
 */
function sweep(
  g: BalloonPopLogic,
  t: number,
  b: Balloon,
  speed: number,
  player = 0
): { pops: number; bumps: number; t: number; points: number[] } {
  let pops = 0
  let bumps = 0
  const points: number[] = []
  for (let x = b.x - 160; x <= b.x + 20; x += (speed * 16) / 1000) {
    const r = g.update((t += 16), [right({ x, y: b.y }, player)])
    pops += r.pops.length
    bumps += r.bumps.length
    points.push(...r.pops.map((p) => p.points))
  }
  return { pops, bumps, t, points }
}

describe('geometry', () => {
  it('measures distance to a segment', () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
    expect(distToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5)
    expect(distToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5)
  })
})

describe('Balloon Pop rules', () => {
  it('goes menu -> countdown -> playing -> game over after 60 s', () => {
    const g = new BalloonPopLogic(seeded())
    expect(g.phase).toBe('menu')
    g.start(0)
    expect(g.phase).toBe('countdown')
    expect(g.countdown(10)).toBe(3)
    expect(g.countdown(2500)).toBe(1)
    const t = playing(g)
    advance(g, t, ROUND_MS + 100)
    expect(g.phase).toBe('gameover')
    expect(g.balloons).toHaveLength(0)
  })

  it('spawns balloons below the field that rise and escape at the top', () => {
    const g = new BalloonPopLogic(seeded())
    const t = playing(g)
    g.update(t + 33, [])
    const b = g.balloons[0]
    expect(b.y).toBeGreaterThan(FIELD.height - 1)
    const y0 = b.y
    advance(g, t + 66, 1000)
    expect(b.y).toBeLessThan(y0 - 80)
    advance(g, t + 1100, 12000)
    expect(g.escaped).toBeGreaterThan(0)
  })

  it('pops a balloon the hand swipes through, and scores it', () => {
    const g = new BalloonPopLogic(seeded())
    let t = playing(g)
    g.update((t += 33), [])
    const b = g.balloons[0]
    const r = sweep(g, t, b, 900)
    expect(r.pops).toBe(1)
    expect(g.score).toBe(b.kind === 'golden' ? 50 : 10)
    expect(g.balloons.find((x) => x.id === b.id)).toBeUndefined()
  })

  it('does not pop for a hand resting on the balloon; it only bumps it', () => {
    const g = new BalloonPopLogic(seeded())
    let t = playing(g)
    g.update((t += 33), [])
    const b = g.balloons[0]
    let pops = 0
    let bumps = 0
    for (let i = 0; i < 30; i++) {
      // Hand follows the balloon exactly (moving only as fast as it rises).
      const r = g.update((t += 16), [right({ x: b.x, y: b.y })])
      pops += r.pops.length
      bumps += r.bumps.length
    }
    expect(pops).toBe(0)
    expect(bumps).toBeGreaterThan(0)
    expect(bumps).toBeLessThanOrEqual(1) // wobble cooldown
  })

  it('does not pop for a slow drift, but does for a slight swipe', () => {
    const slow = new BalloonPopLogic(seeded())
    let t = playing(slow)
    slow.update((t += 33), [])
    expect(sweep(slow, t, slow.balloons[0], MIN_POP_SPEED * 0.5).pops).toBe(0)

    const quick = new BalloonPopLogic(seeded())
    t = playing(quick)
    quick.update((t += 33), [])
    expect(sweep(quick, t, quick.balloons[0], MIN_POP_SPEED * 1.5).pops).toBe(1)
  })

  it('pops a balloon the hand swept across between two frames', () => {
    const g = new BalloonPopLogic(seeded())
    let t = playing(g)
    g.update((t += 33), [])
    const b = g.balloons[0]
    // Fast swipe: far left, then far right in the next frame. Never "on" it.
    g.update((t += 16), [right({ x: b.x - 300, y: b.y })])
    const r = g.update(t + 16, [right({ x: b.x + 300, y: b.y - 4 })])
    expect(r.pops.map((p) => p.balloon.id)).toContain(b.id)
  })

  it('does not pop through a hand that just reappeared far away', () => {
    const g = new BalloonPopLogic(seeded())
    let t = playing(g)
    g.update((t += 33), [])
    const b = g.balloons[0]
    g.update((t += 16), [right({ x: b.x - 300, y: b.y })])
    g.update((t += 16), [right(null)]) // hand lost
    const r = g.update(t + 16, [right({ x: b.x + 300, y: b.y })])
    expect(r.pops).toHaveLength(0)
  })

  it('builds combos for quick consecutive pops and resets them after a gap', () => {
    expect([1, 2, 3, 4, 7, 10, 20].map(comboMultiplier)).toEqual([1, 1, 1, 2, 3, 4, 4])
    const g = new BalloonPopLogic(seeded())
    let t = playing(g)
    t = advance(g, t, 3000)
    const popOne = (): number => {
      const b = g.balloons[g.balloons.length - 1]
      const before = g.combo
      const r = sweep(g, t, b, 2000)
      t = r.t
      return r.pops ? g.combo : before
    }
    expect([popOne(), popOne(), popOne(), popOne()]).toEqual([1, 2, 3, 4])
    t = advance(g, t, COMBO_WINDOW_MS + 300)
    expect(popOne()).toBe(1)
  })

  it('stops the clock while paused and resumes with a countdown', () => {
    const g = new BalloonPopLogic(seeded())
    let t = playing(g)
    t = advance(g, t, 5000)
    const left = g.timeLeftMs
    g.pause(t, 'out-of-view')
    expect(g.phase).toBe('paused')
    expect(g.pauseReason).toBe('out-of-view')
    t = advance(g, t, 10000)
    expect(g.timeLeftMs).toBe(left)
    g.resume(t)
    expect(g.phase).toBe('countdown')
    g.update(t + COUNTDOWN_MS, [])
    expect(g.phase).toBe('playing')
  })

  it('keeps the best single-player score across rounds', () => {
    const g = new BalloonPopLogic(seeded())
    let t = playing(g)
    g.update((t += 33), [])
    t = sweep(g, t, g.balloons[0], 900).t
    const first = g.score
    expect(first).toBeGreaterThan(0)
    advance(g, t, ROUND_MS)
    expect(g.best).toBe(first)
    g.start(t + ROUND_MS + 100)
    expect(g.score).toBe(0)
    expect(g.best).toBe(first)
  })

  it('does not jump forward after a long stall', () => {
    const g = new BalloonPopLogic(seeded())
    const t = playing(g)
    g.update(t + 33, [])
    const left = g.timeLeftMs
    g.update(t + 5033, []) // 5 s frame (e.g. window hidden)
    expect(left - g.timeLeftMs).toBeLessThanOrEqual(100)
  })

  it('reports when a hand is moving fast enough to pop', () => {
    const g = new BalloonPopLogic(seeded())
    let t = 0
    for (let i = 0; i < 6; i++) g.update((t += 16), [right({ x: 100 + i * 2, y: 300 })])
    expect(g.isArmed(0, 'right', t)).toBe(false)
    for (let i = 0; i < 6; i++) g.update((t += 16), [right({ x: 200 + i * 20, y: 300 })])
    expect(g.isArmed(0, 'right', t)).toBe(true)
  })
})

describe('slicing', () => {
  /** Three still balloons in a row, so one stroke can slice them all. */
  function row(g: BalloonPopLogic): Balloon[] {
    const mk = (id: number, x: number): Balloon => ({
      id: 1000 + id,
      kind: 'normal',
      color: 0,
      x,
      y: 300,
      r: 40,
      baseX: x,
      speed: 0,
      wobblePhase: -Math.PI / 2
    })
    g.balloons = [mk(1, 400), mk(2, 600), mk(3, 800)]
    return g.balloons
  }

  it('awards a multi-slice bonus when a stroke pops several balloons', () => {
    const g = new BalloonPopLogic(seeded())
    let t = playing(g)
    row(g)
    let bonus = null
    let strokes = 0
    // One fast stroke left to right through all three, then the hand stops.
    for (let x = 200; x <= 1000; x += 30) {
      const r = g.update((t += 16), [right({ x, y: 300 })])
      strokes += r.strokes.length
    }
    for (let i = 0; i < 12; i++) {
      const r = g.update((t += 16), [right({ x: 1000, y: 300 })])
      bonus ??= r.bonuses[0] ?? null
    }
    expect(strokes).toBe(1)
    expect(bonus).toMatchObject({ count: MULTI_SLICE_MIN, player: 0, hand: 'right' })
    expect(g.score).toBeGreaterThanOrEqual(3 * 10 + bonus!.points)
  })

  it('gives no bonus for separate strokes', () => {
    const g = new BalloonPopLogic(seeded())
    let t = playing(g)
    const [a, b, c] = row(g)
    let bonuses = 0
    for (const target of [a, b, c]) {
      // Fast stroke through one balloon, then a full stop.
      for (let x = target.x - 150; x <= target.x + 60; x += 30)
        bonuses += g.update((t += 16), [right({ x, y: 300 })]).bonuses.length
      for (let i = 0; i < 12; i++)
        bonuses += g.update((t += 16), [right({ x: target.x + 60, y: 300 })]).bonuses.length
    }
    expect(bonuses).toBe(0)
  })
})

describe('versus (two players)', () => {
  it('scores each player separately and finds the winner', () => {
    const g = new BalloonPopLogic(seeded())
    let t = playing(g, 2)
    expect(g.scores).toEqual([0, 0])
    t = advance(g, t, 2000)
    const r = sweep(g, t, g.balloons[0], 900, 1) // player 2 pops
    expect(r.pops).toBeGreaterThan(0)
    expect(g.scores[0]).toBe(0)
    expect(g.scores[1]).toBe(r.points.reduce((a, b) => a + b, 0))
    expect(g.popped).toEqual([0, r.pops])
    expect(g.winner()).toBe(1)
  })

  it('reports a draw', () => {
    const g = new BalloonPopLogic(seeded())
    playing(g, 2)
    expect(g.winner()).toBeNull()
  })

  it("keeps players' combos independent", () => {
    const g = new BalloonPopLogic(seeded())
    let t = playing(g, 2)
    t = advance(g, t, 3000)
    t = sweep(g, t, g.balloons[g.balloons.length - 1], 2000, 0).t
    t = sweep(g, t, g.balloons[g.balloons.length - 1], 2000, 0).t
    sweep(g, t, g.balloons[g.balloons.length - 1], 2000, 1)
    // A sweep can catch a neighbouring balloon too, so player 1 has 2 or more.
    expect(g.combos[0]).toBeGreaterThanOrEqual(2)
    expect(g.combos[1]).toBe(1)
  })
})

describe('playerInView (auto-pause rule)', () => {
  const snap = (tracked: boolean, time: number): MotionSnapshot => ({
    time,
    tracked,
    calibration: { status: 'calibrated', progress: 1 },
    cursors: { left: null, right: null },
    lean: 0,
    crouching: false,
    crouchAmount: 0,
    events: []
  })

  it('treats "no tracking data yet" as in view (models warming up)', () => {
    expect(playerInView(null)).toBe(true)
  })

  it('is out of view when the shoulders are not tracked', () => {
    expect(playerInView(snap(false, 4990))).toBe(false)
    expect(playerInView(snap(true, 4990))).toBe(true)
  })

  it('does not treat a stall (old data) as the player leaving', () => {
    // Seen in practice: a ~1 s main-thread stall on a first run must not pause.
    expect(playerInView(snap(true, 3000))).toBe(true)
  })
})
