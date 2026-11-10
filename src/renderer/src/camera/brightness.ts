/**
 * Display brightening. When the camera is held at 30 fps in dim light its
 * picture gets darker; we compensate on the GPU with a CSS brightness() filter
 * on the <video> element (composited, no per-pixel work on the CPU).
 * Only the displayed picture is changed; tracking always sees the raw frame.
 */
export const TARGET_LUMA = 110
export const MAX_GAIN = 2.5

/** Gain that brings mean luma (0-255) up to the target; never darkens. */
export function displayGain(meanLuma: number, target = TARGET_LUMA, maxGain = MAX_GAIN): number {
  if (!(meanLuma > 0)) return 1
  return Math.min(maxGain, Math.max(1, target / meanLuma))
}

export class DisplayBrightener {
  private gain = 1

  constructor(private readonly video: HTMLVideoElement) {}

  get currentGain(): number {
    return this.gain
  }

  /** Eases towards the target gain so the picture doesn't flicker. */
  update(meanLuma: number, enabled: boolean): void {
    const target = enabled ? displayGain(meanLuma) : 1
    const next = this.gain + (target - this.gain) * 0.3
    if (Math.abs(next - this.gain) < 0.01 && Math.abs(target - this.gain) < 0.01) return
    this.gain = next
    this.apply()
  }

  reset(): void {
    this.gain = 1
    this.apply()
  }

  private apply(): void {
    this.video.style.filter = this.gain > 1.005 ? `brightness(${this.gain.toFixed(2)})` : ''
  }
}
