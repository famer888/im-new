<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { ensureGroupRelKey } from '@/utils/e2ee'
import { mediaViewerState } from '@/utils/mediaViewerState'
import { getMediaWindowBounds } from '@/utils/mediaWindowSize'
import { isLocalLikePath, toDisplaySrc, toFsPath } from '@/utils/resourcePath'

const props = defineProps<{
  message: Message
}>()

const authStore = useAuthStore()
const isLoaded = ref(false)
const loadError = ref(false)
const activeSrc = ref('')
const localFilePath = ref('')
const showPreview = ref(false)
const imageElRef = ref<HTMLImageElement | null>(null)
const naturalImageWidth = ref(0)
const naturalImageHeight = ref(0)
let downloadToken = 0
let materializeToken = 0
let stopDownloadEvents: Array<() => void> = []
let nativeDragStartPoint: { x: number; y: number } | null = null
let nativeDragStarted = false
let suppressNextClick = false

const NATIVE_DRAG_THRESHOLD = 4

type ImageDisplayCacheEntry = {
  src: string
  localFilePath: string
  cachedAt: number
}

type LocalFilePayload = {
  mime?: string
  dataBase64?: string
  data_base64?: string
}

const IMAGE_DISPLAY_CACHE_MAX = 240
const imageDisplayCache = new Map<string, ImageDisplayCacheEntry>()

function getCachedImage(key: string) {
  const entry = imageDisplayCache.get(key)
  if (!entry) return null
  imageDisplayCache.delete(key)
  imageDisplayCache.set(key, entry)
  return entry
}

function setCachedImage(key: string, entry: Omit<ImageDisplayCacheEntry, 'cachedAt'>) {
  if (!key || !entry.src || entry.src.startsWith('blob:')) return
  imageDisplayCache.delete(key)
  imageDisplayCache.set(key, {
    ...entry,
    cachedAt: Date.now(),
  })
  while (imageDisplayCache.size > IMAGE_DISPLAY_CACHE_MAX) {
    const oldestKey = imageDisplayCache.keys().next().value
    if (!oldestKey) break
    imageDisplayCache.delete(oldestKey)
  }
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
    const mime = String(mimeType || 'image/png').trim() || 'image/png'
    return `data:${mime};base64,${raw}`
  }
  return raw
}

function extractImageUrlFromRawContent(raw: string): string {
  const value = String(raw || '').trim()
  if (!value) return ''
  const match = value.match(/https?:\/\/[^\s"'<>\\*`]+/i)
  return match?.[0] || value
}

function isRemoteImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src)
}

const imageData = computed((): {
  url: string
  thumbnailUrl: string
  name: string
  localPath: string
  width: number
  height: number
  size: number
} => {
  const raw = (props.message.content ?? '').trim()
  if (!raw) return { url: '', thumbnailUrl: '', name: '', localPath: '', width: 0, height: 0, size: 0 }

  try {
    const parsed = JSON.parse(raw)
    const localPath = String(
      parsed.localPath || parsed.local_path || parsed.filePath || parsed.file_path || parsed.local || '',
    ).trim()
    const name = String(parsed.name || parsed.fileName || parsed.file_name || '').trim()
    const url = normalizeImageSrc(
      parsed.url || parsed.fileUrl || parsed.path || parsed.dataUrl || parsed.data_url || parsed.base64 || '',
      parsed.mimeType || parsed.mime_type || parsed.mime,
    )
    const thumbnailUrl = normalizeImageSrc(
      parsed.thumbnailUrl || parsed.thumbUrl || parsed.thumbnail || parsed.thumbBase64 || parsed.thumb_base64 || url,
      parsed.thumbMimeType || parsed.thumb_mime_type || parsed.mimeType || parsed.mime_type || parsed.mime,
    )
    return {
      url,
      thumbnailUrl,
      name,
      localPath,
      width: Number(parsed.width || 0),
      height: Number(parsed.height || 0),
      size: Number(parsed.size || parsed.fileSize || 0),
    }
  } catch {
    const extractedUrl = extractImageUrlFromRawContent(raw)
    const [url = '', thumbUrl = '', size = '0'] = extractedUrl.split('||')
    const normalizedUrl = normalizeImageSrc(url)
    const normalizedThumbUrl = normalizeImageSrc(thumbUrl)
    return {
      url: normalizedUrl,
      thumbnailUrl: normalizedThumbUrl || normalizedUrl,
      name: '',
      localPath: '',
      width: 0,
      height: 0,
      size: Number(size || 0),
    }
  }
})

