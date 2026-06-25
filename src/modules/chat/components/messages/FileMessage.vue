<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { isFileHelperTargetId, useChatStore } from '@/stores/useChatStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { ensureGroupRelKey, normalizeResolvedFileKey, readMessageAttachmentKey, resolvePrivateAttachmentFileKey } from '@/utils/e2ee'
import { eventBus } from '@/utils/eventBus'
import { mediaViewerState } from '@/utils/mediaViewerState'
import { resolveMediaPreviewFileKind, type MediaPreviewFileKind } from '@/utils/mediaPreview'
import { getOssDownloadCandidates } from '@/utils/ossDownload'
import { normalizeOpenTarget } from '@/utils/resourcePath'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import fileDocIcon from '@/assets/images/message/file-doc.png'
import fileImageIcon from '@/assets/images/message/file-image.png'
import fileVideoIcon from '@/assets/images/message/file-video.png'
import fileMp3Icon from '@/assets/images/message/file-mp3.png'
import filePdfIcon from '@/assets/images/message/file-pdf.png'
import filePptIcon from '@/assets/images/message/file-ppt.png'
import fileXlsIcon from '@/assets/images/message/file-xls.png'
import fileZipIcon from '@/assets/images/message/file-zip.png'
import fileUnknownIcon from '@/assets/images/message/file-unknow.png'

const props = defineProps<{
  message: Message
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const messageStore = useMessageStore()
const isSelf = computed(() => props.message.senderId === authStore.uid)
const isFileHelperChat = computed(
  () => isFileHelperTargetId(chatStore.currentConversation?.targetId),
)
const displayAsSelf = computed(() => isSelf.value || isFileHelperChat.value)
const isOpening = ref(false)
const dangerousDialogVisible = ref(false)
const dangerousFileDialogContent = '请不要直接打开这个文件，确认来源可信后再打开目录修改扩展名打开'
let openToken = 0
let stopDownloadEvents: Array<() => void> = []
const loggedDecryptPendingFileIds = new Set<string>()

const DANGEROUS_EXTENSIONS = new Set([
  'exe',
  'bat',
  'cmd',
  'vbs',
  'js',
  'ps1',
  'scr',
  'pif',
  'msi',
  'com',
  'lnk',
  'wsf',
])

function parseFileMessageContent(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>
  const text = String(raw || '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    // 兼容部分端上报的“二次 JSON 字符串”格式（例如 "\"{...}\""）。
    if (typeof parsed === 'string') {
      try {
        const nested = JSON.parse(parsed)
        if (nested && typeof nested === 'object') return nested as Record<string, unknown>
      } catch {
        // Fall through to non-JSON compatibility parsing below.
      }
    }
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    // Fall through to non-JSON compatibility parsing below.
  }

  // 对齐老 im：兼容历史 `url||name||size||mimeType` 结构。
  if (text.includes('||')) {
    const [url = '', name = '', size = '0', mimeType = ''] = text.split('||')
    const urlName = url.split('?')[0].split('/').pop() || ''
    return {
      url,
      fileUrl: url,
      name: name || urlName || '未知文件',
      size: Number(size || 0) || 0,
      mimeType,
    }
  }

  // 兼容仅上报 URL/路径的文件消息，避免接收侧回退成“未知文件”。
  const normalizedTarget = normalizeOpenTarget(text)
  if (normalizedTarget) {
    const urlName = normalizedTarget.split('?')[0].split(/[\\/]/).pop() || ''
    return {
      url: normalizedTarget,
      fileUrl: normalizedTarget,
      name: urlName || '未知文件',
      size: 0,
    }
  }

  // decryptPending 占位文案至少保留可读提示，避免显示成“未知文件”。
  if (/^\[[^\]]+\]$/.test(text)) {
    return {
      name: text,
      size: 0,
    }
  }

  return {}
}

// 文件消息结构同时兼容新旧字段，避免历史消息因字段名差异导致打开失败。
const fileData = computed(() => {
  const parsed = parseFileMessageContent(props.message.content)
  if (Object.keys(parsed).length > 0) return parsed
  return { name: '未知文件', size: 0 }
})

