<script setup lang="ts">
import { computed, watch } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { MessageType } from '@/types'
import { createFifoConcurrencyQueue } from '@/utils/fifoConcurrencyQueue'
import MediasCaptionCell from './MediasCaptionCell.vue'
import VideoMessage from './VideoMessage.vue'

const mediaDownloadQueue = createFifoConcurrencyQueue(3)

const props = defineProps<{
  message: Message
}>()

const CAPTION_SEPARATOR = '##caption##'

type MediaCaptionItem = Message & {
  mediaSlotIndex: number
  thumbUrl?: string
  fileSize?: string
  width?: number
  height?: number
  duration?: number
}

type MediaPayload = {
  kind: 'image' | 'gif' | 'video'
  content: string
}

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

function isChannelConversationId(value: unknown): boolean {
  return String(value || '').startsWith('2_')
}

function stringifySlotExtra(extra: Record<string, unknown>): string | null {
  try {
    return Object.keys(extra).length > 0 ? JSON.stringify(extra) : null
  } catch {
    return null
  }
}

function buildMediaSlotExtra(index: number): string | null {
  const parentExtra = parseExtraObject(props.message.extra)
  const channelId = String(parentExtra.channelId || '').trim()
  const isChannelMessage = isChannelConversationId(props.message.conversationId) || Boolean(channelId)

  // 多图子格复用 Image/Video 组件下载；私聊/群聊/频道都要继承父消息附件 key，避免子格 extra=null 后无法解密。
  const slotExtra: Record<string, unknown> = {
    mediaSlotIndex: index,
    parentMsgId: props.message.id || props.message.customMsgId || '',
  }
  if (isChannelMessage) {
    slotExtra.channelId = channelId || String(props.message.conversationId || '').split('_')[1] || ''
  }
  for (const key of ['version', 'contentMd5', 'readTotal', 'decryptPending', 'cipherHex', 'attachmentKey', 'fileKey', 'cipherCandidates', 'source']) {
    if (parentExtra[key] !== undefined && parentExtra[key] !== null && String(parentExtra[key]).length > 0) {
      slotExtra[key] = parentExtra[key]
    }
  }
  return stringifySlotExtra(slotExtra)
}

function channelMediasLog(message: string, data: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info') {
  void message
  void data
  void level
}

function buildImageSlotContent(meta: string[], fileKey: string): string {
  const url = meta[0] || ''
  const thumbnailUrl = meta[1] || url
  // 多图格子复用单图组件渲染；这里转成单图组件已支持的 JSON，避免 blob: 预览被旧串解析截断。
  const payload: Record<string, unknown> = {
    url,
    thumbnailUrl,
    size: Number(meta[2] || 0) || 0,
  }
  if (fileKey) payload.fileKey = fileKey
  return JSON.stringify(payload)
}

function buildGifSlotContent(meta: string[], fileKey: string): string {
  const url = meta[0] || ''
  const thumbnailUrl = meta[1] || url
  const payload: Record<string, unknown> = {
    url,
    gif: url,
    thumbnailUrl,
  }
  if (fileKey) payload.fileKey = fileKey
  return JSON.stringify(payload)
}

function stripRefSuffix(value: string): string {
  const index = value.indexOf('-||-type:')
  return (index < 0 ? value : value.slice(0, index)).trim()
}

function splitBodyAndCaption(content: string): { body: string; caption: string } {
  const index = content.indexOf(CAPTION_SEPARATOR)
  if (index < 0) return { body: stripRefSuffix(content), caption: '' }
  return {
    body: stripRefSuffix(content.slice(0, index)),
    caption: stripRefSuffix(content.slice(index + CAPTION_SEPARATOR.length)),
  }
}

function pickMediaPayload(segment: string): MediaPayload | null {
  const markers = [
    { kind: 'image' as const, marker: 'image:' },
    { kind: 'gif' as const, marker: 'gif:' },
    { kind: 'video' as const, marker: 'video:' },
  ]

  for (const { kind, marker } of markers) {
    if (segment.startsWith(marker)) {
      return { kind, content: segment.slice(marker.length) }
    }

    // 兼容旧 im 真实下发格式：文件名/大小等前缀后才出现 image:/video:/gif:。
    const legacyIndex = segment.indexOf(`||${marker}`)
    if (legacyIndex >= 0) {
      return { kind, content: segment.slice(legacyIndex + 2 + marker.length) }
    }
  }

  return null
}

function buildCommonItem(index: number): Omit<MediaCaptionItem, 'msgType' | 'content'> {
  const parentId = props.message.id || props.message.customMsgId || 'media'
  const slotId = `${parentId}-${index}`
  const common = {
    ...props.message,
    id: slotId,
    customMsgId: slotId,
    extra: buildMediaSlotExtra(index),
    mediaSlotIndex: index,
  } as MediaCaptionItem

  // 子格子不直接继承整份 extra，避免私聊/群聊 cipherCandidates 污染；频道只保留下载解密需要的父级字段。
  delete (common as Partial<MediaCaptionItem>).content
  const dynamicFields = common as unknown as Record<string, unknown>
  delete dynamicFields.fileKey
  delete dynamicFields.file_key
  delete dynamicFields.attachmentKey
  delete dynamicFields.attachment_key
  delete dynamicFields.cipherCandidates
  return common
}

