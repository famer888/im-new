<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingStore } from '@/stores/useSettingStore'
import AppSwitch from '@/components/AppSwitch.vue'
import Toast from '@/components/Toast.vue'

const { t: $t } = useI18n()
const settingStore = useSettingStore()
const saving = ref(false)
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')

onMounted(async () => {
  if (!settingStore.loaded) {
    await settingStore.loadSettings({ syncRemote: true })
  } else {
    // 打开隐私页时再拉一次服务端 privacy，避免本地默认 true 但服务端未开验证。
    await settingStore.refreshFriendVerifyFromServer()
  }
})

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

async function onFriendVerifyChange(v: boolean) {
  if (saving.value) return

  saving.value = true
  try {
    await settingStore.updateSettings({ friendVerifyRequired: v })
    showToast($t('修改成功'))
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : $t('修改失败')
    showToast(message, 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="com-setting-dialog-privacy">
    <h3>{{ $t('设置') }}</h3>
    <dl>
      <dt>{{ $t('加我为朋友时需要验证') }}</dt>
      <dd>
        <AppSwitch
          :model-value="settingStore.settings.friendVerifyRequired"
          :disabled="saving"
          @update:model-value="onFriendVerifyChange"
        />
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
.com-setting-dialog-privacy {
  > h3 {
    line-height: 40px;
    margin: 0;
    color: #999;
    font-size: 14px;
    font-weight: 400;
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
    }
  }
}
</style>
