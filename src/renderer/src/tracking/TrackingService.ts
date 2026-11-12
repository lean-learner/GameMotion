import { RateMeter, RollingStat } from '../util/metrics'
import { FrameScheduler } from './frameScheduler'
import type { Delegate, FromWorker, ToWorker, TrackerConfig, TrackingFrame } from './types'

export type TrackingStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error'

export interface TrackingStats {
  status: TrackingStatus
  delegate: Delegate | null
  fallbackReason: string | null
  loadMs: number | null
  /** Completed tracking results per second. */
  trackingFps: number
  poseMs: number
  handsMs: number
  /** Time from frame presentation to result arrival, ms. */
  latencyMs: number
  latencyMaxMs: number
  framesSent: number
  /** Frames skipped because the worker was still busy with the previous one. */
  framesSkippedBusy: number
  /** Frames skipped by the max-rate cap. */
  framesSkippedRate: number
  error: string | null
}

export interface TrackingServiceOptions {
  /** Upper bound on tracking rate; 0 = every camera frame. */
  maxHz: number
  onFrame: (frame: TrackingFrame) => void
  onStatus: () => void
}

/**
 * Owns the tracking worker and pumps camera frames into it. One frame is in
 * flight at a time; frames that arrive while the worker is busy are skipped.
 */
export class TrackingService {
  private worker: Worker | null = null
  private configKey = ''
  private video: HTMLVideoElement | null = null
  private rvfcHandle: number | null = null
  private inFlight = false
  private readyWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null

  private readonly fps = new RateMeter()
  private readonly poseMs = new RollingStat()
  private readonly handsMs = new RollingStat()
  private readonly latency = new RollingStat()

  readonly stats: TrackingStats = {
    status: 'idle',
    delegate: null,
    fallbackReason: null,
    loadMs: null,
    trackingFps: 0,
    poseMs: 0,
    handsMs: 0,
    latencyMs: 0,
    latencyMaxMs: 0,
    framesSent: 0,
    framesSkippedBusy: 0,
    framesSkippedRate: 0,
    error: null
  }

  private readonly scheduler: FrameScheduler

  constructor(private readonly opts: TrackingServiceOptions) {
    this.scheduler = new FrameScheduler(opts.maxHz)
  }

  /** Changes the tracking-rate cap; takes effect on the next camera frame. */
  setMaxHz(hz: number): void {
    this.scheduler.maxHz = hz
    this.scheduler.reset()
  }

  /** Loads models (reusing the worker if the config is unchanged). */
  async load(config: TrackerConfig): Promise<void> {
    const key = JSON.stringify(config)
    if (this.worker && this.configKey === key && this.stats.delegate) return
    this.disposeWorker()
    this.configKey = key
    this.setStatus('loading')

    const worker = new Worker(new URL('./tracking.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data)
    worker.onerror = (e) => this.fail(`Tracking worker crashed: ${e.message || 'unknown error'}`)

    const ready = new Promise<void>((resolve, reject) => {
      this.readyWaiter = { resolve, reject }
    })
    // Assets are served from the app's own origin (public/ directory).
    // Relative to the page, so it also works when the app is served from a sub-folder.
    const assetBase = new URL('./mediapipe', document.baseURI).href
    this.send({ type: 'init', config, assetBase })
    await ready
  }

  start(video: HTMLVideoElement): void {
    if (!this.worker || !this.stats.delegate) throw new Error('Tracker not loaded')
    this.stop()
    this.video = video
    this.resetCounters()
    this.setStatus('running')
    this.rvfcHandle = video.requestVideoFrameCallback(this.onVideoFrame)
  }

  /** Stops sending frames. Models stay loaded for a fast restart. */
  stop(): void {
    if (this.video && this.rvfcHandle !== null) this.video.cancelVideoFrameCallback(this.rvfcHandle)
    this.rvfcHandle = null
    this.video = null
    this.inFlight = false
    if (this.stats.status === 'running') this.setStatus('ready')
  }

  dispose(): void {
    this.stop()
    this.disposeWorker()
    this.setStatus('idle')
  }

  /** Refreshes the time-based stats; call before reading `stats`. */
  sample(now: number): TrackingStats {
    this.stats.trackingFps = this.fps.rate(now)
    this.stats.poseMs = this.poseMs.mean
    this.stats.handsMs = this.handsMs.mean
    this.stats.latencyMs = this.latency.mean
    this.stats.latencyMaxMs = this.latency.max
    return this.stats
  }

  private onVideoFrame = (now: number): void => {
    const video = this.video
    if (!video) return
    this.rvfcHandle = video.requestVideoFrameCallback(this.onVideoFrame)

    const decision = this.scheduler.decide(now, this.inFlight)
    if (decision === 'skip-busy') this.stats.framesSkippedBusy++
    if (decision === 'skip-rate') this.stats.framesSkippedRate++
    if (decision !== 'send') return

    this.inFlight = true
    const frameTime = now
    createImageBitmap(video)
      .then((bitmap) => {
        if (!this.worker || this.video !== video) {
          bitmap.close()
          this.inFlight = false
          return
        }
        this.stats.framesSent++
        this.send({ type: 'frame', bitmap, frameTime }, [bitmap])
      })
      .catch((err: unknown) => {
        this.inFlight = false
        console.warn('[tracking] could not grab frame:', err)
      })
  }

  private onMessage(msg: FromWorker): void {
    switch (msg.type) {
      case 'ready':
        this.stats.delegate = msg.delegate
        this.stats.fallbackReason = msg.fallbackReason ?? null
        this.stats.loadMs = msg.loadMs
        this.stats.error = null
        console.info(
          `[tracking] models loaded in ${msg.loadMs.toFixed(0)} ms, delegate=${msg.delegate}` +
            (msg.fallbackReason ? ` (GPU failed: ${msg.fallbackReason})` : '')
        )
        this.setStatus('ready')
        this.readyWaiter?.resolve()
        this.readyWaiter = null
        break
      case 'result': {
        this.inFlight = false
        if (this.stats.status !== 'running') return
        const now = performance.now()
        this.fps.tick(now)
        this.poseMs.add(msg.frame.poseMs)
        this.handsMs.add(msg.frame.handsMs)
        this.latency.add(now - msg.frame.frameTime)
        this.opts.onFrame(msg.frame)
        break
      }
      case 'error':
        this.inFlight = false
        if (msg.fatal) this.fail(msg.message)
        else console.error('[tracking] frame error:', msg.message)
        break
    }
  }

  private fail(message: string): void {
    console.error('[tracking]', message)
    this.stop()
    this.disposeWorker()
    this.stats.error = message
    this.setStatus('error')
    this.readyWaiter?.reject(new Error(message))
    this.readyWaiter = null
  }

  private send(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker?.postMessage(msg, transfer)
  }

  private disposeWorker(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'dispose' } satisfies ToWorker)
      // Give the worker a moment to release models, then make sure it is gone.
      const w = this.worker
      setTimeout(() => w.terminate(), 500)
    }
    this.worker = null
    this.configKey = ''
    this.stats.delegate = null
    this.stats.fallbackReason = null
  }

  private resetCounters(): void {
    this.fps.reset()
    this.poseMs.reset()
    this.handsMs.reset()
    this.latency.reset()
    this.scheduler.reset()
    this.stats.framesSent = 0
    this.stats.framesSkippedBusy = 0
    this.stats.framesSkippedRate = 0
  }

  private setStatus(status: TrackingStatus): void {
    this.stats.status = status
    this.opts.onStatus()
  }
}
