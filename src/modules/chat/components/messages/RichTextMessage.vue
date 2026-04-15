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
    max-width: 450px;
    min-width: 130px;
    border-radius: 10px;
    border-top-left-radius: 0;
    padding: 10px 10px 10px 12px;
    background: #fff;
    font-size: 14px;
    line-height: 22px;
    letter-spacing: 0.5px;
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

  &.self .bubble {
    background: #98daff;
    border: 1px solid #87cdf6;
    border-top-left-radius: 10px;
    border-top-right-radius: 0;
  }
}
</style>
