/**
 * Standardised tracking output. This is the boundary between MediaPipe and the
 * rest of the app: the future Motion Input layer and games consume these types
 * and never touch MediaPipe directly.
 *
 * Coordinates are normalised to the *unmirrored* camera image: x and y run
 * 0..1 from the top-left. Mirroring is a display concern, applied when drawing.
 * Handedness refers to the subject's own hands (MediaPipe convention for
 * unmirrored input).
 */
export interface Point {
  x: number
  y: number
  /** Relative depth; smaller is closer to the camera. Scale is model specific. */
  z: number
  /** 0..1 confidence that the point is visible (pose only). */
  visibility?: number
}

export type Handedness = 'Left' | 'Right'

export interface HandResult {
  handedness: Handedness
  /** Handedness classification score, 0..1. */
  score: number
  /** 21 landmarks, MediaPipe hand topology. */
  landmarks: Point[]
}

export interface TrackingFrame {
  /** Timestamp of the source video frame (performance.now() clock, ms). */
  frameTime: number
  /** 33 landmarks, MediaPipe pose topology, or null when no body is found (first body). */
  pose: Point[] | null
  /** Every detected body (up to TrackerConfig.numPoses), in MediaPipe's order. */
  poses: Point[][]
  hands: HandResult[]
  /** Inference time spent in the worker for this frame, ms. */
  poseMs: number
  handsMs: number
  /** Mean luma of the frame, 0-255. Sampled every few frames, otherwise undefined. */
  luma?: number
}

export type Delegate = 'GPU' | 'CPU'
export type DelegatePreference = 'auto' | Delegate
export type PoseModel = 'lite' | 'full' | 'heavy'

export interface TrackerConfig {
  delegate: DelegatePreference
  poseModel: PoseModel
  /** 1 = whole frame; 2 = left and right halves tracked separately (two players). */
  views: 1 | 2
  /** Bodies to detect per view. */
  numPoses: number
  /** Hands to detect per view. */
  numHands: number
}

// ---- Worker message protocol ------------------------------------------------

export type ToWorker =
  | { type: 'init'; config: TrackerConfig; assetBase: string }
  | { type: 'frame'; bitmap: ImageBitmap; frameTime: number }
  | { type: 'dispose' }

export type FromWorker =
  | { type: 'ready'; delegate: Delegate; fallbackReason?: string; loadMs: number }
  | { type: 'result'; frame: TrackingFrame }
  | { type: 'error'; message: string; fatal: boolean }
