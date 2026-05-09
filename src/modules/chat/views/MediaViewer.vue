<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-shell'
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
const isMaximized = ref(false)
const rotation = ref(0)
const isVideoPlaying = ref(false)
const videoCurrentTime = ref(0)
const videoDuration = ref(0)
const videoVolume = ref(1)
const isVideoMuted = ref(false)
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

const imageSrc = computed(() => ensureMediaSrc(payload.value?.src || payload.value?.filePath || ''))
const videoSrc = computed(() => {
  if (payload.value?.mediaType !== 'video') return ''
  return ensureMediaSrc(payload.value?.src || payload.value?.filePath || '')
})
const isVideo = computed(() => payload.value?.mediaType === 'video')
const videoProgressPercent = computed(() => {
  if (!videoDuration.value) return 0
  return Math.min(100, Math.max(0, (videoCurrentTime.value / videoDuration.value) * 100))
})
const videoVolumePercent = computed(() => isVideoMuted.value ? 0 : Math.round(videoVolume.value * 100))
const canOpenWithDefaultApp = computed(() =>
  Boolean(String(payload.value?.filePath || payload.value?.src || '').trim()),
)
const localImagePath = computed(() => {
  const filePath = String(payload.value?.filePath || '').trim()
  if (filePath) return fileUrlToLocalPath(filePath)
  const src = String(payload.value?.src || '').trim()
  if (/^file:/i.test(src)) return fileUrlToLocalPath(src)
  return ''
})
const canOpenDirectory = computed(() => Boolean(localImagePath.value))
const contextMenuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = []
  if (!isVideo.value) {
    items.push(
      { key: 'copy', label: t('复制') },
      { key: 'save_as', label: t('另存为') },
    )
  }
  if (canOpenDirectory.value) {
    items.push({ key: 'open_directory', label: t('打开目录') })
  }
  if (canOpenWithDefaultApp.value) {
    items.push({ key: 'open_default', label: t('使用默认应用打开') })
  }
  if (!isVideo.value) {
    items.push({ key: 'rotate', label: t('向右旋转') })
  }
  return items
})

let unsubscribe: (() => void) | null = null
let unlistenWindowEvents: Array<() => void> = []

function currentMediaWindow() {
  if (!(window as any).__TAURI_INTERNALS__) return null
  return getCurrentWindow()
}

function applyPayload(nextPayload: MediaViewerPayload | null) {
  resetVideoState()
  payload.value = nextPayload
  rotation.value = 0
  menuVisible.value = false
  if (nextPayload?.title) {
    document.title = nextPayload.title
  } else if (nextPayload?.mediaType === 'video') {
    document.title = '视频'
  }
}

