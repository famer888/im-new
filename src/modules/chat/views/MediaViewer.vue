<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-shell'
import { mediaViewerState, type MediaViewerPayload } from '@/utils/mediaViewerState'

const payload = ref<MediaViewerPayload | null>(null)
const isMaximized = ref(false)
const rotation = ref(0)

function ensureMediaSrc(src: string): string {
  const raw = String(src || '').trim()
  if (!raw) return ''
  if (/^(https?|file|blob|data):/i.test(raw)) return raw
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
const canOpenWithDefaultApp = computed(() =>
  Boolean(String(payload.value?.filePath || payload.value?.src || '').trim()),
)

let unsubscribe: (() => void) | null = null
let unlistenWindowEvents: Array<() => void> = []

function currentMediaWindow() {
  if (!(window as any).__TAURI_INTERNALS__) return null
  return getCurrentWindow()
}

function applyPayload(nextPayload: MediaViewerPayload | null) {
  payload.value = nextPayload
  rotation.value = 0
  if (nextPayload?.title) {
    document.title = nextPayload.title
  }
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
  if (filePath && /\.img$/i.test(filePath)) {
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
  unsubscribe?.()
  unlistenWindowEvents.forEach((unlisten) => unlisten())
  unlistenWindowEvents = []
})
</script>

<template>
  <div class="media-viewer">
    <div class="media-titlebar">
      <div class="media-drag-layer" @mousedown="startWindowDrag" @dblclick="maximize"></div>
      <span class="media-title">{{ payload?.title || '图片' }}</span>
      <div class="media-actions">
        <button class="titlebar-btn" type="button" @click.stop="minimize">
          <span class="line"></span>
        </button>
        <button class="titlebar-btn" type="button" @click.stop="maximize">
          <span v-if="!isMaximized" class="square"></span>
          <span v-else class="restore"></span>
        </button>
        <button class="titlebar-btn close" type="button" @click.stop="closeWindow">
          <span class="close-x"></span>
        </button>
      </div>
    </div>

    <div class="media-stage">
      <div
        v-if="imageSrc"
        class="media-image-wrap"
        :style="{ transform: `rotate(${rotation}deg)` }"
      >
        <img :src="imageSrc" alt="" class="media-image" />
      </div>
    </div>

    <div class="bottom-actions">
      <button
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
        使用默认应用打开
      </button>
    </div>
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
  width: 10px;
  height: 1.5px;
  background: currentColor;
}

.square {
  width: 10px;
  height: 10px;
  border: 1.5px solid currentColor;
}

.restore {
  width: 10px;
  height: 10px;
  border: 1.5px solid currentColor;

  &::before {
    content: '';
    position: absolute;
    width: 10px;
    height: 10px;
    border: 1.5px solid currentColor;
    left: -4px;
    top: 4px;
    background: transparent;
  }
}

.close-x {
  width: 12px;
  height: 12px;

  &::before,
  &::after {
    content: '';
    position: absolute;
    left: 5px;
    top: 0;
    width: 1.5px;
    height: 12px;
    background: currentColor;
  }

  &::before {
    transform: rotate(45deg);
  }

  &::after {
    transform: rotate(-45deg);
  }
}

.media-stage {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
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
