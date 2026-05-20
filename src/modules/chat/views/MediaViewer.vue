<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-shell'
import '@js-preview/excel/lib/index.css'
import ContextMenu, { type MenuItem } from '@/components/ContextMenu.vue'
import ImageOverwriteDialog from '@/components/ImageOverwriteDialog.vue'
import Toast from '@/components/Toast.vue'
import { exportBase64ImgToLocal, userSelectPngSavePathWithOverwrite } from '@/utils/fileTools'
import { mediaViewerState, type MediaViewerPayload } from '@/utils/mediaViewerState'
import closeIcon from '@/assets/windows_control_icons/close-w-30.png'
import minimizeIcon from '@/assets/windows_control_icons/min-w-30.png'
import squareIcon from '@/assets/windows_control_icons/max-w-30.png'
import restoreIcon from '@/assets/windows_control_icons/restore-w-30.png'

const { t } = useI18n()
const payload = ref<MediaViewerPayload | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const excelPreviewRef = ref<HTMLElement | null>(null)
const isMaximized = ref(false)
const rotation = ref(0)
const isVideoPlaying = ref(false)
const videoCurrentTime = ref(0)
const videoDuration = ref(0)
const videoVolume = ref(1)
const isVideoMuted = ref(false)
const isVideoFullscreen = ref(false)
const isVideoFrameReady = ref(false)
const videoPreparingOnOpen = ref(false)
const videoPlaybackRequested = ref(false)
const videoProbeLoading = ref(false)
const videoConverting = ref(false)
const videoAutoTranscodeTried = ref(false)
const videoProbe = ref<VideoFormatProbe | null>(null)
const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const imageOverwriteVisible = ref(false)
const imageOverwriteFileName = ref('')
const imageOverwriteDirectoryName = ref('')
let imageOverwriteResolver: ((value: boolean) => void) | null = null
let excelPreviewer: { destroy?: () => void } | null = null
let excelPreviewToken = 0
let videoPrepareTimer = 0
let videoPlayWatchTimer = 0
let videoProbeToken = 0
let videoPlayReloadRetries = 0
let videoAutoTranscodeSource = ''

type ExcelPreviewSource = string | ArrayBuffer
type ExcelPreviewSourceKind = 'url' | 'local-array-buffer'

interface ExcelPreviewSourceCandidate {
  kind: ExcelPreviewSourceKind
  load: () => Promise<ExcelPreviewSource>
}

type ExcelPreviewModule = {
  init?: (el: HTMLElement) => { preview?: (src: ExcelPreviewSource) => Promise<void> | void; destroy?: () => void }
  default?: {
    init?: (el: HTMLElement) => { preview?: (src: ExcelPreviewSource) => Promise<void> | void; destroy?: () => void }
  }
}

interface LocalFilePayload {
  name?: string
  mime?: string
  dataBase64?: string
  data_base64?: string
}

interface VideoFormatProbe {
  container: string
  brand: string
  videoCodec: string
  videoCodecTag: string
  audioCodec: string
  audioCodecTag: string
  size: number
  isHevc: boolean
  isH264: boolean
  needsTranscode: boolean
  webviewLikelySupported: boolean
  summary: string
}

function ensureMediaSrc(src: string): string {
  const raw = String(src || '').trim()
  if (!raw) return ''
  if (/^(https?|asset|blob|data):/i.test(raw)) return raw
  if ((window as any).__TAURI_INTERNALS__) {
    if (/^file:/i.test(raw)) return convertFileSrc(fileUrlToLocalPath(raw))
    return convertFileSrc(raw)
  }
  if (/^file:/i.test(raw)) return raw
  const normalized = raw.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`
  }
  if (normalized.startsWith('/')) {
    return `file://${encodeURI(normalized)}`
  }
  return raw
}

function fileUrlToLocalPath(src: string): string {
  const raw = String(src || '').trim()
  if (/^asset:/i.test(raw) || /^https?:\/\/asset\.localhost/i.test(raw)) {
    try {
      const parsed = new URL(raw)
      let pathname = decodeURIComponent(parsed.pathname.replace(/\+/g, ' '))
      if (/^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1)
      return pathname
    } catch {
      return raw.replace(/^asset:\/\/[^/]+\/?/i, '')
    }
  }
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

function imageExtFromDataUrl(src: string): string {
  const matched = String(src || '').match(/^data:image\/([^;,]+)[;,]/i)
  const mime = matched?.[1]?.toLowerCase() || ''
  if (mime === 'jpeg' || mime === 'jpg') return '.jpg'
  if (mime === 'png') return '.png'
  if (mime === 'gif') return '.gif'
  if (mime === 'webp') return '.webp'
  if (mime === 'bmp') return '.bmp'
  if (mime === 'avif') return '.avif'
  if (mime === 'svg+xml') return '.svg'
  return '.png'
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

async function readLocalExcelArrayBuffer(localPath: string): Promise<ArrayBuffer> {
  const files = await invoke<LocalFilePayload[]>('read_local_files', { paths: [localPath] })
  const dataBase64 = files[0]?.dataBase64 || files[0]?.data_base64 || ''
  if (!dataBase64) throw new Error('local excel file read returned empty data')
  return base64ToArrayBuffer(dataBase64)
}

function createExcelPreviewSourceCandidates(src: string, localPath: string): ExcelPreviewSourceCandidate[] {
  const candidates: ExcelPreviewSourceCandidate[] = []
  const normalizedSrc = String(src || '').trim()
  const normalizedLocalPath = String(localPath || '').trim()

  if ((window as any).__TAURI_INTERNALS__ && normalizedLocalPath) {
    candidates.push({
      kind: 'local-array-buffer',
      load: () => readLocalExcelArrayBuffer(normalizedLocalPath),
    })
  }

  if (normalizedSrc) {
    candidates.push({
      kind: 'url',
      load: async () => normalizedSrc,
    })
  }

  return candidates
}

const imageSrc = computed(() => {
  if (payload.value?.mediaType && payload.value.mediaType !== 'image') return ''
  return ensureMediaSrc(payload.value?.src || payload.value?.filePath || '')
})
const videoSrc = computed(() => {
  if (payload.value?.mediaType !== 'video') return ''
  return ensureMediaSrc(payload.value?.src || payload.value?.filePath || '')
})
const videoCoverSrc = computed(() => {
  if (payload.value?.mediaType !== 'video') return ''
  return ensureMediaSrc(payload.value?.cover || '')
})
const isVideo = computed(() => payload.value?.mediaType === 'video')
const isFile = computed(() => payload.value?.mediaType === 'file')
const isExcelFile = computed(() => isFile.value && payload.value?.fileKind === 'excel')
const payloadVideoDuration = computed(() => normalizeVideoDuration(payload.value?.duration))
const filePreviewSrc = computed(() => {
  if (!isExcelFile.value) return ''
  return ensureMediaSrc(payload.value?.src || payload.value?.filePath || '')
})
const isPortraitVideo = computed(() => {
  const w = Number(payload.value?.width || 0)
  const h = Number(payload.value?.height || 0)
  if (w > 0 && h > 0) return h > w
  return true
})
const videoProgressPercent = computed(() => {
  if (!videoDuration.value) return 0
  return Math.min(100, Math.max(0, (videoCurrentTime.value / videoDuration.value) * 100))
})
const isVideoBuffering = computed(() =>
  isVideo.value && (
    videoConverting.value ||
    (!isVideoFrameReady.value && (videoPlaybackRequested.value || (videoPreparingOnOpen.value && !videoDuration.value)))
  ),
)
const isVideoControlPlaying = computed(() => isVideoPlaying.value && isVideoFrameReady.value)
const videoTimeText = computed(() => {
  if (videoConverting.value) return '转换中'
  if (isVideoBuffering.value) return '加载中'
  return `${formatVideoTime(videoCurrentTime.value)} / ${formatVideoTime(videoDuration.value)}`
})
const videoVolumePercent = computed(() => isVideoMuted.value ? 0 : Math.round(videoVolume.value * 100))
const canOpenWithDefaultApp = computed(() =>
  Boolean(String(payload.value?.filePath || payload.value?.src || '').trim()),
)
const localVideoPath = computed(() => {
  if (!isVideo.value) return ''
  const filePath = String(payload.value?.filePath || '').trim()
  if (filePath && !/^https?:/i.test(filePath)) return fileUrlToLocalPath(filePath)
  const src = String(payload.value?.src || '').trim()
  if (/^file:/i.test(src)) return fileUrlToLocalPath(src)
  if (src && !/^(https?|asset|blob|data):/i.test(src)) return fileUrlToLocalPath(src)
  return ''
})
const localImagePath = computed(() => {
  if (isFile.value) return localFilePath.value
  const filePath = String(payload.value?.filePath || '').trim()
  if (filePath) return fileUrlToLocalPath(filePath)
  const src = String(payload.value?.src || '').trim()
  if (/^file:/i.test(src)) return fileUrlToLocalPath(src)
  return ''
})
const localFilePath = computed(() => {
  if (!isFile.value) return ''
  const filePath = String(payload.value?.filePath || '').trim()
  if (filePath) return fileUrlToLocalPath(filePath)
  const src = String(payload.value?.src || '').trim()
  if (/^(file|asset):/i.test(src) || /^https?:\/\/asset\.localhost/i.test(src)) return fileUrlToLocalPath(src)
  if (src && !/^(https?|asset|blob|data):/i.test(src)) return fileUrlToLocalPath(src)
  return ''
})
const canOpenDirectory = computed(() => Boolean(localImagePath.value))
const contextMenuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = []
  if (isFile.value) {
    if (canOpenWithDefaultApp.value) {
      items.push({ key: 'open_default', label: t('使用默认应用打开') })
    }
    return items
  }
  if (!isVideo.value) {
    items.push(
      { key: 'copy', label: t('复制') },
      { key: 'save_as', label: t('另存为') },
    )
  }
  if (!isVideo.value) {
    if (canOpenDirectory.value) {
      items.push({ key: 'open_directory', label: t('打开目录') })
    }
    if (canOpenWithDefaultApp.value) {
      items.push({ key: 'open_default', label: t('使用默认应用打开') })
    }
    items.push({ key: 'rotate', label: t('向右旋转') })
  }
  return items
})

