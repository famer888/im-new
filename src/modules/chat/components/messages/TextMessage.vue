<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore, FILE_HELPER_TARGET_ID } from '@/stores/useChatStore'
import MessageTimeStatusLabel from '@/components/MessageTimeStatusLabel.vue'

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
  <!-- 结构对齐旧 im `msg/text.vue` + `time-status-label`：气泡内右下时间/状态 -->
  <div :class="['text-message', 'com-msg-text', { self: displayAsSelf }]">
    <div class="content-text" v-html="formattedContent" />
    <MessageTimeStatusLabel :message="message" :is-self="displayAsSelf" />
  </div>
</template>

<style lang="scss" scoped>
.text-message.com-msg-text {
  max-width: 450px;
  min-width: 130px;
  border-radius: 10px;
  border-top-left-radius: 0;
  word-wrap: break-word;
  background: #ffffff;
  position: relative;
  padding: 10px 10px 10px 12px;

  &.self {
    background: #98daff;
    border: 1px solid #87cdf6;
    border-top-left-radius: 10px;
    border-top-right-radius: 0;
  }

  > .content-text {
    padding-right: 75px;
    line-height: 22px;
    white-space: pre-wrap;
    letter-spacing: 0.5px;
    font-size: 14px;
  }
}

:deep(.inline-emoji) {
  width: 20px;
  height: 20px;
  vertical-align: middle;
  margin: 0 2px;
  display: inline-block;
  position: relative;
  top: 4px;
}
</style>
