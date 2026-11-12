import type Phaser from 'phaser'
import { CameraGameScene, H, hearts, W } from '../CameraGameScene'
import type { StageTheme } from '../cameraStage'
import { MotionMeter } from '../motion'
import type { BodyInput } from '../poses'
import type { RoundFlow } from '../roundFlow'
import type { Sfx } from '../sfx'
import type { GameServices } from '../types'
import { FreezeDanceLogic, LIVES, MOVE_LIMIT, type GameEvent } from './logic'

const GREEN = 0x3ddc84
const RED = 0xff4d4d

/** The surround: a disco, with glitter balls and notes. */
const DISCO: StageTheme = {
  top: 0x2a0a4a,
  bottom: 0xd6336c,
  accent: 0xff8fd8,
  motif: (g, x, y, s, index) => {
    if (index % 3 === 0) {
      g.fillStyle(0xe8e8ff, 0.5)
      g.fillCircle(x, y, 20 * s)
      g.lineStyle(2, 0xffffff, 0.5)
      g.lineBetween(x - 20 * s, y, x + 20 * s, y)
      g.lineBetween(x, y - 20 * s, x, y + 20 * s)
      g.strokeEllipse(x, y, 22 * s, 40 * s)
      g.lineBetween(x, y - 20 * s, x, y - 44 * s)
      return
    }
    // A music note.
    g.fillStyle(0xffffff, 0.6)
    g.fillEllipse(x - 6 * s, y + 14 * s, 18 * s, 13 * s)
    g.lineStyle(3 * s, 0xffffff, 0.6)
    g.lineBetween(x + 2 * s, y + 12 * s, x + 2 * s, y - 22 * s)
    g.lineBetween(x + 2 * s, y - 22 * s, x + 18 * s, y - 14 * s)
  }
}

/** Time between drum beats while the light is green. */
const BEAT_MS = 430
/** A bass line to dance to, one note per beat (Hz). */
const TUNE = [110, 110, 165, 147, 131, 131, 165, 196]

/**
 * Freeze Dance, played over the camera view: dance while the light is green,
 * freeze when it turns red. Rules live in FreezeDanceLogic; movement is
 * measured by a MotionMeter per player.
 */
export class FreezeDanceScene extends CameraGameScene {
  private readonly logic = new FreezeDanceLogic()
  private meters: MotionMeter[] = []
  private inputs: (BodyInput | null)[] = []
  private speeds: (number | null)[] = []
  private wash!: Phaser.GameObjects.Rectangle
  private g!: Phaser.GameObjects.Graphics
  private shout!: Phaser.GameObjects.Text
  private nextBeat = 0
  private beat = 0

  constructor(services: GameServices, sfx: Sfx, autostart = false) {
    super(services, sfx, autostart, {
      id: 'freeze-dance',
      title: 'Freeze Dance',
      theme: DISCO,
      help: [
        'Green light: dance!  ·  Red light: freeze!',
        `The more you move on green, the more you score  ·  Move on red and lose a life (${LIVES})`
      ]
    })
  }

  protected get flow(): RoundFlow {
    return this.logic.flow
  }

  protected build(): void {
    this.logic.prepare(this.players.length)
    this.meters = this.players.map(() => new MotionMeter())
    this.wash = this.add.rectangle(0, 0, W, H, GREEN, 1).setOrigin(0).setDepth(2).setAlpha(0)
    this.g = this.add.graphics().setDepth(14)
    this.shout = this.label(120)
      .setPosition(W / 2, H * 0.42)
      .setDepth(22)
      .setAlpha(0)
  }

  protected begin(now: number): void {
    this.logic.start(now, this.players.length)
    for (const m of this.meters) m.reset()
    this.nextBeat = 0
    this.beat = 0
  }

  protected scores(): number[] {
    return this.logic.scores()
  }

  protected hudLine(player: number): string {
    const p = this.logic.players[player]
    if (!p) return ''
    const name = this.duo ? `${this.players[player].name} ` : ''
    return `${name}${Math.round(p.score)}  ${hearts(p.lives, LIVES)}`
  }

  protected centreLine(): string {
    return `${Math.ceil(this.logic.remaining() / 1000)}s`
  }

  protected step(now: number): void {
    this.inputs = this.players.map((_, i) => this.bodyInput(i, now))
    this.speeds = this.inputs.map((body, i) => {
      if (!body) {
        this.meters[i].reset()
        return null
      }
      return this.meters[i].update(
        now,
        [{ x: body.x, y: body.y }, body.hands.left, body.hands.right],
        body.sw
      )
    })
    for (const e of this.logic.update(now, this.speeds)) this.onEvent(e)
    this.music()
  }

