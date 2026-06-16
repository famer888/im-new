<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useMessageStore } from '@/stores/useMessageStore'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Toast from '@/components/Toast.vue'
import { clearE2eeKeyCaches, ensureOwnKeyPair } from '@/utils/e2ee'
import {
  formatDiagnosticsPlainText,
  runNetworkDiagnostics,
  type DiagnosticItem,
  type NetworkRecoveryResult,
} from '@/utils/networkDiagnostics'
import { initDomainPoolFromApi, initDomainPoolFromOss } from '@/utils/domainPool'

const { t: $t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()
const messageStore = useMessageStore()
let lastNetworkRecoveryResult: NetworkRecoveryResult | null = null
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const repairingDecrypt = ref(false)
const resettingCache = ref(false)
const diagnosingNetwork = ref(false)
const repairingNetwork = ref(false)
const diagnosticDialogVisible = ref(false)
const diagnosticDialogTitle = ref('')
const diagnosticItems = ref<DiagnosticItem[]>([])
const diagnosticError = ref('')
const diagnosticContentRef = ref<HTMLElement | null>(null)
const diagnosticCopyHint = ref('')
let diagnosticRunToken = 0
let diagnosticCopyHintTimer: ReturnType<typeof setTimeout> | null = null

const diagnosticReport = computed(() => formatDiagnosticsPlainText(diagnosticItems.value))
const hasDiagnosticReport = computed(() => diagnosticItems.value.length > 0)

function statusGlyph(status: DiagnosticItem['status']): string {
  if (status === 'ok') return '✓'
  if (status === 'fail') return '✕'
  if (status === 'running') return '…'
  return '·'
}

async function scrollDiagnosticToBottom() {
  await nextTick()
  const el = diagnosticContentRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

watch(
  diagnosticItems,
  () => {
    void scrollDiagnosticToBottom()
  },
  { deep: true },
)

function clearDiagnosticCopyHint() {
  diagnosticCopyHint.value = ''
  if (diagnosticCopyHintTimer) {
    clearTimeout(diagnosticCopyHintTimer)
    diagnosticCopyHintTimer = null
  }
}

function setDiagnosticCopyHint(message: string) {
  diagnosticCopyHint.value = message
  if (diagnosticCopyHintTimer) clearTimeout(diagnosticCopyHintTimer)
  diagnosticCopyHintTimer = window.setTimeout(() => {
    diagnosticCopyHint.value = ''
    diagnosticCopyHintTimer = null
  }, 2200)
}

function closeDiagnosticDialog() {
  diagnosticDialogVisible.value = false
  clearDiagnosticCopyHint()
}

onUnmounted(() => {
  clearDiagnosticCopyHint()
})

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
const restartConfirmVisible = ref(false)

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const text = String(error || '').trim()
  return text && text !== '[object Object]' ? text : $t('操作失败')
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
    clearE2eeKeyCaches(uid)
    await tauriInvoke('repair_clear_crypto_keys')
    // Rust 修复命令会清掉内存私钥；这里只恢复当前账号私钥，不预热好友/群密钥。
    await ensureOwnKeyPair(uid)

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

function openNetworkDiagnostics() {
  void handleNetworkDiagnostics()
}

function beginDiagnosticUi() {
  diagnosticDialogVisible.value = true
  diagnosticDialogTitle.value = $t('网络诊断')
  diagnosticItems.value = []
  diagnosticError.value = ''
  clearDiagnosticCopyHint()
  diagnosingNetwork.value = true
}

async function runDiagnosticSession(
  runToken: number,
  recoveryLastResult: NetworkRecoveryResult | null = null,
) {
  try {
    await runNetworkDiagnostics((items) => {
      if (runToken !== diagnosticRunToken || !diagnosticDialogVisible.value) return
      diagnosticItems.value = items
    }, { recoveryLastResult })
  } catch (error) {
    diagnosticError.value = formatErrorMessage(error)
  } finally {
    if (runToken === diagnosticRunToken) {
      diagnosingNetwork.value = false
    }
  }
}

async function handleNetworkDiagnostics(options?: { recoveryLastResult?: NetworkRecoveryResult | null }) {
  if (diagnosingNetwork.value || repairingNetwork.value) return
  const runToken = ++diagnosticRunToken
  beginDiagnosticUi()
  await runDiagnosticSession(runToken, options?.recoveryLastResult ?? null)
}

async function copyDiagnosticReport() {
  if (!hasDiagnosticReport.value) return
  try {
    await copyTextToClipboard(diagnosticReport.value)
    setDiagnosticCopyHint($t('复制成功'))
  } catch {
    setDiagnosticCopyHint($t('复制失败'))
  }
}

async function repairNetworkAndRefresh() {
  if (repairingNetwork.value || diagnosingNetwork.value) return
  const runToken = ++diagnosticRunToken
  repairingNetwork.value = true
  // 对齐老 im：先立刻清空列表并显示「检测中」，再后台执行修复，避免长时间无反馈。
  beginDiagnosticUi()

  const steps: NetworkRecoveryResult['steps'] = []
  let rebuilt = false
  let ok = true
  let message = ''

  try {
    const [ossRes, apiRes] = await Promise.allSettled([
      initDomainPoolFromOss(),
      initDomainPoolFromApi(),
    ])
    const ossOk = ossRes.status === 'fulfilled'
    const apiOk = apiRes.status === 'fulfilled'
    steps.push({
      name: '刷新 OSS 引导域名',
      ok: ossOk,
      message: ossOk ? 'ok' : String(ossRes.reason || 'failed'),
    })
    steps.push({
      name: '刷新 listDomain 域名池',
      ok: apiOk,
      message: apiOk ? 'ok' : String(apiRes.reason || 'failed'),
    })
    if (!ossOk && !apiOk) {
      ok = false
      message = '域名刷新失败'
    }

    if (isTauri()) {
      try {
        await tauriInvoke('disconnect_ws')
        await sleep(600)
        await messageStore.ensureWsConnected()
        rebuilt = true
        steps.push({ name: '重建 WebSocket', ok: true, message: 'ok' })
      } catch (error) {
        rebuilt = false
        ok = false
        const errText = formatErrorMessage(error)
        message = message || errText
        steps.push({ name: '重建 WebSocket', ok: false, message: errText })
      }
    } else {
      steps.push({ name: '重建 WebSocket', ok: false, skipped: true, message: '仅桌面端' })
    }
  } catch (error) {
    ok = false
    message = formatErrorMessage(error)
  }

  lastNetworkRecoveryResult = {
    ok,
    message,
    steps,
    rebuilt,
    time: Date.now(),
  }

  repairingNetwork.value = false
  if (runToken !== diagnosticRunToken || !diagnosticDialogVisible.value) return
  await runDiagnosticSession(runToken, lastNetworkRecoveryResult)
}

function openRestartConfirm() {
  restartConfirmVisible.value = true
}

async function confirmRestartApp() {
  restartConfirmVisible.value = false
  if (isTauri()) {
    try {
      await tauriInvoke('restart_app_for_network')
      return
    } catch {
      // fallback：无法 relaunch 时至少刷新 WebView
    }
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
        <button type="button" :disabled="repairingDecrypt" @click="handleDecryptRepair">
          {{ $t('修复') }}
        </button>
      </dd>
    </dl>
    <dl>
      <dt>{{ $t('重置缓存数据') }}</dt>
      <dd>
        <button type="button" :disabled="resettingCache" @click="openResetConfirm">
          {{ $t('重置') }}
        </button>
      </dd>
    </dl>
    <dl>
      <dt />
      <dd>
        <button type="button" :disabled="diagnosingNetwork" @click="openNetworkDiagnostics">
          {{ diagnosingNetwork ? $t('诊断中') : $t('网络诊断') }}
        </button>
      </dd>
    </dl>

    <Teleport to="body">
      <div v-if="diagnosticDialogVisible" class="diagnostic-overlay" @click.self="closeDiagnosticDialog">
        <section class="diagnostic-dialog" role="dialog" aria-modal="true">
          <header>
            <h4>{{ diagnosticDialogTitle }}</h4>
            <button type="button" class="diagnostic-close" @click="closeDiagnosticDialog">×</button>
          </header>

          <div ref="diagnosticContentRef" class="diagnostic-content">
            <p v-if="diagnosticError" class="diagnostic-error">{{ diagnosticError }}</p>
            <p v-if="diagnosingNetwork && !diagnosticError" class="diagnostic-loading">
              <span class="diagnostic-spinner" />
              <span>{{ $t('检测中') }}…</span>
            </p>
            <ul v-if="diagnosticItems.length" class="diagnostic-list">
              <li
                v-for="row in diagnosticItems"
                :key="row.id"
                class="diagnostic-item"
              >
                <span
                  class="diagnostic-icon"
                  :class="{
                    ok: row.status === 'ok',
                    fail: row.status === 'fail',
                    pending: row.status === 'pending' || row.status === 'running',
                  }"
                >{{ statusGlyph(row.status) }}</span>
                <div class="diagnostic-main">
                  <div class="diagnostic-row-title">{{ row.title }}</div>
                  <ul v-if="row.children.length" class="diagnostic-sub">
                    <li v-for="(line, idx) in row.children" :key="`${row.id}-${idx}`">{{ line }}</li>
                  </ul>
                </div>
              </li>
            </ul>
          </div>

          <footer>
            <button type="button" :disabled="!hasDiagnosticReport || diagnosingNetwork" @click="copyDiagnosticReport">
              {{ diagnosticCopyHint || $t('复制诊断报告') }}
            </button>
            <button type="button" :disabled="repairingNetwork || diagnosingNetwork" @click="repairNetworkAndRefresh">
              {{ repairingNetwork ? `${$t('网络修复中')}...` : $t('尝试网络修复') }}
            </button>
            <button type="button" class="danger" :disabled="repairingNetwork || diagnosingNetwork" @click="openRestartConfirm">
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

    <ConfirmDialog
      v-model:visible="restartConfirmVisible"
      variant="im"
      show-icon
      content="重启应用会关闭当前窗口并重新打开，是否继续？"
      @confirm="confirmRestartApp"
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
    margin: 0 0 10px;
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

  .diagnostic-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .diagnostic-item {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    animation: diagnostic-section-in 0.18s ease both;

    &:last-child {
      border-bottom: none;
    }
  }

  .diagnostic-icon {
    flex-shrink: 0;
    width: 18px;
    text-align: center;
    font-size: 13px;
    line-height: 1.4;
    color: #888;

    &.ok {
      color: #5cdb7a;
    }

    &.fail {
      color: #ff6b6b;
    }

    &.pending {
      color: #888;
    }
  }

  .diagnostic-main {
    min-width: 0;
    flex: 1;
  }

  .diagnostic-row-title {
    font-size: 13px;
    font-weight: 500;
    color: #fff;
  }

  .diagnostic-sub {
    margin: 4px 0 0;
    padding: 0 0 0 12px;
    list-style: disc;
    font-size: 11px;
    line-height: 1.45;
    color: #9a9a9a;
    word-break: break-all;
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
