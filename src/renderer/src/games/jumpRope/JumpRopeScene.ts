import type Phaser from 'phaser'
import { CameraGameScene, hearts } from '../CameraGameScene'
import type { StageTheme } from '../cameraStage'
import type { RoundFlow } from '../roundFlow'
import type { Sfx } from '../sfx'
import type { GameServices } from '../types'
import { drawRope } from './art'
import { JumpRopeLogic, LIVES, TRICK_LEVEL, type GameEvent } from './logic'

/** The surround: a playground, with chalk stars. */
const PLAYGROUND: StageTheme = {
  top: 0x14324a,
  bottom: 0x2a9d8f,
  accent: 0xff7eb6,
  motif: (g, x, y, s) => {
    g.lineStyle(3 * s, 0xffffff, 0.6)
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2
      const b = a + (Math.PI * 4) / 5
      g.lineBetween(
        x + Math.cos(a) * 22 * s,
        y + Math.sin(a) * 22 * s,
        x + Math.cos(b) * 22 * s,
        y + Math.sin(b) * 22 * s
      )
    }
  }
}

/** Jump Rope, played over the camera view. Rules live in JumpRopeLogic. */
export class JumpRopeScene extends CameraGameScene {
  private readonly logic = new JumpRopeLogic()
  private g!: Phaser.GameObjects.Graphics

  constructor(services: GameServices, sfx: Sfx, autostart = false) {
    super(services, sfx, autostart, {
      id: 'jump-rope',
      title: 'Jump Rope',
      theme: PLAYGROUND,
      help: [
        'Jump each time the rope sweeps under your feet',
        'It turns faster every level, then starts changing speed  ·  Watch the rope',
        'Three trips and you are out  ·  Keep going as long as you can'
      ]
    })
  }

  protected get flow(): RoundFlow {
    return this.logic.flow
  }

  protected build(): void {
    this.logic.prepare(this.players.length)
    this.g = this.add.graphics().setDepth(16)
  }

  protected begin(now: number): void {
    this.logic.start(now, this.players.length)
  }

  protected scores(): number[] {
    return this.logic.scores()
  }

  protected hudLine(player: number): string {
    const j = this.logic.jumpers[player]
    if (!j) return ''
    const name = this.duo ? `${this.players[player].name} ` : ''
    return `${name}${j.score}  ${hearts(j.lives, LIVES)}`
  }

  protected centreLine(): string {
    return `Level ${this.logic.level}`
  }

  protected resultLine(): string {
    const line = (i: number): string => {
      const j = this.logic.jumpers[i]
      return `${j.score} points  ·  ${j.jumps} jumps  ·  best run ${j.best}`
    }
    if (!this.duo) return `${line(0)}  ·  level ${this.logic.level}`
    return this.players.map((p, i) => `${p.name}: ${line(i)}`).join('\n')
  }

  protected step(now: number): void {
    const inputs = this.players.map((_, i) => this.bodyInput(i, now))
    for (const e of this.logic.update(now, inputs)) this.onEvent(e, inputs[0]?.x)
  }

  private onEvent(e: GameEvent, soloX = 640): void {
    const x = (player: number): number => (this.duo ? 320 + 640 * player : soloX)
    switch (e.type) {
      case 'sweep':
        this.sfx.swoosh()
        break
      case 'jump':
        this.sfx.note(520 + 20 * Math.min(this.logic.jumpers[e.player].streak, 20), 0.07)
        this.floatText(x(e.player), 600, `+${e.points}`, this.cssColorOf(e.player), 32)
        break
      case 'trip':
        this.sfx.thud()
        this.stage.pulse(0xff3030)
        this.floatText(x(e.player), 520, 'Tripped!', '#ff6b6b', 52)
        break
      case 'out':
        this.sfx.buzz()
        break
      case 'level':
        this.sfx.chime()
        this.floatText(
          640,
          300,
          e.level === TRICK_LEVEL ? `Level ${e.level}  ·  Watch the rope!` : `Level ${e.level}`,
          '#ff7eb6',
          64
        )
        break
    }
  }

  protected draw(): void {
    this.g.clear()
    if (!['playing', 'countdown', 'paused'].includes(this.flow.phase)) return
    drawRope(this.g, this.logic.turn(), this.info.theme.accent)
  }
}
