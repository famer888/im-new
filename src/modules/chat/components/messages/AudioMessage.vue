<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { ensureGroupRelKey } from '@/utils/e2ee'
import { getOssDownloadCandidates } from '@/utils/ossDownload'
import ComLoading from '@/components/ComLoading.vue'

const props = defineProps<{
  message: Message
}>()

const authStore = useAuthStore()
const activeSrc = ref('')
const localFilePath = ref('')
const decryptedContent = ref('')
const loading = ref(false)
const loadError = ref(false)
let downloadToken = 0
let contentDecryptToken = 0
let stopDownloadEvents: Array<() => void> = []

function audioTerminalLog(
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
) {
  void message
  void data
  void level
}

function safeHead(value: string, length = 10): string {
  return value ? value.slice(0, length) : ''
}

function describeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.slice(0, 48)}`
  } catch {
    return url.slice(0, 80)
  }
}

const audioData = computed(() => {
  const raw = (decryptedContent.value || props.message.content || '').trim()
  if (!raw) return { url: '', duration: 0, size: 0, name: '' }
  try {
    const parsed = JSON.parse(raw)
    return {
      url: String(parsed.url || parsed.fileUrl || parsed.path || ''),
      duration: Number(parsed.duration || 0),
      size: Number(parsed.size || parsed.fileSize || 0),
      name: String(parsed.name || ''),
    }
  } catch {
    const [url = '', duration = '0'] = raw.split('||')
    return {
      url,
      duration: Number(duration || 0),
      size: 0,
      name: '',
    }
  }
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
const fileKey = computed(() =>
  String(extraData.value.fileKey || extraData.value.file_key || (audioData.value as any).fileKey || '').trim(),
)
const attachmentKey = computed(() =>
  String(extraData.value.attachmentKey || extraData.value.attachment_key || '').trim(),
)
const cipherHex = computed(() =>
  String(extraData.value.cipherHex || extraData.value.cipher_hex || '').trim(),
)
const groupId = computed(() => {
  const extraGroupId = String(extraData.value.groupId || '').trim()
  if (extraGroupId) return extraGroupId
  const convId = props.message.conversationId || ''
  return convId.startsWith('1_') ? convId.split('_')[1] || '' : ''
})
const isGroupAudio = computed(() => Boolean(groupId.value || props.message.conversationId?.startsWith('1_')))
const audioUrl = computed(() => {
  const url = audioData.value.url
  if (!url || url.startsWith('[加密消息')) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (!/^(https?:|file:|asset:|data:|blob:)/i.test(url)) return ''
  return url
})
const cacheKey = computed(() => [
  props.message.id || '',
  props.message.customMsgId || '',
  audioUrl.value || '',
  fileKey.value || '',
  attachmentKey.value || '',
  cipherHex.value || '',
].join('|'))
const duration = computed(() => Math.max(0, Math.round(Number(audioData.value.duration || 0))))

watch([audioUrl, fileKey, attachmentKey, cacheKey], () => {
  activeSrc.value = ''
  localFilePath.value = ''
  loadError.value = false
  audioTerminalLog('watch source changed', {
    messageId: props.message.id,
    customMsgId: props.message.customMsgId,
    conversationId: props.message.conversationId,
    status: props.message.status,
    url: describeUrl(audioUrl.value),
    duration: audioData.value.duration,
    size: audioData.value.size,
    contentHead: safeHead(props.message.content || '', 160),
    extraHead: safeHead(typeof props.message.extra === 'string' ? props.message.extra : JSON.stringify(props.message.extra || ''), 220),
    hasFileKey: Boolean(fileKey.value),
    fileKeyHead: safeHead(fileKey.value),
    fileKeyLen: fileKey.value.length,
    hasAttachmentKey: Boolean(attachmentKey.value),
    attachmentKeyHead: safeHead(attachmentKey.value),
    hasCipherHex: Boolean(cipherHex.value),
    cipherHexLen: cipherHex.value.length,
  })
  if (!audioUrl.value) {
    if (cipherHex.value && groupId.value) {
      void decryptGroupAudioContent()
      return
    }
    loadError.value = true
    audioTerminalLog('missing audio url', {
      messageId: props.message.id,
      content: props.message.content || '',
    }, 'error')
    return
  }
  if ((fileKey.value || attachmentKey.value) && /^https?:\/\//i.test(audioUrl.value)) {
    void downloadAndDecryptAudio()
    return
  }
  activeSrc.value = audioUrl.value
  audioTerminalLog('use direct audio src', {
    messageId: props.message.id,
    src: describeUrl(activeSrc.value),
    reason: /^https?:\/\//i.test(audioUrl.value) ? 'remote-without-key' : 'local-or-data-url',
  }, /^https?:\/\//i.test(audioUrl.value) ? 'warn' : 'info')
}, { immediate: true })

function cleanupDownloadEvents() {
  stopDownloadEvents.forEach(stop => stop())
  stopDownloadEvents = []
}

function safeName(name: string): string {
  return name.replace(/[^\w.-]/g, '_') || 'audio'
}

function audioExt(url: string): string {
  const matched = url.split('?')[0].match(/\.(mp3|wav|webm|m4a|aac|ogg|amr)$/i)
  return matched?.[0]?.toLowerCase() || '.webm'
}

function fallbackPlainFileKey(key: string): string {
  const raw = key.trim()
  if (!raw) return ''
  if (raw.length <= 32 || !/^[0-9a-f]+$/i.test(raw)) return raw
  return ''
}

async function decryptGroupAudioContent() {
  const ciphertextHex = cipherHex.value
  const gid = groupId.value
  if (!ciphertextHex || !gid) return

  const token = ++contentDecryptToken
  loading.value = true
  loadError.value = false
  audioTerminalLog('decrypt group content start', {
    messageId: props.message.id,
    groupId: gid,
    cipherHexLen: ciphertextHex.length,
    hasAuthUid: Boolean(authStore.uid),
  })
  try {
    if (authStore.uid) {
      await ensureGroupRelKey(String(authStore.uid), gid)
    }
    const { invoke } = await import('@tauri-apps/api/core')
    const plain = await invoke<string>('decrypt_group_incoming', {
      groupId: gid,
      ciphertextHex,
      msgType: 2,
    })
    if (token !== contentDecryptToken) return
    decryptedContent.value = plain
    loadError.value = false
    audioTerminalLog('decrypt group content ok', {
      messageId: props.message.id,
      groupId: gid,
      contentHead: safeHead(plain, 160),
      hasUrl: Boolean(audioUrl.value),
      duration: audioData.value.duration,
      size: audioData.value.size,
    })
  } catch (error) {
    if (token !== contentDecryptToken) return
    loadError.value = true
    audioTerminalLog('decrypt group audio content failed', {
      messageId: props.message.id,
      groupId: gid,
      cipherHexLen: ciphertextHex.length,
      message: (error as Error)?.message || String(error),
    }, 'error')
  } finally {
    if (token === contentDecryptToken && !audioUrl.value) {
      loading.value = false
    }
  }
}

async function resolveFileKey(): Promise<string> {
  if (fileKey.value) {
    audioTerminalLog('resolved fileKey from message', {
      messageId: props.message.id,
      fileKeyHead: safeHead(fileKey.value),
      fileKeyLen: fileKey.value.length,
    })
    return fileKey.value
  }
  const plainAttachmentKey = fallbackPlainFileKey(attachmentKey.value)
  if (plainAttachmentKey) {
    audioTerminalLog('resolved fileKey from plain attachmentKey', {
      messageId: props.message.id,
      fileKeyHead: safeHead(plainAttachmentKey),
      fileKeyLen: plainAttachmentKey.length,
    })
    return plainAttachmentKey
  }
  if (!attachmentKey.value || !groupId.value) {
    audioTerminalLog('cannot resolve fileKey: missing attachmentKey/groupId', {
      messageId: props.message.id,
      hasAttachmentKey: Boolean(attachmentKey.value),
      groupId: groupId.value,
      conversationId: props.message.conversationId,
    }, 'warn')
    return ''
  }
  try {
    if (authStore.uid) {
      await ensureGroupRelKey(String(authStore.uid), groupId.value)
    }
    const { invoke } = await import('@tauri-apps/api/core')
    const resolved = await invoke<string>('decrypt_group_incoming', {
      groupId: groupId.value,
      ciphertextHex: attachmentKey.value,
      msgType: 0,
    })
    audioTerminalLog('resolved fileKey from group attachmentKey', {
      messageId: props.message.id,
      groupId: groupId.value,
      fileKeyHead: safeHead(resolved),
      fileKeyLen: resolved.length,
    })
    return resolved
  } catch {
    audioTerminalLog('resolve fileKey from attachmentKey failed', {
      messageId: props.message.id,
      groupId: groupId.value,
      attachmentKeyHead: safeHead(attachmentKey.value),
    }, 'error')
    return ''
  }
}

async function downloadAndDecryptAudio() {
  const url = audioUrl.value
  const key = await resolveFileKey()
  if (!url || !key) {
    loadError.value = true
    audioTerminalLog('download skipped: missing url or key', {
      messageId: props.message.id,
      hasUrl: Boolean(url),
      hasKey: Boolean(key),
      url: describeUrl(url),
    }, 'error')
    return
  }

  const token = ++downloadToken
  cleanupDownloadEvents()
  loading.value = true
  audioTerminalLog('download start', {
    messageId: props.message.id,
    groupId: groupId.value,
    url: describeUrl(url),
    fileKeyHead: safeHead(key),
    fileKeyLen: key.length,
  })

  try {
    const [{ invoke, convertFileSrc }, { appDataDir, join }, { listen }] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/path'),
      import('@tauri-apps/api/event'),
    ])
    const baseDir = await appDataDir()
    const id = safeName(props.message.id || props.message.customMsgId || `${Date.now()}`)
    const savePath = await join(baseDir, 'audio-cache', `${id}${audioExt(url)}`)
    localFilePath.value = savePath
    const doneEvent = `file:done:${id}`
    const errorEvent = `file:error:${id}`
    audioTerminalLog('download invoke prepared', {
      messageId: props.message.id,
      id,
      url: describeUrl(url),
      savePath,
      fileKeyHead: safeHead(key),
      fileKeyLen: key.length,
      doneEvent,
      errorEvent,
    })

    const unlistenDone = await listen<{ totalBytes?: number; total_bytes?: number; status?: string }>(doneEvent, (event) => {
      if (token !== downloadToken) return
      cleanupDownloadEvents()
      loading.value = false
      loadError.value = false
      activeSrc.value = convertFileSrc(savePath)
      audioTerminalLog('download done event', {
        messageId: props.message.id,
        id,
        savePath,
        totalBytes: event.payload.totalBytes ?? event.payload.total_bytes ?? 0,
        status: event.payload.status || '',
        activeSrc: activeSrc.value,
        srcMode: 'convertFileSrc',
      })
    })
    const unlistenError = await listen<{ error?: string }>(errorEvent, (event) => {
      if (token !== downloadToken) return
      cleanupDownloadEvents()
      loading.value = false
      loadError.value = true
      audioTerminalLog('download error event', {
        messageId: props.message.id,
        id,
        error: event.payload.error || '',
      }, 'error')
    })
    stopDownloadEvents = [unlistenDone, unlistenError]

    await invoke('download_file', {
      url,
      fileKey: key,
      savePath,
      msgId: id,
      logTag: isGroupAudio.value ? 'group-audio' : undefined,
      // 音频和图片共用旧 im 的 OSS 下载兜底：先准备候选域名，4xx/过期由后端停止重试。
      urlCandidates: getOssDownloadCandidates({
        url,
        channelType: extraData.value.channelType ?? extraData.value.channel_type,
      }),
      msgType: props.message.msgType,
      sendTime: props.message.sendTime,
    })
    audioTerminalLog('download invoke returned', {
      messageId: props.message.id,
      id,
    })
  } catch (error) {
    if (token !== downloadToken) return
    cleanupDownloadEvents()
    loading.value = false
    loadError.value = true
    audioTerminalLog('download invoke failed', {
      messageId: props.message.id,
      message: (error as Error)?.message || String(error),
    }, 'error')
  }
}

onBeforeUnmount(() => {
  downloadToken += 1
  cleanupDownloadEvents()
})
</script>

<template>
  <div class="com-msg-audio" :class="{ error: loadError }" :data-duration="duration">
    <div class="content">
      <!-- 对齐旧 im：语音消息使用系统原生 audio 控件；新项目只负责把解密/下载后的地址塞给控件。 -->
      <audio
        :src="activeSrc || undefined"
        controls
        preload="metadata"
        @error="loadError = Boolean(activeSrc)"
      ></audio>
      <div v-if="loading" class="loading-overlay">
        <div><ComLoading /></div>
      </div>
    </div>
    <div v-if="loadError" class="error-message">语音加载失败</div>
  </div>
</template>

<style scoped lang="scss">
.com-msg-audio {
  padding: 5px 0 25px;
  position: relative;

  &.error .content {
    opacity: 0.5;
  }
}

.content {
  height: 54px;
  position: relative;

  audio {
    width: 300px;
    max-width: calc(100vw - 120px);
    height: 54px;
    display: block;
  }
}

.loading-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(255, 255, 255, 0.4);
  z-index: 1;

  > div {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);

    :deep(.comLoading),
    :deep(.com-loading) {
      width: 20px;
      height: 20px;
    }
  }
}

.error-message {
  color: #d32f2f;
  font-size: 12px;
  text-align: left;
  padding-top: 6px;
}

:global(.message-item.is-self) .error-message {
  text-align: right;
}
</style>
