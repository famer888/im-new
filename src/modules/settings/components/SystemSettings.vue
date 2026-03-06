<script setup lang="ts">
import { onMounted } from 'vue'
import { useSettingStore } from '@/stores/useSettingStore'
import AppSwitch from '@/components/AppSwitch.vue'

const settingStore = useSettingStore()

onMounted(() => { if (!settingStore.loaded) settingStore.loadSettings() })

async function toggleAutoStart(v: boolean) {
  await settingStore.updateSettings({ autoStart: v })
}

async function toggleCloseToTray(v: boolean) {
  await settingStore.updateSettings({ closeToTray: v })
}
</script>

<template>
  <div class="system-settings">
    <div class="setting-item">
      <div class="setting-label">
        <span class="label-title">开机自启动</span>
        <span class="label-desc">开机时自动启动 OCS Chat</span>
      </div>
      <AppSwitch :model-value="settingStore.settings.autoStart" @update:model-value="toggleAutoStart" />
    </div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="label-title">关闭时最小化到托盘</span>
        <span class="label-desc">关闭窗口时不退出程序</span>
      </div>
      <AppSwitch :model-value="settingStore.settings.closeToTray" @update:model-value="toggleCloseToTray" />
    </div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="label-title">版本</span>
        <span class="label-desc">当前版本 1.0.0</span>
      </div>
      <button class="check-btn">检查更新</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.system-settings { display: flex; flex-direction: column; gap: 4px; }

.setting-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px solid #f5f5f5;
}

.setting-label { display: flex; flex-direction: column; gap: 2px; }
.label-title { font-size: 14px; color: #333; }
.label-desc { font-size: 12px; color: #999; }

.check-btn {
  height: 28px; padding: 0 12px; background: #fff; color: #3369fe;
  border: 1px solid #3369fe; border-radius: 4px; font-size: 12px; cursor: pointer;
  &:hover { background: rgba(51, 105, 254, 0.05); }
}
</style>