function toDisplayImageSrc(src: string): string {
  return toDisplaySrc(src)
}

const localSourcePath = computed(() => {
  const explicitPath = imageData.value.localPath
  if (explicitPath) return toFsPath(explicitPath)
  const url = imageData.value.url
  if (isLocalLikePath(url)) return toFsPath(url)
  const thumbnail = imageData.value.thumbnailUrl
  if (isLocalLikePath(thumbnail)) return toFsPath(thumbnail)
  return ''
})
const thumbnailUrl = computed(() => toDisplayImageSrc(imageData.value.thumbnailUrl || imageData.value.url || ''))
const downloadUrl = computed(() => {
  const original = imageData.value.url
  const thumbnail = thumbnailUrl.value
  if (isRemoteImageSrc(original)) return original
  if (isRemoteImageSrc(thumbnail)) return thumbnail
  return ''
})
const isVideo = computed(() => props.message.msgType === 3)
const previewSrc = computed(() => activeSrc.value || imageData.value.url)
const dragFileName = computed(() =>
  pathFileName(localFilePath.value) || getImageFileName(downloadUrl.value || imageData.value.url, imageData.value.name),
)
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
const isOwnSingleImageUploadPlaceholder = computed(() => {
  const type = Number(props.message.msgType)
  // 与旧版发送交互对齐：只要是自己发送中的图片消息（status=0），单聊/群聊/频道都显示同款 loading 蒙层。
  return (type === 1 || type === 9)
    && String(props.message.senderId || '') === String(authStore.uid || '')
    && Number(props.message.status) === 0
})
const isOwnSingleImageUploading = computed(() =>
  isOwnSingleImageUploadPlaceholder.value && Number(props.message.status) === 0,
)
const showImageLoading = computed(() => {
  if (isOwnSingleImageUploadPlaceholder.value) return isOwnSingleImageUploading.value
  return !activeSrc.value || (!isLoaded.value && !loadError.value)
})
const showImageOverlay = computed(() => !loadError.value && showImageLoading.value)
const canOpenPreview = computed(() => Boolean(previewSrc.value) && isLoaded.value && !loadError.value && !showImageOverlay.value)
const imageBoxStyle = computed(() => {
  if (!activeSrc.value) {
    return {
      width: '120px',
      height: '150px',
    }
  }

  const sourceWidth = imageData.value.width || naturalImageWidth.value
  const sourceHeight = imageData.value.height || naturalImageHeight.value
  const height = 150
  const minWidth = 120
  const maxWidth = 400
  const ratio = sourceWidth > 0 && sourceHeight > 0
    ? sourceWidth / sourceHeight
    : 1
  const width = Math.min(maxWidth, Math.max(minWidth, Math.round(height * ratio)))

  return {
    width: `${width}px`,
    height: `${height}px`,
  }
})
const fileKey = computed(() => String(extraData.value.fileKey || extraData.value.file_key || '').trim())
const attachmentKey = computed(() =>
  String(extraData.value.attachmentKey || extraData.value.attachment_key || '').trim(),
)
const groupId = computed(() => {
  const extraGroupId = String(extraData.value.groupId || '').trim()
  if (extraGroupId) return extraGroupId
  const convId = props.message.conversationId || ''
  return convId.startsWith('1_') ? convId.split('_')[1] || '' : ''
})
const imageCacheKey = computed(() => [
  props.message.id || '',
  props.message.customMsgId || '',
  imageData.value.name || '',
  localSourcePath.value || '',
  downloadUrl.value || imageData.value.url || '',
  thumbnailUrl.value || '',
  fileKey.value || '',
  attachmentKey.value || '',
].join('|'))

