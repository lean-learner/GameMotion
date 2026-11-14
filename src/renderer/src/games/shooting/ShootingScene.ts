import type Phaser from 'phaser'
import type { Vec2 } from '../../input/types'
import { CameraGameScene } from '../CameraGameScene'
import type { StageTheme } from '../cameraStage'
import type { BodyInput } from '../poses'
import type { RoundFlow } from '../roundFlow'
import type { Sfx } from '../sfx'
import type { GameServices } from '../types'
import { drawHit, drawTarget } from './art'
import { ShootingLogic, rangeView, targetAt } from './logic'

const RANGE: StageTheme = {
  top: 0x0d293a,
  bottom: 0x42643c,
  accent: 0xffd34d,
  cameraDim: 0.08,
  motif: (g, x, y, s) => drawTarget(g, x, y, 23 * s)
}

export class ShootingScene extends CameraGameScene {
  private readonly logic = new ShootingLogic()
  private g!: Phaser.GameObjects.Graphics
  private prompts: Phaser.GameObjects.Text[] = []
  private cards: Phaser.GameObjects.Text[] = []
  private bodies: (BodyInput | null)[] = []

  constructor(services: GameServices, sfx: Sfx, autostart = false) {
    super(services, sfx, autostart, {
      id: 'shooting',
      title: 'Target Shooting',
      theme: RANGE,
      help: [
        'Face the camera  ·  Point with either hand to aim',
        'Move that hand to aim  ·  Hold steady while the ring fills to shoot',
        'Make a finger gun if you like  ·  Lower your hand between shots'
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
      this.label(this.duo ? 23 : 28)
        .setPosition(this.duo ? 320 + i * 640 : 640, 620)
        .setDepth(30)
    )
    this.cards = this.players.map((_, i) =>
      this.label(24).setPosition(rangeView(i, this.players.length).x, 125).setDepth(30)
    )
  }
  protected begin(now: number): void {
    this.logic.start(now, this.players.length)
  }
  protected scores(): number[] {
    return this.logic.scores()
  }
  protected hudLine(player: number): string {
    const a = this.logic.shooters[player]
    return `${this.duo ? this.players[player].name + ' ' : ''}${a.score} · Round ${a.round + 1}/10`
  }
  protected resultLine(): string {
    return this.logic.shooters
      .map(
        (a, i) =>
          `${this.duo ? this.players[i].name + ': ' : ''}${a.score}/300 · ${a.results.filter((s) => s === 10).length} bullseyes`
      )
      .join('\n')
  }
  protected step(now: number): void {
    this.bodies = this.players.map((_, i) => this.bodyInput(i, now))
    const inputs = this.bodies.map((body, i) => {
      const hands = this.services.input.hands(now, i)
      const px = (p: Vec2 | null): Vec2 | null => p && { x: p.x * 1280, y: p.y * 720 }
      return { body, hands: { left: px(hands.left), right: px(hands.right) } }
    })
    for (const e of this.logic.update(now, inputs)) {
      if (e.type === 'ready') this.sfx.note(330, 0.08)
      else if (e.type === 'fire') this.sfx.pop(3)
      else if (e.type === 'round') this.sfx.beep(true)
      else if (e.type === 'hit') {
        if (e.score === 10) this.sfx.chime()
        else if (e.score > 0) this.sfx.pop()
        else this.sfx.buzz()
        const v = rangeView(e.player, this.players.length)
        this.floatText(
          v.x,
          510,
          e.score ? `+${e.score}` : 'Miss',
          e.score === 10 ? '#ffd34d' : '#ffffff',
          42
        )
      }
    }
  }
  protected draw(): void {
    const g = this.g
    g.clear()
    const shown = ['playing', 'countdown', 'paused'].includes(this.flow.phase)
    this.logic.shooters.forEach((a, i) => {
      const v = rangeView(i, this.players.length)
      const point = (p: Vec2): Vec2 => ({ x: v.x + p.x * v.scale, y: v.y + p.y * v.scale })
      this.cards[i].setText(
        shown
          ? `Shots ${a.shots.length}/3  ·  ${a.shots.map((shot) => shot.score || '–').join('  ') || '· · ·'}`
          : ''
      )
      let prompt = ''
      if (shown) {
        if (a.phase === 'done') prompt = 'Finished!'
        else if (a.phase !== 'aim' && a.aiming.mustLower)
          prompt = 'Lower your hand for the next shot'
        else if (a.phase === 'aim')
          prompt = a.aiming.trackingLost
            ? 'Keep your aiming hand in view'
            : a.aiming.mustLower
              ? 'Lower your hand · Then raise it for the next shot'
              : !a.aiming.side
                ? 'Face the camera · Raise either hand'
                : !a.aiming.ready
                  ? 'Hold briefly to ready…'
                  : `Aim · Hold steady to shoot ${Math.round(a.aiming.hold * 100)}%`
      }
      this.prompts[i].setText(prompt)
      if (!shown) return
      const target = targetAt(a.round, this.flow.elapsed)
      const centre = point(target)
      drawTarget(g, centre.x, centre.y, target.r * v.scale)
      for (const shot of a.shots) {
        const hit = shot.offset
          ? { x: target.x + shot.offset.x, y: target.y + shot.offset.y }
          : shot.hit
        drawHit(g, point(hit), this.colorOf(i))
      }
      if (a.phase === 'settle' && this.flow.elapsed - a.since < 160) {
        const last = a.shots[a.shots.length - 1]
        if (last) {
          const p = point(
            last.offset ? { x: target.x + last.offset.x, y: target.y + last.offset.y } : last.hit
          )
          g.lineStyle(4, 0xffe780, 1)
          g.strokeCircle(p.x, p.y, 16 + (this.flow.elapsed - a.since) / 8)
          for (let ray = 0; ray < 6; ray++) {
            const angle = (ray * Math.PI) / 3
            g.lineBetween(
              p.x + Math.cos(angle) * 13,
              p.y + Math.sin(angle) * 13,
              p.x + Math.cos(angle) * 27,
              p.y + Math.sin(angle) * 27
            )
          }
        }
      }
      if (a.phase !== 'aim' || !a.aiming.side) return
      const sight = point(a.aiming.aim)
      g.lineStyle(3, a.aiming.hold > 0 ? 0x7cff6b : 0xffffff, 1)
      g.strokeCircle(sight.x, sight.y, 12)
      if (a.aiming.hold > 0) {
        g.lineStyle(5, 0x7cff6b, 1)
        g.beginPath()
        g.arc(sight.x, sight.y, 23, -Math.PI / 2, -Math.PI / 2 + a.aiming.hold * Math.PI * 2, false)
        g.strokePath()
      }
      g.lineBetween(sight.x - 20, sight.y, sight.x + 20, sight.y)
      g.lineBetween(sight.x, sight.y - 20, sight.x, sight.y + 20)
      g.fillStyle(0x081320, 0.8)
      g.fillRoundedRect(v.x - 90, 495, 180, 15, 7)
      g.fillStyle(a.aiming.ready ? 0x7cff6b : 0xffd34d, 1)
      g.fillRoundedRect(
        v.x - 90,
        495,
        180 * (a.aiming.ready ? a.aiming.hold : a.aiming.charge),
        15,
        7
      )
      const hand = this.bodies[i]?.hands[a.aiming.side]
      if (hand) {
        g.lineStyle(3, this.colorOf(i), 0.9)
        g.strokeCircle(hand.x, hand.y, 20)
      }
    })
  }
}
