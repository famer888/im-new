<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  name: string
  src?: string | null
  size?: number
  rounded?: boolean
}>(), {
  size: 36,
  rounded: false,
})

const initial = computed(() => (props.name || '?')[0].toUpperCase())

const colors = ['#3369fe', '#67c23a', '#e6a23c', '#f44e5a', '#909399', '#00bcd4', '#9c27b0', '#ff5722']
const bgColor = computed(() => {
  let hash = 0
  for (const c of props.name || '') hash = hash * 31 + c.charCodeAt(0)
  return colors[Math.abs(hash) % colors.length]
})

const sizeStyle = computed(() => ({
  width: props.size + 'px',
  height: props.size + 'px',
  fontSize: Math.max(props.size * 0.4, 12) + 'px',
  borderRadius: props.rounded ? '50%' : '4px',
}))
</script>

<template>
  <div class="text-avatar" :style="sizeStyle">
    <img v-if="src" :src="src" alt="" class="avatar-img" :style="{ borderRadius: rounded ? '50%' : '4px' }" />
    <span v-else class="avatar-text" :style="{ background: bgColor }">{{ initial }}</span>
  </div>
</template>

<style lang="scss" scoped>
.text-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-text {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 500;
  border-radius: inherit;
}
</style>