const fileSize = computed(() => {
  const size = Number(fileData.value.size || fileData.value.fileSize || 0)
  if (Number.isNaN(size)) return String(fileData.value.size || '')
  if (size < 1024) return `${Number(size.toFixed(2))} b`
  const kb = size / 1024
  if (kb > 1024) return `${Number((kb / 1024).toFixed(2))} mb`
  return `${Number(kb.toFixed(2))} kb`
})

const fileIcon = computed(() => {
  const name = String(fileData.value.name || fileData.value.fileName || '')
  const ext = String(fileData.value.ext || name.split('.').pop() || '').toLowerCase()
  if (ext.includes('doc')) return fileDocIcon
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return fileImageIcon
  if (['mp4', 'mov', 'wmv', 'm4v', 'avi', 'flv'].includes(ext)) return fileVideoIcon
  if (ext.includes('mp3')) return fileMp3Icon
  if (ext.includes('pdf')) return filePdfIcon
  if (ext.includes('ppt')) return filePptIcon
  if (ext.includes('xls')) return fileXlsIcon
  if (ext.includes('zip') || ['rar', '7z'].includes(ext)) return fileZipIcon
  return fileUnknownIcon
})

const extraData = computed((): Record<string, any> => {
  const raw = props.message.extra
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, any>
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
})

const fileName = computed(() =>
  String(fileData.value.name || fileData.value.fileName || '文件').trim() || '文件',
)
const fileExt = computed(() => {
  const ext = String(fileData.value.ext || fileName.value.split('.').pop() || '').toLowerCase()
  return ext.replace(/^\./, '')
})
// 与老 im 的文件气泡保持一致：危险扩展名在消息内直接展示“高危文件”标签。
const isDangerousFile = computed(() => {
  const explicitFlag = fileData.value.isDangerous ?? fileData.value.is_dangerous ?? extraData.value.isDangerous ?? extraData.value.is_dangerous
  if (explicitFlag === true || explicitFlag === 'true' || explicitFlag === 1 || explicitFlag === '1') return true
  return DANGEROUS_EXTENSIONS.has(fileExt.value)
})
const browserOpenTarget = computed(() => {
  return pickBrowserOpenTarget()?.target ?? ''
})
const remoteOpenTarget = computed(() => {
  return pickRemoteOpenTarget()?.target ?? ''
})
const fileKey = computed(() =>
  normalizeResolvedFileKey(
    fileData.value.fileKey ||
    fileData.value.file_key ||
    extraData.value.fileKey ||
    extraData.value.file_key ||
    '',
  ).trim(),
)
const attachmentKey = computed(() => readMessageAttachmentKey(extraData.value))
const privateAttachmentCandidates = computed(() => {
  const extra = extraData.value
  const candidates = Array.isArray(extra.cipherCandidates)
    ? extra.cipherCandidates
        .map((candidate: any) => ({
          version: Number(candidate?.version || extra.version || 1),
          source: String(candidate?.source || extra.source || ''),
          attachmentKey: String(candidate?.attachmentKey || candidate?.attachment_key || ''),
        }))
        .filter((candidate: { attachmentKey: string }) => !!candidate.attachmentKey)
    : []
  if (attachmentKey.value && candidates.length === 0) {
    candidates.push({
      version: Number(extra.version || 1),
      source: String(extra.source || ''),
      attachmentKey: attachmentKey.value,
    })
  }
  return candidates
})
const groupId = computed(() => {
  const extraGroupId = String(extraData.value.groupId || '').trim()
  if (extraGroupId) return extraGroupId
  const convId = props.message.conversationId || ''
  return convId.startsWith('1_') ? convId.split('_')[1] || '' : ''
})

watch(
  () => [props.message.id, props.message.customMsgId, props.message.content, props.message.extra],
  () => {
    const content = String(props.message.content || '').trim()
    const isPendingCipherHint = /^\[加密消息，等待密钥同步\]$/.test(content)
    if (!isPendingCipherHint) return
    const messageId = String(props.message.id || props.message.customMsgId || '')
    if (!messageId || loggedDecryptPendingFileIds.has(messageId)) return
    loggedDecryptPendingFileIds.add(messageId)
    // 仅在“文件消息 + 解密占位”场景打一条诊断日志，便于定位是否是 relKey 同步问题。
    console.warn('[DEBUG-doc-file] decrypt-pending file placeholder', {
      messageId,
      conversationId: props.message.conversationId,
      msgType: props.message.msgType,
      decryptPending: (extraData.value as any)?.decryptPending ?? null,
      cipherHexLen: String((extraData.value as any)?.cipherHex || '').length,
      cipherCandidatesLen: Array.isArray((extraData.value as any)?.cipherCandidates)
        ? (extraData.value as any).cipherCandidates.length
        : 0,
      version: (extraData.value as any)?.version ?? null,
      source: (extraData.value as any)?.source ?? null,
      senderId: props.message.senderId,
    })
  },
  { immediate: true },
)

