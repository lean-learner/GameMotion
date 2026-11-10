import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Optional "start on login" for Linux desktops (GNOME, KDE, ...), via the XDG
 * autostart folder. Off by default: the file exists only while the user has
 * the setting on. Windows and macOS use Electron's login items instead (see
 * applyAutostart in index.ts).
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

/** Builds a .desktop entry for the given command line. */
export function desktopEntry(
  command: string[],
  kind: 'autostart' | 'launcher' = 'autostart'
): string {
  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=GameMotion',
    'Comment=Play motion games with your body and a webcam, fully offline',
    `Exec=${command.map(quote).join(' ')}`,
    'Icon=gamemotion',
    'Terminal=false'
  ]
  if (kind === 'autostart') lines.push('X-GNOME-Autostart-enabled=true')
  else {
    lines.push(
      'Categories=Game;',
      'Keywords=game;motion;webcam;fitness;party;',
      // Electron sets this window class from package.json "desktopName", so the
      // dock links the running window to this entry.
      'StartupWMClass=gamemotion'
    )
  }
  return lines.join('\n') + '\n'
}

function dataHome(): string {
  return process.env['XDG_DATA_HOME'] || join(homedir(), '.local', 'share')
}

/** Where the Linux app-menu entry, desktop icon and icon file go. */
export function shortcutPaths(desktopDir: string): {
  menuEntry: string
  desktopIcon: string
  icon: string
} {
  return {
    menuEntry: join(dataHome(), 'applications', 'gamemotion.desktop'),
    desktopIcon: join(desktopDir, 'GameMotion.desktop'),
    icon: join(dataHome(), 'icons', 'hicolor', '512x512', 'apps', 'gamemotion.png')
  }
}

export function hasShortcuts(desktopDir: string): boolean {
  const p = shortcutPaths(desktopDir)
  return existsSync(p.menuEntry) || existsSync(p.desktopIcon)
}

/**
 * Adds GameMotion to the Linux app menu (and dock search) and puts an icon on
 * the desktop, launching `command`. The caller marks the desktop file trusted.
 */
export function installShortcuts(
  command: string[],
  iconFile: string,
  desktopDir: string
): string[] {
  const p = shortcutPaths(desktopDir)
  for (const f of [p.menuEntry, p.desktopIcon, p.icon]) mkdirSync(dirname(f), { recursive: true })
  copyFileSync(iconFile, p.icon)
  const entry = desktopEntry(command, 'launcher')
  writeFileSync(p.menuEntry, entry)
  writeFileSync(p.desktopIcon, entry)
  chmodSync(p.desktopIcon, 0o755)
  return [p.menuEntry, p.desktopIcon]
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
