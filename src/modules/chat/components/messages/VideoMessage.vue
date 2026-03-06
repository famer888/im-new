<template>
  <div class="video-message" @click="handlePlay">
    <div class="video-thumb">
      <img v-if="thumbUrl" :src="thumbUrl" alt="" />
      <div v-else class="thumb-placeholder" />
      <div class="play-icon">
        <svg viewBox="0 0 24 24" width="32" height="32">
          <circle cx="12" cy="12" r="12" fill="rgba(0,0,0,0.5)" />
          <polygon points="10,7 18,12 10,17" fill="#fff" />
        </svg>
      </div>
      <span v-if="duration" class="duration">{{ formatDuration(duration) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  content: string
  isSelf: boolean
}>()

interface VideoContent {
  url?: string
  thumbUrl?: string
  duration?: number
  width?: number
  height?: number
}

const parsed = computed<VideoContent>(() => {
  try { return JSON.parse(props.content) } catch { return {} }
})

const thumbUrl = computed(() => parsed.value.thumbUrl || '')
const duration = computed(() => parsed.value.duration || 0)

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function handlePlay() {
  // TODO: Tauri invoke open video player
}
</script>

<style lang="scss" scoped>
.video-message {
  cursor: pointer;
}

.video-thumb {
  position: relative;
  max-width: 200px;
  border-radius: 4px;
  overflow: hidden;

  img {
    width: 100%;
    display: block;
  }

  .thumb-placeholder {
    width: 200px;
    height: 150px;
    background: #000;
  }
}

.play-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.duration {
  position: absolute;
  bottom: 4px;
  right: 6px;
  font-size: 11px;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  padding: 1px 4px;
  border-radius: 2px;
}
</style>
