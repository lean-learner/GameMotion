import type Phaser from 'phaser'
import { CameraGameScene, hearts } from '../CameraGameScene'
import type { StageTheme } from '../cameraStage'
import type { RoundFlow } from '../roundFlow'
import type { Sfx } from '../sfx'
import type { GameServices } from '../types'
import { drawFootball, drawGoal } from './art'
import { ballPosition, GoalkeeperLogic, levelAt } from './logic'

const STADIUM: StageTheme = {
  top: 0x071d29,
  bottom: 0x17623b,
  accent: 0xa5f56b,
  motif: (g, x, y, s) => drawFootball(g, x, y, 19 * s)
}

export class GoalkeeperScene extends CameraGameScene {
  private readonly logic = new GoalkeeperLogic()
  private g!: Phaser.GameObjects.Graphics
  private prompts: Phaser.GameObjects.Text[] = []

  constructor(services: GameServices, sfx: Sfx, autostart = false) {
    super(services, sfx, autostart, {
      id: 'goalkeeper',
      title: 'Goalkeeper',
      theme: STADIUM,
      usesDuck: true,
      help: [
        'Block the balls with your hands or body',
        'Step or lean for wide shots  ·  Crouch for low balls',
        'Five levels  ·  Three goals ends your run  ·  Two players compete side by side'
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
      this.label(26)
        .setPosition(this.duo ? 320 + 640 * i : 640, 670)
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
    const k = this.logic.keepers[player]
    return `${this.duo ? this.players[player].name + ' ' : ''}${k.score}  ${hearts(k.lives, 3)}`
  }
  protected centreLine(): string {
    return `Level ${levelAt(this.flow.elapsed)}/5`
  }
  protected resultLine(): string {
    return this.logic.keepers
      .map(
        (k, i) =>
          `${this.duo ? this.players[i].name + ': ' : ''}${k.score} points · ${k.saves} saves`
      )
      .join('\n')
  }
  protected step(now: number): void {
    const inputs = this.players.map((_, i) => this.bodyInput(i, now))
    for (const e of this.logic.update(now, inputs)) {
      if (e.type === 'shot') this.sfx.swoosh()
      else if (e.type === 'level') {
        this.sfx.chime()
        this.floatText(640, 180, `Level ${e.level}`, '#ffe14d', 54)
      } else {
        if (e.type === 'save') this.sfx.pop()
        else this.sfx.thud()
        this.floatText(
          e.x,
          e.y,
          e.type === 'save' ? `Save! +${e.points}` : 'Goal!',
          e.type === 'save' ? '#a5f56b' : '#ff6b6b',
          36
        )
      }
    }
  }
  protected draw(): void {
    this.g.clear()
    const shown = ['playing', 'countdown', 'paused'].includes(this.flow.phase)
    this.logic.keepers.forEach((k, i) => {
      this.prompts[i].setText(
        shown
          ? k.lives <= 0
            ? 'Finished · Watch your opponent'
            : !k.goal
              ? 'Stand ready in the middle of your goal'
              : 'Reach · Lean · Crouch'
          : ''
      )
      if (!shown || !k.goal) return
      drawGoal(this.g, k.goal, this.colorOf(i))
      for (const shot of this.logic.shots) {
        if (shot.judged[i]) continue
        const ball = ballPosition(k.goal, shot, this.flow.elapsed)
        // A soft halo keeps the approaching ball visible over the camera picture.
        this.g.fillStyle(0xffe14d, 0.15 + ball.progress * 0.2)
        this.g.fillCircle(ball.x, ball.y, ball.r * 1.8)
        drawFootball(this.g, ball.x, ball.y, ball.r)
      }
    })
  }
}
