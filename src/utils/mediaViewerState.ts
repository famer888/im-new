export const MEDIA_VIEWER_STORAGE_KEY = 'media_viewer_state'
const MEDIA_VIEWER_CHANNEL = 'media_viewer_state_channel'

export type MediaViewerType = 'image' | 'video' | 'file'
export type MediaViewerFileKind = 'excel' | 'pdf' | 'docx'

export interface MediaViewerPayload {
  title: string
  mediaType: MediaViewerType
  src: string
  fileKind?: MediaViewerFileKind
  filePath?: string | null
  width?: number
  height?: number
  duration?: number
  cover?: string
  size?: number
  originalUrl?: string
  fileKey?: string
  fileName?: string
  mimeType?: string
  channelId?: string
  /** 预览窗为独立 Webview，频道限制状态由主窗口打开时写入，不依赖预览窗内 store。 */
  saveRestricted?: boolean
  timestamp: number
}

type Listener = (payload: MediaViewerPayload | null) => void

function parsePayload(raw: string | null): MediaViewerPayload | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as MediaViewerPayload
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.src || !parsed.mediaType) return null
    return parsed
  } catch {
    return null
  }
}

class MediaViewerState {
  private listeners = new Set<Listener>()
  private channel: BroadcastChannel | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.handleStorage)
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel(MEDIA_VIEWER_CHANNEL)
        this.channel.addEventListener('message', this.handleBroadcast)
      }
    }
  }

  private handleStorage = (event: StorageEvent) => {
    if (event.key !== MEDIA_VIEWER_STORAGE_KEY) return
    const payload = parsePayload(event.newValue)
    this.listeners.forEach((listener) => listener(payload))
  }

  private handleBroadcast = (event: MessageEvent) => {
    const payload = parsePayload(JSON.stringify(event.data ?? null))
    this.listeners.forEach((listener) => listener(payload))
  }

  get(): MediaViewerPayload | null {
    if (typeof window === 'undefined') return null
    return parsePayload(window.localStorage.getItem(MEDIA_VIEWER_STORAGE_KEY))
  }

  send(payload: Omit<MediaViewerPayload, 'timestamp'>) {
    if (typeof window === 'undefined') return
    const nextPayload: MediaViewerPayload = {
      ...payload,
      timestamp: Date.now(),
    }
    window.localStorage.setItem(MEDIA_VIEWER_STORAGE_KEY, JSON.stringify(nextPayload))
    // Tauri 多窗口里 storage 事件偶尔不到达已打开的预览窗口；广播通道确保连续打开文件时不会沿用上一份预览数据。
    this.channel?.postMessage(nextPayload)
    this.listeners.forEach((listener) => listener(nextPayload))
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const mediaViewerState = new MediaViewerState()
