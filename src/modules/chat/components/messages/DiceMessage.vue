<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/stores/useMessageStore'

const props = defineProps<{ message: Message }>()

const diceData = computed(() => {
  try {
    const parsed = JSON.parse(props.message.content ?? '{}')
    return { value: parsed.value ?? 1 }
  } catch { return { value: 1 } }
})

const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
</script>

<template>
  <div class="dice-message">
    <div class="dice-bubble">
      <span class="dice-icon">{{ diceEmojis[(diceData.value - 1) % 6] }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.dice-bubble {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
}

.dice-icon {
  font-size: 48px;
}
</style>
