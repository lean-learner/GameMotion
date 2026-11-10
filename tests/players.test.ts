import { describe, expect, it } from 'vitest'
import { PlayerTracker } from '../src/renderer/src/input/players'
import type { HandResult, Point, TrackingFrame } from '../src/renderer/src/tracking/types'
import { ASPECT, synthFrame, type PoseSpec } from './helpers/synthPose'

/** A frame with several bodies (player-space specs), in the given order. */
function frame(t: number, specs: PoseSpec[], hands: HandResult[] = []): TrackingFrame {
  const poses = specs.map((s) => synthFrame(s, t).pose!)
  return { frameTime: t, pose: poses[0] ?? null, poses, hands, poseMs: 0, handsMs: 0 }
}

/** A hand whose palm sits at a player-space point. */
function handAt(x: number, y: number, handedness: 'Left' | 'Right' = 'Right'): HandResult {
  const p: Point = { x: 1 - x / ASPECT, y, z: 0 }
  return { handedness, score: 0.9, landmarks: Array(21).fill(p) }
}

const LEFT_PERSON: PoseSpec = { cx: 0.5, cy: 0.4, sw: 0.15 }
const RIGHT_PERSON: PoseSpec = { cx: 1.3, cy: 0.4, sw: 0.15 }
/** Shoulder-midpoint x (player space) of a player's frame. */
const midX = (f: TrackingFrame): number =>
  f.pose ? (1 - (f.pose[11].x + f.pose[12].x) / 2) * ASPECT : NaN

describe('PlayerTracker (two players)', () => {
  it('numbers players by side: left person is player 1', () => {
    const pt = new PlayerTracker(2, ASPECT)
    const [p0, p1] = pt.split(frame(0, [RIGHT_PERSON, LEFT_PERSON]))
    expect(midX(p0)).toBeCloseTo(0.5)
    expect(midX(p1)).toBeCloseTo(1.3)
  })

  it('keeps identities when MediaPipe reports bodies in a different order', () => {
    const pt = new PlayerTracker(2, ASPECT)
    pt.split(frame(0, [LEFT_PERSON, RIGHT_PERSON]))
    const [p0, p1] = pt.split(frame(33, [RIGHT_PERSON, LEFT_PERSON]))
    expect(midX(p0)).toBeCloseTo(0.5)
    expect(midX(p1)).toBeCloseTo(1.3)
  })

  it('keeps identities as players move, even past the middle', () => {
    const pt = new PlayerTracker(2, ASPECT)
    let t = 0
    let last: TrackingFrame[] = []
    // Both walk right 0.5 units in small steps: player 1 ends up right of centre.
    for (let i = 0; i <= 20; i++, t += 33) {
      const dx = i * 0.025
      last = pt.split(
        frame(t, [
          { ...RIGHT_PERSON, cx: 1.3 + dx },
          { ...LEFT_PERSON, cx: 0.5 + dx }
        ])
      )
    }
    expect(midX(last[0])).toBeCloseTo(1.0)
    expect(midX(last[1])).toBeCloseTo(1.8)
  })

  it('keeps the remaining player when the other leaves, and frees the slot later', () => {
    const pt = new PlayerTracker(2, ASPECT)
    pt.split(frame(0, [LEFT_PERSON, RIGHT_PERSON]))
    const [a0, a1] = pt.split(frame(33, [RIGHT_PERSON])) // left person stepped out
    expect(a0.pose).toBeNull()
    expect(midX(a1)).toBeCloseTo(1.3)
    expect(pt.present).toEqual([true, true]) // briefly kept for a quick return
    pt.split(frame(2000, [RIGHT_PERSON]))
    expect(pt.present).toEqual([false, true])
  })

  it('gives a returning player their slot back by side', () => {
    const pt = new PlayerTracker(2, ASPECT)
    pt.split(frame(0, [LEFT_PERSON, RIGHT_PERSON]))
    pt.split(frame(2000, [RIGHT_PERSON])) // left player gone long enough to be freed
    const [p0, p1] = pt.split(frame(2033, [LEFT_PERSON, RIGHT_PERSON]))
    expect(midX(p0)).toBeCloseTo(0.5)
    expect(midX(p1)).toBeCloseTo(1.3)
  })

  it('places a single newcomer by the half of the screen they stand in', () => {
    const pt = new PlayerTracker(2, ASPECT)
    const [p0, p1] = pt.split(frame(0, [RIGHT_PERSON]))
    expect(p0.pose).toBeNull()
    expect(midX(p1)).toBeCloseTo(1.3)
  })

  it("gives each hand to the person whose wrist it's next to", () => {
    const pt = new PlayerTracker(2, ASPECT)
    const left = { ...LEFT_PERSON, rightWrist: { x: 0.62, y: 0.3 } }
    const right = { ...RIGHT_PERSON, leftWrist: { x: 1.18, y: 0.3 } }
    const [p0, p1] = pt.split(
      frame(
        0,
        [left, right],
        [handAt(0.63, 0.29, 'Right'), handAt(1.17, 0.31, 'Left'), handAt(0.9, 0.9)]
      )
    )
    expect(p0.hands.map((h) => h.handedness)).toEqual(['Right'])
    expect(p1.hands.map((h) => h.handedness)).toEqual(['Left'])
  })

  it('ignores bodies whose shoulders are not visible', () => {
    const pt = new PlayerTracker(2, ASPECT)
    const f = frame(0, [LEFT_PERSON])
    f.poses[0][12].visibility = 0.1
    expect(pt.split(f).every((p) => p.pose === null)).toBe(true)
  })
})

describe('PlayerTracker (one player)', () => {
  it('passes the body and all hands through', () => {
    const pt = new PlayerTracker(1, ASPECT)
    const [p0] = pt.split(frame(0, [LEFT_PERSON], [handAt(0.1, 0.9)]))
    expect(midX(p0)).toBeCloseTo(0.5)
    expect(p0.hands).toHaveLength(1)
  })
})
