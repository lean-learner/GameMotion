import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CameraTuning, findDeviceForLabel, parseControlValue } from '../src/main/cameraTuning'
import { displayGain } from '../src/renderer/src/camera/brightness'

/** Fake /sys/class/video4linux with a C270 (capture + metadata node) and another camera. */
function fakeSysfs(root: string): void {
  const nodes: [string, string, string][] = [
    ['video0', 'C270 HD WEBCAM', '0'],
    ['video1', 'C270 HD WEBCAM', '1'],
    ['video2', 'Integrated Camera', '0']
  ]
  for (const [node, name, index] of nodes) {
    mkdirSync(join(root, node), { recursive: true })
    writeFileSync(join(root, node, 'name'), name + '\n')
    writeFileSync(join(root, node, 'index'), index + '\n')
  }
}

describe('parseControlValue', () => {
  it('reads the value printed by v4l2-ctl -C', () => {
    expect(parseControlValue('exposure_dynamic_framerate: 1\n', 'exposure_dynamic_framerate')).toBe(
      1
    )
    expect(parseControlValue('gain: 32', 'exposure_dynamic_framerate')).toBeNull()
  })
})

describe('findDeviceForLabel', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gm-sysfs-'))
    fakeSysfs(root)
  })

  it('maps a Chromium camera label to its primary capture node', () => {
    expect(findDeviceForLabel('C270 HD WEBCAM (046d:0825)', root)).toBe('/dev/video0')
    expect(findDeviceForLabel('Integrated Camera (04f2:b6dd)', root)).toBe('/dev/video2')
  })

  it('returns null for fake or unknown cameras', () => {
    expect(findDeviceForLabel('/tmp/clip.y4m', root)).toBeNull()
    expect(findDeviceForLabel('fake_device_0', root)).toBeNull()
    expect(findDeviceForLabel('', root)).toBeNull()
  })
})

describe('CameraTuning (with a fake v4l2-ctl)', () => {
  let dir: string
  let sys: string
  let state: string
  let recovery: string
  const oldPath = process.env.PATH

  const value = (): number => Number(readFileSync(state, 'utf8'))

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gm-tuning-'))
    sys = join(dir, 'sys')
    fakeSysfs(sys)
    state = join(dir, 'value')
    recovery = join(dir, 'recovery.json')
    writeFileSync(state, '1') // camera starts with dynamic frame rate ON
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    // Fake v4l2-ctl: "-C ctrl" prints the stored value, "-c ctrl=v" stores v.
    writeFileSync(
      join(bin, 'v4l2-ctl'),
      `#!/bin/sh
case "$3" in
  -C) echo "$4: $(cat '${state}')" ;;
  -c) echo "\${4#*=}" > '${state}' ;;
esac
`
    )
    chmodSync(join(bin, 'v4l2-ctl'), 0o755)
    process.env.PATH = `${bin}:${oldPath}`
  })

  afterEach(() => {
    process.env.PATH = oldPath
  })

  it('locks only while in use and restores the previous value', async () => {
    const t = new CameraTuning(recovery, sys)
    const r = await t.lockFrameRate('C270 HD WEBCAM (046d:0825)')
    expect(r).toEqual({ applied: true, device: '/dev/video0', previous: 1 })
    expect(value()).toBe(0)
    expect(existsSync(recovery)).toBe(true)

    await t.restore()
    expect(value()).toBe(1)
    expect(existsSync(recovery)).toBe(false)
  })

  it('keeps a fast stop -> start in order', async () => {
    const t = new CameraTuning(recovery, sys)
    await t.lockFrameRate('C270 HD WEBCAM (046d:0825)')
    const restored = t.restore()
    const relocked = t.lockFrameRate('C270 HD WEBCAM (046d:0825)')
    await Promise.all([restored, relocked])
    expect(value()).toBe(0) // still locked for the new session
    await t.restore()
    expect(value()).toBe(1)
  })

  it('restores the setting on next launch after a crash', async () => {
    await new CameraTuning(recovery, sys).lockFrameRate('C270 HD WEBCAM (046d:0825)')
    expect(value()).toBe(0) // "crash": never restored
    new CameraTuning(recovery, sys).recoverFromCrash()
    expect(value()).toBe(1)
    expect(existsSync(recovery)).toBe(false)
  })

  it('does nothing for a camera it cannot identify', async () => {
    const t = new CameraTuning(recovery, sys)
    const r = await t.lockFrameRate('fake_device_0')
    expect(r.applied).toBe(false)
    expect(value()).toBe(1)
    expect(existsSync(recovery)).toBe(false)
  })

  it('reports a missing v4l2-ctl instead of failing', async () => {
    process.env.PATH = '/nonexistent'
    const r = await new CameraTuning(recovery, sys).lockFrameRate('C270 HD WEBCAM (046d:0825)')
    expect(r).toEqual({ applied: false, reason: 'v4l2-ctl not installed (v4l-utils)' })
  })
})

describe('displayGain', () => {
  it('brightens dark frames, never darkens, and caps the boost', () => {
    expect(displayGain(55)).toBeCloseTo(2)
    expect(displayGain(200)).toBe(1)
    expect(displayGain(5)).toBe(2.5)
    expect(displayGain(0)).toBe(1)
  })
})
