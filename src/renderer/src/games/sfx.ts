/**
 * Tiny synthesised sound effects (Web Audio). Nothing to download or bundle.
 * All sounds are short and quiet by default.
 */
export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null

  constructor(private volume = 0.35) {}

  private audio(): { ctx: AudioContext; out: GainNode } | null {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext()
        this.master = this.ctx.createGain()
        this.master.gain.value = this.volume
        this.master.connect(this.ctx.destination)
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return { ctx: this.ctx, out: this.master! }
    } catch {
      return null // no audio device: play silently
    }
  }

  /** Balloon pop: a short filtered noise burst. Higher pitch for bigger combos. */
  pop(combo = 1): void {
    const a = this.audio()
    if (!a) return
    const { ctx, out } = a
    const len = Math.floor(ctx.sampleRate * 0.12)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 900 + Math.min(combo, 10) * 120
    filter.Q.value = 1.2
    src.connect(filter).connect(out)
    src.start()
  }

  /** Blade swoosh: a quick noise sweep from low to high. */
  swoosh(): void {
    const a = this.audio()
    if (!a) return
    const { ctx, out } = a
    const dur = 0.16
    const len = Math.floor(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 2
    filter.frequency.setValueAtTime(600, ctx.currentTime)
    filter.frequency.exponentialRampToValueAtTime(3200, ctx.currentTime + dur)
    const g = ctx.createGain()
    g.gain.value = 0.45
    src.connect(filter).connect(g).connect(out)
    src.start()
  }

  /** A low thud for getting hit: a falling tone plus a little noise. */
  thud(): void {
    const a = this.audio()
    if (!a) return
    const { ctx, out } = a
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(180, t0)
    osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.3)
    g.gain.setValueAtTime(0.9, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35)
    osc.connect(g).connect(out)
    osc.start(t0)
    osc.stop(t0 + 0.4)
  }

  /** Rising three-note flourish for a multi-slice bonus. */
  bonus(): void {
    ;[660, 880, 1320].forEach((f, i) => this.tone(f, i * 0.06, 0.14, 'triangle', 0.4))
  }

  /** Bright two-note chime (golden balloon). */
  chime(): void {
    this.tone(880, 0, 0.12)
    this.tone(1320, 0.08, 0.18)
  }

  /** Countdown tick; `go` is the higher final beep. */
  beep(go = false): void {
    this.tone(go ? 880 : 440, 0, go ? 0.25 : 0.12, 'square', 0.15)
  }

  /** Short rising jingle for the end of a round. */
  fanfare(): void {
    ;[523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.11, 0.16, 'triangle'))
  }

  close(): void {
    void this.ctx?.close()
    this.ctx = null
  }

  private tone(
    freq: number,
    delay: number,
    dur: number,
    type: OscillatorType = 'sine',
    gain = 0.5
  ): void {
    const a = this.audio()
    if (!a) return
    const { ctx, out } = a
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    osc.connect(g).connect(out)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }
}
