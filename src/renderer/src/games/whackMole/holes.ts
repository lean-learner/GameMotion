import type { BodyInput } from '../poses'

/** Whack-a-Mole numbers and hole geometry (no Phaser). Moles pop out of holes to the left, right and below each player, never above. Distances in game pixels; hole offsets in shoulder widths. Time in ms. */
/** A round is five levels of equal length; each is faster than the last. */
export const LEVELS = 5
export const LEVEL_MS = 15_000
export const ROUND_MS = LEVELS * LEVEL_MS
export const UP_MS: [number, number] = [1700, 900] // how long a mole stays up: level 1, level 5
export const GAP_MS: [number, number] = [1100, 480] // time between pops: level 1, level 5
export const RISE_MS = 220
export const POINTS = { mole: 50, gold: 150 }
export const GOLD_CHANCE = 0.12
/** Chance that a pop is a hedgehog (do not hit it), for levels 1 to 5. */
export const DECOY_CHANCE = [0, 0.12, 0.18, 0.24, 0.3]
/** Points lost for hitting a hedgehog (the score never goes below zero). */
export const DECOY_PENALTY = 100
export const MOLE_REACH = 0.5 // hole radius, in shoulder widths
export const MAX_UP = 3 // most moles one player has up at once
export const COMBO_BONUS = 5
export const COMBO_CAP = 10
export const FRAME = { width: 1280, height: 720, top: 90 }

export type Edge = 'left' | 'right' | 'bottom'
export type Lane = -1 | 1
export interface Hole {
  edge: Edge
  lane: Lane
}
export interface Mole {
  id: number
  player: number
  edge: Edge
  lane: Lane
  gold: boolean
  /** A hedgehog: hitting it costs points; leaving it alone is right. */
  decoy: boolean
  from: number
  leaves: number
  armed: boolean
}
export interface Whacker {
  score: number
  combo: number
  bestCombo: number
  hits: number
  misses: number
  /** Hedgehogs hit. */
  ouches: number
}
export type GameEvent =
  | { type: 'pop'; player: number; gold: boolean }
  | { type: 'hit'; player: number; gold: boolean; points: number; x: number; y: number }
  | { type: 'miss'; player: number; x: number; y: number }
  /** A hedgehog popped up. */
  | { type: 'peek'; player: number }
  /** A hedgehog was hit; `points` is what it cost. */
  | { type: 'ouch'; player: number; points: number; x: number; y: number }
  /** A new level (2 to 5) began. */
  | { type: 'level'; level: number }

/** The level (1..LEVELS) at a time since the round began. */
export function levelAt(elapsed: number): number {
  return Math.max(1, Math.min(LEVELS, Math.floor(elapsed / LEVEL_MS) + 1))
}

export const HOLES: Hole[] = [
  { edge: 'left', lane: -1 },
  { edge: 'left', lane: 1 },
  { edge: 'right', lane: -1 },
  { edge: 'right', lane: 1 },
  { edge: 'bottom', lane: -1 },
  { edge: 'bottom', lane: 1 }
]

/** Calculate the position of a hole relative to the player's shoulders. */
export function holeSpot(
  body: BodyInput,
  edge: Edge,
  lane: Lane
): { x: number; y: number; r: number } {
  /** Where each hole is from the middle of the shoulders, in shoulder widths: [across, down]. */
  const OFFSETS: Record<Edge, Record<Lane, [number, number]>> = {
    left: { [-1]: [-1.5, -0.7], 1: [-1.7, 0.3] },
    right: { [-1]: [1.5, -0.7], 1: [1.7, 0.3] },
    bottom: { [-1]: [-0.95, 1.6], 1: [0.95, 1.6] }
  }
  const [dx, dy] = OFFSETS[edge][lane]
  const r = MOLE_REACH * body.sw
  const x = Math.max(r, Math.min(body.x + dx * body.sw, FRAME.width - r))
  const y = Math.max(FRAME.top + r, Math.min(body.y + dy * body.sw, FRAME.height - r))
  return { x, y, r }
}

/** Determine which holes are allowed for a given player. */
export function allowedHoles(player: number, count: number): Hole[] {
  if (count < 2) return HOLES
  return player === 0
    ? HOLES.filter((h) => h.edge !== 'right')
    : HOLES.filter((h) => h.edge !== 'left')
}
