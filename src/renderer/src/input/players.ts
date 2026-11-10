import type { HandResult, Point, TrackingFrame } from '../tracking/types'
import { dist, POSE, toPlayer } from './body'
import type { Vec2 } from './types'

/**
 * Multiplayer: turns the anonymous bodies MediaPipe reports each frame into
 * stable players, and gives each player their own TrackingFrame (their body and
 * their hands only), so each can drive its own MotionInput.
 *
 * - A body keeps its player number while it moves: it is matched to the
 *   nearest existing track (shoulder midpoint, scaled by body size).
 * - New bodies take a free slot by screen side: left person = player 0.
 * - A player missing for LOST_MS frees their slot.
 * - Each hand goes to the player whose wrist is closest.
 */
const MIN_VISIBILITY = 0.5
/** A body this far (shoulder widths) from a track is someone else. */
const MATCH_GATE = 2.5
const LOST_MS = 1500
/** A hand further than this (shoulder widths) from every wrist belongs to nobody. */
const HAND_GATE = 1.2
const PALM = [0, 5, 9, 13, 17]

interface Body {
  pose: Point[]
  mid: Vec2
  sw: number
}

interface Track {
  mid: Vec2
  sw: number
  lastSeen: number
}

export class PlayerTracker {
  private tracks: (Track | null)[]

  constructor(
    public readonly count: number,
    public aspect: number
  ) {
    this.tracks = Array(count).fill(null)
  }

  reset(): void {
    this.tracks = Array(this.count).fill(null)
  }

  /** Which player slots currently have a person. */
  get present(): boolean[] {
    return this.tracks.map((t) => t !== null)
  }

  /** One frame per player (always `count` long); a missing player gets pose null. */
  split(frame: TrackingFrame): TrackingFrame[] {
    const t = frame.frameTime
    const bodies = frame.poses.map((p) => this.measure(p)).filter((b): b is Body => b !== null)
    const assigned = this.assign(bodies, t)

    // Free players not seen for a while.
    this.tracks = this.tracks.map((tr) => (tr && t - tr.lastSeen > LOST_MS ? null : tr))

    const hands: HandResult[][] = Array.from({ length: this.count }, () => [])
    for (const hand of frame.hands) {
      const owner = this.handOwner(hand, assigned)
      if (owner !== null) hands[owner].push(hand)
    }
    // Single player: keep every hand (a hand can be visible while the wrist isn't).
    if (this.count === 1) hands[0] = frame.hands

    return assigned.map((body, i) => ({
      ...frame,
      pose: body?.pose ?? null,
      poses: body ? [body.pose] : [],
      hands: hands[i]
    }))
  }

  private measure(pose: Point[]): Body | null {
    const ls = pose[POSE.leftShoulder]
    const rs = pose[POSE.rightShoulder]
    if (
      !ls ||
      !rs ||
      (ls.visibility ?? 1) < MIN_VISIBILITY ||
      (rs.visibility ?? 1) < MIN_VISIBILITY
    ) {
      return null
    }
    const a = toPlayer(ls, this.aspect)
    const b = toPlayer(rs, this.aspect)
    const sw = dist(a, b)
    return sw > 1e-3 ? { pose, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, sw } : null
  }

  /** Returns, per player slot, the body assigned this frame (or null). */
  private assign(bodies: Body[], t: number): (Body | null)[] {
    const out: (Body | null)[] = Array(this.count).fill(null)
    const free = new Set(bodies)

    // 1. Keep existing players: best overall pairing of tracks to bodies.
    const pairs: { slot: number; body: Body; d: number }[] = []
    this.tracks.forEach((tr, slot) => {
      if (!tr) return
      for (const body of bodies) {
        const d = dist(tr.mid, body.mid) / Math.max(tr.sw, body.sw)
        if (d <= MATCH_GATE) pairs.push({ slot, body, d })
      }
    })
    for (const combo of bestPairing(pairs)) {
      out[combo.slot] = combo.body
      free.delete(combo.body)
    }

    // 2. Newcomers take free slots by screen side (left person -> lowest slot).
    const newcomers = [...free].sort((a, b) => a.mid.x - b.mid.x)
    const openSlots = out.flatMap((b, i) => (b === null && !this.tracks[i] ? [i] : []))
    if (newcomers.length && openSlots.length) {
      if (newcomers.length < openSlots.length && this.count === 2) {
        // One newcomer, both slots open: choose the slot by which half they stand in.
        const side = newcomers[0].mid.x < this.aspect / 2 ? 0 : 1
        out[side] = newcomers[0]
      } else {
        newcomers.slice(0, openSlots.length).forEach((b, i) => (out[openSlots[i]] = b))
      }
    }

    out.forEach((b, i) => {
      if (b) this.tracks[i] = { mid: b.mid, sw: b.sw, lastSeen: t }
    })
    return out
  }

  private handOwner(hand: HandResult, bodies: (Body | null)[]): number | null {
    const pts = PALM.map((i) => hand.landmarks[i]).filter((p): p is Point => !!p)
    if (!pts.length) return null
    const palm = toPlayer(
      {
        x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
        y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
        z: 0
      },
      this.aspect
    )
    let bestSlot: number | null = null
    let bestD = HAND_GATE
    for (const [slot, body] of bodies.entries()) {
      if (!body) continue
      for (const w of [POSE.leftWrist, POSE.rightWrist]) {
        const p = body.pose[w]
        if (!p) continue
        const d = dist(palm, toPlayer(p, this.aspect)) / body.sw
        if (d <= bestD) {
          bestD = d
          bestSlot = slot
        }
      }
    }
    return bestSlot
  }
}

/** Picks the set of (slot, body) pairs with no shared slot or body and the smallest total distance. */
function bestPairing<T extends { slot: number; body: object; d: number }>(pairs: T[]): T[] {
  let best: T[] = []
  let bestScore = Infinity
  const search = (
    i: number,
    chosen: T[],
    usedSlots: Set<number>,
    usedBodies: Set<object>
  ): void => {
    if (i === pairs.length) {
      // Prefer matching more players, then the shortest total distance.
      const score = -chosen.length * 1e6 + chosen.reduce((a, p) => a + p.d, 0)
      if (score < bestScore) {
        bestScore = score
        best = [...chosen]
      }
      return
    }
    search(i + 1, chosen, usedSlots, usedBodies)
    const p = pairs[i]
    if (!usedSlots.has(p.slot) && !usedBodies.has(p.body)) {
      usedSlots.add(p.slot)
      usedBodies.add(p.body)
      chosen.push(p)
      search(i + 1, chosen, usedSlots, usedBodies)
      chosen.pop()
      usedSlots.delete(p.slot)
      usedBodies.delete(p.body)
    }
  }
  search(0, [], new Set(), new Set())
  return best
}
