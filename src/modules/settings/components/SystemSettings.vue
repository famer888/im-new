<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingStore } from '@/stores/useSettingStore'
import { checkVersion } from '@/api/imBase'
import AppSwitch from '@/components/AppSwitch.vue'
import Toast from '@/components/Toast.vue'
import pkg from '../../../../package.json'

const { t } = useI18n()
const settingStore = useSettingStore()
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const appVersion = ref(String(pkg.version ?? '1.0.0'))

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

onMounted(async () => {
  if (!settingStore.loaded) await settingStore.loadSettings()
  if (!(window as any).__TAURI_INTERNALS__) return
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    appVersion.value = await getVersion()
  } catch {
    /* keep package.json version */
  }
})

async function toggleNewMessageAlertTone(v: boolean) {
  await settingStore.updateSettings({ notificationSound: v })
}

async function toggleMessageReminderWhenMinimized(v: boolean) {
  await settingStore.updateSettings({ messageReminderWhenMinimized: v })
}

const versionText = computed(() => `v${appVersion.value}`)

function getVersionNumber(text: string): number {
  return Number(String(text || '').replace(/\./g, ''))
}

async function openVersionSite() {
  const url = 'https://97chat.com'
  if ((window as any).__TAURI_INTERNALS__) {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
    return
  }
  window.open(url, '_blank')
}

async function handleVersionUpdate() {
  try {
    const res = await checkVersion()
    const errCode = Number((res as any)?.commonResult?.errCode ?? 200)
    if (errCode !== 200) {
      await openVersionSite()
      return
    }

    if (Number(res.version || 0) === getVersionNumber(appVersion.value)) {
      showToast(t('已是最新版本'))
      return
    }

    await openVersionSite()
  } catch {
    try {
      await openVersionSite()
    } catch {
      showToast(t('当前网络异常，请检查网络设置'), 'error')
    }
  }
}
</script>

<template>
  <div class="system-settings">
    <h3>{{ t('通用') }}</h3>
    <dl>
      <dt>{{ t('新消息提示音') }}</dt>
      <dd>
        <AppSwitch
          :model-value="settingStore.settings.notificationSound"
          @update:model-value="toggleNewMessageAlertTone"
        />
      </dd>
    </dl>
    <dl>
      <dt>{{ t('最小化时消息提醒') }}</dt>
      <dd>
        <AppSwitch
          :model-value="settingStore.settings.messageReminderWhenMinimized"
          @update:model-value="toggleMessageReminderWhenMinimized"
        />
      </dd>
    </dl>

    <h3>{{ t('关于我们') }}</h3>
    <dl>
      <dt>{{ t('版本信息') }} {{ versionText }}</dt>
      <dd>
        <button type="button" @click="handleVersionUpdate">{{ t('版本更新') }}</button>
      </dd>
    </dl>

    <Toast
      v-model:visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
    />
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
    height: 30px;
    margin: 0 0 10px;

    > dt {
      font-size: 14px;
      color: #333;
    }

    > dd {
      margin: 0;

      > button {
        padding: 0 12px;
        height: 26px;
        line-height: 26px;
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
