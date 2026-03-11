<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/stores/useMessageStore'

const props = defineProps<{
  message: Message
}>()

const fileData = computed(() => {
  try {
    return JSON.parse(props.message.content ?? '{}')
  } catch {
    return { name: '未知文件', size: 0 }
  }
})

const fileSize = computed(() => {
  const bytes = fileData.value.size || 0
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
})

const fileIcon = computed(() => {
  const ext = (fileData.value.ext || '').toLowerCase()
  if (['doc', 'docx'].includes(ext)) return '📄'
  if (['xls', 'xlsx'].includes(ext)) return '📊'
  if (['pdf'].includes(ext)) return '📕'
  if (['zip', 'rar', '7z'].includes(ext)) return '📦'
  return '📎'
})

async function handleDownload() {
  // TODO: Open save dialog and download via Rust
}
</script>

<template>
  <div class="file-message" @click="handleDownload">
    <div class="file-bubble">
      <div class="file-icon">{{ fileIcon }}</div>
      <div class="file-info">
        <div class="file-name">{{ fileData.name || '文件' }}</div>
        <div class="file-size">{{ fileSize }}</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.file-message {
  .file-bubble {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: #fff;
    border-radius: 4px;
    cursor: pointer;
    width: 240px;

    &:hover {
      background: #f5f5f5;
    }
  }

  .file-icon {
    font-size: 32px;
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    min-width: 0;

    .file-name {
      font-size: 14px;
      color: #333;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-size {
      font-size: 12px;
      color: #999;
      margin-top: 4px;
    }
  }
}
</style>
