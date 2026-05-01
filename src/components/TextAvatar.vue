<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import groupIcon from '@/assets/images/logo/default_group_icon.png'
import friendIcon from '@/assets/images/logo/logo-58.png'
import channelIcon from '@/assets/images/logo/channel-notice.webp'

const props = withDefaults(defineProps<{
  id?: string | number | null
  name: string
  src?: string | null
  size?: number
  rounded?: boolean
  color?: string
  avatarType?: 'friend' | 'group' | 'channel' | 'member' | 'text'
}>(), {
  size: 36,
  rounded: false,
  avatarType: 'friend',
})

const initial = computed(() => (props.name || '?')[0].toUpperCase())
const imageLoadError = ref(false)

const legacyChannelGradientColors = [
  ['#ff516a', '#ff885e'],
  ['#ffa85c', '#ffcd6a'],
  ['#665fff', '#82b1ff'],
  ['#54cb68', '#a0de7e'],
  ['#4acccd', '#00fcfd'],
  ['#2a9ef1', '#72d5fd'],
  ['#d669ed', '#e0a2f3'],
]

watch(() => props.src, () => {
  imageLoadError.value = false
})

const defaultSrc = computed(() => {
  if (props.avatarType === 'group') return groupIcon
  if (props.avatarType === 'channel') return channelIcon
  return friendIcon
})

const hasSrc = computed(() => !!props.src && !imageLoadError.value)
const showImage = computed(() => props.avatarType !== 'text' && (props.avatarType !== 'channel' || hasSrc.value))
const imageSrc = computed<string>(() => (hasSrc.value ? (props.src as string) : defaultSrc.value))
const useCircle = computed(() => props.rounded || props.avatarType === 'group' || props.avatarType === 'channel' || props.avatarType === 'text')

function legacyGradientById(id: string | number | null | undefined): string | null {
  if (id === undefined || id === null || id === '') return null
  const raw = String(id)
  const numeric = Number(raw)
  const seed = Number.isFinite(numeric)
    ? Math.abs(Math.trunc(numeric))
    : [...raw].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const color = legacyChannelGradientColors[seed % legacyChannelGradientColors.length]
  return `linear-gradient(to top, ${color[0]}, ${color[1]})`
}

const textBgColor = computed(() => {
  if (props.avatarType === 'channel' || props.avatarType === 'text') {
    return legacyGradientById(props.id) || props.color || '#3369fe'
  }
  return props.color || '#3369fe'
})

const sizeStyle = computed(() => ({
  width: props.size + 'px',
  height: props.size + 'px',
  fontSize: Math.max(props.size * 0.4, 12) + 'px',
  borderRadius: useCircle.value ? '50%' : '4px',
}))

function handleImageError() {
  imageLoadError.value = true
}
</script>

<template>
  <div class="text-avatar" :style="sizeStyle">
    <img
      v-if="showImage"
      :src="imageSrc"
      alt=""
      class="avatar-img"
      :style="{ borderRadius: useCircle ? '50%' : '4px' }"
      @error="handleImageError"
    />
    <span v-else class="avatar-text" :style="{ background: textBgColor }">{{ initial }}</span>
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
