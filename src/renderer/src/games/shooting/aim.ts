import type { Side, Vec2 } from '../../input/types'
import type { BodyInput } from '../poses'

export interface ShooterInput {
  body: BodyInput | null
  hands?: Record<Side, Vec2 | null>
}
export interface Release {
  aim: Vec2
}
export const READY_MS = 350
export const HOLD_MS = 1200
export const TRACKING_GRACE_MS = 350
const clamp = (n: number): number => Math.max(-1.5, Math.min(1.5, n))

/** Face-forward, one-hand aiming. A visible steady hold fires once per raised hand. */
export class AimDetector {
  side: Side | null = null
  ready = false
  charge = 0
  hold = 0
  mustLower = false
  aim: Vec2 = { x: 0, y: 0 }
  trackingLost = false
  private previous: number | null = null
  private lastSeen: number | null = null
  private readyTime = 0
  private holdTime = 0
  private stableAim: Vec2 | null = null
  private anchor: Vec2 | null = null
  private reference: { y: number; sw: number } | null = null
  private blockedSide: Side | null = null

  reset(): void {
    this.side = null
    this.ready = false
    this.charge = 0
    this.hold = 0
    this.mustLower = false
    this.aim = { x: 0, y: 0 }
    this.trackingLost = false
    this.previous = null
    this.lastSeen = null
    this.readyTime = 0
    this.holdTime = 0
    this.stableAim = null
    this.anchor = null
    this.reference = null
    this.blockedSide = null
  }

  update(t: number, input: ShooterInput): Release | null {
    let dt = this.previous === null ? 0 : Math.max(0, Math.min(100, t - this.previous))
    this.previous = t
    const body = input.body
    const hands = input.hands ?? body?.hands
    if (this.mustLower) {
      const hand = hands?.[this.blockedSide!]
      // Missing tracking never counts as lowering the arm.
      if (hand && this.reference && hand.y > this.reference.y + this.reference.sw * 0.65)
        this.reset()
      return null
    }
    if (!this.side && body && body.sw > 0 && hands) {
      const raised = (side: Side): boolean => {
        const h = hands[side]
        return (
          !!h &&
          h.y <= body.y + body.sw * 0.2 &&
          h.y >= body.y - body.sw * 1.5 &&
          Math.abs(h.x - body.x) <= body.sw * 1.4
        )
      }
      this.side = raised('right') ? 'right' : raised('left') ? 'left' : null
      if (this.side) this.reference = { y: body.y, sw: body.sw }
    }
    const hand = this.side && hands?.[this.side]
    if (!hand || !this.reference) {
      this.trackingLost = true
      this.holdTime = 0
      this.hold = 0
      this.stableAim = null
      if (this.lastSeen !== null && t - this.lastSeen > TRACKING_GRACE_MS) this.reset()
      return null
    }
    if (this.lastSeen !== null && t - this.lastSeen > TRACKING_GRACE_MS) {
      this.reset()
      return null
    }
    if (this.trackingLost) dt = 0
    this.trackingLost = false
    this.lastSeen = t
    const { y, sw } = this.reference
    if (hand.y > y + sw * 0.65) {
      this.reset()
      return null
    }
    if (!this.ready) {
      this.readyTime += dt
      this.charge = Math.min(1, this.readyTime / READY_MS)
      this.anchor = { ...hand }
      if (this.charge === 1) this.ready = true
      return null
    }

    // Freeze the reference for this shot: shoulder width/position changes cannot move the sight.
    const target = {
      x: clamp(((hand.x - this.anchor!.x) / sw) * 1.8),
      y: clamp(((hand.y - this.anchor!.y) / sw) * 1.8)
    }
    const blend = 1 - Math.exp(-dt / 110)
    if (Math.abs(target.x - this.aim.x) > 0.025) this.aim.x += (target.x - this.aim.x) * blend
    if (Math.abs(target.y - this.aim.y) > 0.025) this.aim.y += (target.y - this.aim.y) * blend
    // Check raw movement too, so smoothing cannot hide a deliberate move and fire early.
    if (
      !this.stableAim ||
      Math.hypot(target.x - this.stableAim.x, target.y - this.stableAim.y) > 0.16
    ) {
      this.stableAim = { ...target }
      this.holdTime = 0
    } else this.holdTime += dt
    this.hold = Math.min(1, this.holdTime / HOLD_MS)
    if (this.hold < 1) return null
    const release = { aim: { ...this.aim } }
    const side = this.side
    const reference = this.reference
    this.reset()
    this.mustLower = true
    this.blockedSide = side
    this.reference = reference
    return release
  }
}
