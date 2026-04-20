<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { ensureGroupRelKey } from '@/utils/e2ee'

const props = defineProps<{
  message: Message
}>()

const authStore = useAuthStore()
const isLoaded = ref(false)
const loadError = ref(false)
const activeSrc = ref('')
const showPreview = ref(false)
let downloadToken = 0
let stopDownloadEvents: Array<() => void> = []

const imageData = computed((): {
  url: string
  thumbnailUrl: string
  width: number
  height: number
  size: number
} => {
  const raw = (props.message.content ?? '').trim()
  if (!raw) return { url: '', thumbnailUrl: '', width: 0, height: 0, size: 0 }

  try {
    const parsed = JSON.parse(raw)
    const url = parsed.url || parsed.fileUrl || parsed.path || ''
    const thumbnailUrl = parsed.thumbnailUrl || parsed.thumbUrl || url
    return {
      url,
      thumbnailUrl,
      width: Number(parsed.width || 0),
      height: Number(parsed.height || 0),
      size: Number(parsed.size || parsed.fileSize || 0),
    }
  } catch {
    const [url = '', thumbUrl = '', size = '0'] = raw.split('||')
    return {
      url,
      thumbnailUrl: thumbUrl || url,
      width: 0,
      height: 0,
      size: Number(size || 0),
    }
  }
})

const thumbnailUrl = computed(() => imageData.value.thumbnailUrl || imageData.value.url || '')
const isVideo = computed(() => props.message.msgType === 3)
const previewSrc = computed(() => activeSrc.value || imageData.value.url)
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
const fileKey = computed(() => String(extraData.value.fileKey || extraData.value.file_key || '').trim())
const attachmentKey = computed(() =>
  String(extraData.value.attachmentKey || extraData.value.attachment_key || '').trim(),
)
const groupId = computed(() => {
  const extraGroupId = String(extraData.value.groupId || '').trim()
  if (extraGroupId) return extraGroupId
  const convId = props.message.conversationId || ''
  return convId.startsWith('1_') ? convId.split('_')[1] || '' : ''
})

watch([thumbnailUrl, fileKey, attachmentKey], () => {
  isLoaded.value = false
  loadError.value = false
  activeSrc.value = ''
  if ((fileKey.value || attachmentKey.value) && /^https?:\/\//i.test(imageData.value.url)) {
    downloadAndDecryptImage()
    return
  }
  activeSrc.value = thumbnailUrl.value
}, { immediate: true })

function handleError() {
  const originalUrl = imageData.value.url
  if (!fileKey.value && !attachmentKey.value && originalUrl && activeSrc.value !== originalUrl) {
    activeSrc.value = originalUrl
    isLoaded.value = false
    return
  }
  loadError.value = true
  isLoaded.value = true
}

function openPreview() {
  if (!previewSrc.value || loadError.value) return
  showPreview.value = true
}

function cleanupDownloadEvents() {
  stopDownloadEvents.forEach(stop => stop())
  stopDownloadEvents = []
}

function imageExt(url: string): string {
  const matched = url.split('?')[0].match(/\.(png|jpe?g|gif|webp|bmp)$/i)
  return matched ? matched[0] : '.img'
}

function safeName(name: string): string {
  return name.replace(/[^\w.-]/g, '_') || 'image'
}

async function resolveFileKey(): Promise<string> {
  if (fileKey.value) return fileKey.value
  if (!attachmentKey.value || !groupId.value) return ''

  try {
    if (authStore.uid) {
      await ensureGroupRelKey(String(authStore.uid), groupId.value)
    }
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('decrypt_group_incoming', {
      groupId: groupId.value,
      ciphertextHex: attachmentKey.value,
      msgType: 0,
    })
  } catch {
    return ''
  }
}

async function downloadAndDecryptImage() {
  const url = imageData.value.url
  const key = await resolveFileKey()
  if (!url || !key) {
    loadError.value = true
    isLoaded.value = true
    return
  }

  const token = ++downloadToken
  cleanupDownloadEvents()

  try {
    const [{ invoke }, { appDataDir, join }, { listen }] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/path'),
      import('@tauri-apps/api/event'),
    ])
    const baseDir = await appDataDir()
    const id = safeName(props.message.id || props.message.customMsgId || `${Date.now()}`)
    const savePath = await join(baseDir, 'image-cache', `${id}${imageExt(url)}`)
    const doneEvent = `file:done:${id}`
    const errorEvent = `file:error:${id}`

    const unlistenDone = await listen<{ dataUrl?: string; data_url?: string }>(doneEvent, (event) => {
      if (token !== downloadToken) return
      cleanupDownloadEvents()
      const src = event.payload.dataUrl || event.payload.data_url || ''
      if (!src) {
        loadError.value = true
        isLoaded.value = true
        return
      }
      loadError.value = false
      isLoaded.value = false
      activeSrc.value = src
    })
    const unlistenError = await listen(errorEvent, () => {
      if (token !== downloadToken) return
      cleanupDownloadEvents()
      loadError.value = true
      isLoaded.value = true
    })
    stopDownloadEvents = [unlistenDone, unlistenError]

    await invoke('download_file', {
      url,
      fileKey: key,
      savePath,
      msgId: id,
    })
  } catch {
    if (token !== downloadToken) return
    cleanupDownloadEvents()
    loadError.value = true
    isLoaded.value = true
  }
}

onBeforeUnmount(() => {
  downloadToken += 1
  cleanupDownloadEvents()
})
</script>

<template>
  <div class="image-message">
    <div class="image-wrapper" :style="{ maxWidth: '240px' }" @click="openPreview">
      <img
        v-if="activeSrc && !loadError"
        :src="activeSrc"
        alt=""
        @load="isLoaded = true"
        @error="handleError"
      />
      <div v-if="!activeSrc || (!isLoaded && !loadError)" class="skeleton" />
      <div v-if="loadError" class="image-error">图片加载失败</div>
      <div v-if="isVideo" class="play-icon">▶</div>
    </div>

    <Teleport to="body">
      <div v-if="showPreview" class="image-preview" @click="showPreview = false">
        <img :src="previewSrc" alt="" @click.stop />
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.image-message {
  .image-wrapper {
    position: relative;
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;
    min-width: 120px;
    min-height: 90px;

    img {
      width: 100%;
      display: block;
      border-radius: 4px;
    }
  }

  .skeleton {
    width: 200px;
    height: 150px;
    background: #e8e8e8;
    border-radius: 4px;
    animation: pulse 1.5s infinite;
  }

  .image-error {
    width: 200px;
    height: 150px;
    background: #e8e8e8;
    border-radius: 4px;
    color: #999;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .play-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 40px;
    height: 40px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 16px;
  }
}

.image-preview {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;

  img {
    max-width: 92vw;
    max-height: 92vh;
    object-fit: contain;
    cursor: default;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
