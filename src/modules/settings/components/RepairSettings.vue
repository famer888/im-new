<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useMessageStore } from '@/stores/useMessageStore'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Toast from '@/components/Toast.vue'
import { ensureFriendRelKey, ensureGroupRelKey, ensureOwnKeyPair } from '@/utils/e2ee'

const { t: $t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const messageStore = useMessageStore()
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const repairingDecrypt = ref(false)
const resettingCache = ref(false)

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

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

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const text = String(error || '').trim()
  return text && text !== '[object Object]' ? text : $t('操作失败')
}

function collectFriendIds(uid: string): string[] {
  const ids = new Set<string>()

  for (const contact of contactStore.contacts) {
    const id = String(contact.id || '')
    if (!id || id === uid || contact.status <= 0) continue
    ids.add(id)
  }

  for (const conv of chatStore.conversations) {
    if (conv.type !== 0) continue
    const id = String(conv.targetId || '')
    if (!id || id === uid) continue
    ids.add(id)
  }

  return Array.from(ids)
}

function collectGroupIds(): string[] {
  const ids = new Set<string>()

  for (const group of groupStore.groups) {
    const id = String(group.id || '')
    if (!id) continue
    ids.add(id)
  }

  for (const conv of chatStore.conversations) {
    if (conv.type !== 1) continue
    const id = String(conv.targetId || '')
    if (!id) continue
    ids.add(id)
  }

  return Array.from(ids)
}

async function warmupInBatches(
  ids: string[],
  worker: (id: string) => Promise<unknown>,
  batchSize = 8,
) {
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    const results = await Promise.allSettled(batch.map((id) => worker(id)))
    const failed = results.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') {
      throw failed.reason
    }
  }
}

async function handleDecryptRepair() {
  if (repairingDecrypt.value) return
  if (!isTauri()) {
    showToast($t('仅桌面客户端支持此修复'), 'error')
    return
  }

  const uid = String(authStore.uid || '').trim()
  if (!uid) {
    showToast($t('操作失败'), 'error')
    return
  }

  repairingDecrypt.value = true
  try {
    await tauriInvoke('repair_clear_crypto_keys')
    await ensureOwnKeyPair(uid)

    const [friendIds, groupIds] = [
      collectFriendIds(uid),
      collectGroupIds(),
    ]

    await warmupInBatches(friendIds, (friendId) => ensureFriendRelKey(uid, friendId))
    await warmupInBatches(groupIds, (groupId) => ensureGroupRelKey(uid, groupId))

    showToast($t('秘钥重置成功'))
  } catch (e) {
    showToast(formatErrorMessage(e), 'error')
  } finally {
    repairingDecrypt.value = false
  }
}

function openResetConfirm() {
  resetConfirmVisible.value = true
}

async function confirmResetCache() {
  if (resettingCache.value) return
  resetConfirmVisible.value = false
  resettingCache.value = true
  const uid = authStore.uid

  if (isTauri() && uid) {
    try {
      await tauriInvoke('repair_reset_user_local_data', { uid })
    } catch (e) {
      showToast(formatErrorMessage(e), 'error')
      resettingCache.value = false
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
    resettingCache.value = false
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
        <button type="button" :disabled="repairingDecrypt || resettingCache" @click="handleDecryptRepair">
          {{ $t('修复') }}
        </button>
      </dd>
    </dl>
    <dl>
      <dt>{{ $t('重置缓存数据') }}</dt>
      <dd>
        <button type="button" :disabled="repairingDecrypt || resettingCache" @click="openResetConfirm">
          {{ $t('重置') }}
        </button>
      </dd>
    </dl>

    <ConfirmDialog
      v-model:visible="resetConfirmVisible"
      variant="im"
      :content="$t('确认退出，并重置缓存数据？')"
      @confirm="confirmResetCache"
    />

    <Toast
      v-model:visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
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

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      }
    }
  }
}
</style>
