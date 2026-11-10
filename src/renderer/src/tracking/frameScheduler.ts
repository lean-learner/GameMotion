/**
 * Decides whether a newly presented camera frame should be sent to the
 * tracker. Policy:
 *  - At most one frame in flight ("latest frame wins"): when inference is
 *    slower than capture we skip frames instead of queueing stale ones.
 *  - Optional rate cap (`maxHz`), enforced as a token bucket so it limits the
 *    *average* rate. Frame callbacks are aligned to display refresh, so frame
 *    spacing jitters (e.g. 16/50 ms instead of 33/33 ms); a fixed minimum
 *    interval would wrongly drop frames that arrive slightly early.
 */
export type FrameDecision = 'send' | 'skip-busy' | 'skip-rate'

/** Max burst, in frames, the bucket can bank. Enough to absorb jitter. */
const BUCKET_CAPACITY = 1.5
/** Tolerance for fractional frame timestamps (e.g. 16.666 ms -> 0.49999 tokens). */
const EPSILON = 0.02

export class FrameScheduler {
  private tokens = BUCKET_CAPACITY
  private lastTime: number | null = null

  /** @param maxHz cap on frames sent per second; 0 = uncapped. */
  constructor(public maxHz = 0) {}

  reset(): void {
    this.tokens = BUCKET_CAPACITY
    this.lastTime = null
  }

  decide(now: number, inFlight: boolean): FrameDecision {
    if (this.maxHz > 0) {
      if (this.lastTime !== null) {
        const earned = ((now - this.lastTime) * this.maxHz) / 1000
        this.tokens = Math.min(BUCKET_CAPACITY, this.tokens + earned)
      }
      this.lastTime = now
    }
    if (inFlight) return 'skip-busy'
    if (this.maxHz > 0) {
      if (this.tokens < 1 - EPSILON) return 'skip-rate'
      this.tokens = Math.max(0, this.tokens - 1)
    }
    return 'send'
  }
}
