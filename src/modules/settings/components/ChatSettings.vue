<script setup lang="ts">
import { onMounted } from 'vue'
import { useSettingStore } from '@/stores/useSettingStore'
import AppSwitch from '@/components/AppSwitch.vue'

const settingStore = useSettingStore()
onMounted(() => { if (!settingStore.loaded) settingStore.loadSettings() })

async function toggleNotification(v: boolean) {
  await settingStore.updateSettings({ notificationEnabled: v })
}

async function toggleSound(v: boolean) {
  await settingStore.updateSettings({ notificationSound: v })
}
</script>

<template>
  <div class="chat-settings">
    <div class="setting-item">
      <div class="setting-label">
        <span class="label-title">新消息通知</span>
        <span class="label-desc">收到新消息时弹出桌面通知</span>
      </div>
      <AppSwitch :model-value="settingStore.settings.notificationEnabled" @update:model-value="toggleNotification" />
    </div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="label-title">消息提示音</span>
        <span class="label-desc">收到新消息时播放提示音</span>
      </div>
      <AppSwitch :model-value="settingStore.settings.notificationSound" @update:model-value="toggleSound" />
    </div>
    <div class="setting-item">
      <div class="setting-label">
        <span class="label-title">字体大小</span>
        <span class="label-desc">调整聊天文字大小</span>
      </div>
      <select
        :value="settingStore.settings.fontSize"
        @change="settingStore.updateSettings({ fontSize: Number(($event.target as HTMLSelectElement).value) })"
        class="font-select"
      >
        <option :value="12">小</option>
        <option :value="14">标准</option>
        <option :value="16">大</option>
        <option :value="18">超大</option>
      </select>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chat-settings { display: flex; flex-direction: column; gap: 4px; }
.setting-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px solid #f5f5f5;
}
.setting-label { display: flex; flex-direction: column; gap: 2px; }
.label-title { font-size: 14px; color: #333; }
.label-desc { font-size: 12px; color: #999; }
.font-select {
  height: 28px; padding: 0 8px; border: 1px solid #dcdfe6; border-radius: 4px;
  font-size: 13px; outline: none;
}
</style>
