<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/stores/useMessageStore'

const props = defineProps<{
  message: Message
}>()

const parsedNotice = computed(() => {
  const content = props.message.content || ''
  if (!content.startsWith('!@#')) {
    return { prefix: '', text: content }
  }

  const endIndex = content.lastIndexOf('!@#')
  if (endIndex <= 0) {
    return { prefix: '', text: content }
  }

  return {
    prefix: content.slice(3, endIndex),
    text: content.slice(endIndex + 3),
  }
})
</script>

<template>
  <div class="system-notification">
    <span class="text">
      <strong v-if="parsedNotice.prefix">{{ parsedNotice.prefix }}</strong>{{ parsedNotice.text }}
    </span>
  </div>
</template>

<style lang="scss" scoped>
.system-notification {
  text-align: center;
  padding: 10px 30px;
  position: relative;

  .text {
    font-size: 14px;
    color: rgb(126, 126, 126);
    line-height: 17px;
    max-width: 80%;
    text-align: center;
    word-break: break-word;

    strong {
      font-size: 14px;
      font-weight: normal;
      color: rgb(126, 126, 126);
    }
  }
}
</style>