watch([thumbnailUrl, downloadUrl, localSourcePath, fileKey, attachmentKey, isOwnSingleImageUploadPlaceholder], () => {
  isLoaded.value = false
  loadError.value = false
  activeSrc.value = ''
  localFilePath.value = ''
  if (isOwnSingleImageUploadPlaceholder.value) {
    // 发送中的本地图片也先渲染缩略图，避免仅显示灰色加载蒙层。
    cleanupDownloadEvents()
    if (localSourcePath.value) {
      localFilePath.value = localSourcePath.value
    }
    activeSrc.value = thumbnailUrl.value
    materializeDataImageForDrag()
    markLoadedIfImageAlreadyComplete()
    return
  }
  if (!thumbnailUrl.value && !imageData.value.url && !fileKey.value && !attachmentKey.value) {
    loadError.value = true
    isLoaded.value = true
    return
  }
  const cached = getCachedImage(imageCacheKey.value)
  if (cached) {
    activeSrc.value = cached.src
    localFilePath.value = cached.localFilePath
    loadError.value = false
    isLoaded.value = true
    return
  }
  if ((fileKey.value || attachmentKey.value) && downloadUrl.value) {
    downloadAndDecryptImage()
    return
  }
  if (localSourcePath.value) {
    localFilePath.value = localSourcePath.value
  }
  activeSrc.value = thumbnailUrl.value
  materializeDataImageForDrag()
  markLoadedIfImageAlreadyComplete()
}, { immediate: true })

function handleLoad() {
  naturalImageWidth.value = imageElRef.value?.naturalWidth || 0
  naturalImageHeight.value = imageElRef.value?.naturalHeight || 0
  isLoaded.value = true
  setCachedImage(imageCacheKey.value, {
    src: activeSrc.value,
    localFilePath: localFilePath.value,
  })
}

function markLoadedIfImageAlreadyComplete() {
  nextTick(() => {
    requestAnimationFrame(() => {
      const img = imageElRef.value
      if (!img || !activeSrc.value || loadError.value) return
      if (img.complete && img.naturalWidth > 0) {
        handleLoad()
      }
    })
  })
}

function handleError() {
  if (isOwnSingleImageUploadPlaceholder.value) return
  const originalUrl = imageData.value.url
  if (!fileKey.value && !attachmentKey.value && originalUrl && activeSrc.value !== originalUrl) {
    activeSrc.value = originalUrl
    isLoaded.value = false
    return
  }
  loadError.value = true
  isLoaded.value = true
}

async function openPreview() {
  if (!canOpenPreview.value) return
  if (!(window as any).__TAURI_INTERNALS__) {
    showPreview.value = true
    return
  }
  try {
    const [{ invoke }, windowApi] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/window') as Promise<any>,
    ])
    const bounds = await getMediaWindowBounds(windowApi)

    mediaViewerState.send({
      title: '图片',
      mediaType: 'image',
      src: previewSrc.value,
      filePath: localFilePath.value || null,
      width: imageData.value.width || undefined,
      height: imageData.value.height || undefined,
    })

    await invoke('open_media_window', {
      title: '图片',
      ...bounds,
    })
  } catch (error) {
    console.warn('[image] open media window failed:', error)
    showPreview.value = true
  }
}

async function openWithDefaultApp() {
  const filePath = String(localFilePath.value || '').trim()
  if (!filePath) return
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(filePath)
  } catch (error) {
    console.warn('[image] openWithDefaultApp failed:', error)
  }
}

function cleanupDownloadEvents() {
  stopDownloadEvents.forEach(stop => stop())
  stopDownloadEvents = []
}

function getFileSuffix(chatType: number, fileUrl: string): string {
  let suffix = fileUrl.slice(fileUrl.lastIndexOf('.'))
  if ([1, 2, 3, 9].includes(chatType) && (suffix.length < 2 || suffix.length > 7)) {
    if (chatType === 1) suffix = '.png'
    else if (chatType === 2) suffix = '.mp4'
    else if (chatType === 3) suffix = '.png'
    else if (chatType === 9) suffix = '.gif'
  } else {
    suffix = ''
  }
  return suffix
}

