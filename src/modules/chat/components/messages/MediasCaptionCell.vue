<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import ImageMessage from './ImageMessage.vue'

const props = defineProps<{
  item: Message
  acquireDownloadSlot: () => Promise<() => void>
}>()

const slotReady = ref(false)
let releaseSlot: (() => void) | null = null

function parseExtraObject(raw: Message['extra']): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function hasLocalPath(message: Message): boolean {
  const extra = parseExtraObject(message.extra)
  const slotIndex = Number(extra.mediaSlotIndex)
  if (Number.isFinite(slotIndex) && slotIndex >= 0) {
    const localKey = `local_${slotIndex}`
    const thumbKey = `thumb_${slotIndex}`
    if (Object.prototype.hasOwnProperty.call(extra, localKey)) return true
    if (Object.prototype.hasOwnProperty.call(extra, thumbKey)) return true
  }
  const raw = String(message.content ?? '').trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      const localPath = String(parsed.local || parsed.localPath || parsed.local_path || '').trim()
      if (localPath) return true
    } catch {
      // 非 JSON 内容继续看 extra。
    }
  }
  return Boolean(extra.local || extra.localPath || extra.local_path)
}

function releaseHeldSlot() {
  if (!releaseSlot) return
  const release = releaseSlot
  releaseSlot = null
  release()
}

onMounted(async () => {
  if (hasLocalPath(props.item)) {
    slotReady.value = true
    return
  }
  try {
    releaseSlot = await props.acquireDownloadSlot()
  } finally {
    slotReady.value = true
  }
})

watch(
  () => [props.item.content, props.item.extra],
  () => {
    if (releaseSlot && hasLocalPath(props.item)) {
      releaseHeldSlot()
    }
  },
  { deep: true },
)

onBeforeUnmount(() => {
  releaseHeldSlot()
})

function handleTransferAttempt(payload: { started: boolean }) {
  // 对齐旧 im medias-caption-cell：下载未真正启动时释放并发槽位，避免多图卡死。
  if (!releaseSlot || payload.started) return
  releaseHeldSlot()
}
</script>

<template>
  <ImageMessage
    v-if="slotReady"
    :message="item"
    @transfer-attempt="handleTransferAttempt"
  />
</template>
