<script setup lang="ts">
import { ref, onMounted } from 'vue'

const isMac = ref(false)

onMounted(() => {
  isMac.value = navigator.platform.toLowerCase().includes('mac')
})

async function getTauriWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow()
}

async function handleMinimize() {
  try { (await getTauriWindow()).minimize() } catch { /* browser */ }
}

async function handleMaximize() {
  try {
    const win = await getTauriWindow()
    if (await win.isMaximized()) await win.unmaximize()
    else await win.maximize()
  } catch { /* browser */ }
}

async function handleClose() {
  try { (await getTauriWindow()).hide() } catch { /* browser */ }
}
</script>

<template>
  <div class="home-top">
    <!-- Drag region: OCS uses width: calc(100% - 120px) -->
    <div class="drag-region" data-tauri-drag-region />
    <!-- Window controls: right side (non-Mac) -->
    <div v-if="!isMac" class="window-controls">
      <button class="ctrl-btn" @click="handleMinimize">
        <svg viewBox="0 0 16 16" width="16" height="16"><line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" stroke-width="1"/></svg>
      </button>
      <button class="ctrl-btn" @click="handleMaximize">
        <svg viewBox="0 0 16 16" width="16" height="16"><rect x="3" y="3" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/></svg>
      </button>
      <button class="ctrl-btn close" @click="handleClose">
        <svg viewBox="0 0 16 16" width="16" height="16"><line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="1"/><line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" stroke-width="1"/></svg>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.home-top {
  height: 32px;
  width: 100%;
  position: absolute;
  top: 0;
  right: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.drag-region {
  width: calc(100% - 120px);
  height: 32px;
  line-height: 32px;
  position: absolute;
  left: 0;
  top: 0;
  -webkit-app-region: drag;
}

.window-controls {
  display: flex;
  padding: 0 12px;
  -webkit-app-region: no-drag;
  z-index: 1;

  .ctrl-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: #666;

    img, svg {
      width: 16px;
      height: 16px;
    }

    &:hover {
      background: #f0f0f0;
    }

    &.close:hover {
      background: #e81123;
      color: #fff;
    }
  }
}
</style>
