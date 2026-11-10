// Manifest of MediaPipe models bundled with the app.
// Pinned to model version "1" (not "latest") so builds are reproducible.
const BASE = 'https://storage.googleapis.com/mediapipe-models'

export const MODELS = [
  {
    file: 'pose_landmarker_lite.task',
    url: `${BASE}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
    bytes: 5777746
  },
  {
    file: 'pose_landmarker_full.task',
    url: `${BASE}/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
    bytes: 9398198
  },
  {
    file: 'pose_landmarker_heavy.task',
    url: `${BASE}/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`,
    bytes: 30664242
  },
  {
    file: 'hand_landmarker.task',
    url: `${BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
    bytes: 7819105
  }
]
