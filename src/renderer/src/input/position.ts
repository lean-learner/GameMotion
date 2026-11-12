import type { BodyFrame } from './body'

/** What is wrong with where a player is standing, most important first. */
export type PositionIssue =
  'not-seen' | 'too-close' | 'too-far' | 'move-left' | 'move-right' | 'too-high' | 'too-low'

export interface PositionCheck {
  ok: boolean
  issue: PositionIssue | null
  /** What to tell the player: a short instruction, or praise when all is well. */
  hint: string
  /** Where the player is across the picture, 0 (left of the screen) .. 1; null when not seen. */
  x: number | null
  /** Shoulder width as a fraction of the picture's width (bigger = closer); null when not seen. */
  size: number | null
  /** How far down the picture the shoulders are, 0 (top) .. 1; null when not seen. */
  y: number | null
}

/** Shoulders wider than this share of the picture: outstretched arms won't fit. */
export const TOO_CLOSE = 0.28
/** Shoulders narrower than this: hands are too small to track well. */
export const TOO_FAR = 0.09
/** Shoulders must be at least this many shoulder widths below the top, so raised hands stay in view. */
const HEADROOM = 0.8
/** Shoulders lower than this share of the picture's height: lowered hands leave the bottom. */
const TOO_LOW = 0.72
/** Where a single player's centre should be, across the picture. */
export const SOLO_LANE: [number, number] = [0.3, 0.7]
/** Two players stand side by side: the left player's lane and the right player's. */
export const DUO_LANES: [number, number][] = [
  [0.08, 0.45],
  [0.55, 0.92]
]

const HINTS: Record<PositionIssue, string> = {
  'not-seen': 'Step in front of the camera',
  'too-close': 'Step back',
  'too-far': 'Come closer',
  'move-left': 'Step to your left',
  'move-right': 'Step to your right',
  'too-high': 'Step back, or tilt the camera up',
  'too-low': 'Tilt the camera down'
}
export const GOOD_SPOT = 'Great spot'

/**
 * Is the player standing where tracking works well? Judged from the shoulders:
 * how big they are in the picture (distance), where they are across it, and
 * how high. `lane` is the range the player's centre should be in.
 *
 * The picture is mirrored, so a player on the left of the screen is standing
 * too far to their own left and is told to step right.
 */
export function checkPosition(
  body: BodyFrame | null,
  aspect: number,
  lane: [number, number] = SOLO_LANE
): PositionCheck {
  if (!body) return result('not-seen', null, null, null)
  const size = body.shoulderWidth / aspect
  const x = body.shoulderMid.x / aspect
  let issue: PositionIssue | null = null
  if (size > TOO_CLOSE) issue = 'too-close'
  else if (size < TOO_FAR) issue = 'too-far'
  else if (x < lane[0]) issue = 'move-right'
  else if (x > lane[1]) issue = 'move-left'
  else if (body.shoulderMid.y < HEADROOM * body.shoulderWidth) issue = 'too-high'
  else if (body.shoulderMid.y > TOO_LOW) issue = 'too-low'
  return result(issue, x, size, body.shoulderMid.y)
}

function result(
  issue: PositionIssue | null,
  x: number | null,
  size: number | null,
  y: number | null
): PositionCheck {
  return { ok: issue === null, issue, hint: issue ? HINTS[issue] : GOOD_SPOT, x, size, y }
}

/** A changed verdict must hold this long before it is reported, so the advice doesn't flicker. */
const SETTLE_MS = 400

/** Steadies checkPosition over time. */
export class PositionMonitor {
  private shown: PositionCheck | null = null
  private pending: { issue: PositionIssue | null; since: number } | null = null

  update(check: PositionCheck, t: number): PositionCheck {
    if (!this.shown || check.issue === this.shown.issue) {
      this.shown = check
      this.pending = null
      return check
    }
    if (this.pending?.issue !== check.issue) this.pending = { issue: check.issue, since: t }
    if (t - this.pending.since >= SETTLE_MS) {
      this.shown = check
      this.pending = null
      return check
    }
    // Keep the old verdict, but with the live position for drawing.
    return { ...this.shown, x: check.x, size: check.size, y: check.y }
  }

  reset(): void {
    this.shown = null
    this.pending = null
  }
}