type BrowserOpenCandidate = {
  label: string
  value: unknown
}

function browserOpenCandidates(): BrowserOpenCandidate[] {
  return [...localBrowserOpenCandidates(), ...remoteBrowserOpenCandidates()]
}

function localBrowserOpenCandidates(): BrowserOpenCandidate[] {
  return [
    { label: 'content.local', value: fileData.value.local },
    { label: 'content.localPath', value: fileData.value.localPath },
    { label: 'content.local_path', value: fileData.value.local_path },
    { label: 'content.filePath', value: fileData.value.filePath },
    { label: 'content.file_path', value: fileData.value.file_path },
    { label: 'content.path', value: fileData.value.path },
    { label: 'extra.local', value: extraData.value.local },
    { label: 'extra.localPath', value: extraData.value.localPath },
    { label: 'extra.local_path', value: extraData.value.local_path },
    { label: 'extra.filePath', value: extraData.value.filePath },
    { label: 'extra.file_path', value: extraData.value.file_path },
  ]
}

function remoteBrowserOpenCandidates(): BrowserOpenCandidate[] {
  return [
    { label: 'content.url', value: fileData.value.url },
    { label: 'content.fileUrl', value: fileData.value.fileUrl },
  ]
}

function pickBrowserOpenTarget(): { label: string; target: string } | null {
  for (const candidate of localBrowserOpenCandidates()) {
    const target = normalizeLocalBrowserTarget(candidate.value)
    if (target) return { label: candidate.label, target }
  }
  return null
}

function pickRemoteOpenTarget(): { label: string; target: string } | null {
  for (const candidate of remoteBrowserOpenCandidates()) {
    const target = normalizeBrowserTarget(candidate.value)
    if (/^https?:\/\//i.test(target)) return { label: candidate.label, target }
  }
  return null
}

function normalizeLocalBrowserTarget(value: unknown): string {
  const target = normalizeBrowserTarget(value)
  if (!target) return ''
  if (/^https?:\/\//i.test(target)) return ''
  return target
}

function normalizeBrowserTarget(value: unknown): string {
  return normalizeOpenTarget(value)
}

function safeName(name: string): string {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^\.+$/, '_')
    .trim() || 'file'
}

function fallbackPlainFileKey(key: string): string {
  const raw = key.trim()
  if (!raw) return ''
  if (raw.length <= 32 || !/^[0-9a-f]+$/i.test(raw)) return raw
  return ''
}

async function resolveFileKey(): Promise<string> {
  if (fileKey.value) return fileKey.value
  const plainAttachmentKey = fallbackPlainFileKey(attachmentKey.value)
  if (plainAttachmentKey) return plainAttachmentKey

  const conversationId = String(props.message.conversationId || '')
  if (conversationId.startsWith('0_')) {
    const senderId = String(props.message.senderId || '').trim()
    for (const candidate of privateAttachmentCandidates.value) {
      const resolved = await resolvePrivateAttachmentFileKey({
        uid: authStore.uid,
        senderId,
        version: candidate.version,
        source: candidate.source,
        attachmentKey: candidate.attachmentKey,
      })
      if (resolved) return resolved
    }
  }

  if (!attachmentKey.value || !groupId.value) return ''

  try {
    if (authStore.uid) {
      await ensureGroupRelKey(String(authStore.uid), groupId.value)
    }
    const { invoke } = await import('@tauri-apps/api/core')
    return normalizeResolvedFileKey(await invoke<string>('decrypt_group_incoming', {
      groupId: groupId.value,
      ciphertextHex: attachmentKey.value,
      msgType: 0,
    }))
  } catch {
    return ''
  }
}

async function localFileExists(path: string): Promise<boolean> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<boolean>('file_exists', { path })
  } catch {
    return false
  }
}

