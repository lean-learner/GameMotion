import type { GameModule } from '../types'

/** Sky Catch. Phaser and the scene load only when the game starts. */
export const skyCatch: GameModule = {
  id: 'sky-catch',
  title: 'Sky Catch',
  cameraView: true,
  async mount(parent, services, options = {}) {
    const [{ default: Phaser }, { SkyCatchScene }, { Sfx }] = await Promise.all([
      import('phaser'),
      import('./SkyCatchScene'),
      import('../sfx')
    ])
    const sfx = new Sfx()
    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent,
      transparent: true, // the camera picture shows through, behind the canvas
      banner: false,
      audio: { noAudio: true },
      // Fills the window; the scene scales its 16:9 frame and decorates the rest (CameraStage).
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: parent.clientWidth || 1280,
        height: parent.clientHeight || 720
      },
      scene: new SkyCatchScene(services, sfx, options.autostart ?? false)
    })
    return () => {
      game.destroy(true)
      sfx.close()
    }
  }
}
