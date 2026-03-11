<script setup lang="ts">
import { ref, onMounted } from 'vue'
import top1Icon from '@/assets/images/system/top1.png'
import top2Icon from '@/assets/images/system/top2.png'
import top3Icon from '@/assets/images/system/top3.png'

const isMac = ref(false)

onMounted(() => {
  isMac.value = navigator.platform.toLowerCase().includes('mac')
})

async function getTauriWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow()
}

async function minimize() {
  try { (await getTauriWindow()).minimize() } catch { /* browser */ }
}

async function maximize() {
  try {
    const win = await getTauriWindow()
    if (await win.isMaximized()) {
      await win.unmaximize()
      document.body.classList.remove('maximized')
    } else {
      await win.maximize()
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
    <div class="max-box" :class="['drag', isMac && 'mac']" data-tauri-drag-region></div>
    <template v-if="!isMac">
      <div class="box" @click="minimize">
        <img :src="top1Icon" />
      </div>
      <div class="box maximize" @click="maximize">
        <img :src="top2Icon" />
      </div>
      <div class="box" @click="close">
        <img :src="top3Icon" />
      </div>
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
    -webkit-app-region: drag;

    &.mac {
      width: 100%;
    }
  }

  .box {
    padding: 0 12px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-items: center;
    cursor: pointer;
    -webkit-app-region: no-drag;

    &:hover {
      background: #f0f0f0;
    }

    img {
      width: 16px;
      height: 16px;
    }
  }
}
</style>
