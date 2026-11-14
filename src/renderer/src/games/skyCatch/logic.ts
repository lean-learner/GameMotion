import type { BodyInput } from '../poses'
import { RoundFlow } from '../roundFlow'
import { Vertical } from '../vertical'

/**
 * Sky Catch rules (no Phaser), so they can be unit-tested.
 * Fruit falls all across each player's part of the frame; run under it and
 * catch it in the basket held at the chest. Bombs fall too and must not be
 * caught. Now and then a comet flies past at head height: jump as it passes
 * to grab it. Five levels, each faster. Time in ms, positions in game pixels
 * on a 1280x720 frame.
 */
export const LEVELS = 5
export const LEVEL_MS = 15_000
export const ROUND_MS = LEVELS * LEVEL_MS
export const LIVES = 3
/** Where things start falling from (just below the score plates). */
export const TOP = 96
/** Time to fall from the top to a standing player's basket, per level. */
export const FALL_MS = [2300, 2000, 1750, 1500, 1300]
/** Time between drops, per level. */
export const GAP_MS = [1500, 1250, 1050, 900, 780]
/** Share of drops that are bombs, per level. */
const BOMBS = [0.1, 0.18, 0.24, 0.28, 0.32]
const GOLD = 0.08
/** Each drop lands this far from the last, as a share of the field's width. */
const STEP = { min: 0.22, max: 0.6 }
/** Comets come from this level on, this often, and take this long to cross. */
export const COMET = { level: 2, everyMs: 8000, crossMs: 3200 }
export const POINTS = { fruit: 10, gold: 40, comet: 60, streak: 2, streakCap: 10 }
/** The basket, in shoulder widths from the middle of the shoulders. */
export const BASKET = { half: 0.65, above: 0.25, below: 0.4 }

export const levelAt = (t: number): number =>
  Math.min(LEVELS, Math.floor(Math.max(0, t) / LEVEL_MS) + 1)

export type Kind = 'fruit' | 'gold' | 'bomb' | 'comet'

/** A player's part of the frame, measured when they were first seen. */
export interface Field {
  left: number
  right: number
  /** Standing shoulder height and width. */
  y: number
  sw: number
}

export interface Item {
  id: number
  player: number
  kind: Kind
  x: number
  y: number
  /** Speed in pixels per ms. */
  vx: number
  vy: number
  r: number
  /** Which picture to draw, for variety. */
  look: number
  /** Fell past the basket: can no longer be caught. */
  past: boolean
}

export interface Catcher {
  field: Field | null
  score: number
  lives: number
  streak: number
  caught: number
  vertical: Vertical
}

export type GameEvent =
  | { type: 'level'; level: number }
  | { type: 'comet'; player: number }
  | { type: 'catch'; player: number; kind: Kind; points: number; x: number; y: number }
  | { type: 'boom'; player: number; x: number; y: number }
  | { type: 'miss'; player: number; x: number; y: number }
  | { type: 'out'; player: number }

export function fieldView(body: BodyInput, player: number, count: number): Field {
  const left = count > 1 ? player * 640 + 20 : 20
  const right = count > 1 ? (player + 1) * 640 - 20 : 1260
  const sw = Math.max(40, Math.min(body.sw, (right - left) / 4))
  return { left, right, y: Math.max(TOP + 2 * sw, body.y), sw }
}

/** Is a falling thing in the basket of a player standing at `body`? */
export function inBasket(body: BodyInput, item: { x: number; y: number }): boolean {
  return (
    Math.abs(item.x - body.x) <= BASKET.half * body.sw &&
    item.y >= body.y - BASKET.above * body.sw &&
    item.y <= body.y + BASKET.below * body.sw
  )
}

export class SkyCatchLogic {
  readonly flow = new RoundFlow()
  catchers: Catcher[] = []
  items: Item[] = []
  private next = 0
  private nextComet = 0
  private nextId = 1
  private lastLevel = 1
  /** Where the last drop fell, as a share of the field's width. */
  private lastU = 0.5
  private cometDir = 1

  constructor(private readonly random: () => number = Math.random) {}

  prepare(count: number): void {
    this.catchers = Array.from({ length: count }, () => ({
      field: null,
      score: 0,
      lives: LIVES,
      streak: 0,
      caught: 0,
      vertical: new Vertical()
    }))
    this.items = []
    this.next = 800
    this.nextComet = (COMET.level - 1) * LEVEL_MS + 3000
    this.lastLevel = 1
    this.lastU = 0.5
    this.cometDir = 1
  }

  start(now: number, count: number): void {
    this.prepare(count)
    this.flow.start(now)
  }

