<template>
  <div class="gif-message">
    <img :src="gifUrl" alt="GIF" @load="onLoad" @error="onError" />
    <span v-if="!loaded" class="loading-text">GIF</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { Message } from '@/stores/useMessageStore'

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

function isLocalFilePath(src: string): boolean {
  const raw = String(src || '').trim()
  if (!raw || /^(https?|blob|data|asset|tauri):/i.test(raw)) return false
  return /^file:/i.test(raw) || raw.startsWith('/') || /^[A-Za-z]:[\\/]/.test(raw)
}

function fileUrlToLocalPath(src: string): string {
  const raw = String(src || '').trim()
  if (!/^file:/i.test(raw)) return raw
  try {
    const parsed = new URL(raw)
    let pathname = decodeURIComponent(parsed.pathname.replace(/\+/g, ' '))
    if (/^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1)
    return pathname
  } catch {
    return raw.replace(/^file:\/\/?/i, '')
  }
}

function toDisplayGifSrc(src: string): string {
  const raw = String(src || '').trim()
  if (!raw) return ''
  if ((window as any).__TAURI_INTERNALS__ && isLocalFilePath(raw)) {
    return convertFileSrc(fileUrlToLocalPath(raw))
  }
  return raw
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