function cleanupDownloadEvents() {
  stopDownloadEvents.forEach(stop => stop())
  stopDownloadEvents = []
}

function conversationCacheFolder(): string {
  const convId = String(props.message.conversationId || chatStore.currentConversationId || '')
  const [, typedId = ''] = convId.split('_')
  if (convId.startsWith('1_')) return `group-${safeName(typedId)}`
  if (convId.startsWith('2_')) return `channel-${safeName(typedId)}`

  const peerId = typedId ||
    (props.message.senderId && props.message.senderId !== authStore.uid ? props.message.senderId : '') ||
    chatStore.currentConversation?.targetId ||
    'unknown'
  return `user-${safeName(String(peerId))}`
}

function remoteCacheFileName(url: string): string {
  try {
    const parsed = new URL(url)
    const last = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '')
    return safeName(last || fileName.value)
  } catch {
    const last = String(url || '').split(/[/?#]/).filter(Boolean).pop() || ''
    return safeName(last || fileName.value)
  }
}

async function getDownloadSavePath(url: string): Promise<string> {
  const { appDataDir, join } = await import('@tauri-apps/api/path')
  const baseDir = await appDataDir()
  const uid = safeName(String(authStore.uid || 'unknown'))
  const msgId = safeName(props.message.id || props.message.customMsgId || `${Date.now()}`)
  return join(
    baseDir,
    'Local Storage',
    uid,
    conversationCacheFolder(),
    msgId,
    remoteCacheFileName(url),
  )
}

function waitForDownloadFile(url: string, key: string, savePath: string, msgId: string): Promise<{ filePath: string; isDangerous: boolean }> {
  return new Promise(async (resolve, reject) => {
    let settled = false

    try {
      const [{ invoke }, { listen }] = await Promise.all([
        import('@tauri-apps/api/core'),
        import('@tauri-apps/api/event'),
      ])

      const unlistenDone = await listen<{ filePath?: string; file_path?: string; isDangerous?: boolean; is_dangerous?: boolean }>(`file:done:${msgId}`, (event) => {
        if (settled) return
        settled = true
        cleanupDownloadEvents()
        resolve({
          filePath: event.payload?.filePath || event.payload?.file_path || savePath,
          isDangerous: Boolean(event.payload?.isDangerous ?? event.payload?.is_dangerous),
        })
      })
      const unlistenError = await listen<{ error?: string }>(`file:error:${msgId}`, (event) => {
        if (settled) return
        settled = true
        cleanupDownloadEvents()
        reject(new Error(event.payload?.error || '文件下载失败'))
      })
      stopDownloadEvents = [unlistenDone, unlistenError]

      await invoke('download_file', {
        url,
        fileKey: key,
        savePath,
        msgId,
        logTag: 'file-open',
        emitDataUrl: false,
        // 文件打开走桌面下载命令，候选域名按旧 im 文件资源通道准备。
        urlCandidates: getOssDownloadCandidates({
          url,
          channelType: extraData.value.channelType ?? extraData.value.channel_type,
        }),
        msgType: props.message.msgType,
        sendTime: props.message.sendTime,
      })
    } catch (error) {
      if (!settled) {
        settled = true
        cleanupDownloadEvents()
        reject(error)
      }
    }
  })
}

function cacheLocalPathOnMessage(localPath: string, isDangerous?: boolean) {
  const messageId = props.message.id || props.message.customMsgId || ''
  if (!messageId) return

  // 下载后若后端判定为高危，需要把标记写回消息，保证后续点击持续走高危弹窗分支。
  const nextDangerousFlag = isDangerous
    ? { isDangerous: true, is_dangerous: true }
    : {}
  const nextContent = {
    ...(fileData.value || {}),
    local: localPath,
    localPath,
    ...nextDangerousFlag,
  }
  const nextExtra = {
    ...(extraData.value || {}),
    local: localPath,
    localPath,
    ...nextDangerousFlag,
  }

  messageStore.updateMessage(messageId, {
    content: JSON.stringify(nextContent),
    extra: JSON.stringify(nextExtra),
  })
}

function stringifyForLog(value: unknown): string {
  if (value === undefined) return ''
  if (value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function shortValue(value: unknown, maxLength = 260): string {
  const text = stringifyForLog(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

function describeBrowserTarget(target: string) {
  if (/^https?:\/\//i.test(target)) {
    try {
      const url = new URL(target)
      return {
        kind: 'remote-url',
        protocol: url.protocol,
        host: url.host,
        pathname: url.pathname,
      }
    } catch {
      return { kind: 'remote-url' }
    }
  }
  if (target.startsWith('/') || /^[A-Za-z]:[\\/]/.test(target)) {
    return { kind: 'local-path' }
  }
  return { kind: 'unknown' }
}

function browserOpenCandidateLog(selectedLabel?: string) {
  return browserOpenCandidates()
    .map(candidate => {
      const raw = stringifyForLog(candidate.value).trim()
      if (!raw) return null
      const normalized = normalizeBrowserTarget(candidate.value)
      return {
        label: candidate.label,
        raw: shortValue(raw),
        normalized: shortValue(normalized),
        targetInfo: normalized ? describeBrowserTarget(normalized) : null,
        selected: candidate.label === selectedLabel,
      }
    })
    .filter(Boolean)
}

function logFileOpen(
  level: 'info' | 'warn' | 'error',
  message: string,
  data: Record<string, unknown>,
) {
  const payload = {
    messageId: props.message.id,
    customMsgId: props.message.customMsgId,
    senderId: props.message.senderId,
    fileName: fileName.value,
    fileExt: fileExt.value,
    ...data,
  }
  void message
  void level
  void payload
}

function showDangerousFileDialog() {
  dangerousDialogVisible.value = true
}

async function openFilePreviewWindow(kind: MediaPreviewFileKind, target: string) {
  const { invoke } = await import('@tauri-apps/api/core')
  mediaViewerState.send({
    title: fileName.value,
    mediaType: 'file',
    fileKind: kind,
    src: target,
    filePath: target,
    fileName: fileName.value,
    size: Number(fileData.value.size || fileData.value.fileSize || 0) || 0,
  })
  await invoke('open_media_window', {
    title: fileName.value,
    width: 900,
    height: 600,
  })
}

async function handleOpenInBrowser() {
  if (isOpening.value) return
  if (!(window as any).__TAURI_INTERNALS__) return

  const targetMatch = pickBrowserOpenTarget()
  const remoteMatch = pickRemoteOpenTarget()
  logFileOpen('warn', 'click', {
    localSelected: targetMatch
      ? {
          label: targetMatch.label,
          target: targetMatch.target,
          targetInfo: describeBrowserTarget(targetMatch.target),
        }
      : null,
    remoteSelected: remoteMatch
      ? {
          label: remoteMatch.label,
          target: remoteMatch.target,
          targetInfo: describeBrowserTarget(remoteMatch.target),
        }
      : null,
    candidates: browserOpenCandidateLog(targetMatch?.label),
    contentKeys: Object.keys(fileData.value || {}),
    extraKeys: Object.keys(extraData.value || {}),
    contentHead: shortValue(props.message.content, 360),
    extraHead: shortValue(props.message.extra, 360),
  })

  if (isDangerousFile.value) {
    logFileOpen('warn', 'blocked dangerous extension', {
      extension: fileExt.value,
    })
    // 对齐旧 im：高危文件点击改为明确弹窗提醒，不再只用 toast 一闪而过。
    showDangerousFileDialog()
    return
  }

  let target = targetMatch?.target || browserOpenTarget.value
  const remoteTarget = remoteMatch?.target || remoteOpenTarget.value
  if (!target && !remoteTarget) {
    logFileOpen('warn', 'no open target', {
      candidates: browserOpenCandidateLog(),
    })
    eventBus.emit('show-toast', { message: '文件链接为空', type: 'error' })
    return
  }

  const token = ++openToken
  isOpening.value = true
  cleanupDownloadEvents()

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    if (!target || !(await localFileExists(target))) {
      if (!remoteTarget) {
        logFileOpen('warn', 'local missing and no remote fallback', {
          target,
          source: targetMatch?.label || null,
        })
        eventBus.emit('show-toast', { message: '文件未下载到本地', type: 'error' })
        return
      }

      const savePath = target || await getDownloadSavePath(remoteTarget)
      const key = await resolveFileKey()
      logFileOpen('warn', 'download for browser local open', {
        remoteTarget,
        savePath,
        source: remoteMatch?.label || null,
        hasFileKey: Boolean(key),
        fileKeyLen: key.length,
      })
      const downloadResult = await waitForDownloadFile(
        remoteTarget,
        key,
        savePath,
        `file-open-${safeName(props.message.id || props.message.customMsgId || `${Date.now()}`)}-${Date.now()}`,
      )
      if (token !== openToken) return
      target = downloadResult.filePath
      cacheLocalPathOnMessage(downloadResult.filePath, downloadResult.isDangerous)
      if (downloadResult.isDangerous) {
        showDangerousFileDialog()
        return
      }
    }

    // 对齐老 im 的入口策略：pdf/doc/docx/xls/xlsx 都优先进入统一媒体窗预览，失败再走默认应用。
    const previewKind = resolveMediaPreviewFileKind({
      fileName: fileName.value,
      fileUrl: remoteTarget,
      localPath: target,
    })
    if (previewKind) {
      logFileOpen('warn', 'invoke file media preview', {
        previewKind,
        target,
        targetInfo: describeBrowserTarget(target),
        source: targetMatch?.label || null,
      })
      await openFilePreviewWindow(previewKind, target)
      logFileOpen('info', 'file media preview success', {
        previewKind,
        target,
        targetInfo: describeBrowserTarget(target),
        source: targetMatch?.label || null,
      })
      return
    }

    logFileOpen('warn', 'invoke open_in_browser', {
      target,
      targetInfo: describeBrowserTarget(target),
      source: targetMatch?.label || null,
    })
    await invoke('open_in_browser', { target })
    logFileOpen('info', 'open_in_browser success', {
      target,
      targetInfo: describeBrowserTarget(target),
      source: targetMatch?.label || null,
    })
  } catch (error) {
    logFileOpen('error', 'open_in_browser failed', {
      target,
      targetInfo: describeBrowserTarget(target),
      source: targetMatch?.label || null,
      error: (error as Error)?.message || String(error),
    })
    eventBus.emit('show-toast', {
      message: (error as Error)?.message || '文件打开失败',
      type: 'error',
    })
  } finally {
    if (token === openToken) {
      isOpening.value = false
    }
  }
}

onBeforeUnmount(() => {
  openToken += 1
  cleanupDownloadEvents()
})
</script>

<template>
  <div>
    <div :class="['file-message', { self: displayAsSelf }]" @click="handleOpenInBrowser">
      <div class="file-bubble">
        <img class="file-icon" :src="fileIcon" alt="" />
        <div class="file-main">
          <div class="file-title-row">
            <h2 class="file-name">{{ fileData.name || fileData.fileName || '文件' }}</h2>
            <span v-if="isDangerousFile" class="danger-badge">高危文件</span>
          </div>
          <div class="file-size">{{ isOpening ? '打开中...' : fileSize }}</div>
        </div>
      </div>
    </div>
    <ConfirmDialog
      v-model:visible="dangerousDialogVisible"
      variant="im"
      :title="'高危文件'"
      :content="dangerousFileDialogContent"
      :show-title="true"
      :show-confirm="false"
      :cancel-text="'取消'"
    />
  </div>
</template>

<style lang="scss" scoped>
.file-message {
  .file-bubble {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    background: rgb(243, 243, 243);
    border-radius: 10px;
    border-top-left-radius: 0;
    cursor: pointer;
    min-width: 240px;
    min-height: 61px;
    max-width: 360px;
    word-wrap: break-word;

    &:hover {
      opacity: 0.8;
    }
  }

  &.self .file-bubble {
    background: #98daff;
    border-top-left-radius: 10px;
    border-top-right-radius: 0;

    &:hover {
      background: #98daff;
      opacity: 0.8;
    }
  }

  .file-icon {
    display: block;
    width: 45px;
    height: 45px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .file-main {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    flex: 1;
    align-items: flex-start;

    .file-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-width: 0;
    }

    .file-name {
      flex: 1;
      min-width: 0;
      max-width: 135px;
      margin: 0;
      padding: 0;
      line-height: 22px;
      font-size: 14px;
      font-weight: 400;
      color: #333;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      word-break: break-all;
    }

    .file-size {
      font-size: 12px;
      color: #666;
      line-height: 18px;
    }

    .danger-badge {
      flex: none;
      background: #ff4444;
      color: #fff;
      padding: 2px 4px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
      line-height: 16px;
      white-space: nowrap;
    }
  }
}
</style>
