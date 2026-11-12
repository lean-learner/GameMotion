/**
 * Meteor Dodge rules (no Phaser), so they can be unit-tested.
 * Played over the camera view: the player's own body in the picture is what
 * gets hit. Step aside to dodge meteors, duck under beams, touch stars.
 * Units: game pixels on a 1280x720 field (the camera frame); time in ms.
 */
export type Phase = 'menu' | 'countdown' | 'playing' | 'paused' | 'gameover'

export const FIELD = { width: 1280, height: 720 }
/** A player's body before the camera has seen them: half width and top of the head. */
export const DEFAULT_BODY = { half: 70, top: 230 }
export const COUNTDOWN_MS = 3000
export const LIVES = 3
/** After a hit, a player can't be hit again for this long. */
export const INVULNERABLE_MS = 1500
/** The body box follows the player with this much smoothing (ms), to steady camera jitter. */
const FOLLOW_MS = 70
/** Meteors start this long above the frame, so a marker can show where they will fall. */
export const METEOR_LEAD_MS = 700
/** Share of meteors aimed straight at a player; the rest fall around them. */
const AIMED = 0.5
const STAR_POINTS = 50
const POINTS_PER_SECOND = 10
/** Beam warning before it starts sweeping. */
export const BEAM_WARNING_MS = 1000

/** Where a player's body is in the frame this moment. */
export interface PlayerInput {
  /** Centre of the body across the frame. */
  x: number
  /** Top of the head. */
  top: number
  /** Half the body's width. */
  half: number
  crouching: boolean
}

export interface Avatar {
  x: number
  top: number
  half: number
  crouching: boolean
  lives: number
  score: number
  alive: boolean
  invulnerableUntil: number
  survivedMs: number
}

export interface Meteor {
  id: number
  x: number
  y: number
  r: number
  vy: number
}

export interface Star {
  id: number
  x: number
  y: number
  vy: number
}

export interface Beam {
  id: number
  /** Leading edge x; the beam sweeps left to right (dir 1) or right to left (dir -1). */
  x: number
  dir: 1 | -1
  length: number
  speed: number
  /** When the warning started; it sweeps after BEAM_WARNING_MS. */
  warnedAt: number
}

export type GameEvent =
  | { type: 'hit'; player: number; by: 'meteor' | 'beam'; livesLeft: number }
  | { type: 'star'; player: number; x: number; y: number }
  | { type: 'out'; player: number }

export class MeteorDodgeLogic {
  phase: Phase = 'menu'
  players: Avatar[] = []
  meteors: Meteor[] = []
  stars: Star[] = []
  beams: Beam[] = []
  pauseReason: 'player' | 'out-of-view' | null = null

  private phaseStart = 0
  private lastUpdate = 0
  private elapsedMs = 0
  private nextMeteor = 0
  private nextStar = 0
  private nextBeam = 0
  private nextId = 1

  constructor(private readonly random: () => number = Math.random) {}

  get elapsed(): number {
    return this.elapsedMs
  }

  countdown(now: number): number {
    return this.phase === 'countdown'
      ? Math.ceil((COUNTDOWN_MS - (now - this.phaseStart)) / 1000)
      : 0
  }

  /** Index of the winner (best score, survivors first), or null for 1 player or a draw. */
  winner(): number | null {
    if (this.players.length < 2) return null
    const ranked = this.players.map((p, i) => ({ i, key: p.score })).sort((a, b) => b.key - a.key)
    return ranked[0].key === ranked[1].key ? null : ranked[0].i
  }

  /** Places fresh avatars (also used on the menu, so players can try moving). */
  prepare(count: number): void {
    const spread = count > 1 ? [0.3, 0.7] : [0.5]
    this.players = spread.map((f) => ({
      x: FIELD.width * f,
      top: DEFAULT_BODY.top,
      half: DEFAULT_BODY.half,
      crouching: false,
      lives: LIVES,
      score: 0,
      alive: true,
      invulnerableUntil: 0,
      survivedMs: 0
    }))
  }

  start(now: number, count: number): void {
    this.prepare(count)
    this.meteors = []
    this.stars = []
    this.beams = []
    this.elapsedMs = 0
    this.nextMeteor = 1200
    this.nextStar = 2500
    this.nextBeam = 6000
    this.pauseReason = null
    this.setPhase('countdown', now)
  }

  pause(now: number, reason: 'player' | 'out-of-view'): void {
    if (this.phase !== 'playing' && this.phase !== 'countdown') return
    this.pauseReason = reason
    this.setPhase('paused', now)
  }

  resume(now: number): void {
    if (this.phase !== 'paused') return
    this.pauseReason = null
    this.setPhase('countdown', now)
  }

  toMenu(now: number): void {
    this.meteors = []
    this.stars = []
    this.beams = []
    this.setPhase('menu', now)
  }

  /** `inputs[i]` is null while player i isn't seen: their body stays where it was. */
  update(now: number, inputs: (PlayerInput | null)[]): GameEvent[] {
    const events: GameEvent[] = []
    const dt = Math.min(now - this.lastUpdate, 100)
    this.lastUpdate = now
    if (this.phase === 'countdown' && now - this.phaseStart >= COUNTDOWN_MS)
      this.setPhase('playing', now)
    // The body boxes follow the players even before play starts.
    this.moveAvatars(dt, inputs)
    if (this.phase !== 'playing') return events

    this.elapsedMs += dt
    const k = Math.min(1, this.elapsedMs / 90_000) // difficulty ramps over 90 s
    this.spawn(now, k)
    this.moveObjects(dt, now)
    this.collide(now, events)
    for (const p of this.players) {
      if (!p.alive) continue
      p.survivedMs += dt
      p.score += (POINTS_PER_SECOND * dt) / 1000
    }
    if (this.players.every((p) => !p.alive)) {
      for (const p of this.players) p.score = Math.round(p.score)
      this.setPhase('gameover', now)
    }
    return events
  }

