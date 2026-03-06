<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Message } from '@/stores/useMessageStore'

const props = defineProps<{
  message: Message
}>()

const isLoaded = ref(false)

const imageData = computed(() => {
  try {
    return JSON.parse(props.message.content ?? '{}')
  } catch {
    return {}
  }
})

const thumbnailUrl = computed(() => imageData.value.thumbnailUrl || imageData.value.url || '')
const isVideo = computed(() => props.message.msgType === 3)
</script>

<template>
  <div class="image-message">
    <div class="image-wrapper" :style="{ maxWidth: '240px' }">
      <img
        v-show="isLoaded"
        :src="thumbnailUrl"
        alt=""
        @load="isLoaded = true"
      />
      <div v-if="!isLoaded" class="skeleton" />
      <div v-if="isVideo" class="play-icon">▶</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.image-message {
  .image-wrapper {
    position: relative;
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;

    img {
      width: 100%;
      display: block;
      border-radius: 4px;
    }
  }

  .skeleton {
    width: 200px;
    height: 150px;
    background: #e8e8e8;
    border-radius: 4px;
    animation: pulse 1.5s infinite;
  }

  .play-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 40px;
    height: 40px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 16px;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
