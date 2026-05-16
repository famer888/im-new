<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { convertFileSrc, invoke as tauriInvoke } from '@tauri-apps/api/core'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { ensureGroupRelKey } from '@/utils/e2ee'
import { mediaViewerState } from '@/utils/mediaViewerState'
import { getMediaWindowBounds } from '@/utils/mediaWindowSize'
import { eventBus } from '@/utils/eventBus'

const props = defineProps<{
  message: Message
}>()

const authStore = useAuthStore()
const messageStore = useMessageStore()
const isLoaded = ref(false)
const loadError = ref(false)
const activeThumbSrc = ref('')
const showPreview = ref(false)
const previewVideoSrc = ref('')
const previewVideoElRef = ref<HTMLVideoElement | null>(null)
const previewVideoPlaying = ref(false)
const previewVideoCurrentTime = ref(0)
const previewVideoDuration = ref(0)
const previewVideoVolume = ref(1)
const previewVideoMuted = ref(false)
const videoOpening = ref(false)
const videoPreparingForDrag = ref(false)
const localVideoPath = ref('')
const thumbElRef = ref<HTMLImageElement | null>(null)
let downloadToken = 0
let videoOpenToken = 0
let coverToken = 0
let pendingVideoLocalFilePromise: Promise<string> | null = null
let stopDownloadEvents: Array<() => void> = []
let stopVideoDownloadEvents: Array<() => void> = []
let nativeDragStartPoint: { x: number; y: number } | null = null
let nativeDragStarted = false
let suppressNextClick = false
const NATIVE_DRAG_THRESHOLD = 4
const MAX_CACHED_VIDEO_COVER_DATA_URL_BYTES = 512 * 1024

function videoMessageIdForCache(): string {
  return safeName(props.message.id || props.message.customMsgId || `${props.message.conversationId || 'video'}-${props.message.sendTime || ''}`)
}

interface VideoContent {
  url: string
  thumbUrl: string
  name: string
  localPath: string
  mimeType: string
  duration: number
  width: number
  height: number
  size: number
  fileKey: string
}

function videoStreamLog(message: string, data?: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info') {
  const payload = data || {}
  console.warn(`[video-stream] ${message}`, payload)
  if (!(window as any).__TAURI_INTERNALS__) return
  void tauriInvoke('image_send_log', {
    payload: {
      level,
      message: `[video-stream] ${message}`,
      data: payload,
    },
  }).catch(() => {})
}

function isLikelyBase64ImagePayload(value: string): boolean {
  const raw = value.trim()
  if (!raw || raw.length < 32 || raw.length % 4 !== 0) return false
  if (/^(https?:|blob:|file:|asset:|tauri:|\/)/i.test(raw)) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return false
  return /^(iVBORw0KGgo|\/9j\/|R0lGOD|UklGR|Qk|AAAAIGZ0eXBhdmlm|PD94bWw|PHN2Z)/.test(raw)
}

function normalizeImageSrc(value: unknown, mimeType?: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^data:image\//i.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  if (isLikelyBase64ImagePayload(raw)) {
    const mime = String(mimeType || 'image/jpeg').trim() || 'image/jpeg'
    return `data:${mime};base64,${raw}`
  }
  return raw
}

function normalizeVideoUrl(value: unknown): string {
  const raw = String(value || '').trim()
  if (raw.startsWith('//')) return `https:${raw}`
  return raw
}

function parseLegacyVideo(raw: string): VideoContent {
  const [head = '', duration = '0', size = '0', width = '0', height = '0'] = raw.split('||')
  const [url = '', thumbUrl = ''] = head.split('*P')
  return {
    url: normalizeVideoUrl(url),
    thumbUrl: normalizeImageSrc(thumbUrl),
    duration: Number(duration || 0) || 0,
    width: Number(width || 0) || 0,
    height: Number(height || 0) || 0,
    size: Number(size || 0) || 0,
    name: '',
    localPath: '',
    mimeType: '',
    fileKey: '',
  }
}

const videoData = computed<VideoContent>(() => {
  const raw = String(props.message.content || '').trim()
  if (!raw) {
    return { url: '', thumbUrl: '', name: '', localPath: '', mimeType: '', duration: 0, width: 0, height: 0, size: 0, fileKey: '' }
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const url = normalizeVideoUrl(parsed.url || parsed.fileUrl || parsed.path || '')
    const localPath = String(
      parsed.local ||
      parsed.localPath ||
      parsed.local_path ||
      parsed.filePath ||
      parsed.file_path ||
      '',
    ).trim()
    const thumbUrl = normalizeImageSrc(
      parsed.thumbUrl || parsed.thumbnailUrl || parsed.thumbnail || parsed.cover || '',
      parsed.thumbMimeType || parsed.thumb_mime_type || parsed.mimeType || parsed.mime,
    )
    return {
      url,
      thumbUrl,
      name: String(parsed.name || parsed.fileName || parsed.file_name || '').trim(),
      localPath,
      mimeType: String(parsed.mimeType || parsed.mime_type || parsed.mime || '').trim(),
      duration: Number(parsed.duration || 0) || 0,
      width: Number(parsed.width || 0) || 0,
      height: Number(parsed.height || 0) || 0,
      size: Number(parsed.size || parsed.fileSize || 0) || 0,
      fileKey: String(parsed.fileKey || parsed.file_key || '').trim(),
    }
  } catch {
    return parseLegacyVideo(raw)
  }
})

const extraData = computed((): Record<string, any> => {
  const raw = props.message.extra
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, any>
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
})

