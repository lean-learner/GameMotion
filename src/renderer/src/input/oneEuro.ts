/**
 * One Euro filter (Casiez, Roussel & Vogel, CHI 2012): a low-pass filter whose
 * cutoff rises with speed. Low jitter when still, low lag when moving.
 *
 * @param minCutoff Hz; lower = smoother at rest.
 * @param beta      cutoff increase per unit/s of speed; higher = less lag.
 * @param dCutoff   Hz; smoothing of the speed estimate.
 */
export class OneEuroFilter {
  private x: number | null = null
  private dx = 0
  private t = 0

  constructor(
    private readonly minCutoff = 1,
    private readonly beta = 0,
    private readonly dCutoff = 1
  ) {}

  /** @param t time in ms */
  filter(value: number, t: number): number {
    if (this.x === null) {
      this.x = value
      this.t = t
      return value
    }
    const dt = Math.max((t - this.t) / 1000, 1e-3)
    this.t = t
    const rawDx = (value - this.x) / dt
    this.dx += alpha(this.dCutoff, dt) * (rawDx - this.dx)
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx)
    this.x += alpha(cutoff, dt) * (value - this.x)
    return this.x
  }

  reset(): void {
    this.x = null
    this.dx = 0
  }
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}
