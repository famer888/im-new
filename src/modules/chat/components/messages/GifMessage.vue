<template>
  <div class="gif-message">
    <img :src="gifUrl" alt="GIF" @load="onLoad" @error="onError" />
    <span v-if="!loaded" class="loading-text">GIF</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { toDisplaySrc } from '@/utils/resourcePath'

const props = defineProps<{
  message?: Message
  content?: string
  isSelf?: boolean
}>()

const loaded = ref(false)
const rawContent = computed(() => String(props.content || props.message?.content || ''))

function isLikelyBase64ImagePayload(value: string): boolean {
  const raw = value.trim()
  if (!raw || raw.length < 32 || raw.length % 4 !== 0) return false
  if (/^(https?:|blob:|file:|asset:|tauri:|\/)/i.test(raw)) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return false
  return /^(R0lGOD|iVBORw0KGgo|\/9j\/|UklGR)/.test(raw)
}

function normalizeGifSrc(value: unknown, mimeType?: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^data:image\//i.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  if (isLikelyBase64ImagePayload(raw)) {
    const mime = String(mimeType || 'image/gif').trim() || 'image/gif'
    return `data:${mime};base64,${raw}`
  }
  return raw
}

function extractUrlFromRawContent(raw: string): string {
  const value = String(raw || '').trim()
  if (!value) return ''
  const match = value.match(/https?:\/\/[^\s"'<>\\*`]+/i)
  return match?.[0] || value
}

function toDisplayGifSrc(src: string): string {
  return toDisplaySrc(src)
}

const gifUrl = computed(() => {
  try {
    const parsed = JSON.parse(rawContent.value)
    const candidate = normalizeGifSrc(
      parsed.url
        || parsed.gif
        || parsed.fileUrl
        || parsed.path
        || parsed.localPath
        || parsed.local_path
        || parsed.filePath
        || parsed.file_path
        || parsed.dataUrl
        || parsed.data_url
        || parsed.base64
        || parsed.thumbnailUrl
        || parsed.thumbUrl
        || rawContent.value,
      parsed.mimeType || parsed.mime_type || parsed.mime || 'image/gif',
    )
    return toDisplayGifSrc(extractUrlFromRawContent(candidate))
  } catch {
    return toDisplayGifSrc(extractUrlFromRawContent(normalizeGifSrc(rawContent.value, 'image/gif')))
  }
})

watch(gifUrl, () => {
  loaded.value = false
}, { immediate: true })

function onLoad() {
  loaded.value = true
}

function onError() {
  loaded.value = true
}
</script>

<style lang="scss" scoped>
.gif-message {
  position: relative;
  max-width: 200px;

  img {
    max-width: 100%;
    border-radius: 4px;
    display: block;
  }

  .loading-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 12px;
    color: #999;
  }
}
</style>
