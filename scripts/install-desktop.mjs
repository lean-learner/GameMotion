// Adds GameMotion to this Linux desktop: app menu / dock entry and a desktop
// icon, launching a stable copy of the AppImage.
//
//   npm run install:desktop      (after `npm run release`)
//   npm run uninstall:desktop
//
// Windows and macOS don't need this: the Windows installer creates Start menu and
// desktop shortcuts, and on macOS the app is dragged to Applications.
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = homedir()
const uninstall = process.argv.includes('--uninstall')

if (process.platform !== 'linux') {
  console.log(
    'Only needed on Linux. Windows: use the installer (it adds shortcuts). macOS: drag GameMotion to Applications.'
  )
  process.exit(0)
}

const tryRun = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

const dataHome = process.env.XDG_DATA_HOME || join(home, '.local', 'share')
const desktopDir = tryRun('xdg-user-dir', ['DESKTOP']) || join(home, 'Desktop')
const paths = {
  app: join(home, 'Applications', 'GameMotion.AppImage'),
  icon: join(dataHome, 'icons', 'hicolor', '512x512', 'apps', 'gamemotion.png'),
  menuEntry: join(dataHome, 'applications', 'gamemotion.desktop'),
  desktopIcon: join(desktopDir, 'GameMotion.desktop')
}

if (uninstall) {
  for (const p of Object.values(paths)) rmSync(p, { force: true })
  tryRun('update-desktop-database', [join(dataHome, 'applications')])
  console.log(
    'GameMotion removed from the app menu and desktop. (Scores in ~/.config/gamemotion are kept.)'
  )
  process.exit(0)
}

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const name = `GameMotion-${version}-linux-x86_64.AppImage`
const source = [join(root, 'release', version, name), join(root, 'dist', name)].find(existsSync)
if (!source) {
  console.error(`${name} not found. Build it first: npm run release`)
  process.exit(1)
}

// A stable copy, so the shortcut survives rebuilding or moving the project.
for (const p of Object.values(paths)) mkdirSync(dirname(p), { recursive: true })
copyFileSync(source, paths.app)
chmodSync(paths.app, 0o755)
copyFileSync(join(root, 'resources', 'icon.png'), paths.icon)

const entry = [
  '[Desktop Entry]',
  'Type=Application',
  'Name=GameMotion',
  'GenericName=Motion games',
  'Comment=Play motion games with your body and a webcam, fully offline',
  `Exec="${paths.app}" %U`,
  'Icon=gamemotion',
  'Terminal=false',
  'Categories=Game;',
  'Keywords=game;motion;webcam;fitness;party;',
  // Electron sets this window class from package.json "desktopName", so the dock
  // links the running window to this entry.
  'StartupWMClass=gamemotion',
  ''
].join('\n')
writeFileSync(paths.menuEntry, entry)
writeFileSync(paths.desktopIcon, entry)
chmodSync(paths.desktopIcon, 0o755)
// The desktop-icons extension only launches desktop files marked as trusted.
tryRun('gio', ['set', paths.desktopIcon, 'metadata::trusted', 'true'])
tryRun('update-desktop-database', [join(dataHome, 'applications')])
tryRun('gtk-update-icon-cache', ['-q', '-t', join(dataHome, 'icons', 'hicolor')])

console.log(`GameMotion ${version} installed for this user:
  app        ${paths.app}
  app menu   ${paths.menuEntry}   (search "GameMotion"; right-click it in the dock to pin)
  desktop    ${paths.desktopIcon}  (double-click to start)
Remove with: npm run uninstall:desktop`)
