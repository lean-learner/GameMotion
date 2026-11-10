/** Events per second over a sliding time window. */
export class RateMeter {
  private times: number[] = []

  constructor(private readonly windowMs = 1000) {}

  tick(now: number): void {
    this.times.push(now)
    this.prune(now)
  }

  rate(now: number): number {
    this.prune(now)
    return (this.times.length * 1000) / this.windowMs
  }

  reset(): void {
    this.times = []
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs
    let i = 0
    while (i < this.times.length && this.times[i] <= cutoff) i++
    if (i > 0) this.times.splice(0, i)
  }
}

/** Mean and max over the last N samples. */
export class RollingStat {
  private samples: number[] = []

  constructor(private readonly size = 60) {}

  add(v: number): void {
    this.samples.push(v)
    if (this.samples.length > this.size) this.samples.shift()
  }

  get mean(): number {
    if (this.samples.length === 0) return 0
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length
  }

  get max(): number {
    return this.samples.length ? Math.max(...this.samples) : 0
  }

  get count(): number {
    return this.samples.length
  }

  reset(): void {
    this.samples = []
  }
}
