<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/stores/useMessageStore'

const props = defineProps<{ message: Message }>()

const pokerData = computed(() => {
  try { return JSON.parse(props.message.content ?? '{}') }
  catch { return { result: '🃏' } }
})
</script>

<template>
  <div class="poker-message">
    <div class="poker-bubble">
      <span class="poker-icon">{{ pokerData.result || '🃏' }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.poker-bubble {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
}

.poker-icon { font-size: 48px; }
</style>
