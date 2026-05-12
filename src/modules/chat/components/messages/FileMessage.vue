<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { isFileHelperTargetId, useChatStore } from '@/stores/useChatStore'
import { ensureGroupRelKey } from '@/utils/e2ee'
import { eventBus } from '@/utils/eventBus'
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
const isSelf = computed(() => props.message.senderId === authStore.uid)
const isFileHelperChat = computed(
  () => isFileHelperTargetId(chatStore.currentConversation?.targetId),
)
const displayAsSelf = computed(() => isSelf.value || isFileHelperChat.value)
const isOpening = ref(false)
let openToken = 0
let stopDownloadEvents: Array<() => void> = []

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

const fileData = computed(() => {
  try {
    return JSON.parse(props.message.content ?? '{}')
  } catch {
    return { name: '未知文件', size: 0 }
  }
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
const fileUrl = computed(() =>
  normalizeUrl(fileData.value.url || fileData.value.fileUrl || fileData.value.path || ''),
)
const fileKey = computed(() =>
  String(
    fileData.value.fileKey ||
    fileData.value.file_key ||
    extraData.value.fileKey ||
    extraData.value.file_key ||
    '',
  ).trim(),
)
const attachmentKey = computed(() =>
  String(extraData.value.attachmentKey || extraData.value.attachment_key || '').trim(),
)
const groupId = computed(() => {
  const extraGroupId = String(extraData.value.groupId || '').trim()
  if (extraGroupId) return extraGroupId
  const convId = props.message.conversationId || ''
  return convId.startsWith('1_') ? convId.split('_')[1] || '' : ''
})

function normalizeUrl(value: unknown): string {
  const raw = String(value || '').trim()
  if (raw.startsWith('//')) return `https:${raw}`
  return raw
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+$/, '_') || 'file'
}

function fallbackPlainFileKey(key: string): string {
  const raw = key.trim()
  if (!raw) return ''
  if (raw.length <= 32 || !/^[0-9a-f]+$/i.test(raw)) return raw
  return ''
}

function cleanupDownloadEvents() {
  stopDownloadEvents.forEach((unlisten) => unlisten())
  stopDownloadEvents = []
}

async function resolveFileKey(): Promise<string> {
  if (fileKey.value) return fileKey.value
  const plainAttachmentKey = fallbackPlainFileKey(attachmentKey.value)
  if (plainAttachmentKey) return plainAttachmentKey
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

async function localFileExists(path: string): Promise<boolean> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<boolean>('file_exists', { path })
  } catch {
    return false
  }
}

function waitForDownloadFile(url: string, key: string, savePath: string, msgId: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    let settled = false

    try {
      const [{ invoke }, { listen }] = await Promise.all([
        import('@tauri-apps/api/core'),
        import('@tauri-apps/api/event'),
      ])

      const unlistenDone = await listen(`file:done:${msgId}`, () => {
        if (settled) return
        settled = true
        cleanupDownloadEvents()
        resolve()
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
        logTag: 'file',
        emitDataUrl: false,
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

async function openLocalFile(path: string) {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('open_file', { path })
}

async function handleDownload() {
  if (isOpening.value) return
  if (!(window as any).__TAURI_INTERNALS__) return

  if (DANGEROUS_EXTENSIONS.has(fileExt.value)) {
    eventBus.emit('show-toast', { message: '高危文件不支持直接打开', type: 'error' })
    return
  }

  const url = fileUrl.value
  if (!url) {
    eventBus.emit('show-toast', { message: '文件还未上传完成', type: 'error' })
    return
  }

  const token = ++openToken
  isOpening.value = true
  cleanupDownloadEvents()

  try {
    const { appDataDir, join } = await import('@tauri-apps/api/path')
    const baseDir = await appDataDir()
    const id = safeName(props.message.id || props.message.customMsgId || `${Date.now()}`)
    const savePath = await join(baseDir, 'file-cache', id, safeName(fileName.value))

    if (!(await localFileExists(savePath))) {
      const key = await resolveFileKey()
      if (!key) throw new Error('文件密钥缺失，无法打开')
      await waitForDownloadFile(url, key, savePath, `file-open-${id}-${Date.now()}`)
    }

    if (token !== openToken) return
    await openLocalFile(savePath)
  } catch (error) {
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
  <div :class="['file-message', { self: displayAsSelf }]" @click="handleDownload">
    <div class="file-bubble">
      <div class="file-info">
        <h2 class="file-name">{{ fileData.name || fileData.fileName || '文件' }}</h2>
        <div class="file-size">{{ isOpening ? '打开中...' : fileSize }}</div>
      </div>
      <img class="file-icon" :src="fileIcon" alt="" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.file-message {
  .file-bubble {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 10px 10px 12px;
    background: rgb(243, 243, 243);
    border-radius: 10px;
    border-top-left-radius: 0;
    cursor: pointer;
    min-width: 300px;
    min-height: 80px;
    max-width: 450px;
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

  .file-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    flex: 1;

    .file-name {
      margin: 0;
      padding: 0;
      line-height: 25px;
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
      line-height: 20px;
    }
  }
}
</style>