function getImageFileName(fileUrl: string, explicitName = ''): string {
  if (explicitName.trim()) return pathFileName(explicitName.trim()) || safeFileName(explicitName.trim())
  const cleanFileUrl = String(fileUrl || '').split('||')[0].trim()
  if (/^data:image\//i.test(cleanFileUrl)) return 'image.png'
  const suffix = getFileSuffix(props.message.msgType, cleanFileUrl)
  const fileName = cleanFileUrl.slice(cleanFileUrl.lastIndexOf('/') + 1) + suffix
  return safeFileName(fileName || `image${suffix || '.png'}`)
}

function safeName(name: string): string {
  return name.replace(/[^\w.-]/g, '_') || 'image'
}

function safeFileName(name: string): string {
  return name.replace(/[\\/]/g, '_').replace(/\0/g, '') || 'image.png'
}

function pathFileName(path: string): string {
  const raw = String(path || '').trim()
  if (!raw) return ''
  return safeFileName(raw.split(/[\\/]/).pop() || '')
}

function toFileDragUrl(path: string): string {
  const raw = String(path || '').trim()
  if (!raw) return ''
  const normalized = raw.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalized)) return encodeURI(`file:///${normalized}`)
  if (normalized.startsWith('/')) return encodeURI(`file://${normalized}`)
  return ''
}

function inferImageMimeType(fileName: string, src: string): string {
  const dataUrlMatch = String(src || '').match(/^data:(image\/[a-z0-9.+-]+);/i)
  if (dataUrlMatch?.[1]) return dataUrlMatch[1]

  const lowerName = String(fileName || '').toLowerCase()
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg'
  if (lowerName.endsWith('.gif')) return 'image/gif'
  if (lowerName.endsWith('.webp')) return 'image/webp'
  if (lowerName.endsWith('.bmp')) return 'image/bmp'
  if (lowerName.endsWith('.avif')) return 'image/avif'
  if (lowerName.endsWith('.svg')) return 'image/svg+xml'
  return 'image/png'
}

function imageDragLog(
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
) {
  const payload = data || {}
  if (level === 'error') console.error(`[image-drag] ${message}`, payload)
  else if (level === 'warn') console.warn(`[image-drag] ${message}`, payload)
  else console.info(`[image-drag] ${message}`, payload)

  if (!(window as any).__TAURI_INTERNALS__) return
  import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('image_send_log', {
      payload: {
        level,
        message: `[image-drag] ${message}`,
        data: payload,
      },
    }))
    .catch(() => {})
}

