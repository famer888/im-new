<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { ensureGroupRelKey } from '@/utils/e2ee'
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
const isPlaying = ref(false)
const currentSecond = ref(0)
let downloadToken = 0
let contentDecryptToken = 0
let playTimer: number | null = null
let stopDownloadEvents: Array<() => void> = []

function audioTerminalLog(
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
) {
  if (!isGroupAudio.value) return
  const log = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  log(`[group-audio] ${message}`, data || {})
  if (!(window as any).__TAURI_INTERNALS__) return
  import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('image_send_log', {
      payload: {
        level,
        message: `[group-audio] ${message}`,
        data: data || {},
      },
    }))
    .catch(() => {})
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
const totalSecond = computed(() => Math.max(1, duration.value || 1))
const progressPercent = computed(() => Math.min(100, Math.max(0, (currentSecond.value / totalSecond.value) * 100)))
const currentTimeText = computed(() => formatTime(currentSecond.value))
const durationText = computed(() => formatTime(duration.value))

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

function clearPlayTimer() {
  if (playTimer !== null) {
    window.clearInterval(playTimer)
    playTimer = null
  }
}

function formatTime(seconds: number): string {
  const value = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(value / 60)
  const rest = value % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
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

async function stopPlayback() {
  clearPlayTimer()
  isPlaying.value = false
  currentSecond.value = 0
  if (!(window as any).__TAURI_INTERNALS__) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('stop_audio_file', { msgId: props.message.id || props.message.customMsgId || null })
  } catch (error) {
    audioTerminalLog('stop audio failed', {
      messageId: props.message.id,
      message: (error as Error)?.message || String(error),
    }, 'warn')
  }
}

async function togglePlayback() {
  if (loading.value) return
  if (isPlaying.value) {
    await stopPlayback()
    return
  }
  if (!localFilePath.value) {
    loadError.value = true
    audioTerminalLog('play skipped: missing local file path', {
      messageId: props.message.id,
      activeSrc: activeSrc.value,
    }, 'error')
    return
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('play_audio_file', {
      msgId: props.message.id || props.message.customMsgId || `${Date.now()}`,
      filePath: localFilePath.value,
    })
    isPlaying.value = true
    currentSecond.value = 0
    audioTerminalLog('play audio requested', {
      messageId: props.message.id,
      localFilePath: localFilePath.value,
      duration: duration.value,
    })
    clearPlayTimer()
    const startedAt = Date.now()
    playTimer = window.setInterval(() => {
      currentSecond.value = Math.min(totalSecond.value, Math.floor((Date.now() - startedAt) / 1000))
      if (currentSecond.value >= totalSecond.value) {
        isPlaying.value = false
        clearPlayTimer()
      }
    }, 250)
  } catch (error) {
    loadError.value = true
    isPlaying.value = false
    audioTerminalLog('play audio failed', {
      messageId: props.message.id,
      localFilePath: localFilePath.value,
      message: (error as Error)?.message || String(error),
    }, 'error')
  }
}

onBeforeUnmount(() => {
  downloadToken += 1
  void stopPlayback()
  cleanupDownloadEvents()
})
</script>

<template>
  <div class="audio-player" :class="{ playing: isPlaying, error: loadError }">
    <div class="player-container">
      <!-- Play Button with Ripple -->
      <button
        class="play-button"
        type="button"
        :disabled="loading || loadError"
        @click="togglePlayback"
        aria-label="Toggle audio playback"
      >
        <div class="ripple-container">
          <span v-if="isPlaying" class="ripple"></span>
          <svg v-if="!isPlaying" viewBox="0 0 24 24" fill="white" class="play-icon">
            <path d="M8 5v14l11-7z" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="white" class="pause-icon">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        </div>
      </button>

      <!-- Progress Bar -->
      <div class="progress-bar-wrapper">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progressPercent}%` }"></div>
        </div>
      </div>

      <!-- Time Display -->
      <span class="time-display">
        <span class="current-time">{{ currentTimeText }}</span>
        <span class="divider">/</span>
        <span class="total-time">{{ durationText }}</span>
      </span>
    </div>

    <!-- Loading & Error States -->
    <div v-if="loading" class="loading-overlay">
      <ComLoading />
    </div>
    <div v-if="loadError" class="error-message">语音加载失败</div>
  </div>
</template>

<style scoped lang="scss">
.audio-player {
  width: 100%;
  max-width: 360px;

  &.error .player-container {
    opacity: 0.6;
  }
}

.player-container {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(170, 222, 254);
  border-radius: 16px 0 16px 16px;
  position: relative;
  overflow: hidden;
  transition: all 0.2s ease;
}

.play-button {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }

  &:not(:disabled):active .ripple-container {
    transform: scale(0.95);
  }
}

.ripple-container {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1e88e5 0%, #1565c0 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 2px 6px rgba(30, 136, 229, 0.25);
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;

  svg {
    width: 10px;
    height: 10px;
    position: relative;
    z-index: 2;
  }

  &:hover {
    transform: scale(1.15);
    box-shadow: 0 3px 10px rgba(30, 136, 229, 0.35);
  }
}

.ripple {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  animation: ripple-animation 1.2s infinite;

  @keyframes ripple-animation {
    0% {
      transform: scale(0.8);
      opacity: 1;
    }
    100% {
      transform: scale(2.2);
      opacity: 0;
    }
  }
}

.progress-bar-wrapper {
  flex: 1;
  height: 24px;
  display: flex;
  align-items: center;
  min-width: 0;
}

.progress-bar {
  width: 100%;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.3);
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.5);
  }
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #42a5f5, #1e88e5);
  transition: width 0.1s linear;
  border-radius: 6px;
}

.time-display {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #0d47a1;
  white-space: nowrap;

  .current-time {
    font-weight: 600;
  }

  .divider {
    color: rgba(13, 71, 161, 0.3);
    margin: 0 2px;
  }

  .total-time {
    color: rgba(13, 71, 161, 0.6);
  }
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  z-index: 10;

  :deep(.comLoading),
  :deep(.com-loading) {
    width: 20px;
    height: 20px;
  }
}

.error-message {
  color: #d32f2f;
  font-size: 12px;
  text-align: center;
  padding-top: 6px;
  animation: shake 0.3s ease;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}
</style>
