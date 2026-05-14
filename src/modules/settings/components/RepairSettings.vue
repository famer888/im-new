<script setup lang="ts">
import { computed, ref } from 'vue'
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
import { collectNetworkDiagnostics, splitDiagnosticSections } from '@/utils/networkDiagnostics'
import { initDomainPoolFromApi, initDomainPoolFromOss } from '@/utils/domainPool'

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
const diagnosingNetwork = ref(false)
const repairingNetwork = ref(false)
const diagnosticDialogVisible = ref(false)
const diagnosticDialogTitle = ref('')
const diagnosticReport = ref('')
const diagnosticError = ref('')
const visibleDiagnosticSectionCount = ref(0)

const diagnosticSections = computed(() => splitDiagnosticSections(diagnosticReport.value))
const visibleDiagnosticSections = computed(() => diagnosticSections.value.slice(0, visibleDiagnosticSectionCount.value))

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

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

async function copyTextToClipboard(text: string) {
  if (isTauri()) {
    try {
      await tauriInvoke('write_clipboard_text', { text })
      return
    } catch {
      /* fallback below */
    }
  }
  await navigator.clipboard.writeText(text)
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

async function handleNetworkDiagnostics() {
  if (diagnosingNetwork.value) return
  diagnosticDialogVisible.value = true
  diagnosticDialogTitle.value = $t('网络诊断')
  diagnosticReport.value = ''
  diagnosticError.value = ''
  visibleDiagnosticSectionCount.value = 0
  diagnosingNetwork.value = true
  try {
    // 对齐老 im 网络诊断弹窗：Tauri 无 Electron netLog，先弹窗再逐步展开运行时/WS/代理/VPN 快照。
    diagnosticReport.value = await collectNetworkDiagnostics()
    await revealDiagnosticSections()
  } catch (error) {
    diagnosticError.value = formatErrorMessage(error)
  } finally {
    diagnosingNetwork.value = false
  }
}

async function revealDiagnosticSections() {
  for (let i = 1; i <= diagnosticSections.value.length; i += 1) {
    if (!diagnosticDialogVisible.value) break
    visibleDiagnosticSectionCount.value = i
    await sleep(i === 1 ? 80 : 180)
  }
}

async function copyDiagnosticReport() {
  if (!diagnosticReport.value) return
  await copyTextToClipboard(diagnosticReport.value)
  showToast($t('诊断报告已复制'))
}

async function repairNetworkAndRefresh() {
  if (repairingNetwork.value || diagnosingNetwork.value) return
  repairingNetwork.value = true
  try {
    // 软修复仅刷新动态域名缓存并重跑诊断，不修改系统代理/VPN 设置。
    await Promise.allSettled([initDomainPoolFromOss(), initDomainPoolFromApi()])
    await handleNetworkDiagnostics()
    showToast($t('网络诊断已刷新'))
  } finally {
    repairingNetwork.value = false
  }
}

function restartApp() {
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
    <dl>
      <dt>{{ $t('网络诊断') }}</dt>
      <dd>
        <button type="button" :disabled="diagnosingNetwork" @click="handleNetworkDiagnostics">
          {{ diagnosingNetwork ? $t('诊断中') : $t('打开网络诊断') }}
        </button>
      </dd>
    </dl>

    <Teleport to="body">
      <div v-if="diagnosticDialogVisible" class="diagnostic-overlay" @click.self="diagnosticDialogVisible = false">
        <section class="diagnostic-dialog" role="dialog" aria-modal="true">
          <header>
            <h4>{{ diagnosticDialogTitle }}</h4>
            <button type="button" class="diagnostic-close" @click="diagnosticDialogVisible = false">×</button>
          </header>

          <div class="diagnostic-content">
            <p v-if="diagnosingNetwork" class="diagnostic-loading">
              <span class="diagnostic-spinner" />
              <span>{{ $t('处理中') }}...</span>
            </p>
            <p v-else-if="diagnosticError" class="diagnostic-error">{{ diagnosticError }}</p>
            <template v-else>
              <article v-for="section in visibleDiagnosticSections" :key="section.title" class="diagnostic-section">
                <h5>
                  <span :class="['section-state', section.ok ? 'ok' : 'warn']">{{ section.ok ? '✓' : '!' }}</span>
                  {{ section.title }}
                </h5>
                <ul v-if="section.body.length">
                  <li v-for="line in section.body" :key="line">{{ line }}</li>
                </ul>
              </article>
            </template>
          </div>

          <footer>
            <button type="button" :disabled="!diagnosticReport" @click="copyDiagnosticReport">
              {{ $t('复制诊断报告') }}
            </button>
            <button type="button" :disabled="repairingNetwork || diagnosingNetwork" @click="repairNetworkAndRefresh">
              {{ repairingNetwork ? $t('诊断中') : $t('尝试网络修复') }}
            </button>
            <button type="button" class="danger" @click="restartApp">
              {{ $t('重启应用') }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>

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
  width: 100%;
  padding-top: 7px;

  > h3 {
    line-height: 34px;
    margin: 0;
    color: #999;
    font-size: 14px;
    font-weight: 400;
  }

  > dl {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 42px;
    margin: 0;

    > dt {
      font-size: 14px;
      color: #333;
      line-height: 32px;
    }

    > dd {
      margin: 0;

      > button {
        padding: 0 12px;
        min-width: 98px;
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

.diagnostic-overlay {
  position: fixed;
  inset: 0;
  z-index: 9200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.52);
}

.diagnostic-dialog {
  width: min(420px, calc(100vw - 40px));
  max-height: min(520px, calc(100vh - 80px));
  display: flex;
  flex-direction: column;
  color: #d8d8d8;
  background: #1f1f1f;
  border-radius: 8px;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  transition: max-height 0.2s ease, transform 0.18s ease;

  > header {
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    border-bottom: 1px solid #303030;

    > h4 {
      margin: 0;
      color: #bfbfbf;
      font-size: 14px;
      font-weight: 500;
    }
  }

  .diagnostic-close {
    width: 28px;
    height: 28px;
    border: 0;
    color: #aaa;
    font-size: 24px;
    line-height: 28px;
    background: transparent;
    cursor: pointer;

    &:hover {
      color: #fff;
    }
  }

  .diagnostic-content {
    flex: 1;
    min-height: 44px;
    padding: 14px 16px;
    overflow: auto;
  }

  .diagnostic-loading,
  .diagnostic-error {
    margin: 0;
    font-size: 13px;
    line-height: 22px;
  }

  .diagnostic-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #8f8f8f;
  }

  .diagnostic-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid #3a3a3a;
    border-top-color: #a8a8a8;
    border-radius: 50%;
    animation: diagnostic-spin 0.8s linear infinite;
  }

  .diagnostic-error {
    color: #ff7777;
  }

  .diagnostic-section {
    animation: diagnostic-section-in 0.18s ease both;

    & + .diagnostic-section {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid #303030;
    }

    > h5 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 6px;
      color: #f2f2f2;
      font-size: 13px;
      font-weight: 600;
    }

    > ul {
      margin: 0;
      padding-left: 28px;
      color: #bdbdbd;
      font-size: 12px;
      line-height: 18px;
      word-break: break-all;
    }
  }

  .section-state {
    width: 14px;
    color: #f0b84a;
    font-weight: 700;

    &.ok {
      color: #56e37c;
    }
  }

  > footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 12px 12px;
    border-top: 1px solid #303030;

    > button {
      height: 32px;
      padding: 0 14px;
      border-radius: 6px;
      border: 1px solid #555;
      color: #f3f3f3;
      background: #2b2b2b;
      cursor: pointer;

      &:hover {
        border-color: #777;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &.danger {
        color: #ff8d8d;
        border-color: #7a3d3d;
      }
    }
  }
}

@keyframes diagnostic-section-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes diagnostic-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
