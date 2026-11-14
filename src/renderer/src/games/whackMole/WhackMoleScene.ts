import type Phaser from 'phaser'
import { CameraGameScene } from '../CameraGameScene'
import type { StageTheme } from '../cameraStage'
import type { BodyInput } from '../poses'
import type { RoundFlow } from '../roundFlow'
import type { Sfx } from '../sfx'
import type { GameServices } from '../types'
import { allowedHoles, FRAME, holeSpot, LEVELS, WhackMoleLogic, type GameEvent } from './logic'
import { drawHedgehog, drawHole, drawMole } from './moleArt'

/** The surround: a garden, with molehills and tufts of grass. */
const GARDEN: StageTheme = {
  top: 0x3b2a1a,
  bottom: 0x8fbf5a,
  accent: 0xf4e285,
  motif: (g, x, y, s, index) => {
    if (index % 2 === 0) {
      g.fillStyle(0x6b4423, 0.8)
      g.fillEllipse(x, y, 60 * s, 30 * s)
      g.fillStyle(0x2b1a0e, 0.8)
      g.fillEllipse(x, y - 6 * s, 26 * s, 12 * s)
      return
    }
    g.lineStyle(4 * s, 0x2d6a4f, 0.8)
    g.lineBetween(x, y + 14 * s, x - 12 * s, y - 14 * s)
    g.lineBetween(x, y + 14 * s, x, y - 20 * s)
    g.lineBetween(x, y + 14 * s, x + 12 * s, y - 14 * s)
  }
}
const MALLET = 0xb5651d

/** Whack-a-Mole, played over the camera view: moles pop out of holes to the left, right and below each player; whack them with a hand, but not the hedgehogs. Five levels, each faster. Rules live in WhackMoleLogic. */
export class WhackMoleScene extends CameraGameScene {
  private readonly logic = new WhackMoleLogic()
  private inputs: (BodyInput | null)[] = []
  private g!: Phaser.GameObjects.Graphics
  private mallets!: Phaser.GameObjects.Graphics
  private splats: { x: number; y: number; r: number; at: number; color: number }[] = []

  constructor(services: GameServices, sfx: Sfx, autostart = false) {
    super(services, sfx, autostart, {
      id: 'whack-mole',
      title: 'Whack-a-Mole',
      theme: GARDEN,
      help: [
        'Whack each mole before it hides  ·  Golden moles are worth more',
        'Five levels, faster each time  ·  Leave the hedgehogs alone'
      ]
    })
  }

  protected get flow(): RoundFlow {
    return this.logic.flow
  }

  protected build(): void {
    this.logic.prepare(this.players.length)
    this.g = this.add.graphics().setDepth(16)
    this.mallets = this.add.graphics().setDepth(18)
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
    return `Level ${this.logic.level()}/${LEVELS}  ·  ${Math.ceil(this.logic.remaining() / 1000)}s`
  }

  protected resultLine(): string {
    const line = (i: number): string => {
      const p = this.logic.players[i]
      const hogs = p.ouches > 0 ? `  ·  ${p.ouches} hedgehog${p.ouches > 1 ? 's' : ''} hit` : ''
      return `${p.score} points  ·  ${p.hits} moles  ·  best run ${p.bestCombo}${hogs}`
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
      case 'pop':
        this.sfx.note(e.gold ? 880 : 330, 0.08)
        break
      case 'hit':
        this.sfx.pop(e.gold ? 3 : 1)
        if (e.gold) this.sfx.bonus()
        this.splats.push({
          x: e.x,
          y: e.y,
          r: (this.inputs[e.player]?.sw ?? 170) * 0.5,
          at: now,
          color: e.gold ? 0xffe14d : 0xffffff
        })
        this.floatText(
          e.x,
          e.y - 30,
          e.gold ? `Gold! +${e.points}` : `+${e.points}`,
          e.gold ? '#ffe14d' : this.cssColorOf(e.player),
          e.gold ? 40 : 34
        )
        break
      case 'peek':
        this.sfx.note(196, 0.12)
        break
      case 'ouch':
        this.sfx.buzz()
        this.splats.push({
          x: e.x,
          y: e.y,
          r: (this.inputs[e.player]?.sw ?? 170) * 0.5,
          at: now,
          color: 0xe63946
        })
        this.floatText(e.x, e.y - 30, e.points > 0 ? `Ouch! -${e.points}` : 'Ouch!', '#ff6b6b', 38)
        break
      case 'level':
        this.sfx.chime()
        this.floatText(
          FRAME.width / 2,
          FRAME.height * 0.42,
          e.level === LEVELS ? 'Final level!' : `Level ${e.level}`,
          '#f4e285',
          72
        )
        break
      case 'miss':
        this.floatText(e.x, e.y - 20, 'Too slow', '#c9c9c9', 26)
        break
    }
  }

  protected draw(now: number): void {
    const g = this.g
    const m = this.mallets
    g.clear()
    m.clear()
    if (this.flow.phase !== 'playing') return

    // Every hole a player can reach, then the moles that are out.
    this.logic.bodies.forEach((body, i) => {
      if (!body) return
      for (const h of allowedHoles(i, this.players.length))
        drawHole(g, holeSpot(body, h.edge, h.lane), h.edge, this.colorOf(i))
    })
    for (const mole of this.logic.moles) {
      const spot = this.logic.spot(mole)
      if (!spot) continue
      if (mole.decoy) drawHedgehog(g, spot, mole.edge, this.logic.shown(mole))
      else drawMole(g, spot, mole.edge, this.logic.shown(mole), mole.gold)
    }

    // A ring bursting out where a mole was whacked.
    this.splats = this.splats.filter((s) => now - s.at < 320)
    for (const s of this.splats) {
      const k = (now - s.at) / 320
      g.lineStyle(8 * (1 - k), s.color, 1 - k)
      g.strokeCircle(s.x, s.y, s.r * (0.5 + k))
    }

    // A mallet head on every hand the camera sees.
    this.inputs.forEach((body, i) => {
      if (!body) return
      const r = body.sw * 0.22
      for (const side of ['left', 'right'] as const) {
        const hand = body.hands[side]
        if (!hand) continue
        m.fillStyle(MALLET, 0.9)
        m.fillRoundedRect(hand.x - r, hand.y - r * 0.7, r * 2, r * 1.4, r * 0.3)
        m.lineStyle(4, this.colorOf(i), 1)
        m.strokeRoundedRect(hand.x - r, hand.y - r * 0.7, r * 2, r * 1.4, r * 0.3)
      }
    })
  }
}