const mediaViewerPageClass = 'media-viewer-page'

let unsubscribe: (() => void) | null = null
let unlistenWindowEvents: Array<() => void> = []

function isWindowsPlatform(): boolean {
  return /win|windows/i.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`)
}

function currentMediaWindow() {
  if (!(window as any).__TAURI_INTERNALS__) return null
  return getCurrentWindow()
}

function mediaSourceSummary(src: string): Record<string, unknown> {
  const raw = String(src || '').trim()
  return {
    kind: /^https?:\/\/127\.0\.0\.1:/i.test(raw)
      ? 'local-http-stream'
      : /^https?:/i.test(raw)
        ? 'remote-http'
        : /^(asset|file):/i.test(raw)
          ? 'local-file'
          : raw ? 'other' : 'empty',
    head: raw.slice(0, 160),
  }
}

function videoBufferedRanges(video: HTMLVideoElement): string[] {
  const ranges: string[] = []
  try {
    for (let index = 0; index < video.buffered.length; index += 1) {
      ranges.push(`${video.buffered.start(index).toFixed(2)}-${video.buffered.end(index).toFixed(2)}`)
    }
  } catch {
    // Buffered ranges can throw while the media element is changing source.
  }
  return ranges
}

function videoElementSnapshot(video = videoRef.value): Record<string, unknown> {
  if (!video) {
    return {
      hasVideo: false,
      payload: payload.value ? {
        mediaType: payload.value.mediaType,
        size: payload.value.size || 0,
        duration: payload.value.duration || 0,
        width: payload.value.width || 0,
        height: payload.value.height || 0,
        src: mediaSourceSummary(payload.value.src || ''),
        filePath: String(payload.value.filePath || '').slice(0, 160),
      } : null,
    }
  }
  return {
    hasVideo: true,
    readyState: video.readyState,
    networkState: video.networkState,
    paused: video.paused,
    ended: video.ended,
    currentTime: Number.isFinite(video.currentTime) ? Number(video.currentTime.toFixed(3)) : 0,
    duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(3)) : String(video.duration),
    buffered: videoBufferedRanges(video),
    videoWidth: video.videoWidth || 0,
    videoHeight: video.videoHeight || 0,
    currentSrc: mediaSourceSummary(video.currentSrc || video.src || videoSrc.value),
    payloadDuration: payload.value?.duration || 0,
    payloadSize: payload.value?.size || 0,
    frameReady: isVideoFrameReady.value,
    preparingOnOpen: videoPreparingOnOpen.value,
    playbackRequested: videoPlaybackRequested.value,
    retryCount: videoPlayReloadRetries,
  }
}

function mediaViewerVideoLog(message: string, data?: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info') {
  const snapshot = videoElementSnapshot()
  const payloadData = { ...(data || {}), snapshot }
  const logMessage = `[media-viewer-video] ${message}`
  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  logger(logMessage, payloadData)
  if (!(window as any).__TAURI_INTERNALS__) return
  void invoke('image_send_log', {
    payload: {
      level,
      message: logMessage,
      data: payloadData,
    },
  }).catch(() => {})
}

function applyPayload(nextPayload: MediaViewerPayload | null) {
  resetVideoState({ clearSource: !nextPayload || nextPayload.mediaType !== 'video' })
  destroyExcelPreviewer()
  payload.value = nextPayload
  if (nextPayload?.mediaType === 'video') {
    videoDuration.value = payloadVideoDuration.value
    mediaViewerVideoLog('payload applied', {
      src: mediaSourceSummary(nextPayload.src || ''),
      filePath: String(nextPayload.filePath || '').slice(0, 160),
      originalUrlHead: String(nextPayload.originalUrl || '').slice(0, 160),
      fileKeyLen: String(nextPayload.fileKey || '').length,
      size: nextPayload.size || 0,
      duration: nextPayload.duration || 0,
      width: nextPayload.width || 0,
      height: nextPayload.height || 0,
      mimeType: nextPayload.mimeType || '',
    })
  }
  rotation.value = 0
  menuVisible.value = false
  if (nextPayload?.title) {
    document.title = nextPayload.title
  } else if (nextPayload?.mediaType === 'video') {
    document.title = '视频'
  } else if (nextPayload?.mediaType === 'file') {
    document.title = '文件'
  }
  void nextTick(() => {
    void setupExcelPreview()
    if (nextPayload?.mediaType === 'video') {
      startVideoPreparingOnOpen()
      void probeCurrentVideoFormat()
    }
  })
}

function resetVideoState(options: { clearSource?: boolean } = {}) {
  window.clearTimeout(videoPrepareTimer)
  window.clearTimeout(videoPlayWatchTimer)
  videoProbeToken += 1
  const video = videoRef.value
  if (video) {
    video.pause()
    if (options.clearSource !== false) {
      video.removeAttribute('src')
      video.load()
    }
  }
  isVideoFrameReady.value = false
  videoPreparingOnOpen.value = false
  videoPlaybackRequested.value = false
  videoProbeLoading.value = false
  videoConverting.value = false
  videoAutoTranscodeTried.value = false
  videoPlayReloadRetries = 0
  videoAutoTranscodeSource = ''
  videoProbe.value = null
  isVideoPlaying.value = false
  videoCurrentTime.value = 0
  videoDuration.value = 0
  videoVolume.value = 1
  isVideoMuted.value = false
}

function startVideoPreparingOnOpen() {
  const video = videoRef.value
  if (!video || !videoSrc.value) return
  mediaViewerVideoLog('prepare on open start')
  videoPreparingOnOpen.value = true
  window.clearTimeout(videoPrepareTimer)
  videoPrepareTimer = window.setTimeout(() => {
    mediaViewerVideoLog('prepare on open timeout', {}, 'warn')
    videoPreparingOnOpen.value = false
  }, 1200)
  try {
    video.preload = 'auto'
    video.load()
  } catch {
    mediaViewerVideoLog('prepare on open load threw', {}, 'warn')
    // Loading is opportunistic; playback click can still retry.
  }
}

function stopVideoPreparing() {
  window.clearTimeout(videoPrepareTimer)
  videoPreparingOnOpen.value = false
}

function videoErrorMessage(error?: unknown): string {
  const video = videoRef.value
  const code = video?.error?.code || 0
  const detail = error instanceof Error ? error.message : String(error || '')
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || /not supported|format|codec/i.test(detail)) {
    return '当前系统不支持该视频格式，请使用默认应用打开'
  }
  return '视频播放失败，请使用默认应用打开'
}

function isVideoUnsupportedError(error?: unknown): boolean {
  const video = videoRef.value
  const code = video?.error?.code || 0
  const detail = error instanceof Error ? error.message : String(error || '')
  return code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || /not supported|format|codec/i.test(detail)
}

function tryAutoConvertVideoForWindows(reason: string, error?: unknown): boolean {
  if (!isWindowsPlatform()) return false
  if (!isVideo.value || videoConverting.value || videoAutoTranscodeTried.value) return false
  if (!isVideoUnsupportedError(error)) return false
  if (!localVideoPath.value && !String(payload.value?.originalUrl || '').trim()) return false

  videoAutoTranscodeTried.value = true
  mediaViewerVideoLog('auto convert after playback error', {
    reason,
    error: error instanceof Error ? error.message : String(error || ''),
  }, 'warn')
  void convertCurrentVideoToMp4({ auto: true })
  return true
}

async function probeCurrentVideoFormat(sourceOverride = '') {
  if (!isVideo.value) return
  const source = String(sourceOverride || localVideoPath.value || videoSrc.value || '').trim()
  if (!source) return
  const token = ++videoProbeToken
  videoProbeLoading.value = true
  try {
    const probe = await invoke<VideoFormatProbe>('probe_video_format', {
      source,
      size: Number(payload.value?.size || 0) || null,
    })
    if (token !== videoProbeToken) return
    videoProbe.value = probe
    console.info('[media-viewer] video format:', probe)
    void maybeAutoConvertVideoForWindows(probe, source)
  } catch (error) {
    if (token !== videoProbeToken) return
    console.warn('[media-viewer] video format probe failed:', error)
  } finally {
    if (token === videoProbeToken) {
      videoProbeLoading.value = false
    }
  }
}

function disposeExcelPreviewer() {
  if (excelPreviewer?.destroy) {
    try {
      excelPreviewer.destroy()
    } catch (error) {
      console.warn('[media-viewer] excel preview destroy failed:', error)
    }
  }
  excelPreviewer = null
  if (excelPreviewRef.value) {
    excelPreviewRef.value.innerHTML = ''
  }
}

function destroyExcelPreviewer() {
  excelPreviewToken += 1
  disposeExcelPreviewer()
}

async function setupExcelPreview() {
  const token = ++excelPreviewToken
  const mount = excelPreviewRef.value
  const src = filePreviewSrc.value
  if (!mount || !src || !isExcelFile.value) return

  mount.innerHTML = ''
  const localPath = localFilePath.value
  const previewSourceCandidates = createExcelPreviewSourceCandidates(src, localPath)
  const previewErrors: Array<{ kind: ExcelPreviewSourceKind; error: unknown }> = []
  try {
    const excelModule = await import('@js-preview/excel') as ExcelPreviewModule
    if (token !== excelPreviewToken) return
    const initPreview = excelModule.init || excelModule.default?.init
    if (!initPreview) throw new Error('excel preview init unavailable')

    for (const candidate of previewSourceCandidates) {
      try {
        const previewSource = await candidate.load()
        if (token !== excelPreviewToken) return
        disposeExcelPreviewer()
        const previewer = initPreview(mount)
        excelPreviewer = previewer
        await previewer.preview?.(previewSource)
        if (token !== excelPreviewToken) return
        return
      } catch (error) {
        previewErrors.push({ kind: candidate.kind, error })
      }
    }

    throw previewErrors[previewErrors.length - 1]?.error || new Error('excel preview source unavailable')
  } catch (error) {
    if (token !== excelPreviewToken) return
    console.warn('[media-viewer] excel preview failed:', {
      error,
      previewErrors,
      localPath,
      src,
    })
    showToast('文件预览失败，请使用默认应用打开', 'error')
  }
}

function formatVideoTime(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function normalizeVideoDuration(value: unknown): number {
  const duration = Number(value || 0)
  return Number.isFinite(duration) && duration > 0 ? duration : 0
}

function currentPlayableVideoDuration(video: HTMLVideoElement): number {
  return normalizeVideoDuration(video.duration) || payloadVideoDuration.value
}

function syncVideoState() {
  const video = videoRef.value
  if (!video) return
  videoCurrentTime.value = video.currentTime || 0
  videoDuration.value = currentPlayableVideoDuration(video)
  videoVolume.value = video.volume
  isVideoMuted.value = video.muted
  isVideoPlaying.value = !video.paused && !video.ended
}

function handleVideoLoadedMetadata() {
  mediaViewerVideoLog('loadedmetadata')
  stopVideoPreparing()
  syncVideoState()
}

function markVideoFrameReady() {
  const video = videoRef.value
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
  const requestVideoFrameCallback = (video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number
  }).requestVideoFrameCallback
  if (typeof requestVideoFrameCallback === 'function') {
    requestVideoFrameCallback.call(video, () => {
      isVideoFrameReady.value = true
      stopVideoPreparing()
      videoPlaybackRequested.value = false
      syncVideoState()
      mediaViewerVideoLog('frame ready by requestVideoFrameCallback')
    })
    return
  }
  requestAnimationFrame(() => {
    if (videoRef.value !== video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    isVideoFrameReady.value = true
    stopVideoPreparing()
    videoPlaybackRequested.value = false
    syncVideoState()
    mediaViewerVideoLog('frame ready by animation frame')
  })
}

function handleVideoCanPlay() {
  mediaViewerVideoLog('canplay')
  markVideoFrameReady()
  syncVideoState()
}

function handleVideoLoadedData() {
  mediaViewerVideoLog('loadeddata')
  markVideoFrameReady()
  syncVideoState()
}

function handleVideoLoadStart() {
  mediaViewerVideoLog('loadstart')
}

function handleVideoProgress() {
  const video = videoRef.value
  if (!video || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return
  mediaViewerVideoLog('progress while not ready')
}

function handleVideoPlay() {
  mediaViewerVideoLog('play event')
  videoPlaybackRequested.value = true
  syncVideoState()
}

function handleVideoPlaying() {
  mediaViewerVideoLog('playing')
  window.clearTimeout(videoPlayWatchTimer)
  videoPlayReloadRetries = 0
  stopVideoPreparing()
  videoPlaybackRequested.value = false
  markVideoFrameReady()
  syncVideoState()
}

function handleVideoWaiting() {
  mediaViewerVideoLog('waiting/stalled', {}, 'warn')
  const video = videoRef.value
  if (!isVideoFrameReady.value && video && !video.paused) {
    videoPlaybackRequested.value = true
  }
  syncVideoState()
}

function handleVideoPause() {
  mediaViewerVideoLog('pause')
  window.clearTimeout(videoPlayWatchTimer)
  stopVideoPreparing()
  videoPlaybackRequested.value = false
  syncVideoState()
}

function handleVideoError() {
  isVideoFrameReady.value = false
  window.clearTimeout(videoPlayWatchTimer)
  videoPlayReloadRetries = 0
  stopVideoPreparing()
  videoPlaybackRequested.value = false
  mediaViewerVideoLog('error', {
    code: videoRef.value?.error?.code || 0,
    message: videoRef.value?.error?.message || '',
  }, 'error')
  if (tryAutoConvertVideoForWindows('video-error')) {
    syncVideoState()
    return
  }
  if (isWindowsPlatform() && isVideoUnsupportedError()) {
    syncVideoState()
    return
  }
  showToast(videoErrorMessage(), 'error')
  syncVideoState()
}

async function recoverStalledVideoPlayback(video: HTMLVideoElement) {
  mediaViewerVideoLog('stalled watchdog fired', {}, 'warn')
  if (videoRef.value !== video || video.paused || video.ended) return
  if (video.currentTime > 0 || video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return
  if (videoPlayReloadRetries < 1) {
    videoPlayReloadRetries += 1
    videoPlaybackRequested.value = true
    try {
      mediaViewerVideoLog('stalled watchdog reload start', {}, 'warn')
      video.load()
      await video.play()
      syncVideoState()
      mediaViewerVideoLog('stalled watchdog reload play resolved')
      return
    } catch (error) {
      mediaViewerVideoLog('stalled watchdog reload failed', {
        message: error instanceof Error ? error.message : String(error || ''),
      }, 'error')
    }
  }
  videoPlaybackRequested.value = false
  showToast('视频正在准备中，如长时间无响应请使用默认应用打开', 'error')
  syncVideoState()
}

async function toggleVideoPlayback() {
  const video = videoRef.value
  if (!video) return
  mediaViewerVideoLog('toggle playback', {
    action: video.paused || video.ended ? 'play' : 'pause',
  })
  if (video.paused || video.ended) {
    videoPlaybackRequested.value = true
    try {
      await video.play()
      window.clearTimeout(videoPlayWatchTimer)
      videoPlayWatchTimer = window.setTimeout(() => {
        void recoverStalledVideoPlayback(video)
      }, 2500)
    } catch (error) {
      window.clearTimeout(videoPlayWatchTimer)
      videoPlaybackRequested.value = false
      mediaViewerVideoLog('play promise failed', {
        message: error instanceof Error ? error.message : String(error || ''),
      }, 'error')
      if (tryAutoConvertVideoForWindows('play-promise', error)) {
        syncVideoState()
        return
      }
      if (isWindowsPlatform() && isVideoUnsupportedError(error)) {
        syncVideoState()
        return
      }
      showToast(videoErrorMessage(error), 'error')
    }
  } else {
    window.clearTimeout(videoPlayWatchTimer)
    videoPlaybackRequested.value = false
    video.pause()
  }
  syncVideoState()
}

function handleVideoSeek(event: Event) {
  const video = videoRef.value
  if (!video) return
  const duration = currentPlayableVideoDuration(video)
  if (!duration) return
  const next = Number((event.target as HTMLInputElement).value)
  video.currentTime = (Math.min(100, Math.max(0, next)) / 100) * duration
  syncVideoState()
}

function toggleVideoMuted() {
  const video = videoRef.value
  if (!video) return
  video.muted = !video.muted
  if (!video.muted && video.volume === 0) {
    video.volume = 0.5
  }
  syncVideoState()
}

function handleVideoVolume(event: Event) {
  const video = videoRef.value
  if (!video) return
  const next = Number((event.target as HTMLInputElement).value)
  video.volume = Math.min(1, Math.max(0, next / 100))
  video.muted = video.volume === 0
  syncVideoState()
}

async function syncVideoFullscreenState() {
  try {
    isVideoFullscreen.value = await invoke<boolean>('media_window_is_fullscreen')
  } catch {
    isVideoFullscreen.value = false
  }
}

async function toggleVideoFullscreen() {
  try {
    isVideoFullscreen.value = await invoke<boolean>('media_window_toggle_fullscreen')
    return
  } catch (error) {
    console.warn('[media-viewer] window fullscreen failed:', error)
  }

  const currentWindow = currentMediaWindow()
  if (!currentWindow) return
  try {
    const nextFullscreen = !isVideoFullscreen.value
    await currentWindow.setFullscreen(nextFullscreen)
    isVideoFullscreen.value = nextFullscreen
  } catch (error) {
    console.warn('[media-viewer] window fullscreen fallback failed:', error)
  }
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

function pathBaseName(filePath: string): string {
  const segments = filePath.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] || filePath
}

function safeFileName(name: string, fallback = 'video.mp4'): string {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\0/g, '')
    .trim() || fallback
}

function videoExt(source: string): string {
  const matched = String(source || '').split('?')[0].match(/\.(mp4|m4v|mov|webm|ogg|ogv|avi|mkv)$/i)
  return matched?.[0]?.toLowerCase() || '.mp4'
}

function ensureVideoFileName(fileName: string, source = ''): string {
  const name = safeFileName(fileName, 'video')
  if (/\.(mp4|m4v|mov|webm|ogg|ogv|avi|mkv)$/i.test(name)) return name
  return `${name}${videoExt(source)}`
}

function pathDirectoryName(filePath: string): string {
  const segments = filePath.split(/[\\/]/).filter(Boolean)
  return segments.length > 1 ? segments[segments.length - 2] : pathBaseName(filePath)
}

function normalizeImageFileName(name: string): string {
  const cleaned = String(name || 'image')
    .trim()
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\.[^.]+$/, '') || 'image'
  return `${cleaned || 'image'}.png`
}

function suggestedImageFileName(): string {
  const title = String(payload.value?.title || '').trim()
  if (title && title !== '图片') return normalizeImageFileName(title)
  const filePath = String(payload.value?.filePath || '').trim()
  if (filePath) return normalizeImageFileName(pathBaseName(filePath))
  const src = String(payload.value?.src || '').trim()
  if (src && !/^data:/i.test(src)) {
    try {
      return normalizeImageFileName(pathBaseName(new URL(src).pathname))
    } catch {
      return normalizeImageFileName(pathBaseName(src.split('?')[0] || 'image'))
    }
  }
  return 'image.png'
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('blob read failed'))
    reader.readAsDataURL(blob)
  })
}

function blobToPng(blob: Blob): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    try {
      const src = await blobToDataUrl(blob)
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        const width = image.naturalWidth || image.width
        const height = image.naturalHeight || image.height
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('canvas context unavailable'))
          return
        }
        ctx.drawImage(image, 0, 0, width, height)
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            reject(new Error('png conversion failed'))
            return
          }
          resolve(pngBlob)
        }, 'image/png')
      }
      image.onerror = () => reject(new Error('image decode failed'))
      image.src = src
    } catch (error) {
      reject(error instanceof Error ? error : new Error('png conversion failed'))
    }
  })
}

async function fetchImageAsPngDataUrl(): Promise<string> {
  const src = imageSrc.value
  if (!src) throw new Error('image source unavailable')
  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`image fetch failed: ${response.status}`)
  }
  let blob = await response.blob()
  if ((blob.type || 'image/png') !== 'image/png') {
    blob = await blobToPng(blob)
  }
  return blobToDataUrl(blob)
}

async function copyImageToClipboard() {
  const dataUrl = await fetchImageAsPngDataUrl()
  const dataBase64 = dataUrl.split(',', 2)[1] || ''
  if (!dataBase64) {
    throw new Error('image base64 encode failed')
  }

  if ((window as any).__TAURI_INTERNALS__) {
    await invoke('write_clipboard_image', { dataBase64 })
    return
  }

  const blob = await (await fetch(dataUrl)).blob()
  const ClipboardItemCtor = window.ClipboardItem
  if (!ClipboardItemCtor || !navigator.clipboard?.write) {
    throw new Error('clipboard image write unsupported')
  }
  await navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': blob })])
}

function promptImageOverwrite(filePath: string): Promise<boolean> {
  if (imageOverwriteResolver) {
    imageOverwriteResolver(false)
    imageOverwriteResolver = null
  }

  imageOverwriteFileName.value = pathBaseName(filePath)
  imageOverwriteDirectoryName.value = pathDirectoryName(filePath)
  imageOverwriteVisible.value = true

  return new Promise((resolve) => {
    imageOverwriteResolver = resolve
  })
}

function resolveImageOverwrite(result: boolean) {
  imageOverwriteVisible.value = false
  const resolver = imageOverwriteResolver
  imageOverwriteResolver = null
  resolver?.(result)
}

async function saveImageAs() {
  const dataUrl = await fetchImageAsPngDataUrl()
  if ((window as any).__TAURI_INTERNALS__) {
    const { filePath, canceled, needsOverwriteConfirm } =
      await userSelectPngSavePathWithOverwrite(suggestedImageFileName())
    if (!filePath || canceled) return
    const finalPath = filePath.toLowerCase().endsWith('.png') ? filePath : `${filePath}.png`
    if (needsOverwriteConfirm) {
      const confirmed = await promptImageOverwrite(finalPath)
      if (!confirmed) return
    }
    const err = await exportBase64ImgToLocal(dataUrl, finalPath)
    if (err) throw err
    showToast(t('保存成功'))
    return
  }

  const link = document.createElement('a')
  link.download = suggestedImageFileName()
  link.href = dataUrl
  link.click()
  showToast(t('保存成功'))
}

function startWindowDrag(e: MouseEvent) {
  if (e.button !== 0) return
  const currentWindow = currentMediaWindow()
  if (!currentWindow) return
  currentWindow.startDragging().catch((err) => {
    console.warn('[media-viewer] start dragging failed:', err)
  })
}

async function syncMaximizedState() {
  try {
    isMaximized.value = await invoke<boolean>('media_window_is_maximized')
  } catch {
    isMaximized.value = false
  }
}

async function minimize() {
  try {
    await invoke('media_window_minimize')
  } catch {
    // browser noop
  }
}

async function maximize() {
  try {
    isMaximized.value = await invoke<boolean>('media_window_toggle_maximize')
  } catch {
    // browser noop
  }
}

async function closeWindow() {
  try {
    await invoke('media_window_close')
    return
  } catch {
    // fallback below
  }
  window.close()
}

async function openWithDefaultApp() {
  const filePath = String(payload.value?.filePath || '').trim()
  const src = String(payload.value?.src || '').trim()
  let target = filePath || fileUrlToLocalPath(src)
  if (isVideo.value) {
    if (target && !/^https?:/i.test(target)) {
      await invoke('open_file', { path: fileUrlToLocalPath(target) })
      return
    }
    const localVideo = await downloadVideoForDefaultApp()
    if (localVideo) {
      await invoke('open_file', { path: localVideo })
    }
    return
  }
  if (isFile.value) {
    target = localFilePath.value
    if (!target) {
      showToast('文件路径为空，请重新下载后再试', 'error')
      return
    }
    try {
      await invoke('open_file', { path: target })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error || '未知错误')
      console.warn('[media-viewer] open file failed:', error)
      showToast(`打开文件失败：${detail}`, 'error')
    }
    return
  }
  if (!isVideo.value && filePath && /\.img$/i.test(filePath)) {
    if (/^data:image\//i.test(src)) {
      try {
        const fixedPath = filePath.replace(/\.img$/i, imageExtFromDataUrl(src))
        await invoke('save_base64_image', { filePath: fixedPath, base64Data: src })
        target = fixedPath
      } catch (error) {
        console.warn('[media-viewer] repair .img cache failed:', error)
        target = fileUrlToLocalPath(src) || filePath
      }
    } else {
      target = fileUrlToLocalPath(src) || filePath
    }
  }
  if (!target) return
  try {
    await open(target)
  } catch (error) {
    console.warn('[media-viewer] openWithDefaultApp failed:', error)
  }
}

function defaultVideoFileName(): string {
  const explicit = String(payload.value?.fileName || '').trim()
  if (explicit) return ensureVideoFileName(explicit, payload.value?.originalUrl || payload.value?.src || '')
  const source = String(payload.value?.originalUrl || payload.value?.src || '').split('?')[0]
  let fromUrl = ''
  try {
    fromUrl = pathBaseName(decodeURIComponent(new URL(source).pathname))
  } catch {
    fromUrl = pathBaseName(source)
  }
  return ensureVideoFileName(fromUrl, source)
}

async function downloadVideoForDefaultApp(options: { silent?: boolean } = {}): Promise<string> {
  const url = String(payload.value?.originalUrl || '').trim()
  const key = String(payload.value?.fileKey || '').trim()
  if (!url) {
    if (!options.silent) showToast('视频文件还没有本地缓存', 'error')
    return ''
  }

  if (!options.silent) showToast('正在准备视频文件...')
  const [{ appDataDir, join }, { listen }] = await Promise.all([
    import('@tauri-apps/api/path'),
    import('@tauri-apps/api/event'),
  ])
  const baseDir = await appDataDir()
  const id = `media-viewer-video-${Date.now()}`
  const savePath = await join(baseDir, 'video-cache', 'default-open', id, defaultVideoFileName())
  const doneEvent = `file:done:${id}`
  const errorEvent = `file:error:${id}`

  return new Promise(async (resolve) => {
    let settled = false
    let timeout = 0
    const cleanup = (listeners: Array<() => void>) => {
      window.clearTimeout(timeout)
      listeners.forEach((stop) => stop())
    }
    const listeners: Array<() => void> = []
    timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      cleanup(listeners)
      if (!options.silent) showToast('视频准备超时，请稍后重试', 'error')
      resolve('')
    }, 30000)
    listeners.push(await listen(doneEvent, () => {
      if (settled) return
      settled = true
      cleanup(listeners)
      if (!options.silent) showToast('视频准备完成，正在打开')
      resolve(savePath)
    }))
    listeners.push(await listen<{ error?: string }>(errorEvent, (event) => {
      if (settled) return
      settled = true
      cleanup(listeners)
      if (!options.silent) showToast(`视频准备失败：${event.payload?.error || '未知错误'}`, 'error')
      resolve('')
    }))

    try {
      await invoke('download_file', {
        url,
        fileKey: key,
        savePath,
        msgId: id,
        logTag: 'video-default-open',
        emitDataUrl: false,
      })
    } catch (error) {
      if (settled) return
      settled = true
      cleanup(listeners)
      const detail = error instanceof Error ? error.message : String(error || '未知错误')
      if (!options.silent) showToast(`视频准备失败：${detail}`, 'error')
      resolve('')
    }
  })
}

async function ensureLocalVideoForVideoAction(options: { silent?: boolean } = {}): Promise<string> {
  if (localVideoPath.value) return localVideoPath.value
  return downloadVideoForDefaultApp(options)
}

async function convertedVideoPath(inputPath: string): Promise<string> {
  const [{ appDataDir, join }] = await Promise.all([
    import('@tauri-apps/api/path'),
  ])
  const baseDir = await appDataDir()
  const rawName = pathBaseName(inputPath).replace(/\.[^.]+$/, '') || 'video'
  const name = `${safeFileName(rawName, 'video')}_compatible.mp4`
  return join(baseDir, 'video-cache', 'converted', `${Date.now()}`, name)
}

async function convertCurrentVideoToMp4(options: { auto?: boolean } = {}) {
  if (!isWindowsPlatform()) {
    if (!options.auto) showToast('视频兼容转换仅在 Windows 启用', 'error')
    return
  }
  if (videoConverting.value) return
  videoConverting.value = true
  let localPath = ''
  try {
    localPath = await ensureLocalVideoForVideoAction({ silent: options.auto })
    if (!localPath) return
    if (!options.auto) showToast('正在转为兼容 MP4...')
    const outputPath = await convertedVideoPath(localPath)
    const convertedPath = await invoke<string>('convert_video_to_compatible_mp4', {
      inputPath: localPath,
      outputPath,
    })
    const result = await invoke<{ url: string }>('create_local_video_stream_url', {
      request: {
        path: convertedPath,
        mimeType: 'video/mp4',
        name: pathBaseName(convertedPath),
      },
    })
    if (!payload.value) return
    payload.value = {
      ...payload.value,
      src: result.url,
      filePath: convertedPath,
      originalUrl: '',
      fileKey: '',
      fileName: pathBaseName(convertedPath),
      mimeType: 'video/mp4',
    }
    resetVideoState({ clearSource: false })
    videoAutoTranscodeTried.value = true
    await nextTick()
    startVideoPreparingOnOpen()
    await probeCurrentVideoFormat(convertedPath)
    if (!options.auto) showToast('已转为兼容 MP4')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error || '未知错误')
    if (options.auto && /ffmpeg/i.test(detail) && localPath) {
      try {
        await invoke('open_file', { path: localPath })
        return
      } catch {
        // Fall through to the original error message.
      }
    }
    if (!options.auto) showToast(`转换失败：${detail}`, 'error')
  } finally {
    videoConverting.value = false
  }
}

async function maybeAutoConvertVideoForWindows(probe: VideoFormatProbe, source: string) {
  if (!isWindowsPlatform()) return
  if (!probe.needsTranscode) return
  if (videoConverting.value || videoAutoTranscodeTried.value) return
  const key = `${source}\n${probe.videoCodecTag}\n${probe.audioCodecTag}\n${probe.size}`
  if (videoAutoTranscodeSource === key) return
  videoAutoTranscodeSource = key
  videoAutoTranscodeTried.value = true
  await convertCurrentVideoToMp4({ auto: true })
}

function rotateImage() {
  rotation.value += 90
}

function handleContextMenu(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (contextMenuItems.value.length === 0) {
    menuVisible.value = false
    return
  }
  menuX.value = event.clientX
  menuY.value = event.clientY
  menuVisible.value = true
}

async function openImageDirectory() {
  const path = isFile.value ? localFilePath.value : localImagePath.value
  if (!path) return
  await invoke('reveal_file_in_directory', { path })
}

async function handleMenuSelect(key: string) {
  try {
    switch (key) {
      case 'copy':
        await copyImageToClipboard()
        showToast(t('复制成功'))
        break
      case 'save_as':
        await saveImageAs()
        break
      case 'open_directory':
        await openImageDirectory()
        break
      case 'open_default':
        await openWithDefaultApp()
        break
      case 'rotate':
        rotateImage()
        break
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (key === 'copy') {
      showToast(t('复制失败'), 'error')
    } else if (key === 'save_as') {
      showToast(t('保存失败详情', { detail }), 'error')
    } else if (key === 'open_directory') {
      showToast(t('打开目录失败详情', { detail }), 'error')
    } else {
      console.warn('[media-viewer] context menu action failed:', { key, error })
    }
  }
}

onMounted(async () => {
  document.documentElement.classList.add(mediaViewerPageClass)
  document.body.classList.add(mediaViewerPageClass)
  document.getElementById('app')?.classList.add(mediaViewerPageClass)
  applyPayload(mediaViewerState.get())
  unsubscribe = mediaViewerState.subscribe((nextPayload) => {
    applyPayload(nextPayload)
  })
  const currentWindow = currentMediaWindow()
  if (!currentWindow) {
    isMaximized.value = false
    void syncVideoFullscreenState()
    return
  }

  await syncMaximizedState()
  await syncVideoFullscreenState()
  unlistenWindowEvents = await Promise.all([
    currentWindow.onResized(() => {
      void syncMaximizedState()
      void syncVideoFullscreenState()
    }),
    currentWindow.onMoved(() => {
      void syncMaximizedState()
    }),
    currentWindow.onScaleChanged(() => {
      void syncMaximizedState()
      void syncVideoFullscreenState()
    }),
  ])
})

onUnmounted(() => {
  document.documentElement.classList.remove(mediaViewerPageClass)
  document.body.classList.remove(mediaViewerPageClass)
  document.getElementById('app')?.classList.remove(mediaViewerPageClass)
  resetVideoState()
  destroyExcelPreviewer()
  unsubscribe?.()
  unlistenWindowEvents.forEach((unlisten) => unlisten())
  unlistenWindowEvents = []
  imageOverwriteResolver?.(false)
  imageOverwriteResolver = null
})
</script>

<template>
  <div
    class="media-viewer"
    :class="{ 'is-video-mode': isVideo, 'is-file-mode': isFile, 'is-desktop-fullscreen': isVideoFullscreen }"
    @contextmenu="handleContextMenu"
  >
    <div class="media-titlebar">
      <div class="media-drag-layer" @mousedown="startWindowDrag" @dblclick="maximize"></div>
      <span class="media-title">{{ payload?.title || '图片' }}</span>
      <div class="media-actions">
        <button class="titlebar-btn" type="button" @click.stop="minimize">
          <span
            class="line"
            :style="{ backgroundImage: `url(${minimizeIcon})` }"
          ></span>
        </button>
        <button class="titlebar-btn" type="button" @click.stop="maximize">
          <span
            v-if="!isMaximized"
            class="square"
            :style="{ backgroundImage: `url(${squareIcon})` }"
          ></span>
          <span
            v-else
            class="restore"
            :style="{ backgroundImage: `url(${restoreIcon})` }"
          ></span>
        </button>
        <button class="titlebar-btn close" type="button" @click.stop="closeWindow">
          <span
            class="close-x"
            :style="{ backgroundImage: `url(${closeIcon})` }"
          ></span>
        </button>
      </div>
    </div>

    <div
      class="media-stage"
      :class="{ 'is-video': isVideo, 'is-video-fullscreen': isVideoFullscreen }"
    >
      <div
        v-if="videoSrc"
        class="media-video-shell"
        :class="{
          'is-landscape-video': isVideo && !isPortraitVideo,
          'is-video-ready': isVideoFrameReady,
          'has-video-cover': Boolean(videoCoverSrc),
        }"
      >
        <img
          v-if="videoCoverSrc && !isVideoFrameReady"
          class="media-video-cover"
          :src="videoCoverSrc"
          alt=""
          draggable="false"
        />
        <div
          v-else-if="isVideoBuffering"
          class="media-video-waiting"
          aria-hidden="true"
        >
          <span></span>
        </div>
        <video
          ref="videoRef"
          class="media-video"
          :src="videoSrc"
          :poster="videoCoverSrc"
          playsinline
          preload="auto"
          @click.stop="toggleVideoPlayback"
          @loadstart="handleVideoLoadStart"
          @progress="handleVideoProgress"
          @loadedmetadata="handleVideoLoadedMetadata"
          @loadeddata="handleVideoLoadedData"
          @canplay="handleVideoCanPlay"
          @durationchange="syncVideoState"
          @timeupdate="syncVideoState"
          @play="handleVideoPlay"
          @playing="handleVideoPlaying"
          @waiting="handleVideoWaiting"
          @stalled="handleVideoWaiting"
          @pause="handleVideoPause"
          @ended="syncVideoState"
          @volumechange="syncVideoState"
          @error="handleVideoError"
        ></video>
        <button
          v-if="!isVideoPlaying && !videoConverting"
          class="video-overlaid-play"
          type="button"
          aria-label="Play"
          @click.stop="toggleVideoPlayback"
        >
          <span></span>
        </button>
      </div>
      <div
        v-if="videoSrc"
        class="video-controls"
        @click.stop
        @contextmenu.stop
      >
        <button
          class="video-control-btn video-play-btn"
          :class="{ loading: isVideoBuffering }"
          type="button"
          :aria-label="isVideoControlPlaying ? 'Pause' : 'Play'"
          @click="toggleVideoPlayback"
        >
          <span v-if="isVideoBuffering" class="video-loading-glyph"></span>
          <span v-else-if="isVideoControlPlaying" class="pause-glyph">
            <i></i>
            <i></i>
          </span>
          <span v-else class="play-glyph"></span>
        </button>
        <input
          class="video-range video-progress"
          type="range"
          min="0"
          max="100"
          step="0.1"
          :value="videoProgressPercent"
          :style="{ '--fill': `${videoProgressPercent}%` }"
          aria-label="Progress"
          @input="handleVideoSeek"
        />
        <span class="video-time" :class="{ loading: isVideoBuffering }">{{ videoTimeText }}</span>
        <button
          class="video-control-btn video-volume-btn"
          type="button"
          :aria-label="isVideoMuted ? 'Unmute' : 'Mute'"
          @click="toggleVideoMuted"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4Z" />
            <path v-if="!isVideoMuted && videoVolumePercent > 0" d="M16 8.5c1.2 1.2 1.2 5.8 0 7" />
            <path v-if="!isVideoMuted && videoVolumePercent > 45" d="M18.5 6c2.4 2.4 2.4 9.6 0 12" />
            <path v-if="isVideoMuted || videoVolumePercent === 0" d="M17 9l5 5m0-5-5 5" />
          </svg>
        </button>
        <input
          class="video-range video-volume"
          type="range"
          min="0"
          max="100"
          step="1"
          :value="videoVolumePercent"
          :style="{ '--fill': `${videoVolumePercent}%` }"
          aria-label="Volume"
          @input="handleVideoVolume"
        />
        <button
          class="video-control-btn video-fullscreen-btn"
          type="button"
          :aria-label="isVideoFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
          @click="toggleVideoFullscreen"
        >
          <svg v-if="!isVideoFullscreen" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M10 3h3.6l-4 4L11 8.4l4-4V8h2V1h-7v2ZM7 9.6l-4 4V10H1v7h7v-2H4.4l4-4L7 9.6Z" />
          </svg>
          <svg v-else viewBox="0 0 18 18" aria-hidden="true">
            <path d="M15 4.4 11 8.4 9.6 7 13.6 3H10V1h7v7h-2V4.4ZM3 13.6 7 9.6 8.4 11l-4 4H8v2H1v-7h2v3.6Z" />
          </svg>
        </button>
      </div>
      <div
        v-else-if="isExcelFile"
        class="file-preview-wrap"
      >
        <div ref="excelPreviewRef" class="excel-preview-mount"></div>
      </div>
      <div
        v-else-if="imageSrc"
        class="media-image-wrap"
        :style="{ transform: `rotate(${rotation}deg)` }"
      >
        <img :src="imageSrc" alt="" class="media-image" />
      </div>
    </div>

    <div v-if="!isVideo || canOpenWithDefaultApp" class="bottom-actions">
      <button
        v-if="!isVideo && !isFile"
        class="action-btn"
        type="button"
        title="Rotate"
        @click="rotateImage"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M11.5 20.5C6.80558 20.5 3 16.6944 3 12C3 7.30558 6.80558 3.5 11.5 3.5C16.1944 3.5 20 7.30558 20 12C20 13.5433 19.5887 14.9905 18.8698 16.238M22.5 15L18.8698 16.238M17.1747 12.3832L18.5289 16.3542L18.8698 16.238"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        v-if="canOpenWithDefaultApp"
        class="action-btn-text"
        :class="{ 'action-btn-text-on-light-doc': isFile }"
        type="button"
        @click="openWithDefaultApp"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M10 3.778a6.222 6.222 0 1 0 3.726 11.205l-4.869-4.869v2.208a.889.889 0 0 1-1.778 0V7.968c0-.49.398-.889.89-.889h4.353a.889.889 0 0 1 0 1.778h-2.208l4.87 4.87A6.193 6.193 0 0 0 16.221 10 6.222 6.222 0 0 0 10 3.778ZM2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Z"
          />
        </svg>
        {{ t('使用默认应用打开') }}
      </button>
    </div>

    <ContextMenu
      v-model:visible="menuVisible"
      :x="menuX"
      :y="menuY"
      :items="contextMenuItems"
      variant="im"
      @select="handleMenuSelect"
    />

    <ImageOverwriteDialog
      v-model:visible="imageOverwriteVisible"
      :file-name="imageOverwriteFileName"
      :directory-name="imageOverwriteDirectoryName"
      @confirm="resolveImageOverwrite(true)"
      @cancel="resolveImageOverwrite(false)"
    />

    <Toast
      v-model:visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
    />
  </div>
</template>

<style lang="scss" scoped>
.media-viewer {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
  border-radius: 5px;
}

.media-viewer.is-video-mode {
  background: transparent;
  --media-chrome-bg: rgba(16, 16, 20, 0.95);
}

.media-viewer.is-file-mode {
  background: #f5f6f8;
  color: #1f2329;
  border-radius: 0;
}

.media-viewer.is-desktop-fullscreen {
  border-radius: 0;
  background: #000;
}

.media-viewer.is-desktop-fullscreen .media-titlebar {
  display: none;
}

.media-titlebar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 20;
}

.media-viewer.is-video-mode .media-titlebar {
  background: transparent;
  pointer-events: none;
}

.media-viewer.is-video-mode .media-titlebar .media-drag-layer,
.media-viewer.is-video-mode .media-titlebar .media-actions {
  pointer-events: auto;
}

.media-viewer.is-video-mode .media-title {
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.9),
    0 0 12px rgba(0, 0, 0, 0.65);
}

.media-viewer.is-video-mode .titlebar-btn {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.75));
}

.media-viewer.is-file-mode .media-titlebar {
  background: #252525;
  border-radius: 5px 5px 0 0;
  overflow: hidden;
}

.media-viewer.is-file-mode .media-title {
  position: absolute;
  left: 140px;
  right: 140px;
  margin: 0;
  text-align: center;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-drag-layer {
  position: absolute;
  inset: 0;
  right: 138px;
}

.media-title {
  position: relative;
  z-index: 1;
  margin-left: 12px;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.86);
  user-select: none;
  pointer-events: none;
}

.media-actions {
  position: relative;
  z-index: 1;
  display: flex;
  margin-left: auto;
}

.titlebar-btn {
  width: 46px;
  height: 32px;
  border: none;
  background: transparent;
  color: rgba(136, 136, 136) !important;
  cursor: pointer;
  position: relative;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  &.close:hover {
    background: #e81123;
    color: #fff !important;
  }
}

.line,
.square,
.restore,
.close-x {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  color: inherit;

}

.line {
  width: 12px;
  height: 12px;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}

.square {
  width: 12px;
  height: 12px;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}

.restore {
  width: 12px;
  height: 12px;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}

.close-x {
  width: 12px;
  height: 12px;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}

.media-stage {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  &.is-video {
    padding: 0;
  }
}

.media-stage.is-video-fullscreen {
  background: #000;
}

.media-video-shell {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 0;
  min-width: 0;
  background: var(--media-chrome-bg);
}

.media-viewer.is-video-mode:not(.is-desktop-fullscreen) .media-video-shell {
  align-items: center;
  justify-content: center;
}

.media-viewer.is-video-mode:not(.is-desktop-fullscreen) .media-video-shell.is-landscape-video {
  align-items: center;
}

.media-stage.is-video-fullscreen .media-video-shell {
  top: 0;
  inset: 0;
  align-items: center;
  background: #000;
}

.media-viewer.is-video-mode .media-video {
  background-color: var(--media-chrome-bg);
}

.media-viewer.is-desktop-fullscreen .media-video {
  background-color: #000;
}

.media-image-wrap {
  width: 100%;
  height: 100%;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.media-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

.file-preview-wrap {
  position: absolute;
  inset: 32px 0 0;
  overflow: hidden;
  background: #f5f6f8;
}

.excel-preview-mount {
  width: 100%;
  height: 100%;
  overflow: auto;
  background: #fff;
}

.media-video {
  display: block;
  flex: 0 1 auto;
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  object-fit: contain;
  outline: none;
}

.media-video-shell.has-video-cover:not(.is-video-ready) .media-video {
  opacity: 0;
}

.media-video-shell:not(.is-video-ready):not(.has-video-cover) .media-video {
  opacity: 0;
}

.media-video-cover {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

.media-video-waiting {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #202124;

  span {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.22);
    border-top-color: rgba(255, 255, 255, 0.82);
    animation: media-video-loading-spin 0.9s linear infinite;
  }
}

@keyframes media-video-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

.video-overlaid-play {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 90;
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

  &:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.85);
    outline-offset: 3px;
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

.video-controls {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 120;
  display: flex;
  align-items: center;
  gap: 9px;
  width: 70%;
  max-width: 600px;
  min-height: 44px;
  padding: 6px 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
  box-sizing: border-box;
}

.media-viewer.is-video-mode .video-controls {
  background: var(--media-chrome-bg);
  backdrop-filter: none;
}

.media-viewer.is-desktop-fullscreen .video-controls {
  background: rgba(0, 0, 0, 0.72);
}

.video-control-btn {
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

  &:focus-visible {
    outline: 2px solid rgba(123, 130, 255, 0.85);
    outline-offset: 2px;
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

.video-control-btn.loading {
  cursor: wait;
}

.video-fullscreen-btn svg {
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
    border-radius: 1px;
    background: #fff;
  }
}

.video-loading-glyph {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.28);
  border-top-color: #fff;
  animation: media-video-loading-spin 0.9s linear infinite;
}

.video-range {
  --fill: 0%;
  height: 18px;
  margin: 0;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  cursor: pointer;
  flex: 1 1 auto;
  min-width: 72px;

  &:focus-visible {
    outline: none;
  }

  &::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 99px;
    background: linear-gradient(to right, #7b82ff 0 var(--fill), rgba(255, 255, 255, 0.45) var(--fill) 100%);
  }

  &::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    margin-top: -5px;
    border: 0;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.38);
  }

  &::-moz-range-track {
    height: 4px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.45);
  }

  &::-moz-range-progress {
    height: 4px;
    border-radius: 99px;
    background: #7b82ff;
  }

  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: 0;
    border-radius: 50%;
    background: #fff;
  }
}

.video-progress {
  flex-basis: 280px;
}

.video-volume {
  flex: 0 0 84px;
  min-width: 64px;
}

.video-time {
  flex: 0 0 auto;
  min-width: 82px;
  color: #fff;
  font-size: 14px;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
}

.video-time.loading {
  opacity: 0.86;
}

.bottom-actions {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 100;
  display: flex;
  gap: 8px;
}

.media-viewer.is-video-mode .bottom-actions {
  z-index: 130;
}

.media-viewer.is-file-mode .bottom-actions {
  right: 16px;
  bottom: 16px;
}

.media-viewer.is-desktop-fullscreen .bottom-actions {
  display: none;
}

.action-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  svg {
    stroke: #aaa;
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  &:hover svg {
    stroke: #fff;
  }
}

.action-btn-text {
  padding: 8px 12px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #aaa;
  font-size: 12px;

  svg {
    width: 16px;
    height: 16px;
    fill: #aaa;
    flex-shrink: 0;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }

  &:hover svg {
    fill: #fff;
  }
}

.action-btn-text.action-btn-text-on-light-doc {
  background: rgba(35, 51, 73, 0.72);
  color: #e7eef8;

  svg {
    fill: #e7eef8;
  }

  &:hover {
    background: rgba(35, 51, 73, 0.86);
    color: #fff;
  }

  &:hover svg {
    fill: #fff;
  }
}
</style>

<style lang="scss">
html.media-viewer-page,
body.media-viewer-page,
#app.media-viewer-page {
  background-color: transparent !important;
}
</style>
