<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import closeIcon from '@/assets/windows_control_icons/close-k-30.png'
import maximizeIcon from '@/assets/windows_control_icons/max-k-30.png'
import minimizeIcon from '@/assets/windows_control_icons/min-k-30.png'
import restoreIcon from '@/assets/windows_control_icons/restore-k-30.png'

const isMac = ref(false)
const isMaximized = ref(false)
let unlistenWindowEvents: Array<() => void> = []

onMounted(async () => {
  isMac.value = navigator.platform.toLowerCase().includes('mac')
  if (!isTauri()) return
  await syncMaximizedState()
  const win = getCurrentWindow()
  unlistenWindowEvents = await Promise.all([
    win.onResized(() => {
      void syncMaximizedState()
    }),
    win.onMoved(() => {
      void syncMaximizedState()
    }),
    win.onScaleChanged(() => {
      void syncMaximizedState()
    }),
  ])
})

onUnmounted(() => {
  unlistenWindowEvents.forEach((unlisten) => unlisten())
  unlistenWindowEvents = []
})

async function getTauriWindow() {
  return getCurrentWindow()
}

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function syncMaximizedState() {
  try {
    isMaximized.value = await getCurrentWindow().isMaximized()
  } catch {
    isMaximized.value = false
  }
}

function startWindowDrag(e: MouseEvent) {
  if (e.button !== 0) return
  getCurrentWindow().startDragging().catch((err) => {
    console.warn('[window] start dragging failed:', err)
  })
}

async function minimize() {
  try { (await getTauriWindow()).minimize() } catch { /* browser */ }
}

async function maximize() {
  try {
    const win = await getTauriWindow()
    if (await win.isMaximized()) {
      await win.unmaximize()
      isMaximized.value = false
      document.body.classList.remove('maximized')
    } else {
      await win.maximize()
      isMaximized.value = true
      document.body.classList.add('maximized')
    }
  } catch { /* browser */ }
}

async function close() {
  try {
    const win = await getTauriWindow()
    await win.minimize()
    await win.hide()
  } catch { /* browser */ }
}
</script>

<template>
  <div class="manage">
    <div
      class="max-box"
      :class="['drag', isMac && 'mac']"
      @mousedown="startWindowDrag"
    ></div>
    <template v-if="!isMac">
      <button class="box" type="button" @click.stop="minimize">
        <span class="window-icon line" :style="{ backgroundImage: `url(${minimizeIcon})` }"></span>
      </button>
      <button class="box maximize" type="button" @click.stop="maximize">
        <span
          v-if="!isMaximized"
          class="window-icon square"
          :style="{ backgroundImage: `url(${maximizeIcon})` }"
        ></span>
        <span
          v-else
          class="window-icon restore"
          :style="{ backgroundImage: `url(${restoreIcon})` }"
        ></span>
      </button>
      <button class="box close" type="button" @click.stop="close">
        <span class="window-icon close-x" :style="{ backgroundImage: `url(${closeIcon})` }"></span>
      </button>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.manage {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  height: 32px;
  position: absolute;
  z-index: 9999;
  top: 0;
  right: 0;

  .max-box {
    left: 0;
    top: 0;
    position: absolute;
    width: calc(100% - 120px);
    height: 32px;
    line-height: 32px;
    z-index: 1;
    user-select: none;

    &.mac {
      width: 100%;
    }
  }

  .box {
    width: 46px;
    height: 100%;
    border: none;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    position: relative;
    -webkit-app-region: no-drag;

    &:hover {
      background: #f0f0f0;
    }

    &.close:hover {
      background: #e81123;
    }

    .window-icon {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 12px;
      height: 12px;
      transform: translate(-50%, -50%);
      background-position: center;
      background-repeat: no-repeat;
      background-size: contain;
    }
  }
}
</style>
