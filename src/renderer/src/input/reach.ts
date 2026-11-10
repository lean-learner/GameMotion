import { DEFAULT_REACH, type HandRelative, type ReachZone } from './cursor'

/** Hand samples needed (per hand) for a trustworthy fit: about 3 s at 30 fps. */
export const MIN_SAMPLES = 90
/** The fitted zone is shrunk a little so the screen edges are comfortable, not a stretch. */
const COMFORT = 0.9
/** Sane limits, in shoulder widths (anything outside is a tracking error, not a reach). */
const LIMITS: Record<keyof ReachZone, [number, number]> = {
  inward: [0.2, 1.6],
  outward: [0.5, 2.5],
  up: [0.3, 2.0],
  down: [0.3, 1.6]
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[i]
}

const clamp = (v: number, [lo, hi]: [number, number]): number => Math.min(hi, Math.max(lo, v))

/**
 * Fits a reach zone to where a player's hands actually went while tracing big
 * circles. The 95th percentile ignores the odd tracking jump. Both hands share
 * one zone (mirrored), so `samples` mixes them, already in "out/down" terms.
 * Returns null when there isn't enough data.
 */
export function fitReach(samples: HandRelative[]): ReachZone | null {
  if (samples.length < MIN_SAMPLES) return null
  const out = samples.map((s) => s.out)
  const down = samples.map((s) => s.down)
  const fit = {
    outward: percentile(out, 95),
    inward: -percentile(out, 5),
    up: -percentile(down, 5),
    down: percentile(down, 95)
  }
  const zone = {} as ReachZone
  for (const k of Object.keys(LIMITS) as (keyof ReachZone)[]) {
    zone[k] = Math.round(clamp(fit[k] * COMFORT, LIMITS[k]) * 100) / 100
  }
  return zone
}

/** Checks a stored zone (from disk); anything odd falls back to the default. */
export function validReach(z: unknown): ReachZone | null {
  if (!z || typeof z !== 'object') return null
  const r = z as Record<string, unknown>
  for (const k of Object.keys(DEFAULT_REACH)) {
    const v = r[k]
    const [lo, hi] = LIMITS[k as keyof ReachZone]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) return null
  }
  return { inward: r.inward, outward: r.outward, up: r.up, down: r.down } as ReachZone
}
