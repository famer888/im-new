<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'

const props = defineProps<{
  message: Message
}>()

const authStore = useAuthStore()
const isSelf = computed(() => props.message.senderId === authStore.uid)

const formattedContent = computed(() => {
  const content = props.message.content ?? ''
  return content.replace(
    /\[([^\]]+)\]/g,
    (_, name) => `<img class="inline-emoji" src="/images/emoji/${name}.png" alt="${name}" />`,
  )
})
</script>

<template>
  <div :class="['text-message', { self: isSelf }]">
    <div class="bubble" v-html="formattedContent" />
  </div>
</template>

<style lang="scss" scoped>
.text-message {
  .bubble {
    display: inline-block;
    padding: 8px 12px;
    border-radius: 4px;
    background: #fff;
    font-size: 14px;
    line-height: 1.5;
    word-break: break-all;
    max-width: 100%;
  }

  &.self .bubble {
    background: #95ec69;
  }
}

:deep(.inline-emoji) {
  width: 20px;
  height: 20px;
  vertical-align: middle;
  margin: 0 2px;
}
</style>