  private moveAvatars(dt: number, inputs: (PlayerInput | null)[]): void {
    const k = 1 - Math.exp(-dt / FOLLOW_MS)
    this.players.forEach((p, i) => {
      const input = inputs[i]
      if (!input || !p.alive) return
      p.x += (input.x - p.x) * k
      p.top += (input.top - p.top) * k
      p.half += (input.half - p.half) * k
      p.crouching = input.crouching
    })
  }

  /** The player the next object is thrown at: one of those still in the game. */
  private target(): Avatar {
    const alive = this.players.filter((p) => p.alive)
    const from = alive.length ? alive : this.players
    return from[Math.min(from.length - 1, Math.floor(this.random() * from.length))]
  }

  private spawn(now: number, k: number): void {
    while (this.elapsedMs >= this.nextMeteor) {
      // Sized to the player, and dropped on or around them so there is always something to dodge.
      const p = this.target()
      const scale = Math.max(0.6, Math.min(1.5, p.half / DEFAULT_BODY.half))
      const r = (26 + this.random() * 22) * scale
      const spread = this.random() < AIMED ? p.half : p.half * 4.5
      const x = p.x + (this.random() * 2 - 1) * spread
      const vy = 170 + 150 * k + this.random() * 50
      this.meteors.push({
        id: this.nextId++,
        x: Math.max(r, Math.min(FIELD.width - r, x)),
        y: -r - (vy * METEOR_LEAD_MS) / 1000,
        r,
        vy
      })
      this.nextMeteor += 1300 - 600 * k
    }
    while (this.elapsedMs >= this.nextStar) {
      // Stars fall a step or a reach away from a player.
      const p = this.target()
      const x = p.x + (this.random() * 2 - 1) * p.half * 3.5
      this.stars.push({
        id: this.nextId++,
        x: Math.max(60, Math.min(FIELD.width - 60, x)),
        y: -20,
        vy: 160
      })
      this.nextStar += 3500
    }
    while (this.elapsedMs >= this.nextBeam) {
      const dir = this.random() < 0.5 ? 1 : -1
      const length = 380
      this.beams.push({
        id: this.nextId++,
        x: dir === 1 ? -length : FIELD.width + length,
        dir,
        length,
        speed: 520 + 260 * k,
        warnedAt: now
      })
      this.nextBeam += 7000 - 3000 * k
    }
  }

  private moveObjects(dt: number, now: number): void {
    const s = dt / 1000
    for (const m of this.meteors) m.y += m.vy * s
    for (const st of this.stars) st.y += st.vy * s
    for (const b of this.beams) if (now - b.warnedAt >= BEAM_WARNING_MS) b.x += b.dir * b.speed * s
    this.meteors = this.meteors.filter((m) => m.y - m.r < FIELD.height)
    this.stars = this.stars.filter((st) => st.y < FIELD.height)
    this.beams = this.beams.filter((b) =>
      b.dir === 1 ? b.x - b.length < FIELD.width : b.x + b.length > 0
    )
  }

  /** The player's body as a rectangle: from the top of the head down out of the frame. */
  static body(p: Avatar): { left: number; right: number; top: number; bottom: number } {
    return { left: p.x - p.half, right: p.x + p.half, top: p.top, bottom: FIELD.height }
  }

  private collide(now: number, events: GameEvent[]): void {
    this.players.forEach((p, i) => {
      if (!p.alive) return
      const box = MeteorDodgeLogic.body(p)
      // Stars: collected on touch.
      this.stars = this.stars.filter((st) => {
        const hit = st.x > box.left - 20 && st.x < box.right + 20 && st.y > box.top - 20
        if (hit) {
          p.score += STAR_POINTS
          events.push({ type: 'star', player: i, x: st.x, y: st.y })
        }
        return !hit
      })
      if (now < p.invulnerableUntil) return
      const meteor = this.meteors.find((m) => {
        const cx = Math.max(box.left, Math.min(m.x, box.right))
        const cy = Math.max(box.top, Math.min(m.y, box.bottom))
        return Math.hypot(m.x - cx, m.y - cy) < m.r * 0.85 // a little forgiving
      })
      const beam = this.beams.find((b) => {
        if (now - b.warnedAt < BEAM_WARNING_MS) return false
        const [l, r] = b.dir === 1 ? [b.x - b.length, b.x] : [b.x, b.x + b.length]
        // Beams sweep at head height: ducking gets under them.
        return r > box.left && l < box.right && !p.crouching
      })
      if (!meteor && !beam) return
      if (meteor) this.meteors = this.meteors.filter((m) => m !== meteor)
      p.lives--
      p.invulnerableUntil = now + INVULNERABLE_MS
      events.push({ type: 'hit', player: i, by: meteor ? 'meteor' : 'beam', livesLeft: p.lives })
      if (p.lives <= 0) {
        p.alive = false
        events.push({ type: 'out', player: i })
      }
    })
  }

  private setPhase(phase: Phase, now: number): void {
    this.phase = phase
    this.phaseStart = now
    this.lastUpdate = now
  }
}