const parentFileKey = computed(() => {
  const extra = parseExtraObject(props.message.extra)
  return String(extra.fileKey || extra.file_key || extra.mediasCaptionFileKey || '').trim()
})

const parsed = computed(() => {
  const { body, caption } = splitBodyAndCaption(String(props.message.content || '').trim())
  const segments = body
    ? body.split('|||').map((segment) => segment.trim()).filter(Boolean)
    : []
  const items: MediaCaptionItem[] = []

  for (let index = 0; index < segments.length; index += 1) {
    const payload = pickMediaPayload(segments[index])
    if (!payload) continue

    const common = buildCommonItem(index)
    if (payload.kind === 'image') {
      const meta = payload.content.split('||')
      items.push({
        ...common,
        msgType: MessageType.Image,
        content: buildImageSlotContent(meta, parentFileKey.value),
        thumbUrl: meta[1] || undefined,
        fileSize: meta[2] || '',
      })
    } else if (payload.kind === 'gif') {
      const meta = payload.content.split('||')
      items.push({
        ...common,
        msgType: MessageType.DynamicImage,
        content: buildGifSlotContent(meta, parentFileKey.value),
        thumbUrl: meta[0] || undefined,
      })
    } else {
      const meta = payload.content.split('||')
      const [, thumbUrl = ''] = (meta[0] || '').split('*P')
      items.push({
        ...common,
        msgType: MessageType.Video,
        content: payload.content,
        duration: Number(meta[1] || 0) || 0,
        fileSize: meta[2] || '',
        width: Number(meta[3] || 0) || 0,
        height: Number(meta[4] || 0) || 0,
        thumbUrl: thumbUrl || undefined,
      })
    }
  }

  return { items, caption }
})

const mediaItems = computed(() => parsed.value.items)
const captionText = computed(() => parsed.value.caption)
const gridColumnCount = computed(() => Math.max(1, Math.min(3, mediaItems.value.length || 1)))

function waitMediaDownloadSlot() {
  return mediaDownloadQueue.acquire()
}

watch(
  () => [
    props.message.id,
    props.message.customMsgId,
    props.message.conversationId,
    props.message.content,
    props.message.extra,
    mediaItems.value.length,
  ],
  () => {
    const parentExtra = parseExtraObject(props.message.extra)
    const content = String(props.message.content || '')
    const channelId = String(parentExtra.channelId || '').trim()
    if (!isChannelConversationId(props.message.conversationId) && !channelId) return

    // 频道多图单独打点：确认父内容是否已解密、是否拆出了子图、子图是否拿到附件 key。
    channelMediasLog(mediaItems.value.length > 0 ? 'parsed channel medias' : 'empty channel medias', {
      id: props.message.id,
      customMsgId: props.message.customMsgId,
      conversationId: props.message.conversationId,
      contentLen: content.length,
      contentHead: content.slice(0, 220),
      segmentCount: (content.split('##caption##')[0] || '').split('|||').filter((segment) => segment.trim()).length,
      itemCount: mediaItems.value.length,
      captionLen: captionText.value.length,
      parentFileKeyLen: parentFileKey.value.length,
      parentAttachmentKeyLen: String(parentExtra.attachmentKey || '').length,
      decryptPending: Boolean(parentExtra.decryptPending),
      itemSamples: mediaItems.value.slice(0, 4).map((item) => {
        const itemExtra = parseExtraObject(item.extra)
        return {
          id: item.id,
          msgType: item.msgType,
          contentLen: String(item.content || '').length,
          fileKeyLen: String(itemExtra.fileKey || '').length,
          attachmentKeyLen: String(itemExtra.attachmentKey || '').length,
        }
      }),
    }, mediaItems.value.length > 0 ? 'info' : 'warn')
  },
  { immediate: true },
)
</script>

<template>
  <div class="medias-caption-message">
    <div class="media-grid" :style="{ '--media-grid-cols': gridColumnCount }">
      <div
        v-for="item in mediaItems"
        :key="`${message.id || message.customMsgId || 'media'}-${item.mediaSlotIndex}`"
        class="media-cell"
      >
        <VideoMessage v-if="item.msgType === MessageType.Video" :message="item" />
        <MediasCaptionCell v-else :item="item" :acquire-download-slot="waitMediaDownloadSlot" />
      </div>
    </div>
    <div v-if="captionText" class="caption-text">{{ captionText }}</div>
  </div>
</template>

<style scoped lang="scss">
.medias-caption-message {
  position: relative;
  max-width: 408px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(var(--media-grid-cols, 3), 100px);
  grid-auto-rows: 100px;
  gap: 4px;
  width: fit-content;
  padding: 4px;
  overflow: hidden;
  border-radius: 10px;
  background: #fff;
  box-sizing: border-box;
}

.media-cell {
  width: 100px;
  height: 100px;
  overflow: hidden;
  border-radius: 10px;
  background: #e8e8e8;
}

.caption-text {
  max-width: 308px;
  padding: 6px 8px 0;
  color: #333;
  font-size: 14px;
  line-height: 1.4;
  word-break: break-word;
}

:deep(.image-message .image-wrapper),
:deep(.video-message .video-content),
:deep(.video-message .video-frame) {
  width: 100px !important;
  height: 100px !important;
  min-width: 100px !important;
  min-height: 100px !important;
  border-radius: 0 !important;
}

:deep(.image-message .image-wrapper img),
:deep(.video-message .video-frame img) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  border-radius: 0 !important;
}
</style>
