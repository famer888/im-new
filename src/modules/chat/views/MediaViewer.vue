<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-shell'
import { mediaViewerState, type MediaViewerPayload } from '@/utils/mediaViewerState'

const payload = ref<MediaViewerPayload | null>(null)
const isMaximized = ref(false)

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

const imageSrc = computed(() => ensureMediaSrc(payload.value?.filePath || payload.value?.src || ''))
const canOpenWithDefaultApp = computed(() => Boolean(String(payload.value?.filePath || '').trim()))

let unsubscribe: (() => void) | null = null

function applyPayload(nextPayload: MediaViewerPayload | null) {
  payload.value = nextPayload
  if (nextPayload?.title) {
    document.title = nextPayload.title
  }
}

function startWindowDrag(e: MouseEvent) {
  if (e.button !== 0) return
  getCurrentWindow().startDragging().catch((err) => {
    console.warn('[media-viewer] start dragging failed:', err)
  })
}

async function minimize() {
  try {
    await getCurrentWindow().minimize()
  } catch {
    // browser noop
  }
}

async function maximize() {
  try {
    const win = getCurrentWindow()
    if (await win.isMaximized()) {
      await win.unmaximize()
      isMaximized.value = false
    } else {
      await win.maximize()
      isMaximized.value = true
    }
  } catch {
    // browser noop
  }
}

async function closeWindow() {
  try {
    await getCurrentWindow().close()
  } catch {
    window.close()
  }
}

async function openWithDefaultApp() {
  const filePath = String(payload.value?.filePath || '').trim()
  if (!filePath) return
  try {
    await open(filePath)
  } catch (error) {
    console.warn('[media-viewer] openWithDefaultApp failed:', error)
  }
}

onMounted(async () => {
  applyPayload(mediaViewerState.get())
  unsubscribe = mediaViewerState.subscribe((nextPayload) => {
    applyPayload(nextPayload)
  })
  try {
    isMaximized.value = await getCurrentWindow().isMaximized()
  } catch {
    isMaximized.value = false
  }
})

onUnmounted(() => {
  unsubscribe?.()
})
</script>

<template>
  <div class="media-viewer">
    <div class="media-titlebar">
      <div class="media-drag-layer" @mousedown="startWindowDrag"></div>
      <span class="media-title">{{ payload?.title || '图片' }}</span>
      <div class="media-actions">
        <button class="titlebar-btn" type="button" @click="minimize">
          <span class="line"></span>
        </button>
        <button class="titlebar-btn" type="button" @click="maximize">
          <span v-if="!isMaximized" class="square"></span>
          <span v-else class="restore"></span>
        </button>
        <button class="titlebar-btn close" type="button" @click="closeWindow">
          <span class="close-x"></span>
        </button>
      </div>
    </div>

    <div class="media-stage">
      <img v-if="imageSrc" :src="imageSrc" alt="" class="media-image" />
    </div>

    <div class="media-footer">
      <button
        v-if="canOpenWithDefaultApp"
        class="default-open-btn"
        type="button"
        @click="openWithDefaultApp"
      >
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
  padding: 34px 16px 72px;
  box-sizing: border-box;
}

.media-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

.media-footer {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 20;
}

.default-open-btn {
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
</style>
