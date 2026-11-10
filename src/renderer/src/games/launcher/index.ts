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
    backgroundColor: '#10213f',
    banner: false,
    audio: { noAudio: true },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1280,
      height: 720
    },
    scene: new LauncherScene(services)
  })
  return () => game.destroy(true)
}