const shouldUseNativeFileDrag = computed(() => {
  if (!(window as any).__TAURI_INTERNALS__) return false
  const runtimePlatform = String((window as any).__OCS_RUNTIME_PLATFORM__ || '').toLowerCase()
  // macOS/Windows 桌面端统一走原生文件拖拽，避免 HTML 拖拽被系统当成文本剪贴生成“@ FILE”。
  if (runtimePlatform === 'macos' || runtimePlatform === 'darwin') return true
  if (runtimePlatform === 'windows') return true
  return /mac|darwin|windows|win32|win64/i.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`)
})

async function getImageSavePath(join: (...paths: string[]) => Promise<string>, baseDir: string, msgId: string, fileName: string) {
  const uid = safeName(String(authStore.uid || '0'))
  if (groupId.value) {
    return join(baseDir, 'Local Storage', uid, `group-${safeName(groupId.value)}`, msgId, fileName)
  }
  return join(baseDir, 'image-cache', msgId, fileName)
}

async function resolveFileKey(): Promise<string> {
  if (fileKey.value) return fileKey.value
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

async function downloadAndDecryptImage() {
  if (isOwnSingleImageUploadPlaceholder.value) return
  const url = downloadUrl.value
  const key = await resolveFileKey()
  if (!url || !key) {
    loadError.value = true
    isLoaded.value = true
    return
  }

  const token = ++downloadToken
  cleanupDownloadEvents()

  try {
    const [{ invoke }, { appDataDir, join }, { listen }] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/path'),
      import('@tauri-apps/api/event'),
    ])
    const baseDir = await appDataDir()
    const id = safeName(props.message.id || props.message.customMsgId || `${Date.now()}`)
    const savePath = await getImageSavePath(join, baseDir, id, getImageFileName(url, imageData.value.name))
    localFilePath.value = savePath
    const doneEvent = `file:done:${id}`
    const errorEvent = `file:error:${id}`

    const unlistenDone = await listen<{ dataUrl?: string; data_url?: string }>(doneEvent, (event) => {
      if (token !== downloadToken) return
      cleanupDownloadEvents()
      const src = toDisplayImageSrc(savePath) || event.payload.dataUrl || event.payload.data_url || ''
      if (!src) {
        loadError.value = true
        isLoaded.value = true
        return
      }
      loadError.value = false
      isLoaded.value = false
      activeSrc.value = src
      markLoadedIfImageAlreadyComplete()
      setCachedImage(imageCacheKey.value, {
        src,
        localFilePath: localFilePath.value,
      })
    })
    const unlistenError = await listen(errorEvent, () => {
      if (token !== downloadToken) return
      cleanupDownloadEvents()
      loadError.value = true
      isLoaded.value = true
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
    loadError.value = true
    isLoaded.value = true
  }
}

async function materializeDataImageForDrag() {
  if (isOwnSingleImageUploadPlaceholder.value) return
  const src = String(activeSrc.value || '').trim()
  if (!(window as any).__TAURI_INTERNALS__ || localFilePath.value || !/^data:image\//i.test(src)) return

  const token = ++materializeToken
  try {
    const [{ invoke }, { appDataDir, join }] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/path'),
    ])
    const baseDir = await appDataDir()
    const id = safeName(props.message.id || props.message.customMsgId || `${Date.now()}`)
    const savePath = await getImageSavePath(join, baseDir, id, getImageFileName(imageData.value.url, imageData.value.name))
    await invoke('save_base64_image', {
      filePath: savePath,
      base64Data: src,
    })
    if (token !== materializeToken || localFilePath.value) return
    localFilePath.value = savePath
    activeSrc.value = toDisplayImageSrc(savePath)
    setCachedImage(imageCacheKey.value, {
      src: activeSrc.value,
      localFilePath: savePath,
    })
  } catch (error) {
    console.warn('[image] materialize data image for drag failed:', error)
  }
}

function handleImageDragStart(event: DragEvent) {
  if (shouldUseNativeFileDrag.value) {
    // Windows 由原生拖拽命令接管，避免 WebView2 的 HTML 拖拽被桌面拒收（🚫）。
    imageDragLog('html dragstart blocked: native drag mode enabled', {
      messageId: props.message.id || props.message.customMsgId || '',
      localFilePath: localFilePath.value,
      runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
    })
    event.preventDefault()
    return
  }
  if (!localFilePath.value) {
    // 先记录拖拽失败原因：没有本地文件路径时，Windows 桌面一定无法接收文件拖拽。
    imageDragLog('dragstart skipped: local file path missing', {
      messageId: props.message.id || props.message.customMsgId || '',
      activeSrcHead: String(activeSrc.value || '').slice(0, 120),
      runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
    }, 'warn')
    return
  }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
    const fileUrl = toFileDragUrl(localFilePath.value)
    if (!fileUrl) {
      imageDragLog('dragstart skipped: failed to build file url', {
        localFilePath: localFilePath.value,
        runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
      }, 'warn')
      return
    }
    const fileName = dragFileName.value || 'image.png'
    const mimeType = inferImageMimeType(fileName, activeSrc.value)
    // Windows WebView 需要 DownloadURL 才能把聊天图片真正拖出到桌面文件系统。
    event.dataTransfer.setData('DownloadURL', `${mimeType}:${fileName}:${fileUrl}`)
    event.dataTransfer.setData('text/uri-list', fileUrl)
    event.dataTransfer.setData('text/plain', fileUrl)
    imageDragLog('dragstart data prepared', {
      messageId: props.message.id || props.message.customMsgId || '',
      localFilePath: localFilePath.value,
      fileUrl,
      fileName,
      mimeType,
      dragTypes: Array.from(event.dataTransfer.types || []),
      runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
    })
  }
}

function cleanupNativeImageDragListeners() {
  window.removeEventListener('mousemove', handleNativeDragMouseMove, true)
  window.removeEventListener('mouseup', handleNativeDragMouseUp, true)
}

function getPreparedNativeDragPath(): string {
  const filePath = String(localFilePath.value || '').trim()
  if (!filePath || /^(https?|blob|data):/i.test(filePath)) return ''
  return filePath
}

async function buildPluginDragIcon(filePath: string): Promise<string> {
  if (!(window as any).__TAURI_INTERNALS__) return filePath
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    // 直接读取本地文件生成 data URL，避免 canvas 跨域污染导致 toDataURL 失败。
    const files = await invoke<LocalFilePayload[]>('read_local_files', {
      paths: [filePath],
    })
    const payload = files?.[0]
    const dataBase64 = String(payload?.dataBase64 || payload?.data_base64 || '').trim()
    if (!dataBase64) {
      imageDragLog('plugin drag icon fallback: local file payload empty', {
        messageId: props.message.id || props.message.customMsgId || '',
        localFilePath: filePath,
        runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
      }, 'warn')
      return filePath
    }
    const mime = String(payload?.mime || '').trim().toLowerCase()
    if (mime && !mime.startsWith('image/')) {
      imageDragLog('plugin drag icon fallback: local file mime is not image', {
        messageId: props.message.id || props.message.customMsgId || '',
        localFilePath: filePath,
        runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
        mime,
      }, 'warn')
      return filePath
    }
    const mimeType = mime || inferImageMimeType(dragFileName.value || pathFileName(filePath), activeSrc.value)
    return `data:${mimeType};base64,${dataBase64}`
  } catch (error) {
    imageDragLog('plugin drag icon fallback: read local file failed', {
      messageId: props.message.id || props.message.customMsgId || '',
      localFilePath: filePath,
      runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
      error: error instanceof Error ? error.message : String(error || ''),
    }, 'warn')
    return filePath
  }
}

async function startNativeImageFileDrag(filePath: string) {
  if (!(window as any).__TAURI_INTERNALS__ || !filePath) return

  try {
    const [{ getCurrentWindow }, { startDrag }] = await Promise.all([
      import('@tauri-apps/api/window'),
      import('@crabnebula/tauri-plugin-drag'),
    ])
    const runtimePlatform = String((window as any).__OCS_RUNTIME_PLATFORM__ || '').toLowerCase()

    // Windows 优先走 drag 插件以提供系统级拖拽预览动画；失败时再回退旧原生方案。
    if (runtimePlatform === 'windows' || /windows|win32|win64/i.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`)) {
      try {
        let pluginDropResult = ''
        let pluginDropCursor: { x: number; y: number } | null = null
        const dragIcon = await buildPluginDragIcon(filePath)
        await startDrag({
          item: [filePath],
          icon: dragIcon,
          mode: 'copy',
        }, (event) => {
          pluginDropResult = String(event.result || '')
          pluginDropCursor = {
            x: Number(event.cursorPos?.x || 0),
            y: Number(event.cursorPos?.y || 0),
          }
          const normalized = pluginDropResult.toLowerCase()
          // 记录插件拖拽最终状态，便于判断是被目标拒收还是用户取消。
          imageDragLog('plugin drag event', {
            messageId: props.message.id || props.message.customMsgId || '',
            localFilePath: filePath,
            iconKind: dragIcon.startsWith('data:image/png;base64,') ? 'base64' : 'path',
            runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
            result: event.result,
            cursorPos: event.cursorPos,
          }, (normalized === 'cancel' || normalized === 'cancelled') ? 'warn' : 'info')
        })
        imageDragLog('plugin drag invoked', {
          messageId: props.message.id || props.message.customMsgId || '',
          localFilePath: filePath,
          iconKind: dragIcon.startsWith('data:image/png;base64,') ? 'base64' : 'path',
          runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
        })

        const normalizedPluginResult = pluginDropResult.toLowerCase()
        if (normalizedPluginResult === 'cancel' || normalizedPluginResult === 'cancelled') {
          imageDragLog('plugin drag cancelled, fallback to native drag', {
            messageId: props.message.id || props.message.customMsgId || '',
            localFilePath: filePath,
            runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
            pluginResult: pluginDropResult,
            cursorPos: pluginDropCursor,
          }, 'warn')
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('start_native_file_drag', { path: filePath })
          imageDragLog('native drag invoked after plugin cancel', {
            messageId: props.message.id || props.message.customMsgId || '',
            localFilePath: filePath,
            runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
          })
        }
        return
      } catch (pluginError) {
        imageDragLog('plugin drag invoke failed, fallback to native drag', {
          messageId: props.message.id || props.message.customMsgId || '',
          localFilePath: filePath,
          runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
          error: pluginError instanceof Error ? pluginError.message : String(pluginError || ''),
        }, 'warn')
      }
    }

    // 非 Windows 或插件不可用时，再聚焦窗口并走现有原生兜底逻辑。
    await getCurrentWindow().setFocus().catch(() => {})
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('start_native_file_drag', { path: filePath })
    imageDragLog('native drag invoked (fallback)', {
      messageId: props.message.id || props.message.customMsgId || '',
      localFilePath: filePath,
      runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
    })
  } catch (error) {
    imageDragLog('native drag invoke failed', {
      messageId: props.message.id || props.message.customMsgId || '',
      localFilePath: filePath,
      runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
      error: error instanceof Error ? error.message : String(error || ''),
    }, 'error')
  } finally {
    window.setTimeout(() => {
      suppressNextClick = false
    }, 300)
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
  cleanupNativeImageDragListeners()
  nativeDragStartPoint = null

  const filePath = getPreparedNativeDragPath()
  if (!filePath) {
    imageDragLog('native drag skipped: local file path missing', {
      messageId: props.message.id || props.message.customMsgId || '',
      localFilePath: String(localFilePath.value || '').trim(),
      activeSrcHead: String(activeSrc.value || '').slice(0, 120),
      runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
    }, 'warn')
    void materializeDataImageForDrag()
    return
  }
  void startNativeImageFileDrag(filePath)
}

