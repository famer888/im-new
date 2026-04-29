<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { FILE_HELPER_TARGET_ID, useChatStore } from '@/stores/useChatStore'
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
  () => chatStore.currentConversation?.targetId === FILE_HELPER_TARGET_ID,
)
const displayAsSelf = computed(() => isSelf.value || isFileHelperChat.value)

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

async function handleDownload() {
  // TODO: Open save dialog and download via Rust
}
</script>

<template>
  <div :class="['file-message', { self: displayAsSelf }]" @click="handleDownload">
    <div class="file-bubble">
      <div class="file-info">
        <h2 class="file-name">{{ fileData.name || fileData.fileName || '文件' }}</h2>
        <div class="file-size">{{ fileSize }}</div>
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
