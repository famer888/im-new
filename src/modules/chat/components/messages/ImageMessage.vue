<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { isOfficialAccountTargetId } from '@/stores/useChatStore'
import { ensureChannelRelKey, ensureGroupRelKey, normalizeResolvedFileKey, readMessageAttachmentKey, resolvePrivateAttachmentFileKey } from '@/utils/e2ee'
import { API_CONFIG } from '@/api/config'
import { mediaViewerState } from '@/utils/mediaViewerState'
import { getOssDownloadCandidates } from '@/utils/ossDownload'
import { getMediaWindowBounds } from '@/utils/mediaWindowSize'
import { isLocalLikePath, isRemoteUrl, toDisplaySrc, toFsPath } from '@/utils/resourcePath'
import { isChannelContentSaveRestricted } from '@/utils/channelContentLimit'
import { eventBus } from '@/utils/eventBus'
import { getImageAutoRetryDelay } from '@/utils/imageLoadRetry'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  message: Message
  /** 多图子格下载限流：对齐旧 im，最多 3 个并发下载。 */
  acquireDownloadSlot?: () => Promise<() => void>
}>()

const emit = defineEmits<{
  'transfer-attempt': [payload: { started: boolean }]
}>()

const authStore = useAuthStore()
const messageStore = useMessageStore()
const { t } = useI18n()
const showPreview = ref(false)
const imageElRef = ref<HTMLImageElement | null>(null)
const naturalImageWidth = ref(0)
const naturalImageHeight = ref(0)
const dynamicImageHeadKeyFallbackStarted = ref(false)
const invalidLocalCacheRedownloadStarted = ref(false)
const thumbnailDownloadFallbackUsed = ref(false)
const downloadInFlight = ref(false)
const imageRenderKey = ref(0)
let releaseDownloadSlot: (() => void) | null = null
let downloadToken = 0
let activeDownloadSignature = ''
let imageAutoRetryTimer: ReturnType<typeof setTimeout> | null = null
let imageAutoRetryAttempt = 0
let imageAutoRetrySignature = ''
let materializeToken = 0
let plainRemoteCacheToken = 0
let stopDownloadEvents: Array<() => void> = []
let stopPlainRemoteCacheEvents: Array<() => void> = []
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

const IMAGE_DISPLAY_CACHE_MAX = 800
const imageDisplayCache = new Map<string, ImageDisplayCacheEntry>()
/** 已确认加载失败的图片：切会话/聚焦/重挂载时不再自动重下，避免频道失败图反复转圈。 */
const IMAGE_LOAD_FAILURE_CACHE_MAX = 800
type ImageLoadFailureStatus = 'downloadError' | 'decryptionError'
const imageLoadFailureCache = new Map<string, ImageLoadFailureStatus>()

function getCachedImage(key: string) {
  const entry = imageDisplayCache.get(key)
  if (!entry) return null
  imageDisplayCache.delete(key)
  imageDisplayCache.set(key, entry)
  return entry
}

function setCachedImage(key: string, entry: Omit<ImageDisplayCacheEntry, 'cachedAt'>) {
  if (!key || !entry.src || entry.src.startsWith('blob:')) return
  // 需解密的图片不能把远端缩略图地址单独缓存，否则切回会话后会误判为已加载。
  if (isRemoteImageSrc(entry.src) && !isTrustedPersistedLocalPath(entry.localFilePath)) return
  clearCachedImageLoadFailure(key)
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

function deleteCachedImage(key: string) {
  if (!key) return
  imageDisplayCache.delete(key)
}

function hasCachedImageLoadFailure(key: string): boolean {
  return Boolean(key) && imageLoadFailureCache.has(key)
}

function getCachedImageLoadFailure(key: string): ImageLoadFailureStatus | null {
  if (!key) return null
  return imageLoadFailureCache.get(key) || null
}

function markCachedImageLoadFailure(key: string, status: ImageLoadFailureStatus = 'downloadError') {
  if (!key) return
  imageLoadFailureCache.delete(key)
  imageLoadFailureCache.set(key, status)
  while (imageLoadFailureCache.size > IMAGE_LOAD_FAILURE_CACHE_MAX) {
    const oldestKey = imageLoadFailureCache.keys().next().value
    if (!oldestKey) break
    imageLoadFailureCache.delete(oldestKey)
  }
}

function clearCachedImageLoadFailure(key: string) {
  if (!key) return
  imageLoadFailureCache.delete(key)
}

function readImageLoadFailureForMessage(
  message: Pick<Message, 'conversationId' | 'id' | 'customMsgId' | 'sendTime'>,
): ImageLoadFailureStatus | null {
  const stableKey = buildImageCacheKey(message)
  const direct = getCachedImageLoadFailure(stableKey)
  if (direct) return direct
  const idParts = [message.id, message.customMsgId]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  for (const id of idParts) {
    const legacyKey = `${String(message.conversationId || '')}|${id}|${String(message.sendTime || '')}`
    const legacy = getCachedImageLoadFailure(legacyKey)
    if (legacy) return legacy
  }
  return null
}

/** 对齐旧 im Overlay：downloadError→图片已过期；decryptionError→解密/无法加载。 */
function classifyImageLoadFailure(
  reason: string,
  failure: Record<string, unknown> = {},
): ImageLoadFailureStatus {
  const normalizedReason = String(reason || failure.reason || '').toLowerCase()
  const expired = failure.expired === true
    || String(failure.expired || '').toLowerCase() === 'true'
    || normalizedReason === 'url_dated_expired'
    || normalizedReason.includes('expired')
  if (expired) return 'downloadError'
  if (
    normalizedReason.includes('decrypt')
    || normalizedReason.includes('decryption')
    || normalizedReason.includes('cipher')
  ) {
    return 'decryptionError'
  }
  // 旧 im 下载失败统一落 downloadError，文案为「图片已过期」。
  return 'downloadError'
}

function buildImageCacheKey(message: Pick<Message, 'conversationId' | 'id' | 'customMsgId' | 'sendTime'>): string {
  const convId = String(message.conversationId || '')
  const idParts = [message.id, message.customMsgId]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  const msgId = [...new Set(idParts)].join(':')
  const sendTime = String(message.sendTime || '')
  return `${convId}|${msgId}|${sendTime}`
}

function readImageCacheForMessage(message: Pick<Message, 'conversationId' | 'id' | 'customMsgId' | 'sendTime'>): ImageDisplayCacheEntry | null {
  const stableKey = buildImageCacheKey(message)
  const direct = getCachedImage(stableKey)
  if (direct) return direct
  const idParts = [message.id, message.customMsgId]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  for (const id of idParts) {
    const legacyKey = `${String(message.conversationId || '')}|${id}|${String(message.sendTime || '')}`
    const legacy = getCachedImage(legacyKey)
    if (legacy) return legacy
  }
  return null
}

function isTrustedPersistedLocalPath(path: unknown): boolean {
  const raw = String(path || '').trim()
  if (!raw) return false
  if (isRemoteUrl(raw) || isRemoteImageSrc(raw)) return false
  return isLocalLikePath(raw)
}

function messageRequiresDecryptDownload(message: Pick<Message, 'content' | 'extra'>): boolean {
  const raw = String(message.content ?? '').trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (String(parsed?.fileKey || parsed?.file_key || '').trim()) return true
    } catch {
      // 非 JSON 内容继续看 extra。
    }
  }
  const rawExtra = message.extra
  let extra: Record<string, unknown> = {}
  if (rawExtra && typeof rawExtra === 'object') {
    extra = rawExtra as Record<string, unknown>
  } else if (typeof rawExtra === 'string' && rawExtra.trim()) {
    try {
      const parsed = JSON.parse(rawExtra)
      if (parsed && typeof parsed === 'object') extra = parsed as Record<string, unknown>
    } catch {
      extra = {}
    }
  }
  return Boolean(
    String(extra.fileKey || extra.file_key || '').trim() ||
    String(extra.attachmentKey || extra.attachment_key || '').trim(),
  )
}

function extractLocalPathFromMessage(message: Pick<Message, 'content' | 'extra'>): string {
  const rawExtra = message.extra
  let extra: Record<string, unknown> = {}
  if (rawExtra && typeof rawExtra === 'object') {
    extra = rawExtra as Record<string, unknown>
  } else if (typeof rawExtra === 'string' && rawExtra.trim()) {
    try {
      const parsed = JSON.parse(rawExtra)
      if (parsed && typeof parsed === 'object') extra = parsed as Record<string, unknown>
    } catch {
      extra = {}
    }
  }

  const extraPath = String(
    extra.local ||
    extra.localPath ||
    extra.local_path ||
    '',
  ).trim()
  if (isTrustedPersistedLocalPath(extraPath)) return toFsPath(extraPath)

  const raw = String(message.content ?? '').trim()
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const contentPath = String(
        parsed.localPath ||
        parsed.local_path ||
        parsed.local ||
        '',
      ).trim()
      if (isTrustedPersistedLocalPath(contentPath)) return toFsPath(contentPath)
    }
  } catch {
    // 非 JSON 内容不走本地路径恢复。
  }
  return ''
}

