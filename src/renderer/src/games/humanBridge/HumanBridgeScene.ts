import type Phaser from 'phaser'
import type { Side, Vec2 } from '../../input/types'
import { CameraGameScene, H, hearts, W } from '../CameraGameScene'
import type { StageTheme } from '../cameraStage'
import { drawFigure } from '../poseArt'
import { POSE_NAMES, type BodyInput } from '../poses'
import type { RoundFlow } from '../roundFlow'
import type { Sfx } from '../sfx'
import type { GameServices } from '../types'
import { HumanBridgeLogic, LIVES, type GameEvent, type Shape } from './logic'

/** The surround: sunset over a canyon, with bridge arches and clouds. */
const CANYON: StageTheme = {
  top: 0x5b2a86,
  bottom: 0xff8a3d,
  accent: 0xffc857,
  motif: (g, x, y, s, index) => {
    if (index % 3 === 0) {
      g.lineStyle(6 * s, 0xffe8b0, 0.55)
      g.beginPath()
      g.arc(x, y + 14 * s, 30 * s, Math.PI, 0)
      g.strokePath()
      g.lineBetween(x - 30 * s, y + 14 * s, x - 30 * s, y + 34 * s)
      g.lineBetween(x + 30 * s, y + 14 * s, x + 30 * s, y + 34 * s)
      return
    }
    g.fillStyle(0xffffff, 0.22)
    g.fillEllipse(x, y, 62 * s, 22 * s)
    g.fillEllipse(x + 22 * s, y - 10 * s, 40 * s, 20 * s)
  }
}

/** A body the wall is aimed at before the camera has seen that player. */
const fallback = (player: number, count: number): BodyInput => ({
  x: W * (count > 1 ? [0.3, 0.7][player] : 0.5),
  y: H * 0.42,
  sw: 170,
  hands: { left: null, right: null },
  crouching: false
})

/**
 * Human Bridge, played over the camera view. A wall slides towards the players
 * with a hole cut for each of them: strike the pose to fit through. Sometimes
 * the hole is a bridge, and the players must join hands in the middle.
 * A team game with one score. Rules live in HumanBridgeLogic.
 */
export class HumanBridgeScene extends CameraGameScene {
  private readonly logic = new HumanBridgeLogic()
  private inputs: (BodyInput | null)[] = []
  private wallG!: Phaser.GameObjects.Graphics
  private names: Phaser.GameObjects.Text[] = []

  constructor(services: GameServices, sfx: Sfx, autostart = false) {
    super(services, sfx, autostart, {
      id: 'human-bridge',
      title: 'Human Bridge',
      theme: CANYON,
      help: [
        'A wall is coming  ·  Strike the pose to fit through the hole',
        `Later walls come two and three deep  ·  Two players join hands for a bridge  ·  ${LIVES} crashes`
      ],
      team: true,
      usesDuck: true
    })
  }

  protected get flow(): RoundFlow {
    return this.logic.flow
  }

  protected build(): void {
    this.logic.prepare(this.players.length)
    this.wallG = this.add.graphics().setDepth(14)
    this.names = this.players.map(() => this.label(30).setDepth(21))
  }

  protected begin(now: number): void {
    this.logic.start(now, this.players.length)
  }

  protected scores(): number[] {
    return this.logic.scores()
  }

  protected hudLine(): string {
    return ''
  }

  /** One plate for the whole team. */
  protected centreLine(): string {
    const wall = this.logic.wall
    const deep = wall && wall.layers.length > 1 ? `   ${wall.layer + 1}/${wall.layers.length}` : ''
    return `${this.logic.score}   ${hearts(this.logic.lives, LIVES)}${deep}`
  }

  protected resultLine(): string {
    const walls = this.logic.passed
    return `${this.logic.score} points  ·  ${walls} ${walls === 1 ? 'wall' : 'walls'} passed`
  }

  protected step(now: number): void {
    this.inputs = this.players.map((_, i) => this.bodyInput(i, now))
    for (const e of this.logic.update(now, this.inputs)) this.onEvent(e)
  }

