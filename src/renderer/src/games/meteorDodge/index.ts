import type { GameModule } from '../types'

/** Meteor Dodge. Phaser and the scene load only when the game starts. */
export const meteorDodge: GameModule = {
  id: 'meteor-dodge',
  title: 'Meteor Dodge',
  async mount(parent, services, options = {}) {
    const [{ default: Phaser }, { MeteorDodgeScene }, { Sfx }] = await Promise.all([
      import('phaser'),
      import('./MeteorDodgeScene'),
      import('../sfx')
    ])
    const sfx = new Sfx()
    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent,
      backgroundColor: '#050816',
      banner: false,
      audio: { noAudio: true },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1280,
        height: 720
      },
      scene: new MeteorDodgeScene(services, sfx, options.autostart ?? false)
    })
    return () => {
      game.destroy(true)
      sfx.close()
    }
  }
}