const fileKey = computed(() =>
  String(
    videoData.value.fileKey ||
    extraData.value.fileKey ||
    extraData.value.file_key ||
    '',
  ).trim(),
)
const attachmentKey = computed(() =>
  String(extraData.value.attachmentKey || extraData.value.attachment_key || '').trim(),
)
const extraLocalVideoPath = computed(() =>
  String(
    extraData.value.local ||
    extraData.value.localPath ||
    extraData.value.local_path ||
    extraData.value.filePath ||
    extraData.value.file_path ||
    '',
  ).trim(),
)
const localThumbSrc = computed(() => ensureMediaSrc(normalizeImageSrc(
  extraData.value.localThumbDataUrl ||
  extraData.value.local_thumb_data_url ||
  extraData.value.localThumbPath ||
  extraData.value.local_thumb_path ||
  extraData.value.localThumbUrl ||
  extraData.value.local_thumb_url ||
  '',
)))
const groupId = computed(() => {
  const extraGroupId = String(extraData.value.groupId || '').trim()
  if (extraGroupId) return extraGroupId
  const convId = props.message.conversationId || ''
  return convId.startsWith('1_') ? convId.split('_')[1] || '' : ''
})
const localVideoSourcePath = computed(() => {
  if (extraLocalVideoPath.value) return fileUrlToLocalPath(extraLocalVideoPath.value)
  if (videoData.value.localPath) return fileUrlToLocalPath(videoData.value.localPath)
  if (isLocalFilePath(videoData.value.url)) return fileUrlToLocalPath(videoData.value.url)
  return ''
})
const dragFileName = computed(() =>
  ensureVideoFileExtension(
    pathFileName(localVideoPath.value) ||
      getVideoFileName(videoData.value.url, videoData.value.name, localVideoSourcePath.value),
    videoData.value.url || localVideoPath.value || localVideoSourcePath.value,
  ),
)
const isRemoteThumb = computed(() => /^https?:\/\//i.test(videoData.value.thumbUrl))
const showLoading = computed(() =>
  !activeThumbSrc.value &&
  !localThumbSrc.value &&
  !loadError.value &&
  Boolean(videoData.value.thumbUrl),
)
const videoBoxStyle = computed(() => {
  const width = videoData.value.width
  const height = videoData.value.height
  const ratio = width > 0 && height > 0 ? width / height : 1
  const boxWidth = Math.min(400, Math.max(1, Math.round(150 * ratio)))
  return {
    width: `${boxWidth}px`,
  }
})

function cleanupDownloadEvents() {
  stopDownloadEvents.forEach(stop => stop())
  stopDownloadEvents = []
}

function cleanupVideoDownloadEvents() {
  stopVideoDownloadEvents.forEach(stop => stop())
  stopVideoDownloadEvents = []
}

function markLoadedIfImageAlreadyComplete() {
  nextTick(() => {
    requestAnimationFrame(() => {
      const img = thumbElRef.value
      if (!img || !activeThumbSrc.value || loadError.value) return
      if (img.complete && img.naturalWidth > 0) {
        isLoaded.value = true
      }
    })
  })
}

function useLocalThumbFallback(): boolean {
  const fallback = localThumbSrc.value
  if (!fallback) return false
  loadError.value = false
  isLoaded.value = false
  activeThumbSrc.value = fallback
  markLoadedIfImageAlreadyComplete()
  return true
}

function safeName(name: string): string {
  return name.replace(/[^\w.-]/g, '_') || 'video-thumb'
}

function safeFileName(name: string, fallback = 'video.mp4'): string {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\0/g, '')
    .trim() || fallback
}

function pathFileName(path: string): string {
  const raw = String(path || '').trim()
  if (!raw) return ''
  return safeFileName(raw.split(/[\\/]/).pop() || '')
}

function isLocalFilePath(src: string): boolean {
  const raw = String(src || '').trim()
  if (!raw || /^(https?|blob|data|asset|tauri):/i.test(raw)) return false
  return /^file:/i.test(raw) || raw.startsWith('/') || /^[A-Za-z]:[\\/]/.test(raw)
}

function fileUrlToLocalPath(src: string): string {
  const raw = String(src || '').trim()
  if (!/^file:/i.test(raw)) return raw
  try {
    const parsed = new URL(raw)
    let pathname = decodeURIComponent(parsed.pathname.replace(/\+/g, ' '))
    if (/^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1)
    return pathname
  } catch {
    return raw.replace(/^file:\/\/?/i, '')
  }
}

function decodedUrlFileName(url: string): string {
  const cleanUrl = String(url || '').split('?')[0].split('#')[0]
  const rawName = cleanUrl.split(/[\\/]/).pop() || ''
  try {
    return decodeURIComponent(rawName)
  } catch {
    return rawName
  }
}

function getVideoFileName(url: string, explicitName = '', localPath = ''): string {
  const explicit = safeFileName(explicitName, '')
  if (explicit) {
    return ensureVideoFileExtension(explicit, url || localPath)
  }
  const localName = pathFileName(localPath)
  if (localName) return ensureVideoFileExtension(localName, localPath || url)
  const urlName = safeFileName(decodedUrlFileName(url), '')
  if (urlName) {
    return ensureVideoFileExtension(urlName, url)
  }
  return `video${videoExt(url)}`
}

function ensureMediaSrc(src: string): string {
  const raw = String(src || '').trim()
  if (!raw) return ''
  if (/^(https?|asset|blob|data):/i.test(raw)) return raw
  if (/^file:/i.test(raw)) {
    const localPath = fileUrlToLocalPath(raw)
    return (window as any).__TAURI_INTERNALS__ ? convertFileSrc(localPath) : raw
  }
  const normalized = raw.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith('/')) {
    return (window as any).__TAURI_INTERNALS__ ? convertFileSrc(normalized) : `file://${encodeURI(normalized)}`
  }
  return raw
}

function videoExt(url: string): string {
  const matched = String(url || '').split('?')[0].match(/\.(mp4|m4v|mov|webm|ogg|ogv|avi|mkv)$/i)
  return matched?.[0]?.toLowerCase() || '.mp4'
}

