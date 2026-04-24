<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { ensureGroupRelKey } from '@/utils/e2ee'
import { mediaViewerState } from '@/utils/mediaViewerState'

const props = defineProps<{
  message: Message
}>()

const authStore = useAuthStore()
const isLoaded = ref(false)
const loadError = ref(false)
const activeSrc = ref('')
const localFilePath = ref('')
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
  localFilePath.value = ''
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

async function openPreview() {
  if (!previewSrc.value || loadError.value) return
  if (!(window as any).__TAURI_INTERNALS__) {
    showPreview.value = true
    return
  }
  try {
    const [{ invoke }, windowApi] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/window') as Promise<any>,
    ])
    const currentWindow = windowApi.getCurrentWindow()
    const [position, size] = await Promise.all([
      typeof currentWindow.outerPosition === 'function'
        ? currentWindow.outerPosition()
        : currentWindow.innerPosition?.(),
      typeof currentWindow.outerSize === 'function'
        ? currentWindow.outerSize()
        : currentWindow.innerSize?.(),
    ])

    mediaViewerState.send({
      title: '图片',
      mediaType: 'image',
      src: previewSrc.value,
      filePath: localFilePath.value || null,
      width: imageData.value.width || undefined,
      height: imageData.value.height || undefined,
    })

    await invoke('open_media_window', {
      title: '图片',
      x: typeof position?.x === 'number' ? Math.round(position.x) : null,
      y: typeof position?.y === 'number' ? Math.round(position.y) : null,
      width: typeof size?.width === 'number' ? Math.round(size.width) : null,
      height: typeof size?.height === 'number' ? Math.round(size.height) : null,
    })
  } catch (error) {
    console.warn('[image] open media window failed:', error)
    showPreview.value = true
  }
}

async function openWithDefaultApp() {
  const filePath = String(localFilePath.value || '').trim()
  if (!filePath) return
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(filePath)
  } catch (error) {
    console.warn('[image] openWithDefaultApp failed:', error)
  }
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
    localFilePath.value = savePath
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
        :data-local-path="localFilePath || undefined"
        alt=""
        @load="isLoaded = true"
        @error="handleError"
      />
      <div v-if="!activeSrc || (!isLoaded && !loadError)" class="skeleton" />
      <div v-if="loadError" class="image-error">图片加载失败</div>
      <div v-if="isVideo" class="play-icon">▶</div>
    </div>

    <Teleport to="body">
      <div v-if="showPreview" class="image-preview">
        <div class="preview-titlebar">
          <span class="preview-title">图片</span>
          <button class="preview-close" type="button" @click="showPreview = false">×</button>
        </div>
        <div class="preview-stage" @click="showPreview = false">
          <img :src="previewSrc" alt="" @click.stop />
        </div>
        <div class="preview-actions">
          <button
            v-if="localFilePath"
            class="preview-action-btn"
            type="button"
            @click="openWithDefaultApp"
          >
            使用默认应用打开
          </button>
        </div>
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
  background: rgba(0, 0, 0, 0.82);
}

.preview-titlebar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 0 12px;
  box-sizing: border-box;
}

.preview-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.86);
}

.preview-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.14);
  }
}

.preview-stage {
  position: absolute;
  inset: 34px 0 68px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;

  img {
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 118px);
    object-fit: contain;
    cursor: default;
    user-select: none;
    -webkit-user-drag: none;
  }
}

.preview-actions {
  position: absolute;
  right: 16px;
  bottom: 16px;
}

.preview-action-btn {
  min-height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.88);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
