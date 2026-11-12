import type Phaser from 'phaser'
import { CameraGameScene, H, W } from '../CameraGameScene'
import type { StageTheme } from '../cameraStage'
import type { BodyInput } from '../poses'
import type { RoundFlow } from '../roundFlow'
import type { Sfx } from '../sfx'
import type { GameServices } from '../types'
import { PunchFlyLogic, type Fly, type GameEvent } from './logic'

/** The surround: a summer meadow, with leaves and daisies. */
const MEADOW: StageTheme = {
  top: 0x1b4332,
  bottom: 0x74c69d,
  accent: 0xd8f3a0,
  motif: (g, x, y, s, index) => {
    if (index % 3 === 0) {
      g.fillStyle(0xffffff, 0.75)
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i
        g.fillCircle(x + Math.cos(a) * 13 * s, y + Math.sin(a) * 13 * s, 7 * s)
      }
      g.fillStyle(0xffd23f, 0.95)
      g.fillCircle(x, y, 7 * s)
      return
    }
    g.fillStyle(0x2d6a4f, 0.75)
    g.fillEllipse(x, y, 54 * s, 22 * s)
    g.lineStyle(2, 0xb7e4c7, 0.6)
    g.lineBetween(x - 27 * s, y, x + 27 * s, y)
  }
}

const GLOVE = 0xe63946

/**
 * Punch Fly, played over the camera view: flies buzz in on the beat and stop
 * beside each player; punch them as they arrive. Rules live in PunchFlyLogic.
 */
export class PunchFlyScene extends CameraGameScene {
  private readonly logic = new PunchFlyLogic()
  private inputs: (BodyInput | null)[] = []
  private g!: Phaser.GameObjects.Graphics
  private gloves!: Phaser.GameObjects.Graphics
  private splats: { x: number; y: number; r: number; at: number; color: number }[] = []

  constructor(services: GameServices, sfx: Sfx, autostart = false) {
    super(services, sfx, autostart, {
      id: 'punch-fly',
      title: 'Punch Fly',
      theme: MEADOW,
      help: [
        'Flies buzz in on the beat  ·  Punch each one as its ring closes',
        'Hit on the beat for more points  ·  With two players, land the same beat for a bonus'
      ]
    })
  }

  protected get flow(): RoundFlow {
    return this.logic.flow
  }

  protected build(): void {
    this.logic.prepare(this.players.length)
    this.g = this.add.graphics().setDepth(16)
    this.gloves = this.add.graphics().setDepth(18)
  }

  protected begin(now: number): void {
    this.logic.start(now, this.players.length)
    this.splats = []
  }

  protected scores(): number[] {
    return this.logic.scores()
  }

  protected hudLine(player: number): string {
    const p = this.logic.players[player]
    if (!p) return ''
    const name = this.duo ? `${this.players[player].name} ` : ''
    return `${name}${p.score}${p.combo > 1 ? `  x${p.combo}` : ''}`
  }

  protected centreLine(): string {
    return `${Math.ceil(this.logic.remaining() / 1000)}s`
  }

  protected resultLine(): string {
    const line = (i: number): string => {
      const p = this.logic.players[i]
      return `${p.score} points  ·  ${p.hits} flies  ·  best run ${p.bestCombo}`
    }
    if (!this.duo) return line(0)
    return this.players.map((p, i) => `${p.name}: ${line(i)}`).join('\n')
  }

  protected step(now: number): void {
    this.inputs = this.players.map((_, i) => this.bodyInput(i, now))
    for (const e of this.logic.update(now, this.inputs)) this.onEvent(e, now)
  }

  private onEvent(e: GameEvent, now: number): void {
    switch (e.type) {
      case 'beat':
        this.sfx.drum(e.beat % 4 === 1)
        break
      case 'hit': {
        const perfect = e.quality === 'perfect'
        this.sfx.pop(perfect ? 3 : 1)
        this.splats.push({
          x: e.x,
          y: e.y,
          r: (this.inputs[e.player]?.sw ?? 170) * 0.6,
          at: now,
          color: perfect ? 0xffe14d : 0xffffff
        })
        this.floatText(
          e.x,
          e.y - 30,
          perfect ? `Perfect! +${e.points}` : `+${e.points}`,
          perfect ? '#ffe14d' : this.cssColorOf(e.player),
          perfect ? 40 : 34
        )
        break
      }
      case 'miss':
        this.floatText(e.x, e.y - 20, 'Miss', '#c9c9c9', 28)
        break
      case 'together':
        this.sfx.chime()
        this.stage.pulse(0xffe14d, 0.18)
        this.floatText(W / 2, H * 0.3, 'Together!', '#ffe14d', 48)
        break
    }
  }

