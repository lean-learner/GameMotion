import { contextBridge, ipcRenderer } from 'electron'

// Narrow bridge: versions, camera tuning, profiles/scores/settings, quit and
// guided-test reports. Each call maps to one validated handler; no generic IPC.
contextBridge.exposeInMainWorld('gameMotion', {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome
  },
  platform: process.platform,
  store: {
    get: () => ipcRenderer.invoke('store:get'),
    setActiveSlot: (slot: number) => ipcRenderer.invoke('store:set-active-slot', slot),
    renameSlot: (slot: number, name: string) => ipcRenderer.invoke('store:rename-slot', slot, name),
    setReach: (slot: number, reach: unknown) => ipcRenderer.invoke('store:set-reach', slot, reach),
    recordScore: (game: string, score: number, slot?: number) =>
      ipcRenderer.invoke('store:record-score', game, score, slot),
    setSettings: (change: {
      startFullscreen?: boolean
      autostart?: boolean
      camera?: { deviceId: string; label: string } | null
    }) => ipcRenderer.invoke('settings:set', change)
  },
  quit: () => ipcRenderer.invoke('app:quit'),
  exitFullscreen: () => ipcRenderer.invoke('app:exit-fullscreen'),
  shortcuts: {
    status: () => ipcRenderer.invoke('app:shortcuts-status'),
    install: () => ipcRenderer.invoke('app:install-shortcuts')
  },
  testReport: {
    save: (json: string) => ipcRenderer.invoke('test-report:save', json)
  },
  cameraTuning: {
    lockFrameRate: (cameraLabel: string) => ipcRenderer.invoke('camera-tuning:lock', cameraLabel),
    restore: () => ipcRenderer.invoke('camera-tuning:restore')
  }
})