function isRenderableCachedEntry(
  cached: ImageDisplayCacheEntry | null | undefined,
  message: Pick<Message, 'content' | 'extra'>,
): boolean {
  if (!cached?.src) return false
  if (isTrustedPersistedLocalPath(cached.localFilePath)) return true
  if (/^data:image\//i.test(cached.src)) return true
  if (!messageRequiresDecryptDownload(message) && cached.src) return true
  if (messageRequiresDecryptDownload(message) && isRemoteImageSrc(cached.src)) return false
  return !isRemoteImageSrc(cached.src)
}

function readInitialImageDisplay(message: Message): ImageDisplayCacheEntry | null {
  const cached = readImageCacheForMessage(message)
  if (cached && isRenderableCachedEntry(cached, message)) return cached

  const localPath = extractLocalPathFromMessage(message)
  if (!localPath) return null
  const src = toDisplaySrc(localPath)
  if (!src) return null
  return {
    src,
    localFilePath: localPath,
    cachedAt: Date.now(),
  }
}

const initialImageDisplay = readInitialImageDisplay(props.message)
const initialLoadFailure = initialImageDisplay ? null : readImageLoadFailureForMessage(props.message)
const isLoaded = ref(Boolean(initialImageDisplay?.src) || Boolean(initialLoadFailure))
const loadError = ref(Boolean(initialLoadFailure))
const loadErrorStatus = ref<ImageLoadFailureStatus | null>(initialLoadFailure)
const activeSrc = ref(initialImageDisplay?.src || '')
const localFilePath = ref(initialImageDisplay?.localFilePath || '')

function cacheActiveLocalPreview(markLoaded = false) {
  if (!activeSrc.value) return
  // 发送成功回执会把 optimisticId 换成服务端 id；这里用当前最终 key 立即缓存本地预览，
  // 避免窗口恢复或组件重挂载时重新进入远端下载/解密 loading。
  setCachedImage(imageCacheKey.value, {
    src: activeSrc.value,
    localFilePath: localFilePath.value,
  })
  if (markLoaded) {
    loadError.value = false
    loadErrorStatus.value = null
    isLoaded.value = true
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

function shortLogValue(value: unknown, max = 120): string {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function imageSrcKind(src: string): string {
  if (!src) return 'empty'
  if (/^asset:\/\//i.test(src)) return 'asset'
  if (/^data:image\//i.test(src)) return 'data-image'
  if (/^https?:\/\//i.test(src)) return 'remote'
  if (/^blob:/i.test(src)) return 'blob'
  if (/^file:/i.test(src)) return 'file'
  return 'other'
}

function isChannelMessage(): boolean {
  return String(props.message.conversationId || '').startsWith('2_')
}

function blockChannelImageSaveIfRestricted(): boolean {
  if (!isChannelMessage() || !channelId.value) return false
  if (!isChannelContentSaveRestricted(channelId.value)) return false
  eventBus.emit('show-toast', { message: t('频道已限制保存内容'), type: 'error' })
  return true
}

function channelImageLog(message: string, data: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'info') {
  void message
  void data
  void level
}

const imageData = computed((): {
  url: string
  thumbnailUrl: string
  name: string
  localPath: string
  localPreviewUrl: string
  fileKey: string
  width: number
  height: number
  size: number
} => {
  const empty = { url: '', thumbnailUrl: '', name: '', localPath: '', localPreviewUrl: '', fileKey: '', width: 0, height: 0, size: 0 }
  const raw = (props.message.content ?? '').trim()
  if (!raw) return empty

  try {
    const parsed = JSON.parse(raw)
    const localPath = String(
      parsed.localPath || parsed.local_path || parsed.local || '',
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
    const localPreviewUrl = normalizeImageSrc(
      parsed.localPreviewUrl || parsed.local_preview_url || '',
      parsed.mimeType || parsed.mime_type || parsed.mime,
    )
    return {
      url,
      thumbnailUrl,
      name,
      localPath,
      localPreviewUrl,
      fileKey: String(parsed.fileKey || parsed.file_key || '').trim(),
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
      localPreviewUrl: '',
      fileKey: '',
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
  const extra = extraData.value
  const extraPath = String(
    extra.local ||
    extra.localPath ||
    extra.local_path ||
    '',
  ).trim()
  if (isTrustedPersistedLocalPath(extraPath)) return toFsPath(extraPath)

  const explicitPath = imageData.value.localPath
  if (isTrustedPersistedLocalPath(explicitPath)) return toFsPath(explicitPath)
  const url = imageData.value.url
  if (isLocalLikePath(url)) return toFsPath(url)
  const thumbnail = imageData.value.thumbnailUrl
  if (isLocalLikePath(thumbnail)) return toFsPath(thumbnail)
  return ''
})
const thumbnailUrl = computed(() => toDisplayImageSrc(imageData.value.thumbnailUrl || imageData.value.url || ''))
// 仅自己的图片优先用本地预览，避免影响别人发来的远端下载/解密流程。
const isOwnImageMessage = computed(() => {
  const type = Number(props.message.msgType)
  return (type === 1 || type === 9)
    && String(props.message.senderId || '') === String(authStore.uid || '')
})
const localPreviewSrc = computed(() => {
  if (localSourcePath.value) return toDisplayImageSrc(localSourcePath.value)
  return toDisplayImageSrc(imageData.value.localPreviewUrl)
})
const hasLocalPreviewPayload = computed(() => Boolean(
  localPreviewSrc.value
  && (
    imageData.value.localPath
    || imageData.value.localPreviewUrl
    || /^data:image\//i.test(imageData.value.thumbnailUrl)
    || /^blob:/i.test(imageData.value.thumbnailUrl)
  ),
))
// 发送成功回包可能先更新 status/senderId，再合并本地预览；只要内容里还带本地预览，就优先稳定显示本地图。
const shouldUseLocalPreview = computed(() => {
  const type = Number(props.message.msgType)
  return (type === 1 || type === 9)
    && hasLocalPreviewPayload.value
    && (isOwnImageMessage.value || Boolean(extraData.value.__clientMsgId))
})
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
  // 自己发送的图片会先插入本地预览；这里只识别发送中占位，不直接决定遮罩显示。
  return (type === 1 || type === 9)
    && String(props.message.senderId || '') === String(authStore.uid || '')
    && Number(props.message.status) === 0
})
// 官方号 9900 会下发无 fileKey 的公开图片，只在这个会话启用明文远端图缓存。
const officialAccountTargetId = computed(() => {
  const conversationId = String(props.message.conversationId || '')
  if (!conversationId.startsWith('0_')) return ''
  return conversationId.slice(2)
})
const isOfficialAccountImage = computed(() => isOfficialAccountTargetId(officialAccountTargetId.value))
const showImageLoading = computed(() => {
  if (loadError.value) return false
  if (isOwnSingleImageUploadPlaceholder.value && activeSrc.value) {
    // 发送图片时本地预览已可用就按普通图片展示，避免 status=0 回执等待期间继续盖 loading 蒙层。
    return !isLoaded.value
  }
  // 对齐旧 im：只要已有展示地址就不再盖 loading，等待 img 自然完成解码即可。
  return !activeSrc.value
})
const showImageOverlay = computed(() => !loadError.value && showImageLoading.value)
const canOpenPreview = computed(() => Boolean(previewSrc.value) && isLoaded.value && !loadError.value && !showImageOverlay.value)
const imageBoxStyle = computed(() => {
  // 对齐旧 im `.content`：无图/失败时固定 120×150，避免按原图比例撑成大方块。
  if (loadError.value || !activeSrc.value) {
    return {
      width: '120px',
      height: '150px',
    }
  }

  const sourceWidth = imageData.value.width || naturalImageWidth.value
  const sourceHeight = imageData.value.height || naturalImageHeight.value
  const height = 150
  const maxWidth = 400
  const ratio = sourceWidth > 0 && sourceHeight > 0
    ? sourceWidth / sourceHeight
    : 1
  // 对齐旧 im：图片有可显示源后会取消 120px 最小宽度，按图片比例自然收缩，避免窄图两侧露出白底。
  const width = Math.min(maxWidth, Math.max(1, Math.round(height * ratio)))

  return {
    width: `${width}px`,
    height: `${height}px`,
  }
})
const fileKey = computed(() =>
  // 单聊/频道常把 fileKey 放在 content；这里和视频消息保持一致，避免只读 extra 导致无法解密下载。
  normalizeResolvedFileKey(
    imageData.value.fileKey ||
      extraData.value.fileKey ||
      extraData.value.file_key ||
      '',
  ).trim(),
)
const attachmentKey = computed(() => readMessageAttachmentKey(extraData.value))
const isDecryptPending = computed(() => Boolean(extraData.value.decryptPending))
const mediaSlotIndex = computed(() => {
  const raw = extraData.value.mediaSlotIndex
  if (raw === undefined || raw === null || raw === '') return -1
  const index = Number(raw)
  return Number.isFinite(index) ? index : -1
})
const isMediaCaptionSlot = computed(() => mediaSlotIndex.value >= 0)
const groupId = computed(() => {
  const extraGroupId = String(extraData.value.groupId || '').trim()
  if (extraGroupId) return extraGroupId
  const convId = props.message.conversationId || ''
  return convId.startsWith('1_') ? convId.split('_')[1] || '' : ''
})
const channelId = computed(() => {
  const extraChannelId = String(extraData.value.channelId || '').trim()
  if (extraChannelId) return extraChannelId
  const convId = props.message.conversationId || ''
  return convId.startsWith('2_') ? convId.split('_')[1] || '' : ''
})
const privateAttachmentCandidates = computed(() => {
  const extra = extraData.value
  const candidates = Array.isArray(extra.cipherCandidates)
    ? extra.cipherCandidates
        .map((candidate: any) => ({
          version: Number(candidate?.version || extra.version || 1),
          source: String(candidate?.source || extra.source || ''),
          attachmentKey: String(candidate?.attachmentKey || candidate?.attachment_key || ''),
        }))
        .filter((candidate: { attachmentKey: string }) => !!candidate.attachmentKey)
    : []
  if (attachmentKey.value && candidates.length === 0) {
    candidates.push({
      version: Number(extra.version || 1),
      source: String(extra.source || ''),
      attachmentKey: attachmentKey.value,
    })
  }
  return candidates
})
const imageCacheKey = computed(() => buildImageCacheKey(props.message))

watch(loadError, (failed) => {
  if (!failed) return
  channelImageLog('visible failure state', {
    activeSrcHead: shortLogValue(activeSrc.value),
    activeSrcKind: imageSrcKind(activeSrc.value),
    imageUrlHead: shortLogValue(imageData.value.url),
    imageUrlKind: imageSrcKind(imageData.value.url),
    thumbnailHead: shortLogValue(thumbnailUrl.value),
    thumbnailKind: imageSrcKind(thumbnailUrl.value),
    downloadUrlHead: shortLogValue(downloadUrl.value),
    downloadUrlKind: imageSrcKind(downloadUrl.value),
    localFilePathHead: shortLogValue(localFilePath.value),
    hasFileKey: Boolean(fileKey.value),
    fileKeyLen: fileKey.value.length,
    hasAttachmentKey: Boolean(attachmentKey.value),
    attachmentKeyLen: attachmentKey.value.length,
    showImageLoading: showImageLoading.value,
    showImageOverlay: showImageOverlay.value,
    isLoaded: isLoaded.value,
    imageCacheKeyHead: shortLogValue(imageCacheKey.value, 180),
    dynamicHeadFallbackStarted: dynamicImageHeadKeyFallbackStarted.value,
    imgComplete: imageElRef.value?.complete ?? null,
    imgNaturalWidth: imageElRef.value?.naturalWidth ?? 0,
    imgNaturalHeight: imageElRef.value?.naturalHeight ?? 0,
    imgCurrentSrcHead: shortLogValue(imageElRef.value?.currentSrc || ''),
  }, 'error')
})

function applyCachedImageIfAvailable(): boolean {
  const cached = readImageCacheForMessage(props.message)
  if (!isRenderableCachedEntry(cached, props.message)) return false
  channelImageLog('use memory cache', {
    cachedSrcHead: shortLogValue(cached!.src),
    cachedLocalPathHead: shortLogValue(cached!.localFilePath),
  })
  clearImageAutoRetry()
  activeSrc.value = cached!.src
  localFilePath.value = cached!.localFilePath
  loadError.value = false
  isLoaded.value = true
  setCachedImage(imageCacheKey.value, {
    src: cached!.src,
    localFilePath: cached!.localFilePath,
  })
  return true
}

/** 对齐旧 im msgInfo.local：消息里已有本地路径时直接展示，不走下载蒙层。 */
function applyStoredLocalImagePath(): boolean {
  const path = localSourcePath.value || extractLocalPathFromMessage(props.message)
  if (!isTrustedPersistedLocalPath(path)) return false
  const displaySrc = toDisplayImageSrc(path)
  if (!displaySrc) return false
  clearImageAutoRetry()
  localFilePath.value = path
  activeSrc.value = displaySrc
  loadError.value = false
  isLoaded.value = true
  setCachedImage(imageCacheKey.value, {
    src: displaySrc,
    localFilePath: path,
  })
  markLoadedIfImageAlreadyComplete()
  return true
}

function shouldBlockDownloadForActiveRemoteSrc(): boolean {
  if (!activeSrc.value || loadError.value) return false
  if (messageRequiresDecryptDownload(props.message) && isRemoteImageSrc(activeSrc.value)) {
    return false
  }
  return true
}

function resolveDownloadTargetUrl(options: { preferThumbnail?: boolean } = {}): string {
  const original = imageData.value.url
  const thumbnail = imageData.value.thumbnailUrl
  if (options.preferThumbnail && isMediaCaptionSlot.value && isRemoteImageSrc(thumbnail)) {
    return thumbnail
  }
  if (isRemoteImageSrc(original)) return original
  if (isRemoteImageSrc(thumbnail)) return thumbnail
  return ''
}

function buildDownloadSignature(preferThumbnail = false): string {
  const targetUrl = resolveDownloadTargetUrl({ preferThumbnail })
  return [
    targetUrl,
    fileKey.value,
    attachmentKey.value,
    preferThumbnail ? 'thumb' : 'full',
  ].join('|')
}

function clearImageAutoRetry(resetAttempt = true) {
  if (imageAutoRetryTimer !== null) {
    clearTimeout(imageAutoRetryTimer)
    imageAutoRetryTimer = null
  }
  if (!resetAttempt) return
  imageAutoRetryAttempt = 0
  imageAutoRetrySignature = ''
}

function scheduleImageAutoRetry(
  failure: Record<string, unknown> = {},
  options: { preferThumbnail?: boolean } = {},
): boolean {
  const canResolveKey = Boolean(
    fileKey.value
    || attachmentKey.value
    || (Number(props.message.msgType) === 9 && dynamicImageHeadKeyFallbackStarted.value),
  )
  if (!downloadUrl.value || !canResolveKey) return false

  const signature = buildDownloadSignature(Boolean(options.preferThumbnail))
  if (signature !== imageAutoRetrySignature) {
    clearImageAutoRetry()
    imageAutoRetrySignature = signature
  }
  if (imageAutoRetryTimer !== null) return true

  const delay = getImageAutoRetryDelay(imageAutoRetryAttempt, {
    sendTime: Number(props.message.sendTime || 0),
    httpStatusCode: Number(failure.httpStatusCode ?? failure.http_status_code ?? 0) || null,
    expired: failure.expired === true || String(failure.expired || '').toLowerCase() === 'true',
    reason: String(failure.reason || ''),
  })
  if (delay === null) return false

  imageAutoRetryAttempt += 1
  activeSrc.value = ''
  loadError.value = false
  isLoaded.value = false
  finishDownloadAttempt()
  channelImageLog('schedule automatic retry', {
    attempt: imageAutoRetryAttempt,
    delay,
    httpStatusCode: failure.httpStatusCode ?? failure.http_status_code ?? null,
    reason: failure.reason ?? '',
  }, 'warn')
  imageAutoRetryTimer = setTimeout(() => {
    imageAutoRetryTimer = null
    if (isDecryptPending.value || downloadInFlight.value) return
    void downloadAndDecryptImage({
      ignoreCache: true,
      preferThumbnail: options.preferThumbnail,
    })
  }, delay)
  return true
}

async function holdDownloadSlot(): Promise<boolean> {
  if (!props.acquireDownloadSlot) return true
  if (releaseDownloadSlot) return true
  try {
    releaseDownloadSlot = await props.acquireDownloadSlot()
    return true
  } catch {
    return false
  }
}

function releaseHeldDownloadSlot() {
  if (!releaseDownloadSlot) return
  const release = releaseDownloadSlot
  releaseDownloadSlot = null
  release()
}

function tryRestoreKnownImageDisplay(): boolean {
  if (applyCachedImageIfAvailable()) return true
  if (applyStoredLocalImagePath()) return true
  return false
}

function persistImageLocalPath(filePath: string) {
  const path = toFsPath(String(filePath || '').trim())
  if (!isTrustedPersistedLocalPath(path)) return
  const messageId = String(props.message.id || props.message.customMsgId || '').trim()
  if (!messageId) return

  const existingPath = toFsPath(String(imageData.value.localPath || localFilePath.value || '').trim())
  if (existingPath && existingPath === path) return

  const raw = String(props.message.content ?? '').trim()
  let parsed: Record<string, unknown> | null = null
  try {
    const value = JSON.parse(raw)
    parsed = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    parsed = null
  }
  if (!parsed) {
    const url = String(imageData.value.url || downloadUrl.value || '').trim()
    if (!url) return
    parsed = {
      url,
      thumbnailUrl: String(imageData.value.thumbnailUrl || thumbnailUrl.value || url).trim(),
    }
  }

  messageStore.updateMessage(messageId, {
    content: JSON.stringify({
      ...parsed,
      local: path,
      localPath: path,
    }),
    extra: (() => {
      const rawExtra = props.message.extra
      let extraObj: Record<string, unknown> = {}
      if (rawExtra && typeof rawExtra === 'object') {
        extraObj = { ...(rawExtra as Record<string, unknown>) }
      } else if (typeof rawExtra === 'string' && rawExtra.trim()) {
        try {
          const parsedExtra = JSON.parse(rawExtra)
          if (parsedExtra && typeof parsedExtra === 'object') {
            extraObj = { ...parsedExtra as Record<string, unknown> }
          }
        } catch {
          extraObj = {}
        }
      }
      return JSON.stringify({
        ...extraObj,
        local: path,
        localPath: path,
      })
    })(),
  })
}

function clearPersistedImageLocalPath() {
  const messageId = String(props.message.id || props.message.customMsgId || '').trim()
  if (!messageId) return

  const raw = String(props.message.content ?? '').trim()
  let nextContent: string | undefined
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        delete parsed.local
        delete parsed.localPath
        delete parsed.local_path
        nextContent = JSON.stringify(parsed)
      }
    } catch {
      nextContent = undefined
    }
  }

  const rawExtra = props.message.extra
  let extraObj: Record<string, unknown> | null = null
  if (rawExtra && typeof rawExtra === 'object') {
    extraObj = { ...(rawExtra as Record<string, unknown>) }
  } else if (typeof rawExtra === 'string' && rawExtra.trim()) {
    try {
      const parsedExtra = JSON.parse(rawExtra)
      if (parsedExtra && typeof parsedExtra === 'object') {
        extraObj = { ...parsedExtra as Record<string, unknown> }
      }
    } catch {
      extraObj = null
    }
  }
  if (extraObj) {
    delete extraObj.local
    delete extraObj.localPath
    delete extraObj.local_path
  }

  if (!nextContent && !extraObj) return
  messageStore.updateMessage(messageId, {
    ...(nextContent ? { content: nextContent } : {}),
    ...(extraObj ? { extra: JSON.stringify(extraObj) } : {}),
  })
}

function resetImageDisplayState() {
  clearImageAutoRetry()
  isLoaded.value = false
  loadError.value = false
  activeSrc.value = ''
  localFilePath.value = ''
  invalidLocalCacheRedownloadStarted.value = false
}

watch([thumbnailUrl, downloadUrl, localSourcePath, localPreviewSrc, fileKey, attachmentKey, isDecryptPending, isOwnSingleImageUploadPlaceholder, shouldUseLocalPreview], () => {
  if (isDecryptPending.value) {
    cleanupDownloadEvents()
    loadError.value = false
    isLoaded.value = false
    if (isRemoteImageSrc(activeSrc.value)) {
      activeSrc.value = ''
    }
    return
  }

  if (tryRestoreKnownImageDisplay()) return

  // 已失败图片：切会话重挂载时保持失败态，不要再次进入下载蒙层。
  if (hasCachedImageLoadFailure(imageCacheKey.value)) {
    activeSrc.value = ''
    loadError.value = true
    loadErrorStatus.value = getCachedImageLoadFailure(imageCacheKey.value) || 'downloadError'
    isLoaded.value = true
    return
  }
  if (loadError.value) return

  const willDownload = (fileKey.value || attachmentKey.value)
    && downloadUrl.value
    && !shouldUseLocalPreview.value
    && !isOwnSingleImageUploadPlaceholder.value

  const persistedLocalPath = extractLocalPathFromMessage(props.message)
  const hasPersistedLocal = isTrustedPersistedLocalPath(persistedLocalPath)
  const cachedLocalPath = readImageCacheForMessage(props.message)?.localFilePath || ''
  const hasCachedLocal = isTrustedPersistedLocalPath(cachedLocalPath)
    || (localFilePath.value && isUsingLocalCacheFile())
  if (activeSrc.value && !loadError.value && (hasPersistedLocal || hasCachedLocal)) {
    return
  }

  if (!willDownload) {
    if (!activeSrc.value) {
      resetImageDisplayState()
    }
  } else {
    invalidLocalCacheRedownloadStarted.value = false
  }

  channelImageLog('watch decision start', {
    hasImageUrl: Boolean(imageData.value.url),
    imageUrlHead: shortLogValue(imageData.value.url),
    thumbnailHead: shortLogValue(thumbnailUrl.value),
    downloadUrlHead: shortLogValue(downloadUrl.value),
    hasFileKey: Boolean(fileKey.value),
    fileKeyLen: fileKey.value.length,
    hasAttachmentKey: Boolean(attachmentKey.value),
    attachmentKeyLen: attachmentKey.value.length,
    hasLocalSource: Boolean(localSourcePath.value),
    shouldUseLocalPreview: shouldUseLocalPreview.value,
    isOwnPlaceholder: isOwnSingleImageUploadPlaceholder.value,
  })
  if (shouldUseLocalPreview.value) {
    // 自己刚发送的图片保留本地预览，避免发送成功后重新回到桌面端不可加载的 blob: 源。
    channelImageLog('use local preview', {
      localSourceHead: shortLogValue(localSourcePath.value),
      previewHead: shortLogValue(localPreviewSrc.value),
    })
    cleanupDownloadEvents()
    localFilePath.value = localSourcePath.value
    activeSrc.value = localPreviewSrc.value
    cacheActiveLocalPreview(true)
    materializeDataImageForDrag()
    markLoadedIfImageAlreadyComplete()
    return
  }
  if (isOwnSingleImageUploadPlaceholder.value) {
    // 发送中的本地图片也先渲染缩略图，避免仅显示灰色加载蒙层。
    channelImageLog('use upload placeholder preview', {
      localSourceHead: shortLogValue(localSourcePath.value),
      thumbnailHead: shortLogValue(thumbnailUrl.value),
    })
    cleanupDownloadEvents()
    if (localSourcePath.value) {
      localFilePath.value = localSourcePath.value
    }
    activeSrc.value = thumbnailUrl.value
    cacheActiveLocalPreview(true)
    materializeDataImageForDrag()
    markLoadedIfImageAlreadyComplete()
    return
  }
  if (!thumbnailUrl.value && !imageData.value.url && !fileKey.value && !attachmentKey.value) {
    channelImageLog('load error: missing url and keys', {}, 'warn')
    markImageLoadFailed('missing-url-and-keys')
    return
  }
  if ((fileKey.value || attachmentKey.value) && downloadUrl.value) {
    channelImageLog('start download/decrypt path')
    void downloadAndDecryptImage()
    return
  }
  if (localSourcePath.value) {
    localFilePath.value = localSourcePath.value
    activeSrc.value = toDisplayImageSrc(localSourcePath.value)
    channelImageLog('use stored local path', {
      localPathHead: shortLogValue(localSourcePath.value),
      activeSrcHead: shortLogValue(activeSrc.value),
    })
    markLoadedIfImageAlreadyComplete()
    return
  }
  if (messageRequiresDecryptDownload(props.message)) {
    // 需解密的远端缩略图不能直接挂到 img，否则会先报错再阻塞后续下载。
    isLoaded.value = false
    loadError.value = false
    return
  }
  activeSrc.value = thumbnailUrl.value
  channelImageLog('use direct thumbnail path', {
    activeSrcHead: shortLogValue(activeSrc.value),
    hasRemoteOriginal: isRemoteImageSrc(imageData.value.url),
  })
  void cacheOfficialRemoteImageForCopy()
  materializeDataImageForDrag()
  markLoadedIfImageAlreadyComplete()
}, { immediate: true })

function handleLoad() {
  clearImageAutoRetry()
  naturalImageWidth.value = imageElRef.value?.naturalWidth || 0
  naturalImageHeight.value = imageElRef.value?.naturalHeight || 0
  isLoaded.value = true
  channelImageLog('img load success', {
    activeSrcHead: shortLogValue(activeSrc.value),
    localFilePathHead: shortLogValue(localFilePath.value),
    naturalWidth: naturalImageWidth.value,
    naturalHeight: naturalImageHeight.value,
  })
  setCachedImage(imageCacheKey.value, {
    src: activeSrc.value,
    localFilePath: localFilePath.value,
  })
  if (localFilePath.value) {
    persistImageLocalPath(localFilePath.value)
  }
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

function fallbackFromLocalPreviewError(): boolean {
  if (!shouldUseLocalPreview.value || activeSrc.value !== localPreviewSrc.value) return false
  if ((fileKey.value || attachmentKey.value) && downloadUrl.value) {
    // 本地原图被移动/删除时，回到现有远端下载解密链路，避免永久显示“图片加载失败”。
    localFilePath.value = ''
    activeSrc.value = ''
    isLoaded.value = false
    loadError.value = false
    downloadAndDecryptImage()
    return true
  }
  const remoteUrl = imageData.value.url
  if (remoteUrl && activeSrc.value !== remoteUrl) {
    activeSrc.value = remoteUrl
    localFilePath.value = ''
    isLoaded.value = false
    loadError.value = false
    return true
  }
  return false
}

function isUsingLocalCacheFile(): boolean {
  return Boolean(localFilePath.value && activeSrc.value && imageSrcKind(activeSrc.value) === 'asset')
}

async function retryAfterInvalidLocalCache(): Promise<boolean> {
  if (
    invalidLocalCacheRedownloadStarted.value
    || !(window as any).__TAURI_INTERNALS__
    || !isUsingLocalCacheFile()
    || !downloadUrl.value
    || (!fileKey.value && !attachmentKey.value)
  ) {
    return false
  }

  invalidLocalCacheRedownloadStarted.value = true
  const stalePath = localFilePath.value
  channelImageLog('invalid local cache redownload', {
    debugLine: [
      `stalePathHead=${shortLogValue(stalePath)}`,
      `downloadUrlKind=${imageSrcKind(downloadUrl.value)}`,
      `hasFileKey=${String(Boolean(fileKey.value))}`,
      `hasAttachmentKey=${String(Boolean(attachmentKey.value))}`,
    ].join(' '),
    stalePathHead: shortLogValue(stalePath),
    activeSrcHead: shortLogValue(activeSrc.value),
    downloadUrlHead: shortLogValue(downloadUrl.value),
    hasFileKey: Boolean(fileKey.value),
    hasAttachmentKey: Boolean(attachmentKey.value),
  }, 'warn')

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('remove_file_if_exists', { path: stalePath })
  } catch (error) {
    channelImageLog('invalid local cache remove failed', {
      stalePathHead: shortLogValue(stalePath),
      err: String(error),
    }, 'warn')
  }

  deleteCachedImage(imageCacheKey.value)
  localFilePath.value = ''
  activeSrc.value = ''
  loadError.value = false
  isLoaded.value = false
  await downloadAndDecryptImage({ ignoreCache: true })
  return true
}

async function retryStaleImageRestoreBeforeFail(): Promise<boolean> {
  if (
    invalidLocalCacheRedownloadStarted.value
    || !(window as any).__TAURI_INTERNALS__
    || !downloadUrl.value
    || (!fileKey.value && !attachmentKey.value)
  ) {
    return false
  }

  const hadBadRestore = isRemoteImageSrc(activeSrc.value)
    || (
      isTrustedPersistedLocalPath(extractLocalPathFromMessage(props.message))
      && !isUsingLocalCacheFile()
    )
  if (!hadBadRestore) return false

  invalidLocalCacheRedownloadStarted.value = true
  clearPersistedImageLocalPath()
  deleteCachedImage(imageCacheKey.value)
  localFilePath.value = ''
  activeSrc.value = ''
  loadError.value = false
  isLoaded.value = false
  await downloadAndDecryptImage({ ignoreCache: true })
  return true
}

async function handleError() {
  if (isOwnSingleImageUploadPlaceholder.value) return
  // 对齐旧 im image-error：下载/解密进行中时不把瞬时 img 错误定格为失败。
  if (downloadInFlight.value || showImageOverlay.value) return
  if (shouldUseLocalPreview.value && activeSrc.value !== localPreviewSrc.value) {
    // 远端源切换瞬间失败时回到本地预览，不把可恢复错误展示成“图片加载失败”。
    localFilePath.value = localSourcePath.value
    activeSrc.value = localPreviewSrc.value
    isLoaded.value = false
    loadError.value = false
    markLoadedIfImageAlreadyComplete()
    return
  }
  if (fallbackFromLocalPreviewError()) return
  if (await retryAfterInvalidLocalCache()) return
  if (await retryStaleImageRestoreBeforeFail()) return
  const originalUrl = imageData.value.url
  if (!fileKey.value && !attachmentKey.value && retryDynamicImageWithHeadKey('img-error')) return
  if (scheduleImageAutoRetry()) return
  if (!fileKey.value && !attachmentKey.value && originalUrl && activeSrc.value !== originalUrl) {
    channelImageLog('img error: fallback to original url', {
      activeSrcHead: shortLogValue(activeSrc.value),
      originalUrlHead: shortLogValue(originalUrl),
    }, 'warn')
    activeSrc.value = originalUrl
    isLoaded.value = false
    return
  }
  channelImageLog('img error: final load failed', {
    activeSrcHead: shortLogValue(activeSrc.value),
    activeSrcKind: imageSrcKind(activeSrc.value),
    originalUrlHead: shortLogValue(originalUrl),
    originalUrlKind: imageSrcKind(originalUrl),
    thumbnailHead: shortLogValue(thumbnailUrl.value),
    thumbnailKind: imageSrcKind(thumbnailUrl.value),
    downloadUrlHead: shortLogValue(downloadUrl.value),
    downloadUrlKind: imageSrcKind(downloadUrl.value),
    localFilePathHead: shortLogValue(localFilePath.value),
    imgComplete: imageElRef.value?.complete ?? null,
    imgNaturalWidth: imageElRef.value?.naturalWidth ?? 0,
    imgNaturalHeight: imageElRef.value?.naturalHeight ?? 0,
    imgCurrentSrcHead: shortLogValue(imageElRef.value?.currentSrc || ''),
    hasLocalSource: Boolean(localSourcePath.value),
    shouldUseLocalPreview: shouldUseLocalPreview.value,
    dynamicHeadFallbackStarted: dynamicImageHeadKeyFallbackStarted.value,
    hasFileKey: Boolean(fileKey.value),
    fileKeyLen: fileKey.value.length,
    hasAttachmentKey: Boolean(attachmentKey.value),
    attachmentKeyLen: attachmentKey.value.length,
  }, 'error')
  markImageLoadFailed('img-error')
}

function retryImageDisplayAfterRestore() {
  if (document.hidden) return
  if (downloadInFlight.value) return
  // 已确认失败的频道/历史图：窗口聚焦或切回前台时不再自动重下。
  if (loadError.value || hasCachedImageLoadFailure(imageCacheKey.value)) return
  const canRetryDownload = Boolean(
    (fileKey.value || attachmentKey.value) && downloadUrl.value,
  )
  if (activeSrc.value) return
  if (!canRetryDownload) return
  clearImageAutoRetry()
  invalidLocalCacheRedownloadStarted.value = false
  if (tryRestoreKnownImageDisplay()) return
  void downloadAndDecryptImage()
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
    // 与旧版行为对齐：预览窗先携带可用 fileKey，便于“默认应用打开”优先走本地下载链路而不是前端 fetch 转存。
    const resolvedFileKey = await resolveFileKey()
    const bounds = await getMediaWindowBounds(windowApi)
    const remoteOriginalUrl = isRemoteImageSrc(imageData.value.url) ? imageData.value.url : ''

    const resolvedChannelId = isChannelMessage() ? channelId.value : ''
    mediaViewerState.send({
      title: '图片',
      mediaType: 'image',
      src: previewSrc.value,
      filePath: localFilePath.value || null,
      originalUrl: remoteOriginalUrl,
      fileKey: resolvedFileKey,
      fileName: imageData.value.name || '',
      width: imageData.value.width || undefined,
      height: imageData.value.height || undefined,
      channelId: resolvedChannelId || undefined,
      saveRestricted: resolvedChannelId ? isChannelContentSaveRestricted(resolvedChannelId) : false,
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
  if (blockChannelImageSaveIfRestricted()) return
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
  releaseHeldDownloadSlot()
}

function cleanupPlainRemoteCacheEvents() {
  stopPlainRemoteCacheEvents.forEach(stop => stop())
  stopPlainRemoteCacheEvents = []
}

function retryDynamicImageWithHeadKey(reason: string): boolean {
  if (
    !(window as any).__TAURI_INTERNALS__
    || Number(props.message.msgType) !== 9
    || !downloadUrl.value
    || dynamicImageHeadKeyFallbackStarted.value
  ) {
    return false
  }

  // 旧 im 对 msgType 9 GIF 会在直连/fileKey 解密失败后再试默认 HEAD_AES_KEY；这里只在桌面下载链路失败后兜底一次。
  dynamicImageHeadKeyFallbackStarted.value = true
  channelImageLog('retry dynamic image with head aes key', {
    reason,
    activeSrcHead: shortLogValue(activeSrc.value),
    downloadUrlHead: shortLogValue(downloadUrl.value),
    headKeyLen: API_CONFIG.headAesKey.length,
    hasFileKey: Boolean(fileKey.value),
    hasAttachmentKey: Boolean(attachmentKey.value),
  }, 'warn')
  activeSrc.value = ''
  loadError.value = false
  isLoaded.value = false
  downloadAndDecryptImage()
  return true
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
  if (Number(props.message.msgType) === 9 && dynamicImageHeadKeyFallbackStarted.value) {
    // 旧 im 的 GIF 下载按候选 key 重试：E2EE fileKey 失败后再试默认 HEAD_AES_KEY。
    channelImageLog('resolve key: use dynamic image head aes fallback', {
      headKeyLen: API_CONFIG.headAesKey.length,
    }, 'warn')
    return API_CONFIG.headAesKey
  }
  const conversationId = String(props.message.conversationId || '')
  if (conversationId.startsWith('1_') && attachmentKey.value && groupId.value) {
    // 对齐旧 im：群聊附件的真实 fileKey 以 attachmentKey + 群 relKey 解密结果为准，
    // 避免手机端群图片携带的其它候选 key 被误当作文件解密密钥。
    try {
      if (authStore.uid) {
        await ensureGroupRelKey(String(authStore.uid), groupId.value)
      }
      const { invoke } = await import('@tauri-apps/api/core')
      const resolved = await invoke<string>('decrypt_group_incoming', {
        groupId: groupId.value,
        ciphertextHex: attachmentKey.value,
        msgType: 0,
      })
      const normalized = normalizeResolvedFileKey(resolved)
      channelImageLog('resolve key: group attachmentKey decrypted', {
        groupId: groupId.value,
        attachmentKeyLen: attachmentKey.value.length,
        fileKeyLen: normalized.length,
        messageFileKeyLen: fileKey.value.length,
      })
      if (normalized) return normalized
    } catch (error) {
      channelImageLog('resolve key: group attachmentKey decrypt failed', {
        groupId: groupId.value,
        attachmentKeyLen: attachmentKey.value.length,
        messageFileKeyLen: fileKey.value.length,
        err: String(error),
      }, 'warn')
    }
  }
  if (conversationId.startsWith('0_') && attachmentKey.value) {
    const senderId = String(props.message.senderId || '').trim()
    for (const candidate of privateAttachmentCandidates.value) {
      // 手机/PC 私聊图片里 extra.fileKey 可能是旧值；优先从 attachmentKey 解真实文件 key。
      const resolved = await resolvePrivateAttachmentFileKey({
        uid: authStore.uid,
        senderId,
        version: candidate.version,
        source: candidate.source,
        attachmentKey: candidate.attachmentKey,
      })
      if (resolved) {
        channelImageLog('resolve key: private attachmentKey decrypted', {
          debugLine: [
            `version=${Number(candidate.version || 0)}`,
            `source=${String(candidate.source || '') || 'empty'}`,
            `attachmentKeyLen=${String(candidate.attachmentKey || '').length}`,
            `fileKeyLen=${resolved.length}`,
            `messageFileKeyLen=${fileKey.value.length}`,
          ].join(' '),
          version: candidate.version,
          source: candidate.source,
          attachmentKeyLen: String(candidate.attachmentKey || '').length,
          fileKeyLen: resolved.length,
          messageFileKeyLen: fileKey.value.length,
        })
        return resolved
      }
    }
    channelImageLog('resolve key: private attachmentKey decrypt unavailable', {
      attachmentKeyLen: attachmentKey.value.length,
      candidateCount: privateAttachmentCandidates.value.length,
      messageFileKeyLen: fileKey.value.length,
    }, 'warn')
  }
  if (fileKey.value) {
    channelImageLog(conversationId.startsWith('0_') ? 'resolve key: fallback message fileKey' : 'resolve key: use message fileKey', {
      fileKeyLen: fileKey.value.length,
      hasAttachmentKey: Boolean(attachmentKey.value),
      attachmentKeyLen: attachmentKey.value.length,
    })
    return fileKey.value
  }
  const plainAttachmentKey = normalizeResolvedFileKey(attachmentKey.value)
  if (plainAttachmentKey) {
    channelImageLog('resolve key: use plain attachmentKey', {
      fileKeyLen: plainAttachmentKey.length,
      attachmentKeyLen: attachmentKey.value.length,
    })
    return plainAttachmentKey
  }

  if (isChannelMessage() && attachmentKey.value && channelId.value) {
    try {
      if (authStore.uid) {
        await ensureChannelRelKey(String(authStore.uid), channelId.value)
      }
      const { invoke } = await import('@tauri-apps/api/core')
      // iOS/频道历史图片可能只带频道加密 attachmentKey，需要先解出真实 fileKey 才能下载原图。
      const resolved = await invoke<string>('decrypt_channel_incoming', {
        channelId: channelId.value,
        ciphertextHex: attachmentKey.value,
        msgType: 0,
      })
      const normalized = normalizeResolvedFileKey(resolved)
      channelImageLog('resolve key: channel attachmentKey decrypted', {
        channelId: channelId.value,
        attachmentKeyLen: attachmentKey.value.length,
        fileKeyLen: normalized.length,
      })
      if (normalized) return normalized
    } catch (error) {
      channelImageLog('resolve key: channel attachmentKey decrypt failed', {
        channelId: channelId.value,
        attachmentKeyLen: attachmentKey.value.length,
        err: String(error),
      }, 'warn')
    }
  }
  return ''
}

function finishDownloadAttempt() {
  downloadInFlight.value = false
  activeDownloadSignature = ''
}

function markImageLoadFailed(
  reason = '',
  failure: Record<string, unknown> = {},
) {
  const status = classifyImageLoadFailure(reason, failure)
  clearImageAutoRetry()
  activeSrc.value = ''
  localFilePath.value = ''
  loadError.value = true
  loadErrorStatus.value = status
  isLoaded.value = true
  finishDownloadAttempt()
  markCachedImageLoadFailure(imageCacheKey.value, status)
  channelImageLog('mark permanent load failure', {
    reason,
    status,
    expired: failure.expired ?? null,
    httpStatusCode: failure.httpStatusCode ?? failure.http_status_code ?? null,
  }, 'warn')
}

function clearImageLoadFailureState() {
  clearCachedImageLoadFailure(imageCacheKey.value)
  loadError.value = false
  loadErrorStatus.value = null
}

const imageErrorText = computed(() => {
  if (loadErrorStatus.value === 'decryptionError') return t('图片文件解密失败')
  // 对齐旧 im Overlay downloadError →「图片已过期」
  return t('图片文件已过期')
})

const isExpiredImageError = computed(() => loadErrorStatus.value !== 'decryptionError')

/** 过期图不再自动/手动连点重下；解密失败仍允许手动点一次重试。 */
function handleManualRetryAfterFailure() {
  if (!loadError.value) return
  if (isExpiredImageError.value) return
  clearImageLoadFailureState()
  invalidLocalCacheRedownloadStarted.value = false
  thumbnailDownloadFallbackUsed.value = false
  dynamicImageHeadKeyFallbackStarted.value = false
  isLoaded.value = false
  activeSrc.value = ''
  if (tryRestoreKnownImageDisplay()) return
  if ((fileKey.value || attachmentKey.value) && downloadUrl.value) {
    void downloadAndDecryptImage({ ignoreCache: true })
    return
  }
  markImageLoadFailed('manual-retry-unavailable')
}

async function downloadAndDecryptImage(options: { ignoreCache?: boolean; preferThumbnail?: boolean } = {}) {
  clearImageAutoRetry(false)
  if (isOwnSingleImageUploadPlaceholder.value) return
  if (isDecryptPending.value) return
  if (!options.ignoreCache && hasCachedImageLoadFailure(imageCacheKey.value)) {
    loadError.value = true
    loadErrorStatus.value = getCachedImageLoadFailure(imageCacheKey.value) || 'downloadError'
    isLoaded.value = true
    return
  }
  if (!options.ignoreCache && tryRestoreKnownImageDisplay()) return
  if (shouldBlockDownloadForActiveRemoteSrc()) return
  const url = resolveDownloadTargetUrl({ preferThumbnail: options.preferThumbnail })
  const signature = buildDownloadSignature(Boolean(options.preferThumbnail))
  if (
    !options.ignoreCache
    && downloadInFlight.value
    && signature
    && signature === activeDownloadSignature
  ) {
    channelImageLog('download skipped: same request in flight', {
      signatureHead: shortLogValue(signature, 180),
    })
    return
  }
  const key = await resolveFileKey()
  if (!url || !key) {
    channelImageLog('download skipped: missing url or key', {
      hasUrl: Boolean(url),
      urlHead: shortLogValue(url),
      hasKey: Boolean(key),
      keyLen: key.length,
      hasAttachmentKey: Boolean(attachmentKey.value),
      attachmentKeyLen: attachmentKey.value.length,
    }, 'warn')
    if (url && retryDynamicImageWithHeadKey('missing-key')) return
    if (scheduleImageAutoRetry({ reason: 'missing-key' }, options)) {
      emit('transfer-attempt', { started: false })
      return
    }
    markImageLoadFailed('missing-key')
    emit('transfer-attempt', { started: false })
    return
  }

  const token = ++downloadToken
  cleanupDownloadEvents()
  if (!(await holdDownloadSlot())) {
    emit('transfer-attempt', { started: false })
    return
  }
  emit('transfer-attempt', { started: true })
  downloadInFlight.value = true
  activeDownloadSignature = signature

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
    const cachedSrc = toDisplayImageSrc(savePath)
    const hasCachedFile = await invoke<boolean>('file_exists', { path: savePath }).catch(() => false)
    if (token !== downloadToken) return
    if (!options.ignoreCache && hasCachedFile && cachedSrc) {
      // 对齐旧 im：确认本地文件存在后再挂 src，避免 file_exists 异步期间 img 误报加载失败。
      channelImageLog('download skipped: cache file exists', {
        savePathHead: shortLogValue(savePath),
        cachedSrcHead: shortLogValue(cachedSrc),
      })
      clearImageAutoRetry()
      activeSrc.value = cachedSrc
      loadError.value = false
      isLoaded.value = true
      imageRenderKey.value += 1
      setCachedImage(imageCacheKey.value, {
        src: cachedSrc,
        localFilePath: savePath,
      })
      persistImageLocalPath(savePath)
      markLoadedIfImageAlreadyComplete()
      releaseHeldDownloadSlot()
      finishDownloadAttempt()
      return
    }
    isLoaded.value = false
    loadError.value = false
    activeSrc.value = ''
    const doneEvent = `file:done:${id}`
    const errorEvent = `file:error:${id}`
    channelImageLog('download invoke start', {
      urlHead: shortLogValue(url),
      savePathHead: shortLogValue(savePath),
      msgId: id,
      fileKeyLen: key.length,
      ignoreCache: Boolean(options.ignoreCache),
      doneEvent,
      errorEvent,
    })

    const unlistenDone = await listen<{ dataUrl?: string; data_url?: string }>(doneEvent, (event) => {
      if (token !== downloadToken) return
      cleanupDownloadEvents()
      const src = toDisplayImageSrc(savePath) || event.payload.dataUrl || event.payload.data_url || ''
      if (!src) {
        channelImageLog('download done but no display src', {
          savePathHead: shortLogValue(savePath),
          hasDataUrl: Boolean(event.payload.dataUrl || event.payload.data_url),
        }, 'error')
        markImageLoadFailed('download-done-empty-src')
        return
      }
      channelImageLog('download done', {
        savePathHead: shortLogValue(savePath),
        srcHead: shortLogValue(src),
        hasDataUrl: Boolean(event.payload.dataUrl || event.payload.data_url),
      })
      clearImageAutoRetry()
      loadError.value = false
      activeSrc.value = src
      isLoaded.value = true
      imageRenderKey.value += 1
      finishDownloadAttempt()
      markLoadedIfImageAlreadyComplete()
      setCachedImage(imageCacheKey.value, {
        src,
        localFilePath: localFilePath.value,
      })
      if (localFilePath.value) {
        persistImageLocalPath(localFilePath.value)
      }
    })
    const unlistenError = await listen(errorEvent, (event) => {
      if (token !== downloadToken) return
      cleanupDownloadEvents()
      const payload = (event.payload || {}) as Record<string, unknown>
      channelImageLog('download error event', {
        eventPayloadHead: shortLogValue(JSON.stringify(payload), 240),
        httpStatusCode: payload.httpStatusCode ?? payload.http_status_code ?? null,
        expired: payload.expired ?? null,
        reason: payload.reason ?? '',
        urlHead: shortLogValue(url),
        savePathHead: shortLogValue(savePath),
        fileKeyLen: key.length,
      }, 'error')
      if (
        !options.preferThumbnail
        && !thumbnailDownloadFallbackUsed.value
        && isMediaCaptionSlot.value
        && isRemoteImageSrc(imageData.value.thumbnailUrl)
        && imageData.value.thumbnailUrl !== imageData.value.url
      ) {
        thumbnailDownloadFallbackUsed.value = true
        activeSrc.value = ''
        loadError.value = false
        isLoaded.value = false
        void downloadAndDecryptImage({ ignoreCache: true, preferThumbnail: true })
        return
      }
      if (retryDynamicImageWithHeadKey('download-error')) {
        finishDownloadAttempt()
        return
      }
      if (scheduleImageAutoRetry(payload, options)) {
        return
      }
      markImageLoadFailed(String(payload.reason || 'download-error'), payload)
    })
    stopDownloadEvents = [unlistenDone, unlistenError]

    await invoke('download_file', {
      url,
      fileKey: key,
      savePath,
      msgId: id,
      // 桌面端下载对齐旧 im：按 OSS 通道准备候选域名，真正是否重试交给 Rust 侧判断。
      urlCandidates: getOssDownloadCandidates({
        url,
        channelType: extraData.value.channelType ?? extraData.value.channel_type,
      }),
      msgType: props.message.msgType,
      sendTime: props.message.sendTime,
      logTag: 'image-render',
    })
  } catch (error) {
    if (token !== downloadToken) return
    cleanupDownloadEvents()
    channelImageLog('download invoke threw', {
      urlHead: shortLogValue(url),
      fileKeyLen: key.length,
      err: String(error),
    }, 'error')
    if (
      !options.preferThumbnail
      && !thumbnailDownloadFallbackUsed.value
      && isMediaCaptionSlot.value
      && isRemoteImageSrc(imageData.value.thumbnailUrl)
      && imageData.value.thumbnailUrl !== imageData.value.url
    ) {
      thumbnailDownloadFallbackUsed.value = true
      activeSrc.value = ''
      loadError.value = false
      isLoaded.value = false
      void downloadAndDecryptImage({ ignoreCache: true, preferThumbnail: true })
      return
    }
    if (retryDynamicImageWithHeadKey('download-throw')) {
      finishDownloadAttempt()
      return
    }
    if (scheduleImageAutoRetry({ reason: 'download-invoke-failed' }, options)) {
      return
    }
    markImageLoadFailed('download-invoke-failed')
    releaseHeldDownloadSlot()
  }
}

async function cacheOfficialRemoteImageForCopy() {
  if (
    !(window as any).__TAURI_INTERNALS__
    || !isOfficialAccountImage.value
    || !downloadUrl.value
    || fileKey.value
    || attachmentKey.value
    || localSourcePath.value
    || localFilePath.value
  ) {
    return
  }

  const token = ++plainRemoteCacheToken
  cleanupPlainRemoteCacheEvents()

  try {
    const [{ invoke }, { appDataDir, join }, { listen }] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/path'),
      import('@tauri-apps/api/event'),
    ])
    const baseDir = await appDataDir()
    const id = safeName(props.message.id || props.message.customMsgId || `${Date.now()}`)
    const savePath = await getImageSavePath(join, baseDir, id, getImageFileName(downloadUrl.value, imageData.value.name))
    const hasCachedFile = await invoke<boolean>('file_exists', { path: savePath }).catch(() => false)
    if (token !== plainRemoteCacheToken || localFilePath.value) return
    if (hasCachedFile) {
      localFilePath.value = savePath
      setCachedImage(imageCacheKey.value, {
        src: activeSrc.value || toDisplayImageSrc(savePath),
        localFilePath: savePath,
      })
      return
    }

    const doneEvent = `file:done:${id}`
    const errorEvent = `file:error:${id}`
    const unlistenDone = await listen<{ filePath?: string; file_path?: string }>(doneEvent, (event) => {
      if (token !== plainRemoteCacheToken || localFilePath.value) return
      cleanupPlainRemoteCacheEvents()
      const finalPath = String(event.payload.filePath || event.payload.file_path || savePath).trim()
      if (!finalPath) return
      localFilePath.value = finalPath
      setCachedImage(imageCacheKey.value, {
        src: activeSrc.value || toDisplayImageSrc(finalPath),
        localFilePath: finalPath,
      })
    })
    const unlistenError = await listen(errorEvent, () => {
      if (token !== plainRemoteCacheToken) return
      cleanupPlainRemoteCacheEvents()
    })
    stopPlainRemoteCacheEvents = [unlistenDone, unlistenError]

    // 官方号图片没有加密 fileKey；显示后后台落盘，复制时就能走本地剪贴板快路径。
    await invoke('download_file', {
      url: downloadUrl.value,
      fileKey: '',
      savePath,
      msgId: id,
      emitDataUrl: false,
      urlCandidates: getOssDownloadCandidates({
        url: downloadUrl.value,
        channelType: extraData.value.channelType ?? extraData.value.channel_type,
      }),
      msgType: props.message.msgType,
      sendTime: props.message.sendTime,
      logTag: 'image-render',
    })
  } catch (error) {
    cleanupPlainRemoteCacheEvents()
    channelImageLog('official remote image cache failed', {
      urlHead: shortLogValue(downloadUrl.value),
      err: String(error),
    }, 'warn')
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
  if (blockChannelImageSaveIfRestricted()) {
    event.preventDefault()
    return
  }
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
  if (blockChannelImageSaveIfRestricted()) return
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

onMounted(() => {
  document.addEventListener('visibilitychange', retryImageDisplayAfterRestore)
  window.addEventListener('focus', retryImageDisplayAfterRestore)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', retryImageDisplayAfterRestore)
  window.removeEventListener('focus', retryImageDisplayAfterRestore)
  if (activeSrc.value && !loadError.value) {
    if (!localFilePath.value) {
      const inferredPath = toFsPath(activeSrc.value)
      if (isTrustedPersistedLocalPath(inferredPath)) localFilePath.value = inferredPath
    }
    setCachedImage(imageCacheKey.value, {
      src: activeSrc.value,
      localFilePath: localFilePath.value,
    })
    if (isTrustedPersistedLocalPath(localFilePath.value)) {
      persistImageLocalPath(localFilePath.value)
    }
  }
  finishDownloadAttempt()
  releaseHeldDownloadSlot()
  downloadToken += 1
  materializeToken += 1
  plainRemoteCacheToken += 1
  nativeDragStartPoint = null
  nativeDragStarted = false
  cleanupNativeImageDragListeners()
  clearImageAutoRetry()
  cleanupDownloadEvents()
  cleanupPlainRemoteCacheEvents()
})
</script>

<template>
  <div class="image-message">
    <div
      class="image-wrapper"
      :class="{
        'is-preview-ready': canOpenPreview,
        'is-error': loadError,
      }"
      :style="imageBoxStyle"
      @mousedown.left="handleNativeDragMouseDown"
      @click="handleImageWrapperClick"
    >
      <img
        v-if="activeSrc && !loadError"
        ref="imageElRef"
        :key="imageRenderKey"
        :src="activeSrc"
        :data-local-path="localFilePath || undefined"
        :draggable="!shouldUseNativeFileDrag"
        :alt="dragFileName"
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
      <div
        v-if="loadError"
        class="image-error"
        :class="{ 'is-expired': isExpiredImageError, 'can-retry': !isExpiredImageError }"
        :role="isExpiredImageError ? undefined : 'button'"
        :tabindex="isExpiredImageError ? undefined : 0"
        @click.stop="handleManualRetryAfterFailure"
        @keydown.enter.prevent="handleManualRetryAfterFailure"
      >
        <div class="image-error-content">
          <svg
            v-if="isExpiredImageError"
            class="image-error-icon"
            width="28"
            height="28"
            viewBox="0 0 23 23"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M11.5 0C17.8513 5.15406e-07 23 5.14873 23 11.5C23 17.8513 17.8513 23 11.5 23C5.14873 23 5.15422e-07 17.8513 0 11.5C0 5.14873 5.14873 0 11.5 0ZM11.3057 16.9385C10.825 16.9387 10.4346 17.3288 10.4346 17.8096C10.4347 18.2902 10.8251 18.6795 11.3057 18.6797C11.7863 18.6795 12.1756 18.2902 12.1758 17.8096C12.1758 17.3288 11.7864 16.9387 11.3057 16.9385ZM11.3047 4.5C10.5839 4.50042 9.99923 5.08479 9.99902 5.80566L10.4346 14.5127L10.4385 14.6025C10.4833 15.0412 10.8543 15.3835 11.3047 15.3838C11.7553 15.3838 12.126 15.0413 12.1709 14.6025L12.1758 14.5127L12.6113 5.80566C12.6111 5.08453 12.0259 4.5 11.3047 4.5Z" fill="#979797"/>
          </svg>
          <svg
            v-else
            class="image-error-icon image-error-icon-decrypt"
            width="34"
            height="25"
            viewBox="0 0 28 21"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M27.6255 1.02656C27.3697 0.75341 27.016 0.59281 26.642 0.579958L15.9353 0.163452L15.1244 1.93098L16.2391 5.25602L14.2235 9.03852L15.0449 12.0836L17.0777 14.6964L20.0255 12.0052C20.164 11.8797 20.3463 11.8137 20.533 11.8214C20.6255 11.8248 20.7164 11.8464 20.8005 11.885C20.8846 11.9236 20.9602 11.9785 21.023 12.0465L24.8128 16.0985C24.907 16.1998 24.9691 16.3267 24.9912 16.4632C25.0133 16.5998 24.9945 16.7398 24.9371 16.8657C24.8775 16.9915 24.7823 17.097 24.6633 17.1692C24.5442 17.2414 24.4066 17.277 24.2675 17.2717L13.8818 16.8702L13.3638 18.3403L13.9266 19.6668L25.8653 20.1242C26.2394 20.1385 26.6041 20.0049 26.8803 19.7522C27.0166 19.6284 27.1267 19.4787 27.2044 19.3118C27.282 19.1449 27.3256 18.9642 27.3325 18.7802L27.9986 2.03003C28.0069 1.84642 27.9782 1.66302 27.9142 1.49074C27.8501 1.31847 27.7521 1.16085 27.6258 1.02726L27.6255 1.02656ZM19.9534 8.70812C19.5404 8.68703 19.143 8.54429 18.811 8.29785C18.4789 8.05141 18.2272 7.71229 18.0875 7.32315C17.9477 6.934 17.9262 6.51222 18.0256 6.11086C18.1249 5.70951 18.3408 5.3465 18.646 5.06752C18.9512 4.78854 19.332 4.60605 19.7407 4.543C20.1493 4.47995 20.5675 4.53917 20.9425 4.71319C21.3176 4.88722 21.6328 5.16828 21.8486 5.52102C22.0643 5.87376 22.1709 6.28242 22.1549 6.69559C22.1428 6.9724 22.0762 7.2441 21.959 7.49514C21.8418 7.74618 21.6761 7.97162 21.4716 8.15856C21.2671 8.3455 21.0278 8.49027 20.7673 8.58457C20.5067 8.67887 20.2302 8.72086 19.9534 8.70812ZM12.2568 18.3637L12.6155 16.8223L4.18322 17.3952C4.04404 17.4054 3.90494 17.3744 3.78334 17.3059C3.66175 17.2374 3.56307 17.1345 3.49966 17.0102C3.43774 16.8863 3.4142 16.7468 3.43203 16.6094C3.44986 16.4721 3.50826 16.3432 3.59976 16.2392L9.84734 9.14808C9.9124 9.07507 9.99178 9.01624 10.0805 8.97522C10.1693 8.9342 10.2656 8.91189 10.3633 8.90965C10.4611 8.90742 10.5583 8.92532 10.6488 8.96224C10.7394 8.99917 10.8213 9.05432 10.8897 9.12427L12.9813 11.2803L12.08 8.98042L13.6673 5.01382L12.2046 1.83753L12.815 0L1.31493 0.784361C1.13073 0.795577 0.950563 0.843099 0.784796 0.924193C0.619029 1.00529 0.47093 1.11835 0.349016 1.25689C0.227102 1.39542 0.133779 1.5567 0.0744157 1.73143C0.0150519 1.90616 -0.00918178 2.0909 0.00310836 2.27503L1.16967 19.0014C1.18196 19.1845 1.23074 19.3633 1.31314 19.5273C1.39555 19.6913 1.50992 19.8371 1.64953 19.9562C1.93393 20.1989 2.30161 20.3213 2.6747 20.2975L12.9431 19.5975L12.2561 18.3626L12.2568 18.3637Z" fill="#999999"/>
          </svg>
          <span class="image-error-text">{{ imageErrorText }}</span>
        </div>
      </div>
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
            v-if="localFilePath && !isChannelContentSaveRestricted(channelId)"
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
    border-radius: 5px;
    overflow: hidden;
    cursor: default;
    min-height: 150px;
    background: transparent;
    box-sizing: border-box;

    &.is-preview-ready {
      cursor: pointer;
    }

    // 对齐旧 im `.content`：白底 4px 内边距 + 圆角框，灰底过期态叠在里面。
    &.is-error {
      background: #fff;
      padding: 4px;
      border-radius: 10px;
      min-width: 120px;
      min-height: 150px;
    }

    img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: contain;
      border-radius: 5px;
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
    border-radius: 5px;
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
    position: absolute;
    inset: 4px;
    z-index: 2;
    background: #b8babf;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
    box-sizing: border-box;

    &.can-retry {
      cursor: pointer;
    }
  }

  .image-error-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
  }

  .image-error-icon {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
  }

  .image-error-icon-decrypt {
    width: 34px;
    height: 25px;
  }

  .image-error-text {
    color: #818181;
    font-size: 12px;
    text-align: center;
    line-height: 1.4;
    max-width: 100px;
    word-break: break-all;
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
