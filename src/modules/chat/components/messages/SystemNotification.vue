<script setup lang="ts">
import type { Message } from '@/stores/useMessageStore'

const props = defineProps<{
  message: Message
}>()
</script>

<template>
  <div class="system-notification">
    <span class="text">{{ message.content }}</span>
  </div>
</template>

<style lang="scss" scoped>
.system-notification {
  display: flex;
  justify-content: center;
  padding: 4px 0;

  .text {
    display: inline-block;
    padding: 4px 12px;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    font-size: 12px;
    color: #999;
    max-width: 80%;
    text-align: center;
  }
}
</style>