function ensureVideoFileExtension(fileName: string, source = ''): string {
  const name = safeFileName(fileName, 'video')
  if (/\.(mp4|m4v|mov|webm|ogg|ogv|avi|mkv)$/i.test(name)) return name
  return `${name}${videoExt(source)}`
}

function fallbackPlainFileKey(key: string): string {
  const raw = key.trim()
  if (!raw) return ''
  if (raw.length <= 32 || !/^[0-9a-f]+$/i.test(raw)) return raw
  return ''
}

async function resolveFileKey(): Promise<string> {
  if (fileKey.value) return fileKey.value
  const plainAttachmentKey = fallbackPlainFileKey(attachmentKey.value)
  if (plainAttachmentKey) return plainAttachmentKey
  if (!attachmentKey.value || !groupId.value) return ''

  try {
    if (authStore.uid) {
      await ensureGroupRelKey(String(authStore.uid), groupId.value)
    }
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('decrypt_group_incoming', {
      groupId: groupId.value,
      ciphertextHex: attachmentKey.value,
      msgType: 0,
    })
  } catch {
    return ''
  }
}

async function localFileExists(path: string): Promise<boolean> {
  if (!path || !(window as any).__TAURI_INTERNALS__) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<boolean>('file_exists', { path })
  } catch {
    return false
  }
}

async function getVideoCoverCachePath(): Promise<string> {
  if (!(window as any).__TAURI_INTERNALS__) return ''
  const { appDataDir, join } = await import('@tauri-apps/api/path')
  const baseDir = await appDataDir()
  return join(baseDir, 'video-cover-cache', `${videoMessageIdForCache()}.jpg`)
}

async function usePersistedVideoCoverCache(reason: string): Promise<boolean> {
  try {
    const cachePath = await getVideoCoverCachePath()
    void reason
    if (!cachePath) return false

    const exists = await localFileExists(cachePath)
    if (!exists) return false

    loadError.value = false
    isLoaded.value = false
    activeThumbSrc.value = ensureMediaSrc(cachePath)
    markLoadedIfImageAlreadyComplete()
    return true
  } catch {
    return false
  }
}

async function useCachedOrGenerateFirstFrameCover(reason: string) {
  const token = coverToken
  if (await usePersistedVideoCoverCache(reason)) return
  if (token !== coverToken) return
  void generateFirstFrameCover(reason)
}

async function downloadAndDecryptThumb() {
  const url = videoData.value.thumbUrl
  const key = await resolveFileKey()
  if (!url || !key) {
    activeThumbSrc.value = url || localThumbSrc.value
    markLoadedIfImageAlreadyComplete()
    return
  }

  const token = ++downloadToken
  cleanupDownloadEvents()
  useLocalThumbFallback()

  try {
    const [{ invoke }, { appDataDir, join }, { listen }] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/path'),
      import('@tauri-apps/api/event'),
    ])
    const baseDir = await appDataDir()
    const id = safeName(props.message.id || props.message.customMsgId || `${Date.now()}`)
    const savePath = await join(baseDir, 'video-thumb-cache', `${id}.jpg`)
    const doneEvent = `file:done:${id}`
    const errorEvent = `file:error:${id}`

    const unlistenDone = await listen<{ dataUrl?: string; data_url?: string }>(doneEvent, (event) => {
      if (token !== downloadToken) return
      cleanupDownloadEvents()
      const src = event.payload.dataUrl || event.payload.data_url || ''
      if (!src) {
        if (!useLocalThumbFallback()) {
          loadError.value = true
          isLoaded.value = true
        }
        return
      }
      loadError.value = false
      isLoaded.value = false
      activeThumbSrc.value = src
      markLoadedIfImageAlreadyComplete()
    })
    const unlistenError = await listen(errorEvent, () => {
      if (token !== downloadToken) return
      cleanupDownloadEvents()
      if (!useLocalThumbFallback()) {
        void useCachedOrGenerateFirstFrameCover('thumb-download-error')
      }
    })
    stopDownloadEvents = [unlistenDone, unlistenError]

    await invoke('download_file', {
      url,
      fileKey: key,
      savePath,
      msgId: id,
    })
  } catch {
    if (token !== downloadToken) return
    cleanupDownloadEvents()
    if (!useLocalThumbFallback()) {
      void useCachedOrGenerateFirstFrameCover('thumb-download-catch')
    }
  }
}

function openInlinePreview(src: string) {
  previewVideoSrc.value = ensureMediaSrc(src)
  resetInlinePreviewState()
  showPreview.value = true
  nextTick(() => {
    const video = previewVideoElRef.value
    if (!video) return
    video.volume = previewVideoVolume.value
    video.muted = previewVideoMuted.value
    void video.play().catch((error) => {
      console.warn('[video] inline preview play failed:', error)
    })
  })
}

function closeInlinePreview() {
  const video = previewVideoElRef.value
  if (video) video.pause()
  showPreview.value = false
  previewVideoSrc.value = ''
  resetInlinePreviewState()
}

function resetInlinePreviewState() {
  previewVideoPlaying.value = false
  previewVideoCurrentTime.value = 0
  previewVideoDuration.value = 0
  previewVideoVolume.value = 1
  previewVideoMuted.value = false
}

function syncInlinePreviewState() {
  const video = previewVideoElRef.value
  if (!video) return
  previewVideoCurrentTime.value = video.currentTime || 0
  previewVideoDuration.value = Number.isFinite(video.duration) ? video.duration : 0
  previewVideoVolume.value = video.volume
  previewVideoMuted.value = video.muted
  previewVideoPlaying.value = !video.paused && !video.ended
}