function resetVideoState() {
  const video = videoRef.value
  if (video) {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
  isVideoPlaying.value = false
  videoCurrentTime.value = 0
  videoDuration.value = 0
  videoVolume.value = 1
  isVideoMuted.value = false
}

function formatVideoTime(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function syncVideoState() {
  const video = videoRef.value
  if (!video) return
  videoCurrentTime.value = video.currentTime || 0
  videoDuration.value = Number.isFinite(video.duration) ? video.duration : 0
  videoVolume.value = video.volume
  isVideoMuted.value = video.muted
  isVideoPlaying.value = !video.paused && !video.ended
}

async function toggleVideoPlayback() {
  const video = videoRef.value
  if (!video) return
  if (video.paused || video.ended) {
    try {
      await video.play()
    } catch (error) {
      console.warn('[media-viewer] video play failed:', error)
    }
  } else {
    video.pause()
  }
  syncVideoState()
}

function handleVideoSeek(event: Event) {
  const video = videoRef.value
  if (!video || !videoDuration.value) return
  const next = Number((event.target as HTMLInputElement).value)
  video.currentTime = (Math.min(100, Math.max(0, next)) / 100) * videoDuration.value
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

function toggleVideoFullscreen() {
  const stage = document.querySelector('.media-stage')
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {})
    return
  }
  stage?.requestFullscreen?.().catch((error) => {
    console.warn('[media-viewer] request fullscreen failed:', error)
  })
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

function rotateImage() {
  rotation.value += 90
}

function handleContextMenu(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  menuX.value = event.clientX
  menuY.value = event.clientY
  menuVisible.value = true
}

async function openImageDirectory() {
  const path = localImagePath.value
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
  applyPayload(mediaViewerState.get())
  unsubscribe = mediaViewerState.subscribe((nextPayload) => {
    applyPayload(nextPayload)
  })

  const currentWindow = currentMediaWindow()
  if (!currentWindow) {
    isMaximized.value = false
    return
  }

  await syncMaximizedState()
  unlistenWindowEvents = await Promise.all([
    currentWindow.onResized(() => {
      void syncMaximizedState()
    }),
    currentWindow.onMoved(() => {
      void syncMaximizedState()
    }),
    currentWindow.onScaleChanged(() => {
      void syncMaximizedState()
    }),
  ])
})

onUnmounted(() => {
  resetVideoState()
  unsubscribe?.()
  unlistenWindowEvents.forEach((unlisten) => unlisten())
  unlistenWindowEvents = []
  imageOverwriteResolver?.(false)
  imageOverwriteResolver = null
})
</script>

<template>
  <div class="media-viewer" @contextmenu="handleContextMenu">
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

    <div class="media-stage" :class="{ 'is-video': isVideo }">
      <video
        v-if="videoSrc"
        ref="videoRef"
        class="media-video"
        :src="videoSrc"
        :poster="payload?.cover"
        autoplay
        playsinline
        preload="metadata"
        @click.stop="toggleVideoPlayback"
        @loadedmetadata="syncVideoState"
        @durationchange="syncVideoState"
        @timeupdate="syncVideoState"
        @play="syncVideoState"
        @pause="syncVideoState"
        @ended="syncVideoState"
        @volumechange="syncVideoState"
      ></video>
      <button
        v-if="videoSrc && !isVideoPlaying"
        class="video-overlaid-play"
        type="button"
        aria-label="Play"
        @click.stop="toggleVideoPlayback"
      >
        <span></span>
      </button>
      <div
        v-if="videoSrc"
        class="video-controls"
        @click.stop
        @contextmenu.stop
      >
        <button
          class="video-control-btn video-play-btn"
          type="button"
          :aria-label="isVideoPlaying ? 'Pause' : 'Play'"
          @click="toggleVideoPlayback"
        >
          <span v-if="isVideoPlaying" class="pause-glyph">
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
        <span class="video-time">{{ formatVideoTime(videoCurrentTime) }} / {{ formatVideoTime(videoDuration) }}</span>
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
          aria-label="Fullscreen"
          @click="toggleVideoFullscreen"
        >
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <path d="M10 3h3.6l-4 4L11 8.4l4-4V8h2V1h-7v2ZM7 9.6l-4 4V10H1v7h7v-2H4.4l4-4L7 9.6Z" />
          </svg>
        </button>
      </div>
      <div
        v-else-if="imageSrc"
        class="media-image-wrap"
        :style="{ transform: `rotate(${rotation}deg)` }"
      >
        <img :src="imageSrc" alt="" class="media-image" />
      </div>
    </div>

    <div class="bottom-actions">
      <button
        v-if="!isVideo"
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
  background: rgba(0, 0, 0, 0.82);
  color: #fff;
  overflow: hidden;
  border-radius: 5px;
}

.media-titlebar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 20;
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
  height: 34px;
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

.media-stage:fullscreen {
  background: rgba(0, 0, 0, 0.82);
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

.media-video {
  display: block;
  width: auto;
  height: auto;
  max-width: 100vw;
  max-height: 100vh;
  background: #000;
  outline: none;
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
  width: min(600px, calc(100vw - 48px));
  height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.82);
  box-sizing: border-box;
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
  color: #fff;
  font-size: 14px;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
}

.bottom-actions {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 100;
  display: flex;
  gap: 8px;
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
</style>
