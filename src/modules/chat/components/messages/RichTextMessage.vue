<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import DOMPurify from 'dompurify'

const props = defineProps<{ message: Message }>()
const authStore = useAuthStore()
const isSelf = computed(() => props.message.senderId === authStore.uid)

const sanitizedHtml = computed(() => {
  return DOMPurify.sanitize(props.message.content ?? '', {
    ALLOWED_TAGS: ['b', 'i', 'u', 'a', 'br', 'p', 'span', 'div', 'img', 'strong', 'em'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target'],
  })
})
</script>

<template>
  <div :class="['rich-text-message', { self: isSelf }]">
    <div class="bubble" v-html="sanitizedHtml" />
  </div>
</template>

<style lang="scss" scoped>
.rich-text-message {
  .bubble {
    display: inline-block;
    padding: 8px 12px;
    border-radius: 4px;
    background: #fff;
    font-size: 14px;
    line-height: 1.6;
    max-width: 100%;
    word-break: break-all;

    :deep(a) {
      color: #3369fe;
      text-decoration: underline;
    }

    :deep(img) {
      max-width: 200px;
      border-radius: 4px;
    }
  }

  &.self .bubble { background: #95ec69; }
}
</style>
