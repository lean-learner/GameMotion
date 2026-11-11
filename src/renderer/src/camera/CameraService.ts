import { RateMeter } from '../util/metrics'

export interface CameraInfo {
  deviceId: string
  label: string
}

/**
 * Which listed camera to select: the one already selected, else the remembered
 * one (by id, then by name, since ids can change), else the first.
 */
export function pickCamera(
  cams: CameraInfo[],
  current: string,
  saved: { deviceId: string; label: string } | null
): string {
  if (current && cams.some((c) => c.deviceId === current)) return current
  if (saved) {
    const byId = saved.deviceId && cams.find((c) => c.deviceId === saved.deviceId)
    if (byId) return byId.deviceId
    const byLabel = saved.label && cams.find((c) => c.label === saved.label)
    if (byLabel) return byLabel.deviceId
  }
  return cams[0]?.deviceId ?? ''
}

export interface CameraSettings {
  deviceId: string
  label: string
  width: number
  height: number
  /** Frame rate the driver reports it negotiated. */
  frameRate: number | null
}

export class CameraError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message)
  }
}

/** Turns getUserMedia failures into messages a player can act on. */
export function describeCameraError(err: unknown): CameraError {
  const name = err instanceof DOMException || err instanceof Error ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError(
        'Camera access is blocked. Allow the camera for GameMotion, then try again.',
        name
      )
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new CameraError('No camera found. Plug in a webcam, then try again.', name)
    case 'NotReadableError':
    case 'AbortError':
      return new CameraError(
        'The camera is busy. Close other apps that use it (video calls, browser tabs), then try again.',
        name
      )
    default:
      return new CameraError(
        `Camera problem: ${err instanceof Error ? err.message : String(err)}`,
        name || 'Unknown'
      )
  }
}

export interface CameraServiceOptions {
  onDisconnected: (reason: string) => void
}

/**
 * Opens a webcam into a <video> element and measures the frame rate the
 * element actually presents. Owns the MediaStream and always releases it.
 */
export class CameraService {
  private stream: MediaStream | null = null
  private rvfcHandle: number | null = null
  private readonly presented = new RateMeter()

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly opts: CameraServiceOptions
  ) {}

  get isOpen(): boolean {
    return this.stream !== null
  }

  /** Lists video inputs. Labels are empty until permission has been granted once. */
  async listCameras(): Promise<CameraInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
  }

  async open(deviceId?: string, size = { width: 1280, height: 720 }): Promise<CameraSettings> {
    this.close()
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          width: { ideal: size.width },
          height: { ideal: size.height },
          frameRate: { ideal: 30 }
        }
      })
    } catch (err) {
      throw describeCameraError(err)
    }

    this.stream = stream
    const track = stream.getVideoTracks()[0]
    track.addEventListener('ended', () => {
      // Fired when the device is unplugged or the driver drops it.
      this.close()
      this.opts.onDisconnected('Camera unplugged. Plug it back in to keep playing.')
    })

    this.video.srcObject = stream
    try {
      await this.video.play()
    } catch (err) {
      this.close()
      throw describeCameraError(err)
    }
    this.startCounting()
    return this.settings()
  }

  settings(): CameraSettings {
    const track = this.stream?.getVideoTracks()[0]
    const s = track?.getSettings() ?? {}
    return {
      deviceId: s.deviceId ?? '',
      label: track?.label ?? '',
      width: this.video.videoWidth || s.width || 0,
      height: this.video.videoHeight || s.height || 0,
      frameRate: s.frameRate ?? null
    }
  }

  /** Frames per second actually presented by the <video> element. */
  observedFps(now: number): number {
    return this.presented.rate(now)
  }

  close(): void {
    if (this.rvfcHandle !== null) this.video.cancelVideoFrameCallback(this.rvfcHandle)
    this.rvfcHandle = null
    this.presented.reset()
    if (this.stream) {
      const tracks = this.stream.getTracks()
      for (const track of tracks) track.stop()
      const states = tracks.map((t) => t.readyState).join(',')
      console.info(`[camera] released ${tracks.length} track(s), readyState=${states}`)
      this.stream = null
    }
    this.video.pause()
    this.video.srcObject = null
  }

  private startCounting(): void {
    const onFrame = (now: number): void => {
      this.presented.tick(now)
      this.rvfcHandle = this.video.requestVideoFrameCallback(onFrame)
    }
    this.rvfcHandle = this.video.requestVideoFrameCallback(onFrame)
  }
}
