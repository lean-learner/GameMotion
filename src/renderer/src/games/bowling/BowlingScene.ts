import type Phaser from 'phaser'
import { CameraGameScene } from '../CameraGameScene'
import type { StageTheme } from '../cameraStage'
import type { BodyInput } from '../poses'
import type { RoundFlow } from '../roundFlow'
import type { Sfx } from '../sfx'
import type { GameServices } from '../types'
import { drawBall, drawLane, drawPin } from './art'
import {
  BowlingLogic,
  FRAMES,
  LANE,
  laneView,
  marks,
  project,
  type GameEvent,
  type Pin
} from './logic'

/** The surround: a bowling alley at night, with pins and balls. */
const ALLEY: StageTheme = {
  top: 0x160f33,
  bottom: 0x43206b,
  accent: 0x3ddad7,
  motif: (g, x, y, s, index) => {
    if (index % 2 === 0) {
      g.fillStyle(0xffffff, 0.8)
      g.fillEllipse(x, y + 6 * s, 22 * s, 36 * s)
      g.fillCircle(x, y - 18 * s, 8 * s)
      g.fillStyle(0xd62839, 0.8)
      g.fillRect(x - 6 * s, y - 12 * s, 12 * s, 4 * s)
      return
    }
    g.fillStyle(0xff5fa2, 0.8)
    g.fillCircle(x, y, 20 * s)
    g.fillStyle(0x160f33, 0.8)
    g.fillCircle(x - 5 * s, y - 6 * s, 3 * s)
    g.fillCircle(x + 5 * s, y - 6 * s, 3 * s)
    g.fillCircle(x, y + 2 * s, 3 * s)
  }
}

const STREAKS = ['', 'STRIKE!', 'DOUBLE!', 'TURKEY!']

/**
 * Bowling, played over the camera view: each player has a lane running away
 * from them up the screen. Stand where the ball should start, lower an arm and
 * swing it up to bowl. Rules live in BowlingLogic.
 */
export class BowlingScene extends CameraGameScene {
  private readonly logic = new BowlingLogic()
  private inputs: (BodyInput | null)[] = []
  private lanesG!: Phaser.GameObjects.Graphics
  private g!: Phaser.GameObjects.Graphics
  private cards: Phaser.GameObjects.Text[] = []
  private prompts: Phaser.GameObjects.Text[] = []

  constructor(services: GameServices, sfx: Sfx, autostart = false) {
    super(services, sfx, autostart, {
      id: 'bowling',
      title: 'Bowling',
      theme: ALLEY,
      help: [
        'Stand where the ball should start  ·  Lower an arm, then swing it up to bowl',
        'Swing faster for more power  ·  A leaning swing curves the ball  ·  Ten frames'
      ]
    })
  }

  protected get flow(): RoundFlow {
    return this.logic.flow
  }

  protected build(): void {
    this.logic.prepare(this.players.length)
    this.lanesG = this.add.graphics().setDepth(12)
    this.g = this.add.graphics().setDepth(16)
    this.cards = this.players.map((_, i) =>
      this.label(22, this.cssColorOf(i))
        .setPosition(i === 0 ? 30 : 1250, 104)
        .setOrigin(i === 0 ? 0 : 1, 0.5)
        .setDepth(30)
    )
    this.prompts = this.players.map((_, i) =>
      this.label(28).setPosition(laneView(i, this.players.length).cx, 560).setDepth(30)
    )
  }

  protected begin(now: number): void {
    this.logic.start(now, this.players.length)
  }

  protected scores(): number[] {
    return this.logic.scores()
  }

  protected hudLine(player: number): string {
    const card = this.logic.card(player)
    const name = this.duo ? `${this.players[player].name} ` : ''
    const frame = card.next ? `  ·  Frame ${card.next.frame + 1}/${FRAMES}` : ''
    return `${name}${card.total}${frame}`
  }

