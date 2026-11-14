import type Phaser from 'phaser'
import { CameraGameScene, hearts } from '../CameraGameScene'
import type { StageTheme } from '../cameraStage'
import type { BodyInput } from '../poses'
import type { RoundFlow } from '../roundFlow'
import type { Sfx } from '../sfx'
import type { GameServices } from '../types'
import { drawBasket, drawItem } from './art'
import { LEVELS, LIVES, SkyCatchLogic, type GameEvent } from './logic'

/** The surround: an orchard under a morning sky. */
const ORCHARD: StageTheme = {
  top: 0x1c4e80,
  bottom: 0x3a7d44,
  accent: 0xffd166,
  motif: (g, x, y, s, index) => drawItem(g, { kind: 'fruit', x, y, r: 20 * s, vx: 0, look: index })
}

/** Sky Catch, played over the camera view. Rules live in SkyCatchLogic. */
export class SkyCatchScene extends CameraGameScene {
  private readonly logic = new SkyCatchLogic()
  private inputs: (BodyInput | null)[] = []
  private g!: Phaser.GameObjects.Graphics
  private prompts: Phaser.GameObjects.Text[] = []

  constructor(services: GameServices, sfx: Sfx, autostart = false) {
    super(services, sfx, autostart, {
      id: 'sky-catch',
      title: 'Sky Catch',
      theme: ORCHARD,
      help: [
        'Run under the fruit and catch it in your basket  ·  Never catch a bomb',
        'Jump as a comet flies past to grab it  ·  Golden fruit is worth more',
        'Five levels, faster each time  ·  Three bombs and you are out'
      ]
    })
  }

  protected get flow(): RoundFlow {
    return this.logic.flow
  }

  protected build(): void {
    this.logic.prepare(this.players.length)
    this.g = this.add.graphics().setDepth(16)
    this.prompts = this.players.map((_, i) =>
      this.label(40)
        .setPosition(this.duo ? 320 + 640 * i : 640, 128)
        .setDepth(30)
    )
  }

  protected begin(now: number): void {
    this.logic.start(now, this.players.length)
  }

  protected scores(): number[] {
    return this.logic.scores()
  }

  protected hudLine(player: number): string {
    const c = this.logic.catchers[player]
    if (!c) return ''
    const name = this.duo ? `${this.players[player].name} ` : ''
    return `${name}${c.score}  ${hearts(c.lives, LIVES)}`
  }

  protected centreLine(): string {
    return `Level ${this.logic.level()}/${LEVELS}  ·  ${Math.ceil(this.logic.remaining() / 1000)}s`
  }

  protected resultLine(): string {
    const line = (i: number): string => {
      const c = this.logic.catchers[i]
      return `${c.score} points  ·  ${c.caught} caught`
    }
    if (!this.duo) return line(0)
    return this.players.map((p, i) => `${p.name}: ${line(i)}`).join('\n')
  }

  protected step(now: number): void {
    this.inputs = this.players.map((_, i) => this.bodyInput(i, now))
    for (const e of this.logic.update(now, this.inputs)) this.onEvent(e)
  }

  private onEvent(e: GameEvent): void {
    switch (e.type) {
      case 'level':
        this.sfx.chime()
        this.floatText(
          640,
          300,
          e.level === LEVELS ? 'Final level!' : `Level ${e.level}`,
          '#ffd166',
          72
        )
        break
      case 'comet':
        this.sfx.swoosh()
        break
      case 'catch':
        if (e.kind === 'fruit') this.sfx.pop(this.logic.catchers[e.player].streak)
        else this.sfx.bonus()
        this.floatText(
          e.x,
          e.y - 30,
          e.kind === 'comet' ? `Comet! +${e.points}` : `+${e.points}`,
          e.kind === 'fruit' ? this.cssColorOf(e.player) : '#ffe14d',
          e.kind === 'fruit' ? 32 : 42
        )
        break
      case 'boom':
        this.sfx.thud()
        this.stage.pulse(0xff3030)
        this.floatText(e.x, e.y - 30, 'Boom!', '#ff6b6b', 52)
        break
      case 'miss':
        this.floatText(e.x, Math.min(e.y, 640), 'Missed', '#c9c9c9', 24)
        break
      case 'out':
        this.sfx.buzz()
        break
    }
  }

  protected draw(): void {
    const g = this.g
    g.clear()
    const shown = ['playing', 'countdown', 'paused'].includes(this.flow.phase)
    this.logic.catchers.forEach((c, i) => {
      const comet = this.logic.items.some((item) => item.player === i && item.kind === 'comet')
      this.prompts[i].setText(
        !shown ? '' : c.lives <= 0 ? (this.duo ? 'Out' : '') : comet ? 'Jump for the comet!' : ''
      )
    })
    if (!shown) return
    for (const item of this.logic.items) drawItem(g, item)
    // Baskets go on top, so fruit drops into them.
    this.inputs.forEach((body, i) => {
      if (body && this.logic.catchers[i]?.lives > 0)
        drawBasket(g, body.x, body.y, body.sw, this.colorOf(i))
    })
  }
}
