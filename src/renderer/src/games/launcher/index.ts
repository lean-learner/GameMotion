import type { LauncherServices } from '../types'

/** Mounts the launcher (Phaser loads lazily). Resolves to a function that stops it. */
export async function mountLauncher(
  parent: HTMLElement,
  services: LauncherServices
): Promise<() => void> {
  const [{ default: Phaser }, { LauncherScene }] = await Promise.all([
    import('phaser'),
    import('./LauncherScene')
  ])
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    backgroundColor: '#0c0c0c',
    banner: false,
    audio: { noAudio: true },
    // Fills the window at the screen's own resolution; the scene scales its layout (fillScreen).
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || 1280,
      height: parent.clientHeight || 720
    },
    scene: new LauncherScene(services)
  })
  return () => game.destroy(true)
}
