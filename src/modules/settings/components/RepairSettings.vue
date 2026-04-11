<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useMessageStore } from '@/stores/useMessageStore'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { t: $t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()
const messageStore = useMessageStore()

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke(cmd: string, args?: Record<string, unknown>): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  if (args !== undefined) {
    await invoke(cmd, args)
  }
  else {
    await invoke(cmd)
  }
}

const resetConfirmVisible = ref(false)

async function handleDecryptRepair() {
  if (!isTauri()) {
    window.alert($t('仅桌面客户端支持此修复'))
    return
  }
  try {
    await tauriInvoke('repair_clear_crypto_keys')
    window.alert($t('秘钥重置成功'))
  } catch (e) {
    window.alert(String(e))
  }
}

function openResetConfirm() {
  resetConfirmVisible.value = true
}

async function confirmResetCache() {
  resetConfirmVisible.value = false
  const uid = authStore.uid

  if (isTauri() && uid) {
    try {
      await tauriInvoke('repair_reset_user_local_data', { uid })
    } catch (e) {
      window.alert(String(e))
      return
    }
    try {
      await tauriInvoke('disconnect_ws')
    } catch { /* ignore */ }
  }

  try {
    localStorage.clear()
  } catch { /* ignore */ }

  chatStore.conversations = []
  chatStore.currentConversationId = null
  messageStore.clearAllMessageCaches()
  await authStore.logout()

  if (!isTauri()) {
    await router.push('/login')
    return
  }

  window.location.reload()
}
</script>

<template>
  <div class="com-setting-dialog-repair">
    <h3>{{ $t('修复') }}</h3>
    <dl>
      <dt>{{ $t('消息解密失败') }}</dt>
      <dd>
        <button type="button" @click="handleDecryptRepair">{{ $t('修复') }}</button>
      </dd>
    </dl>
    <dl>
      <dt>{{ $t('重置缓存数据') }}</dt>
      <dd>
        <button type="button" @click="openResetConfirm">{{ $t('重置') }}</button>
      </dd>
    </dl>

    <ConfirmDialog
      v-model:visible="resetConfirmVisible"
      variant="im"
      :content="$t('确认退出，并重置缓存数据？')"
      @confirm="confirmResetCache"
    />
  </div>
</template>

<style lang="scss" scoped>
.com-setting-dialog-repair {
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
