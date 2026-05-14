import type { UnlistenFn } from '@tauri-apps/api/event'

type InvokeArgs = Record<string, unknown>
type BridgeListener<T = unknown> = (event: { payload: T }) => void

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
}

async function tauriInvoke<T = unknown>(command: string, args?: InvokeArgs): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

const listenerRegistry = new Map<string, UnlistenFn[]>()

async function listenWithRegistry<T = unknown>(channel: string, listener: BridgeListener<T>): Promise<UnlistenFn> {
  const { listen } = await import('@tauri-apps/api/event')
  const unlisten = await listen<T>(channel, listener)
  const listeners = listenerRegistry.get(channel) || []
  listeners.push(unlisten)
  listenerRegistry.set(channel, listeners)
  return () => {
    unlisten()
    const next = (listenerRegistry.get(channel) || []).filter((item) => item !== unlisten)
    if (next.length) {
      listenerRegistry.set(channel, next)
    } else {
      listenerRegistry.delete(channel)
    }
  }
}

async function removeAllChannelListeners(channel: string): Promise<void> {
  const listeners = listenerRegistry.get(channel) || []
  listeners.forEach((unlisten) => unlisten())
  listenerRegistry.delete(channel)
}

export const tauriElectronBridge = {
  isTauri: isTauriRuntime,

  ipcRenderer: {
    invoke: tauriInvoke,
    async send<T = unknown>(channel: string, payload?: T): Promise<void> {
      const { emit } = await import('@tauri-apps/api/event')
      await emit(channel, payload)
    },
    on: listenWithRegistry,
    async once<T = unknown>(channel: string, listener: BridgeListener<T>): Promise<UnlistenFn> {
      let dispose: UnlistenFn | null = null
      dispose = await listenWithRegistry<T>(channel, (event) => {
        dispose?.()
        listener(event)
      })
      return dispose
    },
    removeAllListeners: removeAllChannelListeners,
  },

  clipboard: {
    readText: () => tauriInvoke<string>('read_clipboard_text'),
    writeText: (text: string) => tauriInvoke<void>('write_clipboard_text', { text }),
    writeImage: (dataBase64: string) => tauriInvoke<void>('write_clipboard_image', { dataBase64 }),
    writeFile: (path: string) => tauriInvoke<void>('write_clipboard_file', { path }),
  },

  shell: {
    open: (target: string) => tauriInvoke<void>('open_in_browser', { target }),
    revealFileInDirectory: (path: string) => tauriInvoke<void>('reveal_file_in_directory', { path }),
  },

  dialog: {
    async open(options?: Parameters<typeof import('@tauri-apps/plugin-dialog').open>[0]) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      return open(options)
    },
    async save(options?: Parameters<typeof import('@tauri-apps/plugin-dialog').save>[0]) {
      const { save } = await import('@tauri-apps/plugin-dialog')
      return save(options)
    },
  },

  fs: {
    exists: (path: string) => tauriInvoke<boolean>('file_exists', { path }),
    copyFileOverwrite: (sourcePath: string, targetPath: string) =>
      tauriInvoke<void>('copy_file_overwrite', { sourcePath, targetPath }),
    async writeFile(path: string, contents: Uint8Array): Promise<void> {
      const { writeFile } = await import('@tauri-apps/plugin-fs')
      await writeFile(path, contents)
    },
  },

  path: {
    async appDataDir(): Promise<string> {
      const { appDataDir } = await import('@tauri-apps/api/path')
      return appDataDir()
    },
    async downloadDir(): Promise<string> {
      const { downloadDir } = await import('@tauri-apps/api/path')
      return downloadDir()
    },
    async join(...paths: string[]): Promise<string> {
      const { join } = await import('@tauri-apps/api/path')
      return join(...paths)
    },
  },

  windowControl: {
    async minimize(): Promise<void> {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().minimize()
    },
    async toggleMaximize(): Promise<void> {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const currentWindow = getCurrentWindow()
      if (await currentWindow.isMaximized()) {
        await currentWindow.unmaximize()
      } else {
        await currentWindow.maximize()
      }
    },
    async close(): Promise<void> {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
    },
    async setFocus(): Promise<void> {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().setFocus()
    },
  },

  process: {
    getPlatformInfo: () => tauriInvoke<{ os: string; arch: string; version: string }>('get_platform_info'),
  },
}

export type TauriElectronBridge = typeof tauriElectronBridge

declare global {
  interface Window {
    electronAPI?: TauriElectronBridge
  }
}

export function installTauriElectronBridge(): TauriElectronBridge {
  window.electronAPI = tauriElectronBridge
  return tauriElectronBridge
}

