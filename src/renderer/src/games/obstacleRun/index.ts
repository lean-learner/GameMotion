import type { GameModule } from '../types'

/** Obstacle Run. Phaser and the scene load only when the game starts. */
export const obstacleRun: GameModule = {
  id: 'obstacle-run',
  title: 'Obstacle Run',
  cameraView: true,
  async mount(parent, services, options = {}) {
    const [{ default: Phaser }, { ObstacleRunScene }, { Sfx }] = await Promise.all([
      import('phaser'),
      import('./ObstacleRunScene'),
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
      scene: new ObstacleRunScene(services, sfx, options.autostart ?? false)
    })
    return () => {
      game.destroy(true)
      sfx.close()
    }
  }
}
