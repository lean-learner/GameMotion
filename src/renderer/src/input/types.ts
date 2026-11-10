/**
 * Motion Input API: what games consume. Everything here is in *player space*:
 * mirrored like a mirror, so "right" is the player's own right and appears on
 * the right of the screen. Hands are named by the player's own side.
 */
export type Side = 'left' | 'right'

export interface Vec2 {
  x: number
  y: number
}

export interface CursorState {
  /** Screen position, 0..1 from the top-left of the game area. Smoothed. */
  x: number
  y: number
  /** Where the value came from: hand landmarks (precise) or the body pose (fallback). */
  source: 'hand' | 'pose'
}

export type CalibrationStatus = 'waiting' | 'holding' | 'calibrated'

export type InputEvent =
  | { type: 'calibrated'; time: number }
  | { type: 'swipe'; hand: Side; direction: 'left' | 'right' | 'up' | 'down'; time: number }
  | { type: 'crouch'; active: boolean; time: number }
  | { type: 'lean'; direction: Side | 'center'; time: number }

export interface MotionSnapshot {
  time: number
  /** Shoulders visible this frame (nothing body-relative works without them). */
  tracked: boolean
  calibration: { status: CalibrationStatus; progress: number }
  /** Null when that hand is lowered or not tracked. */
  cursors: Record<Side, CursorState | null>
  /** -1 (full lean to the player's left) .. +1 (full lean right). */
  lean: number
  crouching: boolean
  /** 0..1, how far the shoulders dropped relative to a deep crouch. */
  crouchAmount: number
  /** Events detected on this frame. */
  events: InputEvent[]
}