function formatPreviewVideoTime(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

async function toggleInlinePreviewPlayback() {
  const video = previewVideoElRef.value
  if (!video) return
  if (video.paused || video.ended) {
    try {
      await video.play()
    } catch (error) {
      console.warn('[video] inline preview play failed:', error)
    }
  } else {
    video.pause()
  }
  syncInlinePreviewState()
}

function handleInlinePreviewSeek(event: Event) {
  const video = previewVideoElRef.value
  if (!video || !previewVideoDuration.value) return
  const next = Number((event.target as HTMLInputElement).value)
  video.currentTime = (Math.min(100, Math.max(0, next)) / 100) * previewVideoDuration.value
  syncInlinePreviewState()
}

function toggleInlinePreviewMuted() {
  const video = previewVideoElRef.value
  if (!video) return
  video.muted = !video.muted
  syncInlinePreviewState()
}

function handleInlinePreviewVolume(event: Event) {
  const video = previewVideoElRef.value
  if (!video) return
  const nextVolume = Math.min(1, Math.max(0, Number((event.target as HTMLInputElement).value) / 100))
  video.volume = nextVolume
  video.muted = nextVolume === 0
  syncInlinePreviewState()
}

function requestInlinePreviewFullscreen() {
  const video = previewVideoElRef.value
  if (!video) return
  const requestFullscreen = video.requestFullscreen || (video as any).webkitEnterFullscreen
  if (typeof requestFullscreen === 'function') {
    requestFullscreen.call(video)
  }
}

async function openMediaWindow(pathOrUrl: string) {
  const target = String(pathOrUrl || '').trim()
  if (!target) return
  if (!(window as any).__TAURI_INTERNALS__) {
    openInlinePreview(target)
    return
  }
  if (/^blob:|^data:/i.test(target)) {
    openInlinePreview(target)
    return
  }

  const [{ invoke }, windowApi] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/window') as Promise<any>,
  ])
  const bounds = await getMediaWindowBounds(windowApi)

  mediaViewerState.send({
    title: '视频',
    mediaType: 'video',
    src: target,
    filePath: /^https?:/i.test(target) ? null : target,
    width: videoData.value.width || undefined,
    height: videoData.value.height || undefined,
    duration: videoData.value.duration || undefined,
    cover: activeThumbSrc.value || videoData.value.thumbUrl || '',
    size: videoData.value.size || undefined,
  })

  await invoke('open_media_window', {
    title: '视频',
    ...bounds,
  })
}

function downloadVideoToLocal(url: string, key: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const token = ++videoOpenToken
    cleanupVideoDownloadEvents()

    try {
      const [{ invoke }, { appDataDir, join }, { listen }] = await Promise.all([
        import('@tauri-apps/api/core'),
        import('@tauri-apps/api/path'),
        import('@tauri-apps/api/event'),
      ])
      const baseDir = await appDataDir()
      const id = `${safeName(props.message.id || props.message.customMsgId || `${Date.now()}`)}-video`
      const savePath = await join(baseDir, 'video-cache', id, getVideoFileName(url, videoData.value.name))
      const doneEvent = `file:done:${id}`
      const errorEvent = `file:error:${id}`

      const unlistenDone = await listen(doneEvent, () => {
        if (token !== videoOpenToken) return
        cleanupVideoDownloadEvents()
        localVideoPath.value = savePath
        resolve(savePath)
      })
      const unlistenError = await listen<{ error?: string }>(errorEvent, (event) => {
        if (token !== videoOpenToken) return
        cleanupVideoDownloadEvents()
        reject(new Error(event.payload?.error || '视频下载失败'))
      })
      stopVideoDownloadEvents = [unlistenDone, unlistenError]

      await invoke('download_file', {
        url,
        fileKey: key,
        savePath,
        msgId: id,
        logTag: 'video',
        emitDataUrl: false,
      })
    } catch (error) {
      if (token !== videoOpenToken) return
      cleanupVideoDownloadEvents()
      reject(error)
    }
  })
}

async function createEncryptedVideoStreamUrl(url: string, key: string): Promise<string> {
  const urlCandidates = getVideoUrlCandidates(url, videoData.value.name)
  videoStreamLog('create stream url start', {
    messageId: props.message.id || props.message.customMsgId || '',
    urlHead: url.slice(0, 120),
    keyLen: key.length,
    size: videoData.value.size || 0,
    mimeType: videoData.value.mimeType || '',
    name: videoData.value.name || '',
    candidateCount: urlCandidates.length,
    candidateHeads: urlCandidates.map(item => item.slice(0, 120)),
  })
  const { invoke } = await import('@tauri-apps/api/core')
  const result = await invoke<{ url: string }>('create_video_stream_url', {
    request: {
      url,
      urlCandidates,
      fileKey: key,
      mimeType: videoData.value.mimeType || '',
      size: videoData.value.size || 0,
      name: getVideoFileName(url, videoData.value.name),
    },
  })
  videoStreamLog('create stream url done', {
    messageId: props.message.id || props.message.customMsgId || '',
    streamUrl: result.url,
  })
  void probeEncryptedVideoStreamUrl(result.url)
  return result.url
}

