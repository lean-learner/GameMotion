import { matchesPose, randomPose, type BodyInput, type Pose } from '../poses'
import { RoundFlow } from '../roundFlow'

/**
 * Human Bridge rules (no Phaser), so they can be unit-tested.
 * A team game: a wall slides towards the players with a hole cut for each of
 * them. Everyone must be holding their pose when it arrives, or it crashes.
 * Now and then the hole is a bridge: reach out and join hands in the middle.
 * One score and one set of lives for the whole team. Time in ms.
 */
export const LIVES = 3
/** How long the first wall takes to arrive, and the quickest a wall ever gets. */
export const FIRST_APPROACH_MS = 4200
export const FASTEST_APPROACH_MS = 2000
/** Each wall is this much quicker than the one before. */
const SPEED_UP = 0.92
/**
 * Later walls come in layers, one pose straight after another: two layers
 * from this wall on, and three from the next number.
 */
export const LAYERS_FROM: [number, number] = [3, 7]
/** Time to change pose between layers: a share of the wall's approach time, within limits. */
const LAYER_GAP = 0.45
const LAYER_GAP_MS: [number, number] = [1100, 1700]
/** The gap between one wall and the next. */
export const GAP_MS = 1100
/** A pose struck this shortly before the wall arrives still counts (forgives a wobble). */
export const LATCH_MS = 350
export const WALL_POINTS = 100
/** Passing walls in a row is worth this much more each time, up to the cap. */
const STREAK_BONUS = 20
const STREAK_CAP = 5
/** Share of two-player walls that ask for a bridge. */
const BRIDGE_CHANCE = 0.3
/** Joined hands: the players' inner hands are this close, in shoulder widths. */
const BRIDGE_REACH = 0.9

/** Where a following layer is first seen (see progress). */
const FOLLOW_START = 0.45

/** What a player has to do for a wall: a pose, or the bridge. */
export type Shape = Pose | 'bridge'

export interface Wall {
  id: number
  /** Every layer of the wall, front first: one shape per player in each. */
  layers: Shape[][]
  /** The layer the players face now (index into `layers`). */
  layer: number
  /** The current layer's shapes: one per player (all 'bridge' for a bridge). */
  shapes: Shape[]
  /** Play time when the current layer appeared, and when it arrives. */
  from: number
  arrives: number
  /** Time between one layer arriving and the next. */
  gap: number
}

export type GameEvent =
  | { type: 'wall'; wall: Wall }
  | { type: 'pass'; points: number; streak: number; layersLeft: number }
  | { type: 'crash'; missed: number[]; livesLeft: number }

/** Are the two players' nearest hands joined in the middle? */
export function bridged(inputs: (BodyInput | null)[]): boolean {
  const [a, b] = inputs
  if (!a || !b) return false
  // The player on the left of the screen reaches with their right hand, and the other way round.
  const [left, right] = a.x <= b.x ? [a, b] : [b, a]
  const h1 = left.hands.right
  const h2 = right.hands.left
  if (!h1 || !h2) return false
  const sw = (left.sw + right.sw) / 2
  return Math.hypot(h1.x - h2.x, h1.y - h2.y) < BRIDGE_REACH * sw
}

export class HumanBridgeLogic {
  readonly flow = new RoundFlow()
  count = 1
  score = 0
  lives = LIVES
  streak = 0
  passed = 0
  wall: Wall | null = null
  /** Whether each player is in their shape this moment (for drawing). */
  matching: boolean[] = []
  /** Play time each player was last in their shape. */
  private lastMatch: (number | null)[] = []
  private nextWallAt = 0
  private approach = FIRST_APPROACH_MS
  private nextId = 1
  private lastShapes: Shape[] = []

  constructor(private readonly random: () => number = Math.random) {}

  prepare(count: number): void {
    this.count = count
    this.matching = Array.from({ length: count }, () => false)
    this.lastMatch = Array.from({ length: count }, () => null)
  }

