export const MEDIA_VIEWER_STORAGE_KEY = 'media_viewer_state'

export type MediaViewerType = 'image' | 'video' | 'file'
export type MediaViewerFileKind = 'excel'

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

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.handleStorage)
    }
  }

  private handleStorage = (event: StorageEvent) => {
    if (event.key !== MEDIA_VIEWER_STORAGE_KEY) return
    const payload = parsePayload(event.newValue)
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
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const mediaViewerState = new MediaViewerState()