function getVideoUrlCandidates(url: string, name = ''): string[] {
  const raw = String(url || '').trim()
  if (!raw || !/^https?:\/\//i.test(raw)) return []
  const candidates = [raw]
  const [withoutHash, hash = ''] = raw.split('#')
  const [base, query = ''] = withoutHash.split('?')
  const suffixFromName = videoExt(name)
  const hasVideoExt = /\.(mp4|m4v|mov|webm|ogg|ogv|avi|mkv)$/i.test(base)
  if (!hasVideoExt) {
    const suffixes = [suffixFromName, '.mp4', '.mov'].filter((item, index, list) => item && list.indexOf(item) === index)
    for (const suffix of suffixes) {
      candidates.push(`${base}${suffix}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`)
    }
  }
  return [...new Set(candidates)]
}

async function probeEncryptedVideoStreamUrl(streamUrl: string) {
  try {
    const response = await fetch(streamUrl, {
      headers: { Range: 'bytes=0-1023' },
      cache: 'no-store',
    })
    const bytes = await response.arrayBuffer()
    videoStreamLog('probe stream url done', {
      streamUrl,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      contentRange: response.headers.get('content-range') || '',
      bytes: bytes.byteLength,
    }, response.ok ? 'info' : 'warn')
  } catch (error) {
    videoStreamLog('probe stream url failed', {
      streamUrl,
      message: (error as Error)?.message || String(error),
    }, 'error')
  }
}

function captureVideoFirstFrame(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const source = ensureMediaSrc(src)
    if (!source) {
      reject(new Error('video source unavailable'))
      return
    }

    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    let settled = false
    let seekTimer = 0
    const timer = window.setTimeout(() => fail(new Error('video cover capture timeout')), 8000)

    const cleanup = () => {
      window.clearTimeout(timer)
      window.clearTimeout(seekTimer)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('loadeddata', handleFrameReady)
      video.removeEventListener('canplay', handleFrameReady)
      video.removeEventListener('seeked', handleFrameReady)
      video.removeEventListener('error', handleError)
      video.removeAttribute('src')
      video.load()
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    const finish = () => {
      if (settled) return
      const width = video.videoWidth || 0
      const height = video.videoHeight || 0
      if (!width || !height || video.readyState < 2) return

      settled = true
      const maxEdge = 720
      const scale = Math.min(1, maxEdge / Math.max(width, height))
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        cleanup()
        reject(new Error('video cover canvas unavailable'))
        return
      }

      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        cleanup()
        resolve(dataUrl)
      } catch (error) {
        cleanup()
        reject(error instanceof Error ? error : new Error('video cover capture failed'))
      }
    }

    const handleLoadedMetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      const targetTime = duration > 1 ? 0.1 : 0
      if (targetTime > 0) {
        try {
          video.currentTime = targetTime
          return
        } catch {
          // Some codecs do not allow seeking before enough data is buffered.
        }
      }
      seekTimer = window.setTimeout(finish, 80)
    }

    const handleFrameReady = () => {
      window.clearTimeout(seekTimer)
      seekTimer = window.setTimeout(finish, 80)
    }

    const handleError = () => fail(new Error('video cover source load failed'))

    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    if (/^https?:\/\//i.test(source)) video.crossOrigin = 'anonymous'
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('loadeddata', handleFrameReady)
    video.addEventListener('canplay', handleFrameReady)
    video.addEventListener('seeked', handleFrameReady)
    video.addEventListener('error', handleError)
    video.src = source
    video.load()
  })
}

function dataUrlByteLength(dataUrl: string): number {
  const base64 = String(dataUrl || '').split(',', 2)[1] || ''
  if (!base64) return 0
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding)
}

async function cacheGeneratedVideoCover(dataUrl: string) {
  if (!/^data:image\//i.test(dataUrl)) return
  if (localThumbSrc.value) return

  const bytes = dataUrlByteLength(dataUrl)
  if (bytes <= 0 || bytes > MAX_CACHED_VIDEO_COVER_DATA_URL_BYTES) {
    return
  }

  const messageId = props.message.id || props.message.customMsgId || ''
  if (!messageId) return

  let cachePath = ''
  try {
    cachePath = await getVideoCoverCachePath()
    if (cachePath && (window as any).__TAURI_INTERNALS__) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('save_base64_image', {
        filePath: cachePath,
        base64Data: dataUrl,
      })
    }
  } catch {
    // Disk cache is an optimization; the in-memory preview can still be used.
  }

  const nextExtra = {
    ...(extraData.value || {}),
    localThumbDataUrl: dataUrl,
    local_thumb_data_url: dataUrl,
    ...(cachePath ? { localThumbPath: cachePath, local_thumb_path: cachePath } : {}),
    videoCoverCachedAt: Date.now(),
  }
  messageStore.updateMessage(messageId, {
    extra: JSON.stringify(nextExtra),
  })
}

async function buildVideoCoverSources(): Promise<string[]> {
  const sources: string[] = []
  const localSource = localVideoSourcePath.value
  if (localSource && await localFileExists(localSource)) sources.push(localSource)
  if (localVideoPath.value && await localFileExists(localVideoPath.value)) sources.push(localVideoPath.value)

  const url = videoData.value.url
  if (!url) return [...new Set(sources)]
  if (/^(blob|data):/i.test(url) || isLocalFilePath(url)) {
    sources.push(url)
    return [...new Set(sources)]
  }

  const key = await resolveFileKey()
  const isEncryptedRemote = /^https?:\/\//i.test(url) && Boolean(key)
  if ((window as any).__TAURI_INTERNALS__ && isEncryptedRemote && videoData.value.size > 0) {
    sources.push(await createEncryptedVideoStreamUrl(url, key))
    return [...new Set(sources)]
  }

  if (/^https?:\/\//i.test(url)) {
    const candidates = getVideoUrlCandidates(url, videoData.value.name)
    sources.push(...candidates)
  }
  return [...new Set(sources)]
}

async function generateFirstFrameCover(reason = 'fallback') {
  const token = ++coverToken
  try {
    if (await usePersistedVideoCoverCache(`generate:${reason}`)) return
    if (token !== coverToken) return

    const sources = await buildVideoCoverSources()

    let lastError: unknown = null
    for (const source of sources) {
      try {
        const cover = await captureVideoFirstFrame(source)
        if (token !== coverToken) return
        loadError.value = false
        isLoaded.value = false
        activeThumbSrc.value = cover
        void cacheGeneratedVideoCover(cover)
        markLoadedIfImageAlreadyComplete()
        return
      } catch (error) {
        lastError = error
      }
    }

    if (token !== coverToken) return
    loadError.value = true
    isLoaded.value = true
    void lastError
  } catch (error) {
    if (token !== coverToken) return
    loadError.value = true
    isLoaded.value = true
    void error
  }
}

