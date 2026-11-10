import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Optional "start on login" for Ubuntu/GNOME, via the XDG autostart folder.
 * Off by default: the file exists only while the user has the setting on.
 */
export function autostartFile(): string {
  const configHome = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config')
  return join(configHome, 'autostart', 'gamemotion.desktop')
}

export function isAutostartEnabled(): boolean {
  return process.platform === 'linux' && existsSync(autostartFile())
}

/** Quotes one argument for a .desktop Exec line. */
function quote(arg: string): string {
  return /^[A-Za-z0-9_/.:=+-]+$/.test(arg) ? arg : `"${arg.replace(/(["`$\\])/g, '\\$1')}"`
}

/** Builds the .desktop entry for the given command line. */
export function desktopEntry(command: string[]): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=GameMotion',
    'Comment=Local motion games with your webcam',
    `Exec=${command.map(quote).join(' ')}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    ''
  ].join('\n')
}

/**
 * @param command how to launch this app: the AppImage path when packaged as
 *   one, otherwise the Electron binary (plus the app folder in development).
 */
export function setAutostart(enabled: boolean, command: string[]): void {
  if (process.platform !== 'linux') throw new Error('Auto-start is only supported on Linux')
  const file = autostartFile()
  if (!enabled) {
    rmSync(file, { force: true })
    return
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, desktopEntry(command))
}