function handleNativeDragMouseUp() {
  nativeDragStartPoint = null
  nativeDragStarted = false
  cleanupNativeImageDragListeners()
}

function handleNativeDragMouseDown(event: MouseEvent) {
  if (!shouldUseNativeFileDrag.value || !(window as any).__TAURI_INTERNALS__) return
  if (event.button !== 0) return
  const filePath = getPreparedNativeDragPath()
  if (!filePath) {
    imageDragLog('native drag skipped: local file path missing', {
      messageId: props.message.id || props.message.customMsgId || '',
      localFilePath: filePath,
      activeSrcHead: String(activeSrc.value || '').slice(0, 120),
      runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
    }, 'warn')
    void materializeDataImageForDrag()
    return
  }

  event.preventDefault()
  event.stopPropagation()
  nativeDragStartPoint = { x: event.clientX, y: event.clientY }
  nativeDragStarted = false
  cleanupNativeImageDragListeners()
  window.addEventListener('mousemove', handleNativeDragMouseMove, true)
  window.addEventListener('mouseup', handleNativeDragMouseUp, true)
}

function handleImageWrapperClick(event: MouseEvent) {
  if (suppressNextClick) {
    event.preventDefault()
    event.stopPropagation()
    suppressNextClick = false
    return
  }
  void openPreview()
}