async function ensureVideoLocalFile(): Promise<string> {
  if (localVideoPath.value && await localFileExists(localVideoPath.value)) return localVideoPath.value

  const localSource = localVideoSourcePath.value
  if (localSource && await localFileExists(localSource)) {
    localVideoPath.value = localSource
    return localSource
  }

  const url = videoData.value.url
  if (!url || /^(blob|data):/i.test(url)) {
    throw new Error('视频文件还没有本地缓存')
  }

  const key = await resolveFileKey()
  const path = await downloadVideoToLocal(url, key)
  localVideoPath.value = path
  return path
}

function prepareVideoLocalFileForDrag() {
  if (!(window as any).__TAURI_INTERNALS__ || pendingVideoLocalFilePromise) return
  videoPreparingForDrag.value = true
  pendingVideoLocalFilePromise = ensureVideoLocalFile()
    .catch((error) => {
      console.warn('[video] prepare drag file failed:', error)
      return ''
    })
    .finally(() => {
      videoPreparingForDrag.value = false
      pendingVideoLocalFilePromise = null
    })
}

function getPreparedNativeDragPath(): string {
  const path = String(localVideoPath.value || localVideoSourcePath.value || '').trim()
  if (!path || /^(https?|blob|data):/i.test(path)) return ''
  return path
}

function cleanupNativeDragListeners() {
  window.removeEventListener('mousemove', handleNativeDragMouseMove, true)
  window.removeEventListener('mouseup', handleNativeDragMouseUp, true)
}

function showVideoPreparingToast() {
  eventBus.emit('show-toast', { message: '视频准备中，请稍后再拖拽' })
}

async function startNativeVideoFileDrag(filePath: string) {
  if (!(window as any).__TAURI_INTERNALS__ || !filePath) return

  try {
    await tauriInvoke('start_native_file_drag', { path: filePath })
  } catch (error) {
    console.warn('[video] native file drag failed:', error)
    eventBus.emit('show-toast', { message: '拖拽失败，请稍后重试' })
  } finally {
    window.setTimeout(() => {
      suppressNextClick = false
    }, 500)
  }
}

function handleNativeDragMouseMove(event: MouseEvent) {
  if (!nativeDragStartPoint || nativeDragStarted) return

  const dx = event.clientX - nativeDragStartPoint.x
  const dy = event.clientY - nativeDragStartPoint.y
  if (Math.hypot(dx, dy) < NATIVE_DRAG_THRESHOLD) return

  event.preventDefault()
  event.stopPropagation()
  nativeDragStarted = true
  suppressNextClick = true
  cleanupNativeDragListeners()
  nativeDragStartPoint = null

  const filePath = getPreparedNativeDragPath()
  if (filePath) {
    void startNativeVideoFileDrag(filePath)
    return
  }

  prepareVideoLocalFileForDrag()
  showVideoPreparingToast()
}

function handleNativeDragMouseUp() {
  nativeDragStartPoint = null
  nativeDragStarted = false
  cleanupNativeDragListeners()
}

function handleNativeDragMouseDown(event: MouseEvent) {
  if (event.button !== 0) return

  if (!(window as any).__TAURI_INTERNALS__) return

  event.preventDefault()
  nativeDragStartPoint = { x: event.clientX, y: event.clientY }
  nativeDragStarted = false
  cleanupNativeDragListeners()
  window.addEventListener('mousemove', handleNativeDragMouseMove, true)
  window.addEventListener('mouseup', handleNativeDragMouseUp, true)
}

function handleVideoClick(event: MouseEvent) {
  if (suppressNextClick) {
    event.preventDefault()
    event.stopPropagation()
    suppressNextClick = false
    return
  }
  void handleOpenVideo()
}

async function handleOpenVideo() {
  if (videoOpening.value) return
  const url = videoData.value.url
  const localSource = localVideoSourcePath.value
  if (!url && !localSource && !localVideoPath.value) return

  videoOpening.value = true
  try {
    videoStreamLog('open click', {
      messageId: props.message.id || props.message.customMsgId || '',
      hasUrl: Boolean(url),
      urlHead: url.slice(0, 120),
      size: videoData.value.size || 0,
      hasFileKey: Boolean(fileKey.value),
      hasAttachmentKey: Boolean(attachmentKey.value),
      localVideoPath: localVideoPath.value,
      localSource,
    })
    if (localVideoPath.value && await localFileExists(localVideoPath.value)) {
      videoStreamLog('open local cached file', { path: localVideoPath.value })
      await openMediaWindow(localVideoPath.value)
      return
    }

    if (localSource && await localFileExists(localSource)) {
      localVideoPath.value = localSource
      videoStreamLog('open local source file', { path: localSource })
      await openMediaWindow(localSource)
      return
    }

    const key = await resolveFileKey()
    const isEncryptedRemote = /^https?:\/\//i.test(url) && Boolean(key)
    videoStreamLog('open remote decision', {
      isTauri: Boolean((window as any).__TAURI_INTERNALS__),
      isEncryptedRemote,
      keyLen: key.length,
      size: videoData.value.size || 0,
      mimeType: videoData.value.mimeType || '',
    })
    if ((window as any).__TAURI_INTERNALS__ && isEncryptedRemote) {
      if (videoData.value.size > 0) {
        const streamUrl = await createEncryptedVideoStreamUrl(url, key)
        videoStreamLog('open stream media window', { streamUrl })
        await openMediaWindow(streamUrl)
        return
      }
      videoStreamLog('fallback full download because size missing', {
        messageId: props.message.id || props.message.customMsgId || '',
      }, 'warn')
      const path = await downloadVideoToLocal(url, key)
      await openMediaWindow(path)
      return
    }

    videoStreamLog('open direct url', { urlHead: url.slice(0, 120) })
    await openMediaWindow(url)
  } catch (error) {
    videoStreamLog('open failed', {
      message: (error as Error)?.message || String(error),
      stack: (error as Error)?.stack || '',
    }, 'error')
    console.warn('[video] open failed:', error)
  } finally {
    videoOpening.value = false
  }
}