  private onEvent(e: GameEvent): void {
    if (e.type === 'wall') {
      this.sfx.swoosh()
    } else if (e.type === 'pass') {
      console.info(`[game] wall passed, streak ${e.streak}`)
      this.sfx.chime()
      this.stage.pulse(0x7cff6b, 0.3)
      this.floatText(
        W / 2,
        H * 0.4,
        e.layersLeft > 0
          ? `+${e.points}  ·  Next!`
          : e.streak > 1
            ? `+${e.points}  ·  ${e.streak} in a row!`
            : `+${e.points}`,
        '#7cff6b',
        52
      )
    } else {
      console.info(`[game] crash, ${e.livesLeft} lives left`)
      this.sfx.thud()
      this.stage.pulse(0xff3b3b, 0.45, 420)
      this.cameras.main.shake(220, 0.008)
      this.floatText(W / 2, H * 0.4, 'Crash!', '#ff6b6b', 64)
    }
  }

  protected draw(now: number): void {
    const g = this.wallG
    g.clear()
    for (const n of this.names) n.setText('')
    const wall = this.logic.wall
    if (!wall || this.flow.phase !== 'playing') return

    // The wall starts small in the distance and grows until it fills the frame.
    const p = this.logic.progress()
    const k = 0.22 + 0.78 * p * p
    const cx = W / 2
    const cy = H * 0.46
    const w = W * k
    const h = H * k
    const urgent = p > 0.75 && Math.floor(now / 120) % 2 === 0
    g.fillStyle(0x3a1f5c, 0.38 + 0.2 * p)
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 26 * k)
    g.lineStyle(8 * k + 2, urgent ? 0xffffff : CANYON.accent, 0.95)
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 26 * k)

    // Each player's hole: a figure that lands exactly on them as the wall arrives.
    const bodies = this.players.map((_, i) => this.inputs[i] ?? fallback(i, this.players.length))
    const order = bodies.map((b, i) => ({ b, i })).sort((a, b) => a.b.x - b.b.x)
    wall.shapes.forEach((shape, i) => {
      const body = bodies[i]
      const x = cx + (body.x - cx) * k
      const y = cy + (body.y - cy) * k
      const sw = body.sw * k
      const ok = this.logic.matching[i]
      const color = ok ? 0x7cff6b : 0xffffff
      const onLeft = order[0].i === i
      // A bridge is drawn as a standing figure whose inner hand reaches for the other player.
      const bridge = shape === 'bridge'
      const pose = bridge ? 'left-up' : shape
      const hands = bridge ? { ...REST_HANDS, ...bridgeHands(onLeft) } : {}
      // A dark cut-out with a bright edge, so it reads as a hole in the wall.
      drawFigure(g, x, y, sw, pose, { color: 0x000000, alpha: 0.55, weight: 0.42 }, hands)
      drawFigure(g, x, y, sw, pose, { color, alpha: 0.95, weight: 0.1 }, hands)
      // Under the name, what the layer behind this one will ask for.
      const then = wall.layers[wall.layer + 1]?.[i]
      this.names[i]
        .setText(then ? `${nameOf(shape)}\nthen ${nameOf(then).toLowerCase()}` : nameOf(shape))
        .setColor(ok ? '#7cff6b' : '#ffffff')
        .setFontSize(Math.max(18, 34 * k))
        .setPosition(x, Math.max(96, y - 1.75 * sw))
    })
    // A bridge wall is one shape for the whole team: name it once, in the middle.
    if (wall.shapes[0] === 'bridge' && this.names.length > 1) {
      this.names[1].setText('')
      this.names[0].setPosition(cx, Math.max(96, cy - h * 0.36))
    }
  }
}

const nameOf = (shape: Shape): string => (shape === 'bridge' ? 'Join hands!' : POSE_NAMES[shape])

/** Both hands down, the starting point for a bridge figure. */
const REST_HANDS: Record<Side, Vec2> = {
  left: { x: -0.75, y: 1.25 },
  right: { x: 0.75, y: 1.25 }
}

/** The inner hand reaches for the other player: the right hand of whoever is on the left. */
const bridgeHands = (onLeft: boolean): Partial<Record<Side, Vec2>> =>
  onLeft ? { right: { x: 1.9, y: -0.35 } } : { left: { x: -1.9, y: -0.35 } }