function handleImageDragEnd(event: DragEvent) {
  imageDragLog('dragend', {
    messageId: props.message.id || props.message.customMsgId || '',
    localFilePath: localFilePath.value,
    dropEffect: event.dataTransfer?.dropEffect || '',
    runtimePlatform: (window as any).__OCS_RUNTIME_PLATFORM__ || 'unknown',
  })
}

onBeforeUnmount(() => {
  downloadToken += 1
  materializeToken += 1
  nativeDragStartPoint = null
  nativeDragStarted = false
  cleanupNativeImageDragListeners()
  cleanupDownloadEvents()
})
</script>

<template>
  <div class="image-message">
    <div
      class="image-wrapper"
      :class="{ 'is-preview-ready': canOpenPreview }"
      :style="imageBoxStyle"
      @mousedown.left="handleNativeDragMouseDown"
      @click="handleImageWrapperClick"
    >
      <img
        v-if="activeSrc && !loadError"
        ref="imageElRef"
        :src="activeSrc"
        :data-local-path="localFilePath || undefined"
        :draggable="!shouldUseNativeFileDrag"
        :alt="dragFileName"
        :title="dragFileName"
        :class="{ loaded: isLoaded }"
        @dragstart="handleImageDragStart"
        @dragend="handleImageDragEnd"
        @load="handleLoad"
        @error="handleError"
      />
      <div v-if="showImageOverlay" class="image-loading">
        <div class="loading-mask"></div>
        <div class="loading-control">
          <div class="progress-ring spinning">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <circle
                class="ring-bg"
                cx="24"
                cy="24"
                r="21"
                fill="none"
                stroke-width="2"
              />
              <circle
                class="ring-progress"
                cx="24"
                cy="24"
                r="21"
                fill="none"
                stroke-width="2"
              />
            </svg>
          </div>
          <div class="pause-icon" aria-hidden="true">
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
      <div v-if="loadError" class="image-error">图片加载失败</div>
      <div v-if="isVideo" class="play-icon">▶</div>
    </div>

    <Teleport to="body">
      <div v-if="showPreview" class="image-preview">
        <div class="preview-titlebar">
          <span class="preview-title">图片</span>
          <button class="preview-close" type="button" @click="showPreview = false">×</button>
        </div>
        <div class="preview-stage" @click="showPreview = false">
          <img :src="previewSrc" alt="" @click.stop />
        </div>
        <div class="preview-actions">
          <button
            v-if="localFilePath"
            class="preview-action-btn"
            type="button"
            @click="openWithDefaultApp"
          >
            使用默认应用打开
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.image-message {
  .image-wrapper {
    position: relative;
    border-radius: 10px;
    overflow: hidden;
    cursor: default;
    min-width: 120px;
    min-height: 150px;
    background: transparent;

    &.is-preview-ready {
      cursor: pointer;
    }

    img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: contain;
      border-radius: 10px;
      opacity: 0;
      user-select: none;
      -webkit-user-drag: element;

      &.loaded {
        opacity: 1;
      }
    }
  }

  .image-loading {
    position: absolute;
    inset: 0;
    z-index: 2;
    border-radius: 10px;
    overflow: hidden;
    pointer-events: none;
  }

  .loading-mask {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.27);
  }

  .loading-control {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 3;
    width: 48px;
    height: 48px;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
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
      stroke-dasharray: 40 92;
      stroke-dashoffset: 0;
      stroke-linecap: round;
    }

    &.spinning {
      animation: image-loading-spin 1.2s linear infinite;
    }
  }

  .pause-icon {
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;

    span {
      width: 4px;
      height: 16px;
      background: #fff;
      border-radius: 1px;
    }
  }

  .image-error {
    width: 100%;
    height: 100%;
    background: #b8babf;
    border-radius: 10px;
    color: #999;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .play-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 40px;
    height: 40px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 16px;
  }
}

@keyframes image-loading-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.image-preview {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.82);
}

.preview-titlebar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 0 12px;
  box-sizing: border-box;
}

.preview-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.86);
}

.preview-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.14);
  }
}

.preview-stage {
  position: absolute;
  inset: 34px 0 68px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;

  img {
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 118px);
    object-fit: contain;
    cursor: default;
    user-select: none;
    -webkit-user-drag: none;
  }
}

.preview-actions {
  position: absolute;
  right: 16px;
  bottom: 16px;
}

.preview-action-btn {
  min-height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.88);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