  protected resultLine(): string {
    const line = (i: number): string => {
      const card = this.logic.card(i)
      const strikes = this.logic.lanes[i].rolls.filter((r) => r === 10).length
      return `${card.total} points  ·  ${strikes} strike${strikes === 1 ? '' : 's'}`
    }
    if (!this.duo) return line(0)
    return this.players.map((p, i) => `${p.name}: ${line(i)}`).join('\n')
  }

  protected step(now: number): void {
    this.inputs = this.players.map((_, i) => this.bodyInput(i, now))
    for (const e of this.logic.update(now, this.inputs)) this.onEvent(e)
  }

  private onEvent(e: GameEvent): void {
    const view = laneView(e.player, this.players.length)
    const pins = project(view, 0, LANE.length - 2)
    switch (e.type) {
      case 'throw':
        this.sfx.swoosh()
        this.floatText(view.cx, 600, `Power ${Math.round(e.power * 100)}%`, '#ffffff', 28)
        break
      case 'crash':
        this.sfx.thud()
        this.sfx.pop(e.pins)
        break
      case 'gutter':
        this.sfx.buzz()
        break
      case 'result':
        if (e.kind === 'strike') {
          this.sfx.bonus()
          this.floatText(
            pins.x,
            pins.y,
            STREAKS[Math.min(e.streak, 3)] || 'STRIKE!',
            '#ffe14d',
            this.duo ? 56 : 76
          )
        } else if (e.kind === 'spare') {
          this.sfx.chime()
          this.floatText(pins.x, pins.y, 'Spare!', '#7cff6b', this.duo ? 48 : 64)
        } else if (e.kind === 'gutter') {
          this.floatText(pins.x, pins.y, 'Gutter…', '#c9c9c9', 40)
        } else {
          this.floatText(pins.x, pins.y, String(e.knocked), this.cssColorOf(e.player), 56)
        }
        break
    }
  }

  protected draw(): void {
    const g = this.g
    g.clear()
    this.lanesG.clear()
    const phase = this.flow.phase
    const shown = phase === 'playing' || phase === 'countdown' || phase === 'paused'
    this.logic.lanes.forEach((lane, i) => {
      const card = this.logic.card(i)
      this.cards[i].setText(shown ? card.frames.map((f) => marks(f)).join('  ') : '')
      let prompt = ''
      if (phase === 'playing') {
        if (lane.phase === 'done') prompt = 'Finished!'
        else if (lane.phase === 'aim' && lane.swing.armed) prompt = 'Swing up!'
        else if (lane.phase === 'aim' && lane.rolls.length === 0)
          prompt = 'Lower an arm, then swing it up'
      }
      this.prompts[i].setText(prompt)
      if (!shown) return

      const view = laneView(i, this.players.length)
      drawLane(this.lanesG, view, this.colorOf(i))

      // Far things first, so nearer ones cover them.
      const things: { y: number; draw: () => void }[] = lane.pins.map((pin: Pin) => ({
        y: pin.y,
        draw: () => drawPin(g, view, pin)
      }))
      const ball = lane.roll?.ball
      if (ball && !ball.gone)
        things.push({ y: ball.y, draw: () => drawBall(g, view, ball, this.colorOf(i)) })
      if (lane.phase === 'aim' && phase === 'playing') {
        // The waiting ball, and a short line showing where a straight throw would head.
        const from = project(view, lane.aimX, 0.6)
        const to = project(view, lane.aimX, 6)
        g.lineStyle(4, 0xffffff, lane.swing.armed ? 0.8 : 0.35)
        g.lineBetween(from.x, from.y, to.x, to.y)
        things.push({
          y: 0.25,
          draw: () => drawBall(g, view, { x: lane.aimX, y: 0.25 }, this.colorOf(i))
        })
      }
      things.sort((a, b) => b.y - a.y)
      for (const t of things) t.draw()
    })
  }
}
