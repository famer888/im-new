<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSettingStore } from '@/stores/useSettingStore'
import AppSwitch from '@/components/AppSwitch.vue'

const settingStore = useSettingStore()

onMounted(() => { if (!settingStore.loaded) settingStore.loadSettings() })

async function toggleNewMessageAlertTone(v: boolean) {
  await settingStore.updateSettings({ notificationSound: v })
}

async function toggleMessageReminderWhenMinimized(v: boolean) {
  await settingStore.updateSettings({ closeToTray: v })
}

const versionText = computed(() => 'v1.0.0')

function handleVersionUpdate() {
  window.open('https://97chat.com', '_blank')
}
</script>

<template>
  <div class="system-settings">
    <h3>通用</h3>
    <dl>
      <dt>新消息提示音</dt>
      <dd>
        <AppSwitch
          :model-value="settingStore.settings.notificationSound"
          @update:model-value="toggleNewMessageAlertTone"
        />
      </dd>
    </dl>
    <dl>
      <dt>最小化时消息提醒</dt>
      <dd>
        <AppSwitch
          :model-value="settingStore.settings.closeToTray"
          @update:model-value="toggleMessageReminderWhenMinimized"
        />
      </dd>
    </dl>

    <h3>关于我们</h3>
    <dl>
      <dt>版本信息 {{ versionText }}</dt>
      <dd>
        <button type="button" @click="handleVersionUpdate">版本更新</button>
      </dd>
    </dl>
  </div>
</template>

<style lang="scss" scoped>
.system-settings {
  > h3 {
    line-height: 40px;
    color: #999;
    font-size: 14px;
    font-weight: 400;
    margin: 0;
  }

  > dl {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 10px;

    > dt {
      font-size: 14px;
      color: #333;
    }

    > dd {
      margin: 0;

      > button {
        padding: 0 12px;
        height: 32px;
        line-height: 32px;
        font-size: 12px;
        border-radius: 4px;
        border: 1px solid #3369fe;
        color: #fff;
        background-color: #3369fe;
        cursor: pointer;

        &:hover {
          opacity: 0.8;
        }
      }
    }
  }
}
</style>
