<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'

const props = defineProps<{
  message: Message
}>()

const authStore = useAuthStore()
const isSelf = computed(() => props.message.senderId === authStore.uid)
const isPlaying = ref(false)

const audioData = computed(() => {
  try {
    return JSON.parse(props.message.content ?? '{}')
  } catch {
    return { duration: 0 }
  }
})

const duration = computed(() => audioData.value.duration ?? 0)
const barWidth = computed(() => Math.min(20 + duration.value * 8, 200) + 'px')

function togglePlay() {
  isPlaying.value = !isPlaying.value
  // TODO: Play audio via Rust/Tauri
}
</script>

<template>
  <div :class="['audio-message', { self: isSelf }]" @click="togglePlay">
    <div class="audio-bubble" :style="{ width: barWidth }">
      <span class="icon">{{ isPlaying ? '⏸' : '▶' }}</span>
      <span class="duration">{{ duration }}"</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.audio-message {
  .audio-bubble {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #fff;
    border-radius: 4px;
    cursor: pointer;
    min-width: 60px;

    .icon {
      font-size: 12px;
    }

    .duration {
      font-size: 13px;
      color: #666;
    }
  }

  &.self .audio-bubble {
    background: #95ec69;
    flex-direction: row-reverse;
  }
}
</style>