  scores(): number[] {
    return this.catchers.map((c) => c.score)
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
    this.catchers.forEach((c, i) => c.vertical.update(now, inputs[i] ?? null))
    const dt = this.flow.tick(now)
    if (dt <= 0) return events
    const t = this.flow.elapsed
    this.catchers.forEach((c, i) => {
      if (!c.field && inputs[i]) c.field = fieldView(inputs[i]!, i, this.catchers.length)
    })

    const level = levelAt(t)
    if (level > this.lastLevel) {
      this.lastLevel = level
      events.push({ type: 'level', level })
    }

    if (t < ROUND_MS && this.catchers.every((c) => c.field)) {
      if (t >= this.next) {
        this.drop(level)
        this.next = t + GAP_MS[level - 1]
      }
      if (t >= this.nextComet) {
        this.comet(events)
        this.nextComet = t + COMET.everyMs
      }
    }

    this.items = this.items.filter((item) => {
      const c = this.catchers[item.player]
      const field = c.field!
      if (c.lives <= 0) return false
      item.x += item.vx * dt
      item.y += item.vy * dt
      const body = inputs[item.player]
      if (item.kind === 'comet') {
        // No basket for this one: be off the ground as it passes over.
        if (body && c.vertical.air && Math.abs(item.x - body.x) <= BASKET.half * body.sw + item.r) {
          this.score(c, item, events)
          return false
        }
        return item.x > field.left - item.r && item.x < field.right + item.r
      }
      if (!item.past && body && inBasket(body, item)) {
        if (item.kind === 'bomb') {
          c.lives--
          c.streak = 0
          events.push({ type: 'boom', player: item.player, x: item.x, y: item.y })
          if (c.lives <= 0) events.push({ type: 'out', player: item.player })
        } else this.score(c, item, events)
        return false
      }
      const line = (body?.y ?? field.y) + BASKET.below * (body?.sw ?? field.sw)
      if (!item.past && item.y > line) {
        item.past = true
        if (item.kind !== 'bomb') {
          c.streak = 0
          events.push({ type: 'miss', player: item.player, x: item.x, y: item.y })
        }
      }
      return item.y < 720 + item.r
    })

    if (this.catchers.every((c) => c.lives <= 0) || (t >= ROUND_MS && this.items.length === 0))
      this.flow.finish(now)
    return events
  }

  private score(c: Catcher, item: Item, events: GameEvent[]): void {
    const base =
      item.kind === 'comet' ? POINTS.comet : item.kind === 'gold' ? POINTS.gold : POINTS.fruit
    const points = base + POINTS.streak * Math.min(c.streak, POINTS.streakCap)
    c.score += points
    c.streak++
    c.caught++
    events.push({
      type: 'catch',
      player: item.player,
      kind: item.kind,
      points,
      x: item.x,
      y: item.y
    })
  }

  /** One thing starts falling for every player still in, at the same place in each field. */
  private drop(level: number): void {
    const roll = this.random()
    const kind: Kind = roll < GOLD ? 'gold' : roll >= 1 - BOMBS[level - 1] ? 'bomb' : 'fruit'
    // Half the bombs fall where the last fruit did: right where the player is standing.
    let u = this.lastU
    if (kind !== 'bomb' || this.random() < 0.5) {
      const step = STEP.min + this.random() * (STEP.max - STEP.min)
      const dir = this.random() < 0.5 ? -1 : 1
      u = this.lastU + dir * step
      if (u < 0 || u > 1) u = this.lastU - dir * step
      u = Math.max(0, Math.min(1, u))
    }
    if (kind !== 'bomb') this.lastU = u
    const look = Math.floor(this.random() * 3)
    this.catchers.forEach((c, player) => {
      const f = c.field!
      if (c.lives <= 0) return
      const r = f.sw * 0.26
      const margin = f.sw * 0.7
      this.items.push({
        id: this.nextId++,
        player,
        kind,
        x: f.left + margin + u * (f.right - f.left - 2 * margin),
        y: TOP,
        vx: 0,
        vy: (f.y - TOP) / FALL_MS[level - 1],
        r,
        look,
        past: false
      })
    })
  }

  private comet(events: GameEvent[]): void {
    this.cometDir = -this.cometDir
    this.catchers.forEach((c, player) => {
      const f = c.field!
      if (c.lives <= 0) return
      const r = f.sw * 0.24
      this.items.push({
        id: this.nextId++,
        player,
        kind: 'comet',
        x: this.cometDir > 0 ? f.left - r : f.right + r,
        y: Math.max(TOP + r, (c.vertical.base ?? f.y) - 1.05 * f.sw),
        vx: (this.cometDir * (f.right - f.left + 2 * r)) / COMET.crossMs,
        vy: 0,
        r,
        look: 0,
        past: false
      })
      events.push({ type: 'comet', player })
    })
  }
}