  /** A drum and a bass note on every beat while the light is green; silence on red. */
  private music(): void {
    if (this.flow.phase !== 'playing' || this.logic.light !== 'go') return
    const t = this.flow.elapsed
    if (t < this.nextBeat) return
    this.nextBeat = t + BEAT_MS
    this.sfx.drum(this.beat % 4 === 0)
    this.sfx.note(TUNE[this.beat % TUNE.length], 0.2)
    this.beat++
  }

  private onEvent(e: GameEvent): void {
    if (e.type === 'light') {
      const go = e.light === 'go'
      if (go) this.sfx.beep(true)
      else this.sfx.thud()
      this.nextBeat = 0
      this.stage.pulse(go ? GREEN : RED, 0.4, 380)
      this.shout
        .setText(go ? 'DANCE!' : 'FREEZE!')
        .setColor(go ? '#7cff9e' : '#ff6b6b')
        .setAlpha(1)
        .setScale(0.6)
      this.tweens.killTweensOf(this.shout)
      this.tweens.add({ targets: this.shout, scale: 1, duration: 180, ease: 'back.out' })
      this.tweens.add({ targets: this.shout, alpha: 0, delay: 700, duration: 300 })
      return
    }
    const body = this.inputs[e.player]
    const x = body?.x ?? W / 2
    const y = Math.max(150, (body?.y ?? H / 2) - (body?.sw ?? 150) * 1.4)
    if (e.type === 'caught') {
      console.info(`[game] player ${e.player + 1} moved on red, ${e.livesLeft} lives left`)
      this.sfx.buzz()
      this.floatText(x, y, 'You moved!', '#ff6b6b', 44)
    } else if (e.type === 'froze') {
      this.sfx.chime()
      this.floatText(x, y, `Statue! +${e.points}`, '#7cff9e', 40)
    } else {
      this.floatText(x, y - 50, 'OUT', '#ff6b6b', 56)
    }
  }

  protected draw(): void {
    const L = this.logic
    const g = this.g
    g.clear()
    const playing = this.flow.phase === 'playing'
    const go = L.light === 'go'
    // The whole picture is tinted with the light's colour.
    this.wash.setFillStyle(go ? GREEN : RED, 1).setAlpha(playing ? (go ? 0.1 : 0.2) : 0)
    if (!playing) {
      this.shout.setAlpha(0)
      return
    }

    // The light itself, top centre under the clock.
    g.fillStyle(0x000000, 0.6)
    g.fillRoundedRect(W / 2 - 74, 86, 148, 76, 38)
    g.fillStyle(GREEN, go ? 1 : 0.18)
    g.fillCircle(W / 2 - 34, 124, 26)
    g.fillStyle(RED, go ? 0.18 : 1)
    g.fillCircle(W / 2 + 34, 124, 26)

    // A meter beside each player: how hard they dance on green, how still they are on red.
    L.players.forEach((p, i) => {
      const body = this.inputs[i]
      if (!body) return
      const speed = this.speeds[i] ?? 0
      const h = body.sw * 1.7
      const w = Math.max(14, body.sw * 0.13)
      const x = body.x + (i === 0 ? -1 : 1) * body.sw * 1.05 - w / 2
      const top = body.y - body.sw * 0.9
      const alpha = p.alive ? 1 : 0.3
      g.fillStyle(0x000000, 0.55 * alpha)
      g.fillRoundedRect(x - 4, top - 4, w + 8, h + 8, 8)
      if (go) {
        g.fillStyle(GREEN, alpha)
        g.fillRoundedRect(x, top + h * (1 - p.energy), w, Math.max(4, h * p.energy), 5)
      } else {
        // On red the bar shows movement against the limit: stay under the line.
        const level = Math.min(1, speed / (MOVE_LIMIT * 2))
        g.fillStyle(p.caught ? RED : level > 0.5 ? 0xffb02e : 0x9fd8ff, alpha)
        g.fillRoundedRect(x, top + h * (1 - level), w, Math.max(4, h * level), 5)
        g.lineStyle(3, 0xffffff, 0.9 * alpha)
        g.lineBetween(x - 8, top + h / 2, x + w + 8, top + h / 2)
      }
      g.lineStyle(3, this.colorOf(i), alpha)
      g.strokeRoundedRect(x - 4, top - 4, w + 8, h + 8, 8)
    })
  }
}