  start(now: number, count: number): void {
    this.prepare(count)
    this.score = 0
    this.lives = LIVES
    this.streak = 0
    this.passed = 0
    this.wall = null
    this.nextId = 1
    this.lastShapes = []
    this.nextWallAt = GAP_MS
    this.approach = FIRST_APPROACH_MS
    this.flow.start(now)
  }

  /** The team's score, once per player (it is saved under each of them). */
  scores(): number[] {
    return Array.from({ length: this.count }, () => this.score)
  }

  /**
   * How far the current layer has come, 0 (far away) .. 1 (arrived). A layer
   * behind another starts part of the way in, since it has less far to come.
   */
  progress(): number {
    const w = this.wall
    if (!w) return 0
    const k = Math.max(0, Math.min(1, (this.flow.elapsed - w.from) / (w.arrives - w.from)))
    return w.layer === 0 ? k : FOLLOW_START + (1 - FOLLOW_START) * k
  }

  update(now: number, inputs: (BodyInput | null)[]): GameEvent[] {
    const events: GameEvent[] = []
    if (this.flow.tick(now) <= 0) return events
    const t = this.flow.elapsed

    if (!this.wall) {
      if (t < this.nextWallAt) return events
      const id = this.nextId++
      const count = id >= LAYERS_FROM[1] ? 3 : id >= LAYERS_FROM[0] ? 2 : 1
      const layers = Array.from({ length: count }, () => this.shapes())
      const gap = Math.max(LAYER_GAP_MS[0], Math.min(LAYER_GAP_MS[1], this.approach * LAYER_GAP))
      this.wall = {
        id,
        layers,
        layer: 0,
        shapes: layers[0],
        from: t,
        arrives: t + this.approach,
        gap
      }
      this.lastMatch = this.lastMatch.map(() => null)
      events.push({ type: 'wall', wall: this.wall })
    }

    const wall = this.wall
    const joined = bridged(inputs)
    wall.shapes.forEach((shape, i) => {
      const ok = shape === 'bridge' ? joined : matchesPose(shape, inputs[i] ?? null)
      this.matching[i] = ok
      if (ok) this.lastMatch[i] = t
    })
    if (t < wall.arrives) return events

    // The wall is here: did everyone fit through?
    const missed = wall.shapes.flatMap((_, i) => {
      const at = this.lastMatch[i]
      return at !== null && t - at <= LATCH_MS ? [] : [i]
    })
    if (missed.length === 0) {
      this.streak++
      const points = WALL_POINTS + STREAK_BONUS * Math.min(this.streak - 1, STREAK_CAP)
      this.score += points
      const layersLeft = wall.layers.length - 1 - wall.layer
      events.push({ type: 'pass', points, streak: this.streak, layersLeft })
      if (layersLeft > 0) {
        // The next layer is right behind: a new pose, and only a moment to strike it.
        wall.layer++
        wall.shapes = wall.layers[wall.layer]
        wall.from = t
        wall.arrives = t + wall.gap
        this.lastMatch = this.lastMatch.map(() => null)
        this.matching = this.matching.map(() => false)
        return events
      }
      this.passed++
    } else {
      this.streak = 0
      this.lives--
      events.push({ type: 'crash', missed, livesLeft: this.lives })
    }
    this.wall = null
    this.matching = this.matching.map(() => false)
    this.approach = Math.max(FASTEST_APPROACH_MS, this.approach * SPEED_UP)
    this.nextWallAt = t + GAP_MS
    if (this.lives <= 0) this.flow.finish(now)
    return events
  }

  /** Shapes for one layer: never what the layer before asked of the same player. */
  private shapes(): Shape[] {
    const previous = this.lastShapes
    const wasBridge = previous[0] === 'bridge'
    let shapes: Shape[]
    if (this.count > 1 && !wasBridge && this.random() < BRIDGE_CHANCE) {
      shapes = Array.from({ length: this.count }, () => 'bridge' as const)
    } else {
      shapes = Array.from({ length: this.count }, (_, i) => {
        const before = previous[i]
        return randomPose(this.random, before && before !== 'bridge' ? before : null)
      })
    }
    this.lastShapes = shapes
    return shapes
  }
}
