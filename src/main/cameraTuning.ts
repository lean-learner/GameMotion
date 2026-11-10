import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

/**
 * Temporary, game-only camera tuning on Linux (UVC webcams via v4l2-ctl).
 *
 * Problem: many webcams (e.g. Logitech C270) lengthen exposure in indoor light
 * and drop to 15-20 fps. Turning off `exposure_dynamic_framerate` keeps them at
 * 30 fps; the camera compensates with gain and the app brightens the picture.
 *
 * Rule: the change exists only while GameMotion is using the camera. The
 * previous value is saved before changing anything and restored when tracking
 * stops, the camera disconnects or the app quits. A recovery file restores it
 * on the next launch if the app crashed.
 */
const CONTROL = 'exposure_dynamic_framerate'
const LOCKED_VALUE = 0
const SYS_V4L = '/sys/class/video4linux'
const run = promisify(execFile)

export type TuningStatus =
  { applied: true; device: string; previous: number } | { applied: false; reason: string }

interface Saved {
  device: string
  control: string
  previous: number
}

/** Parses `v4l2-ctl -C name` output, e.g. "exposure_dynamic_framerate: 1". */
export function parseControlValue(output: string, control: string): number | null {
  const m = output.match(new RegExp(`^\\s*${control}:\\s*(-?\\d+)\\s*$`, 'm'))
  return m ? Number(m[1]) : null
}

/**
 * Finds the /dev/videoN capture node for a camera label as Chromium reports
 * it, e.g. "C270 HD WEBCAM (046d:0825)" -> sysfs name "C270 HD WEBCAM".
 * Only the primary node (index 0) of each device is considered; secondary
 * nodes are metadata streams.
 */
export function findDeviceForLabel(label: string, sysRoot = SYS_V4L): string | null {
  const wanted = label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '').trim()
  if (!wanted) return null
  let entries: string[]
  try {
    entries = readdirSync(sysRoot).filter((e) => /^video\d+$/.test(e))
  } catch {
    return null
  }
  entries.sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
  for (const entry of entries) {
    try {
      const name = readFileSync(join(sysRoot, entry, 'name'), 'utf8').trim()
      const indexFile = join(sysRoot, entry, 'index')
      const index = existsSync(indexFile) ? readFileSync(indexFile, 'utf8').trim() : '0'
      if (name === wanted && index === '0') return `/dev/${entry}`
    } catch {
      // unreadable entry: skip
    }
  }
  return null
}

export class CameraTuning {
  private saved: Saved | null = null
  /** Lock and restore run strictly in order (e.g. a fast stop -> start). */
  private queue: Promise<unknown> = Promise.resolve()

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task)
    this.queue = next.catch(() => undefined)
    return next
  }

  constructor(
    private readonly recoveryFile: string,
    private readonly sysRoot = SYS_V4L
  ) {}

  /** Restores a value left behind by a previous run that crashed. */
  recoverFromCrash(): void {
    if (!existsSync(this.recoveryFile)) return
    try {
      const saved = JSON.parse(readFileSync(this.recoveryFile, 'utf8')) as Saved
      if (/^\/dev\/video\d+$/.test(saved.device) && saved.control === CONTROL) {
        this.saved = saved
        this.restoreSync()
        console.log(`[camera-tuning] restored ${CONTROL} on ${saved.device} after unclean exit`)
      }
    } catch (err) {
      console.warn('[camera-tuning] could not read recovery file:', err)
    }
    rmSync(this.recoveryFile, { force: true })
  }

  lockFrameRate(label: string): Promise<TuningStatus> {
    return this.serial(() => this.doLock(label))
  }

  restore(): Promise<void> {
    return this.serial(() => this.doRestore())
  }

  private async doLock(label: string): Promise<TuningStatus> {
    if (process.platform !== 'linux') return { applied: false, reason: 'only supported on Linux' }
    if (this.saved)
      return { applied: true, device: this.saved.device, previous: this.saved.previous }
    const device = findDeviceForLabel(label, this.sysRoot)
    if (!device) return { applied: false, reason: 'no matching V4L2 device' }

    let previous: number | null
    try {
      const { stdout } = await run('v4l2-ctl', ['-d', device, '-C', CONTROL])
      previous = parseControlValue(stdout, CONTROL)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      return {
        applied: false,
        reason:
          code === 'ENOENT' ? 'v4l2-ctl not installed (v4l-utils)' : 'camera has no such control'
      }
    }
    if (previous === null) return { applied: false, reason: 'camera has no such control' }

    // Save first, so a crash between "set" and "restore" is recoverable.
    this.saved = { device, control: CONTROL, previous }
    writeFileSync(this.recoveryFile, JSON.stringify(this.saved))
    try {
      if (previous !== LOCKED_VALUE) {
        await run('v4l2-ctl', ['-d', device, '-c', `${CONTROL}=${LOCKED_VALUE}`])
      }
    } catch (err) {
      this.clearSaved()
      return { applied: false, reason: `could not set control: ${(err as Error).message}` }
    }
    console.log(`[camera-tuning] ${device}: ${CONTROL} ${previous} -> ${LOCKED_VALUE}`)
    return { applied: true, device, previous }
  }

  private async doRestore(): Promise<void> {
    const saved = this.saved
    if (!saved) return
    try {
      if (saved.previous !== LOCKED_VALUE) {
        await run('v4l2-ctl', ['-d', saved.device, '-c', `${saved.control}=${saved.previous}`])
      }
      console.log(`[camera-tuning] ${saved.device}: ${saved.control} restored to ${saved.previous}`)
    } catch (err) {
      // Device unplugged: the camera resets its controls itself on replug.
      console.warn(
        `[camera-tuning] restore failed (${(err as Error).message}); camera resets on replug`
      )
    }
    this.clearSaved()
  }

  /** Synchronous restore for app shutdown, where async work may not finish. */
  restoreSync(): void {
    const saved = this.saved
    if (!saved) return
    try {
      if (saved.previous !== LOCKED_VALUE) {
        execFileSync('v4l2-ctl', ['-d', saved.device, '-c', `${saved.control}=${saved.previous}`], {
          timeout: 2000
        })
      }
      console.log(`[camera-tuning] ${saved.device}: ${saved.control} restored to ${saved.previous}`)
    } catch {
      console.warn('[camera-tuning] restore on exit failed; camera resets on replug')
    }
    this.clearSaved()
  }

  private clearSaved(): void {
    this.saved = null
    rmSync(this.recoveryFile, { force: true })
  }
}
