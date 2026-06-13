<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { mediaViewerState } from '@/utils/mediaViewerState'
import { getMediaWindowBounds } from '@/utils/mediaWindowSize'
import DOMPurify from 'dompurify'

const props = defineProps<{ message: Message }>()
const authStore = useAuthStore()
const isSelf = computed(() => String(props.message.senderId || '') === String(authStore.uid || ''))
const showPreview = ref(false)
const previewSrc = ref('')

function getConversationTargetId(message: Message): string {
  const conversationId = String(message.conversationId || '')
  if (conversationId.includes('_')) return conversationId.split('_').slice(1).join('_')
  return conversationId
}

const preventPurify = computed(() => {
  const targetId = getConversationTargetId(props.message)
  // 对齐旧 im：9900/9902 系统富文本由服务端下发完整 HTML，旧版直接展示不再二次清洗。
  return targetId === '9900' || targetId === '9902'
})

const sanitizedHtml = computed(() => {
  const content = props.message.content ?? ''
  if (preventPurify.value) return content

  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'a', 'br', 'p', 'span', 'div', 'img', 'strong', 'em'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target', 'type'],
  })
})

function normalizeExternalHref(raw: string): string {
  const href = String(raw || '').trim()
  if (!href || href === '#') return ''
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(href)) return href
  if (href.startsWith('//')) return `https:${href}`
  return `https://${href}`
}

async function openExternalHref(href: string) {
  const target = normalizeExternalHref(href)
  if (!target) return

  if ((window as any).__TAURI_INTERNALS__) {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(target)
    return
  }

  window.open(target, '_blank', 'noopener,noreferrer')
}

async function openImagePreview(src: string) {
  const imageSrc = String(src || '').trim()
  if (!imageSrc) return

  if (!(window as any).__TAURI_INTERNALS__) {
    previewSrc.value = imageSrc
    showPreview.value = true
    return
  }

  try {
    const [{ invoke }, windowApi] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/window') as Promise<any>,
    ])
    const bounds = await getMediaWindowBounds(windowApi)
    // 旧 im 富文本图片点击会打开预览窗口；这里复用新项目统一媒体窗口，避免再维护一套弹窗链路。
    mediaViewerState.send({
      title: '图片',
      mediaType: 'image',
      src: imageSrc,
    })
    await invoke('open_media_window', {
      title: '图片',
      ...bounds,
    })
  } catch (error) {
    console.warn('[rich-text] open image preview failed:', error)
    previewSrc.value = imageSrc
    showPreview.value = true
  }
}

function handleContentClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return

  const image = target.closest('img')
  if (image instanceof HTMLImageElement) {
    event.preventDefault()
    event.stopPropagation()
    void openImagePreview(image.currentSrc || image.src)
    return
  }

  const anchor = target.closest('a')
  if (anchor instanceof HTMLAnchorElement) {
    event.preventDefault()
    event.stopPropagation()
    void openExternalHref(anchor.getAttribute('href') || anchor.href)
  }
}
</script>

<template>
  <div :class="['rich-text-message', { self: isSelf }]">
    <div class="bubble" @click.stop="handleContentClick" v-html="sanitizedHtml" />

    <Teleport to="body">
      <div v-if="showPreview" class="rich-text-preview" @click="showPreview = false">
        <div class="preview-titlebar">
          <span class="preview-title">图片</span>
          <button class="preview-close" type="button" @click.stop="showPreview = false">×</button>
        </div>
        <div class="preview-stage">
          <img :src="previewSrc" alt="" @click.stop />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.rich-text-message {
  .bubble {
    display: inline-block;
    max-width: 450px;
    min-width: 130px;
    border-radius: 10px;
    border-top-left-radius: 0;
    padding: 10px 10px 10px 12px;
    background: rgb(243, 243, 243);
    border: 1px solid #eeeff3;
    font-size: 14px;
    line-height: 22px;
    letter-spacing: 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    word-break: break-word;
    // App 根节点默认禁用选择；富文本消息正文同样保留拖选复制能力。
    user-select: text;
    -webkit-user-select: text;
    cursor: text;

    :deep(*) {
      user-select: text;
      -webkit-user-select: text;
    }

    :deep(a) {
      color: #3369fe;
      text-decoration: underline;
      cursor: pointer;
    }

    :deep(img) {
      max-width: 200px;
      border-radius: 4px;
      cursor: zoom-in;
      vertical-align: middle;
    }

    :deep(.at) {
      margin: 0;
      font-size: 14px;
      color: #3369fe;
      display: inline-block;
      cursor: pointer;
      font-weight: normal;

      &:hover {
        opacity: 0.8;
      }
    }
  }

  &.self .bubble {
    background: #98daff;
    border: 1px solid #87cdf6;
    border-top-left-radius: 10px;
    border-top-right-radius: 0;
  }
}

.rich-text-preview {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.86);
  display: flex;
  flex-direction: column;
}

.preview-titlebar {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
}

.preview-title {
  font-size: 14px;
}

.preview-close {
  border: none;
  background: transparent;
  color: #fff;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.preview-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;

  img {
    max-width: 92vw;
    max-height: calc(92vh - 44px);
    object-fit: contain;
  }
}
</style>
