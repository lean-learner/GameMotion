import type { Vec2 } from '../input/types'

/**
 * How fast a player is moving (no Phaser): the speed of their fastest tracked
 * point (body or a hand), in shoulder widths per second.
 *
 * Speed is taken over a short window instead of frame to frame, so the small
 * shake in the camera's tracking doesn't read as movement.
 */
const WINDOW_MS = 220
/** Samples older than this are forgotten. */
const KEEP_MS = 400

interface Sample {
  t: number
  points: (Vec2 | null)[]
}

export class MotionMeter {
  private samples: Sample[] = []

  reset(): void {
    this.samples = []
  }

  /**
   * Adds this frame's points (always the same ones in the same order; null for
   * one that isn't seen) and returns the current speed. `unit` is the shoulder
   * width in the same units as the points.
   */
  update(t: number, points: (Vec2 | null)[], unit: number): number {
    this.samples.push({ t, points })
    while (this.samples.length > 1 && t - this.samples[0].t > KEEP_MS) this.samples.shift()
    // Compare with the sample closest to one window ago.
    let past = this.samples[0]
    for (const s of this.samples) {
      if (t - s.t >= WINDOW_MS) past = s
      else break
    }
    const dt = t - past.t
    if (dt < WINDOW_MS / 3 || unit <= 0) return 0
    let fastest = 0
    points.forEach((p, i) => {
      const before = past.points[i]
      // A point that just appeared has no speed yet.
      if (!p || !before) return
      fastest = Math.max(fastest, Math.hypot(p.x - before.x, p.y - before.y))
    })
    return fastest / unit / (dt / 1000)
  }
}