watch([() => videoData.value.thumbUrl, fileKey, attachmentKey, localThumbSrc, localVideoSourcePath], async () => {
  downloadToken += 1
  videoOpenToken += 1
  coverToken += 1
  const token = coverToken
  pendingVideoLocalFilePromise = null
  cleanupDownloadEvents()
  cleanupVideoDownloadEvents()
  isLoaded.value = false
  loadError.value = false
  activeThumbSrc.value = ''
  localVideoPath.value = localVideoSourcePath.value
  const hasLocalFallback = useLocalThumbFallback()
  if (!hasLocalFallback && await usePersistedVideoCoverCache('watch-precheck')) return
  if (token !== coverToken) return
  if (!videoData.value.thumbUrl) {
    if (!hasLocalFallback) void useCachedOrGenerateFirstFrameCover('no-thumb-url')
    return
  }
  if ((fileKey.value || attachmentKey.value) && isRemoteThumb.value) {
    downloadAndDecryptThumb()
    return
  }
  activeThumbSrc.value = videoData.value.thumbUrl
  markLoadedIfImageAlreadyComplete()
}, { immediate: true })

function handleLoad() {
  isLoaded.value = true
}

function handleError() {
  if (activeThumbSrc.value !== localThumbSrc.value && useLocalThumbFallback()) return
  void useCachedOrGenerateFirstFrameCover('thumb-image-error')
}

onBeforeUnmount(() => {
  downloadToken += 1
  videoOpenToken += 1
  coverToken += 1
  pendingVideoLocalFilePromise = null
  closeInlinePreview()
  cleanupNativeDragListeners()
  cleanupDownloadEvents()
  cleanupVideoDownloadEvents()
})
</script>

<template>
  <div
    class="video-message"
    :class="{ preparing: videoPreparingForDrag }"
    :title="dragFileName"
    @click.stop="handleVideoClick"
    @mousedown.left="handleNativeDragMouseDown"
  >
    <div class="video-content" :style="videoBoxStyle">
      <div class="video-frame" :class="{ 'no-cover': !isLoaded || loadError || showLoading }">
        <img
          v-if="activeThumbSrc && !loadError"
          ref="thumbElRef"
          :src="activeThumbSrc"
          :data-local-path="localVideoPath || undefined"
          :class="{ loaded: isLoaded }"
          :alt="dragFileName"
          @load="handleLoad"
          @error="handleError"
        />
        <div v-if="showLoading" class="video-loading"></div>
        <div v-if="loadError" class="video-placeholder"></div>
        <div
          class="center-control"
          :class="{ opening: videoOpening, 'no-cover': !isLoaded || loadError || showLoading }"
          aria-hidden="true"
        >
          <div class="progress-ring">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <circle class="ring-bg" cx="24" cy="24" r="21" fill="none" stroke-width="2" />
              <circle class="ring-progress" cx="24" cy="24" r="21" fill="none" stroke-width="2" />
            </svg>
          </div>
          <div class="play-icon"></div>
        </div>
      </div> 
    </div>

    <Teleport to="body">
      <div v-if="showPreview" class="video-preview" @click="closeInlinePreview">
        <button class="preview-close" type="button" @click.stop="closeInlinePreview">×</button>
        <div class="video-preview-shell" @click.stop>
          <video
            ref="previewVideoElRef"
            :src="previewVideoSrc"
            autoplay
            playsinline
            preload="metadata"
            @click.stop="toggleInlinePreviewPlayback"
            @loadedmetadata="syncInlinePreviewState"
            @durationchange="syncInlinePreviewState"
            @timeupdate="syncInlinePreviewState"
            @play="syncInlinePreviewState"
            @pause="syncInlinePreviewState"
            @ended="syncInlinePreviewState"
            @volumechange="syncInlinePreviewState"
          ></video>
          <button
            v-if="!previewVideoPlaying"
            class="preview-overlaid-play"
            type="button"
            aria-label="Play"
            @click.stop="toggleInlinePreviewPlayback"
          >
            <span></span>
          </button>
          <div class="preview-video-controls" @click.stop>
            <button
              class="preview-control-btn preview-play-btn"
              type="button"
              :aria-label="previewVideoPlaying ? 'Pause' : 'Play'"
              @click="toggleInlinePreviewPlayback"
            >
              <span v-if="previewVideoPlaying" class="pause-glyph">
                <i></i>
                <i></i>
              </span>
              <span v-else class="play-glyph"></span>
            </button>
            <input
              class="preview-range preview-progress"
              type="range"
              min="0"
              max="100"
              step="0.1"
              :value="previewVideoDuration ? Math.min(100, Math.max(0, (previewVideoCurrentTime / previewVideoDuration) * 100)) : 0"
              :style="{ '--fill': `${previewVideoDuration ? Math.min(100, Math.max(0, (previewVideoCurrentTime / previewVideoDuration) * 100)) : 0}%` }"
              aria-label="Progress"
              @input="handleInlinePreviewSeek"
            />
            <span class="preview-video-time">
              {{ formatPreviewVideoTime(previewVideoCurrentTime) }} / {{ formatPreviewVideoTime(previewVideoDuration) }}
            </span>
            <button
              class="preview-control-btn preview-volume-btn"
              type="button"
              :aria-label="previewVideoMuted ? 'Unmute' : 'Mute'"
              @click="toggleInlinePreviewMuted"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9v6h4l5 4V5L8 9H4Z" />
                <path v-if="!previewVideoMuted && previewVideoVolume > 0" d="M16 8.5c1.2 1.2 1.2 5.8 0 7" />
                <path v-if="!previewVideoMuted && previewVideoVolume > 0.45" d="M18.5 6c2.4 2.4 2.4 9.6 0 12" />
                <path v-if="previewVideoMuted || previewVideoVolume === 0" d="M17 9l5 5m0-5-5 5" />
              </svg>
            </button>
            <input
              class="preview-range preview-volume"
              type="range"
              min="0"
              max="100"
              step="1"
              :value="previewVideoMuted ? 0 : Math.round(previewVideoVolume * 100)"
              :style="{ '--fill': `${previewVideoMuted ? 0 : Math.round(previewVideoVolume * 100)}%` }"
              aria-label="Volume"
              @input="handleInlinePreviewVolume"
            />
            <button
              class="preview-control-btn preview-fullscreen-btn"
              type="button"
              aria-label="Fullscreen"
              @click="requestInlinePreviewFullscreen"
            >
              <svg viewBox="0 0 18 18" aria-hidden="true">
                <path d="M10 3h3.6l-4 4L11 8.4l4-4V8h2V1h-7v2ZM7 9.6l-4 4V10H1v7h7v-2H4.4l4-4L7 9.6Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.video-message {
  position: relative;
  max-width: 400px;
  cursor: pointer;
  user-select: none;
  -webkit-user-drag: none;

  &.preparing {
    cursor: progress;
  }

  &:hover {
    opacity: 0.8;
  }
}

