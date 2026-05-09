<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { ensureGroupRelKey } from '@/utils/e2ee'
import { mediaViewerState } from '@/utils/mediaViewerState'

const props = defineProps<{
  message: Message
}>()

const authStore = useAuthStore()
const isLoaded = ref(false)
const loadError = ref(false)
const activeThumbSrc = ref('')
const showPreview = ref(false)
const previewVideoSrc = ref('')
const videoOpening = ref(false)
const localVideoPath = ref('')
const thumbElRef = ref<HTMLImageElement | null>(null)
let downloadToken = 0
let videoOpenToken = 0
let stopDownloadEvents: Array<() => void> = []
let stopVideoDownloadEvents: Array<() => void> = []

interface VideoContent {
  url: string
  thumbUrl: string
  duration: number
  width: number
  height: number
  size: number
  fileKey: string
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
    thumbUrl: normalizeImageSrc(thumbUrl || url),
    duration: Number(duration || 0) || 0,
    width: Number(width || 0) || 0,
    height: Number(height || 0) || 0,
    size: Number(size || 0) || 0,
    fileKey: '',
  }
}

const videoData = computed<VideoContent>(() => {
  const raw = String(props.message.content || '').trim()
  if (!raw) {
    return { url: '', thumbUrl: '', duration: 0, width: 0, height: 0, size: 0, fileKey: '' }
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const url = normalizeVideoUrl(parsed.url || parsed.fileUrl || parsed.path || '')
    const thumbUrl = normalizeImageSrc(
      parsed.thumbUrl || parsed.thumbnailUrl || parsed.thumbnail || parsed.cover || url,
      parsed.thumbMimeType || parsed.thumb_mime_type || parsed.mimeType || parsed.mime,
    )
    return {
      url,
      thumbUrl,
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
const groupId = computed(() => {
  const extraGroupId = String(extraData.value.groupId || '').trim()
  if (extraGroupId) return extraGroupId
  const convId = props.message.conversationId || ''
  return convId.startsWith('1_') ? convId.split('_')[1] || '' : ''
})
const isRemoteThumb = computed(() => /^https?:\/\//i.test(videoData.value.thumbUrl))
const showLoading = computed(() => !activeThumbSrc.value && !loadError.value && Boolean(videoData.value.thumbUrl))
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

function safeName(name: string): string {
  return name.replace(/[^\w.-]/g, '_') || 'video-thumb'
}

function ensureMediaSrc(src: string): string {
  const raw = String(src || '').trim()
  if (!raw) return ''
  if (/^(https?|asset|file|blob|data):/i.test(raw)) return raw
  const normalized = raw.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalized)) return `file:///${encodeURI(normalized)}`
  if (normalized.startsWith('/')) return `file://${encodeURI(normalized)}`
  return raw
}

function videoExt(url: string): string {
  const matched = String(url || '').split('?')[0].match(/\.(mp4|m4v|mov|webm|ogg)$/i)
  return matched?.[0]?.toLowerCase() || '.mp4'
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

async function downloadAndDecryptThumb() {
  const url = videoData.value.thumbUrl
  const key = await resolveFileKey()
  if (!url || !key) {
    activeThumbSrc.value = url
    markLoadedIfImageAlreadyComplete()
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
    const savePath = await join(baseDir, 'video-thumb-cache', `${id}.jpg`)
    const doneEvent = `file:done:${id}`
    const errorEvent = `file:error:${id}`

    const unlistenDone = await listen<{ dataUrl?: string; data_url?: string }>(doneEvent, (event) => {
      if (token !== downloadToken) return
      cleanupDownloadEvents()
      const src = event.payload.dataUrl || event.payload.data_url || ''
      if (!src) {
        loadError.value = true
        isLoaded.value = true
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

function openInlinePreview(src: string) {
  previewVideoSrc.value = ensureMediaSrc(src)
  showPreview.value = true
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
  const currentWindow = windowApi.getCurrentWindow()
  const position = await (
    typeof currentWindow.outerPosition === 'function'
      ? currentWindow.outerPosition()
      : currentWindow.innerPosition?.()
  )

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
    x: typeof position?.x === 'number' ? Math.round(position.x) : null,
    y: typeof position?.y === 'number' ? Math.round(position.y) : null,
    width: 900,
    height: 600,
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
      const savePath = await join(baseDir, 'video-cache', `${id}${videoExt(url)}`)
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
      })
    } catch (error) {
      if (token !== videoOpenToken) return
      cleanupVideoDownloadEvents()
      reject(error)
    }
  })
}

async function handleOpenVideo() {
  if (videoOpening.value) return
  const url = videoData.value.url
  if (!url) return

  videoOpening.value = true
  try {
    if (localVideoPath.value) {
      await openMediaWindow(localVideoPath.value)
      return
    }

    const key = await resolveFileKey()
    const isEncryptedRemote = /^https?:\/\//i.test(url) && Boolean(key)
    if ((window as any).__TAURI_INTERNALS__ && isEncryptedRemote) {
      const path = await downloadVideoToLocal(url, key)
      await openMediaWindow(path)
      return
    }

    await openMediaWindow(url)
  } catch (error) {
    console.warn('[video] open failed:', error)
  } finally {
    videoOpening.value = false
  }
}

watch([() => videoData.value.thumbUrl, fileKey, attachmentKey], () => {
  downloadToken += 1
  videoOpenToken += 1
  cleanupDownloadEvents()
  cleanupVideoDownloadEvents()
  isLoaded.value = false
  loadError.value = false
  activeThumbSrc.value = ''
  localVideoPath.value = ''
  if (!videoData.value.thumbUrl) {
    loadError.value = true
    isLoaded.value = true
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
  loadError.value = true
  isLoaded.value = true
}

onBeforeUnmount(() => {
  downloadToken += 1
  videoOpenToken += 1
  cleanupDownloadEvents()
  cleanupVideoDownloadEvents()
})
</script>

<template>
  <div class="video-message" @click.stop="handleOpenVideo">
    <div class="video-content" :style="videoBoxStyle">
      <div class="video-frame">
        <img
          v-if="activeThumbSrc && !loadError"
          ref="thumbElRef"
          :src="activeThumbSrc"
          :class="{ loaded: isLoaded }"
          alt=""
          @load="handleLoad"
          @error="handleError"
        />
        <div v-if="showLoading" class="video-loading">
          <div class="progress-ring spinning">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <circle class="ring-bg" cx="24" cy="24" r="21" fill="none" stroke-width="2" />
              <circle class="ring-progress" cx="24" cy="24" r="21" fill="none" stroke-width="2" />
            </svg>
          </div>
        </div>
        <div v-if="loadError" class="video-placeholder"></div>
        <div class="center-control" :class="{ opening: videoOpening }" aria-hidden="true">
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
      <div v-if="showPreview" class="video-preview" @click="showPreview = false">
        <button class="preview-close" type="button" @click.stop="showPreview = false">×</button>
        <video
          :src="previewVideoSrc"
          controls
          autoplay
          playsinline
          @click.stop
        ></video>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.video-message {
  position: relative;
  max-width: 400px;
  cursor: pointer;

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
  width: fit-content;
  height: 150px;
  border-radius: 6px;
  overflow: hidden;
  text-align: center;
  background: #bababa;

  img {
    width: auto;
    height: 150px;
    display: inline-block;
    object-fit: contain;
    opacity: 0;
    -webkit-user-drag: unset;

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
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

.progress-ring {
  position: absolute;
  width: 42px;
  height: 42px;

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
    stroke: rgba(255, 255, 255, 0.32);
  }

  .ring-progress {
    stroke: #fff;
    stroke-dasharray: 36 96;
    stroke-linecap: round;
  }

  &.spinning {
    animation: video-loading-spin 1.2s linear infinite;
  }
}

.center-control {
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
}

.play-icon {
  z-index: 4;
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

  video {
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 72px);
    outline: none;
  }
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
