<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore, FILE_HELPER_TARGET_ID } from '@/stores/useChatStore'

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

const formattedContent = computed(() => {
  const content = props.message.content ?? ''
  return content.replace(
    /\[([^\]]+)\]/g,
    (_, name) => `<img class="inline-emoji" src="/images/emoji/${name}.png" alt="${name}" />`,
  )
})
</script>

<template>
  <div :class="['text-message', { self: displayAsSelf, 'file-helper-style': isFileHelperChat }]">
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

  &.file-helper-style {
    .bubble {
      max-width: 450px;
      min-width: 130px;
      border-radius: 10px;
      border-top-left-radius: 0;
      padding: 10px 10px 10px 12px;
      line-height: 22px;
      letter-spacing: 0.5px;
      background: #fff;
    }

    &.self .bubble {
      background: #98daff;
      border: 1px solid #87cdf6;
      border-top-left-radius: 10px;
      border-top-right-radius: 0;
    }
  }
}

:deep(.inline-emoji) {
  width: 20px;
  height: 20px;
  vertical-align: middle;
  margin: 0 2px;
}
</style>
