/// <reference lib="webworker" />
// Runs MediaPipe Pose + Hand Landmarker off the UI thread. Each incoming frame
// is processed exactly once by each model and then released; the main thread
// only sends a new frame after the previous result arrives, so frames can
// never queue up here. Two-player mode tracks each half of the frame with its
// own models (see splitView.ts).
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type NormalizedLandmark
} from '@mediapipe/tasks-vision'
import {
  dedupeHands,
  dedupePoses,
  FULL_VIEW,
  SPLIT_VIEWS,
  toFullFrame,
  type View
} from './splitView'
import type { Delegate, FromWorker, HandResult, Point, ToWorker, TrackerConfig } from './types'

declare const self: DedicatedWorkerGlobalScope

/** One tracked region of the frame with its own models (two in split-view mode). */
interface TrackedView {
  view: View
  pose: PoseLandmarker
  hands: HandLandmarker
}

let views: TrackedView[] = []
let lastTimestamp = -1
let frameCount = 0

// Brightness probe: the frame scaled down to 32x18, averaged. ~0.1 ms.
const LUMA_EVERY_N_FRAMES = 10
const probe = new OffscreenCanvas(32, 18)
const probeCtx = probe.getContext('2d', { willReadFrequently: true })

function meanLuma(bitmap: ImageBitmap): number | undefined {
  if (!probeCtx) return undefined
  probeCtx.drawImage(bitmap, 0, 0, probe.width, probe.height)
  const px = probeCtx.getImageData(0, 0, probe.width, probe.height).data
  let sum = 0
  for (let i = 0; i < px.length; i += 4)
    sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
  return sum / (px.length / 4)
}

function post(msg: FromWorker): void {
  self.postMessage(msg)
}

function closeModels(): void {
  for (const v of views) {
    v.pose.close()
    v.hands.close()
  }
  views = []
}

async function createModels(
  config: TrackerConfig,
  assetBase: string,
  delegate: Delegate
): Promise<void> {
  // `true` = ES-module WASM loader, required inside a module worker.
  const fileset = await FilesetResolver.forVisionTasks(`${assetBase}/wasm`, true)
  const regions = config.views === 2 ? SPLIT_VIEWS : [FULL_VIEW]
  // Separate models per region: VIDEO mode tracks a person from frame to frame,
  // so each instance must always see the same region.
  views = await Promise.all(
    regions.map(async (view) => {
      const [pose, hands] = await Promise.all([
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: `${assetBase}/models/pose_landmarker_${config.poseModel}.task`,
            delegate
          },
          runningMode: 'VIDEO',
          numPoses: config.numPoses
        }),
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: `${assetBase}/models/hand_landmarker.task`, delegate },
          runningMode: 'VIDEO',
          numHands: config.numHands
        })
      ])
      return { view, pose, hands }
    })
  )
  warmUp()
}

/**
 * The first inference compiles the GPU shaders (~1.5-2.5 s). Do it now on a
 * blank image, so "ready" means ready and the first real frame is fast.
 */
function warmUp(): void {
  const blank = new OffscreenCanvas(256, 256)
  blank.getContext('2d')?.fillRect(0, 0, 256, 256)
  for (const v of views) {
    v.pose.detectForVideo(blank, 1)
    v.hands.detectForVideo(blank, 1)
  }
  lastTimestamp = 1 // real frames use performance.now() timestamps, always larger
}

async function init(config: TrackerConfig, assetBase: string): Promise<void> {
  closeModels()
  lastTimestamp = -1
  const t0 = performance.now()
  if (config.delegate === 'CPU') {
    await createModels(config, assetBase, 'CPU')
    post({ type: 'ready', delegate: 'CPU', loadMs: performance.now() - t0 })
    return
  }
  try {
    await createModels(config, assetBase, 'GPU')
    post({ type: 'ready', delegate: 'GPU', loadMs: performance.now() - t0 })
  } catch (err) {
    closeModels()
    if (config.delegate === 'GPU') throw err
    // 'auto': fall back to CPU, but report why so it is visible in the UI.
    const reason = err instanceof Error ? err.message : String(err)
    console.warn('[tracking] GPU delegate failed, falling back to CPU:', reason)
    await createModels(config, assetBase, 'CPU')
    post({ type: 'ready', delegate: 'CPU', fallbackReason: reason, loadMs: performance.now() - t0 })
  }
}

function toPoints(list: NormalizedLandmark[]): Point[] {
  return list.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility }))
}

async function detect(bitmap: ImageBitmap, frameTime: number): Promise<void> {
  if (!views.length) throw new Error('Tracker not initialised')
  // detectForVideo requires strictly increasing timestamps.
  const ts = frameTime > lastTimestamp ? frameTime : lastTimestamp + 1
  lastTimestamp = ts

  const found: { pose: Point[]; view: View }[] = []
  let hands: HandResult[] = []
  let poseMs = 0
  let handsMs = 0
  for (const v of views) {
    const full = v.view.x0 === 0 && v.view.x1 === 1
    const sx = Math.round(v.view.x0 * bitmap.width)
    const image = full
      ? bitmap
      : await createImageBitmap(
          bitmap,
          sx,
          0,
          Math.round(v.view.x1 * bitmap.width) - sx,
          bitmap.height
        )
    try {
      const t0 = performance.now()
      const poseRes = v.pose.detectForVideo(image, ts)
      const t1 = performance.now()
      const handRes = v.hands.detectForVideo(image, ts)
      poseMs += t1 - t0
      handsMs += performance.now() - t1
      for (const lm of poseRes.landmarks)
        found.push({ pose: toFullFrame(toPoints(lm), v.view), view: v.view })
      // MediaPipe documents handedness inconsistently, but with unmirrored input
      // the label is the subject's own hand (confirmed with a live webcam test).
      hands = hands.concat(
        handRes.landmarks.map((lm, i) => {
          const cat = handRes.handedness[i]?.[0]
          return {
            handedness: cat?.categoryName === 'Left' ? 'Left' : 'Right',
            score: cat?.score ?? 0,
            landmarks: toFullFrame(toPoints(lm), v.view)
          }
        })
      )
    } finally {
      if (image !== bitmap) image.close()
    }
  }
  const luma = frameCount++ % LUMA_EVERY_N_FRAMES === 0 ? meanLuma(bitmap) : undefined
  const poses = views.length > 1 ? dedupePoses(found) : found.map((f) => f.pose)

  post({
    type: 'result',
    frame: {
      frameTime,
      pose: poses[0] ?? null,
      poses,
      hands: views.length > 1 ? dedupeHands(hands) : hands,
      poseMs,
      handsMs,
      luma
    }
  })
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  try {
    switch (msg.type) {
      case 'init':
        await init(msg.config, msg.assetBase)
        break
      case 'frame':
        try {
          await detect(msg.bitmap, msg.frameTime)
        } finally {
          msg.bitmap.close()
        }
        break
      case 'dispose':
        closeModels()
        self.close()
        break
    }
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      fatal: msg.type === 'init'
    })
  }
}