.video-content {
  position: relative;
  width: fit-content;
  height: 150px;
  max-width: 400px;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}

.video-frame {
  position: relative;
  width: 100%;
  height: 150px;
  border-radius: 6px;
  overflow: hidden;
  text-align: center;
  // background: #bababa;

  &.no-cover {
    width: 100%;
  }

  img {
    width: 100%;
    height: 100%;
    display: inline-block;
    object-fit: cover;
    opacity: 0;
    pointer-events: none;
    -webkit-user-drag: none;

    &.loaded {
      opacity: 1;
    }
  }
}

.video-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #b7bbc1, #8f949b);
}

.video-loading {
  position: absolute;
  inset: 0;
  pointer-events: none;
  // background: rgba(0, 0, 0, 0.27);
  z-index: 2;
}

.progress-ring {
  position: absolute;
  width: 48px;
  height: 48px;

  &::before {
    content: "";
    position: absolute;
    inset: 4px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 50%;
  }

  svg {
    position: relative;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .ring-bg {
    stroke: rgba(255, 255, 255, 0.3);
  }

  .ring-progress {
    stroke: #fff;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.2s ease;
  }

  &.spinning {
    animation: video-loading-spin 1.2s linear infinite;
  }
}

.center-control {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 13;
  width: 48px;
  height: 48px;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;

  .progress-ring {
    width: 48px;
    height: 48px;

    .ring-progress {
      stroke-dasharray: 132;
      stroke-dashoffset: 0;
    }
  }

  &.opening {
    .progress-ring {
      animation: video-loading-spin 1.2s linear infinite;
    }

    .ring-progress {
      stroke-dasharray: 40 92;
    }
  }

  &.no-cover:not(.opening) {
    .progress-ring {
      &::before {
        inset: 0;
        background: #b8b8b8;
      }

      svg {
        display: none;
      }
    }
  }
}

.play-icon {
  z-index: 14;
  width: 0;
  height: 0;
  margin-left: 3px;
  border-style: solid;
  border-width: 8px 0 8px 14px;
  border-color: transparent transparent transparent #fff;
}

.video-preview {
  position: fixed;
  inset: 0;
  z-index: 3200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.82);

  .video-preview-shell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 72px);
    background: rgba(0, 0, 0, 0.38);
    padding-bottom: 64px;
    box-sizing: border-box;
  }

  .video-preview-shell video {
    display: block;
    max-width: 100%;
    max-height: calc(100vh - 136px);
    width: auto;
    height: auto;
    object-fit: contain;
    outline: none;
  }
}

.preview-overlaid-play {
  position: absolute;
  left: 50%;
  top: calc(50% - 32px);
  z-index: 3;
  width: 56px;
  height: 56px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(123, 130, 255, 0.86);
  color: #fff;
  cursor: pointer;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.24);

  &:hover {
    background: rgba(123, 130, 255, 0.96);
  }

  span {
    width: 0;
    height: 0;
    margin-left: 4px;
    border-style: solid;
    border-width: 13px 0 13px 20px;
    border-color: transparent transparent transparent #fff;
  }
}

.preview-video-controls {
  position: absolute;
  left: 50%;
  bottom: 10px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 9px;
  width: min(600px, calc(100vw - 96px));
  min-height: 44px;
  padding: 6px 12px;
  border-radius: 12px;
  background: rgba(16, 16, 20, 0.95);
  box-sizing: border-box;
  transform: translateX(-50%);
}

.preview-control-btn {
  width: 32px;
  height: 32px;
  padding: 7px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;

  &:hover {
    background: #7b82ff;
  }

  svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.preview-fullscreen-btn svg {
  fill: currentColor;
  stroke: none;
}

.play-glyph {
  width: 0;
  height: 0;
  margin-left: 2px;
  border-style: solid;
  border-width: 8px 0 8px 12px;
  border-color: transparent transparent transparent #fff;
}

.pause-glyph {
  display: inline-flex;
  gap: 4px;

  i {
    display: block;
    width: 4px;
    height: 16px;
    background: #fff;
    border-radius: 1px;
  }
}

.preview-range {
  height: 4px;
  appearance: none;
  border-radius: 999px;
  background: linear-gradient(to right, #7b82ff var(--fill, 0%), rgba(255, 255, 255, 0.3) var(--fill, 0%));
  outline: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 0;
    background: #fff;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.35);
  }
}

.preview-progress {
  flex: 1 1 auto;
  min-width: 80px;
}

.preview-volume {
  flex: 0 0 90px;
}

.preview-video-time {
  min-width: 76px;
  color: #fff;
  font-size: 14px;
  line-height: 20px;
  text-align: center;
  white-space: nowrap;
}

.preview-close {
  position: absolute;
  top: 14px;
  right: 16px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #fff;
  font-size: 28px;
  line-height: 32px;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.14);
  }
}

@keyframes video-loading-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