  protected draw(now: number): void {
    const g = this.g
    const gl = this.gloves
    g.clear()
    gl.clear()
    if (this.flow.phase !== 'playing') return

    for (const fly of this.logic.flies) this.drawFly(g, fly, now)

    // Splats where flies were hit.
    this.splats = this.splats.filter((s) => now - s.at < 320)
    for (const s of this.splats) {
      const k = (now - s.at) / 320
      g.lineStyle(8 * (1 - k), s.color, 1 - k)
      g.strokeCircle(s.x, s.y, s.r * (0.5 + k))
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i
        g.lineBetween(
          s.x + Math.cos(a) * s.r * (0.6 + k * 0.5),
          s.y + Math.sin(a) * s.r * (0.6 + k * 0.5),
          s.x + Math.cos(a) * s.r * (0.9 + k),
          s.y + Math.sin(a) * s.r * (0.9 + k)
        )
      }
    }

    // A boxing glove on every hand the camera sees.
    this.inputs.forEach((body, i) => {
      if (!body) return
      const r = body.sw * 0.24
      for (const side of ['left', 'right'] as const) {
        const hand = body.hands[side]
        if (!hand) continue
        gl.fillStyle(GLOVE, 0.9)
        gl.fillCircle(hand.x, hand.y, r)
        gl.fillStyle(0xffffff, 0.35)
        gl.fillCircle(hand.x - r * 0.3, hand.y - r * 0.35, r * 0.3)
        gl.lineStyle(4, this.colorOf(i), 1)
        gl.strokeCircle(hand.x, hand.y, r)
      }
    })
  }

  private drawFly(g: Phaser.GameObjects.Graphics, fly: Fly, now: number): void {
    const spot = this.logic.spot(fly)
    if (!spot) return
    const p = Math.max(0, this.logic.progress(fly))
    const k = Math.min(1, p)
    const dir = fly.side === 'left' ? -1 : 1
    // It comes in from the side in a wobbly line, then hovers on its spot.
    const ease = 1 - (1 - k) * (1 - k)
    const wobble = Math.sin(now / 90 + fly.id) * 26 * (1 - k)
    const x = spot.x + dir * 420 * (1 - ease)
    const y = spot.y - 170 * (1 - ease) + wobble
    const s = spot.r * (0.45 + 0.55 * k)

    // Where to punch, and a ring that closes on it as the beat arrives.
    const ready = p >= 0.82
    g.lineStyle(4, this.colorOf(fly.player), 0.55)
    g.strokeCircle(spot.x, spot.y, spot.r)
    if (k < 1) {
      g.lineStyle(6, ready ? 0xffe14d : 0xffffff, 0.9)
      g.strokeCircle(spot.x, spot.y, spot.r * (1 + 0.9 * (1 - k)))
    } else {
      g.fillStyle(0xffe14d, 0.3)
      g.fillCircle(spot.x, spot.y, spot.r)
    }

    // The fly: flapping wings, a round body, two eyes.
    const flap = Math.sin(now / 28 + fly.id) > 0 ? 1 : 0.55
    g.fillStyle(0xffffff, 0.6)
    g.fillEllipse(x - s * 0.42, y - s * 0.38, s * 0.7 * flap, s * 0.42)
    g.fillEllipse(x + s * 0.42, y - s * 0.38, s * 0.7 * flap, s * 0.42)
    g.fillStyle(0x1f2a1f, 1)
    g.fillCircle(x, y, s * 0.4)
    g.fillStyle(0xd62828, 1)
    g.fillCircle(x - s * 0.16, y - s * 0.1, s * 0.11)
    g.fillCircle(x + s * 0.16, y - s * 0.1, s * 0.11)
  }
}
