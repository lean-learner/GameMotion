// Builds GameMotion for this computer's OS and collects the results, with
// checksums and install instructions, in release/<version>/.
//
//   npm run release
//
// Linux also builds the portable Windows zip (no Wine needed; its .exe has no
// embedded icon). Full Windows installers and macOS disk images are built on
// those systems, or by the GitHub Actions workflow (.github/workflows/build.yml).
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version, productName = 'GameMotion' } = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8')
)
const name = 'GameMotion'
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' })

const builds = {
  linux: ['--linux', '--win zip -c.win.signAndEditExecutable=false'],
  win32: ['--win'],
  darwin: ['--mac']
}[process.platform]
if (!builds) throw new Error(`No release build defined for ${process.platform}`)

run('npm run build')
for (const args of builds) run(`npx electron-builder ${args} --publish never`)

const out = join(root, 'release', version)
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const artifacts = readdirSync(join(root, 'dist')).filter(
  (f) => f.startsWith(`${name}-${version}-`) && /\.(exe|zip|dmg|AppImage|tar\.gz|deb)$/.test(f)
)
const sums = []
for (const f of artifacts) {
  copyFileSync(join(root, 'dist', f), join(out, f))
  const hash = createHash('sha256')
    .update(readFileSync(join(out, f)))
    .digest('hex')
  sums.push(`${hash}  ${f}`)
}
writeFileSync(join(out, 'SHA256SUMS.txt'), sums.join('\n') + '\n')
copyFileSync(join(root, 'INSTALL.md'), join(out, 'INSTALL.md'))

console.log(`\n${productName} ${version} -> ${out}`)
for (const f of [...artifacts, 'SHA256SUMS.txt', 'INSTALL.md']) {
  const mb = statSync(join(out, f)).size / 1e6
  console.log(`  ${f.padEnd(48)} ${mb >= 1 ? mb.toFixed(0) + ' MB' : '<1 MB'}`)
}
