<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import groupIcon from '@/assets/images/logo/default_group_icon.png'
import friendIcon from '@/assets/images/logo/logo-58.png'
import channelIcon from '@/assets/images/logo/channel-notice.webp'
import { canUseNativeImageAvatar, resolveNativeAvatarSrc } from '@/utils/nativeImage'

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
const resolvedImageSrc = ref<string | null>(null)
// src 频繁切换时用 token 丢弃过期异步结果，避免旧请求回写新头像。
let resolveTaskToken = 0
let lastResolvedSrcKey = ''

const AVATAR_PRELOAD_TIMEOUT_MS = 1200
const AVATAR_FAIL_RETRY_MS = 15_000
const AVATAR_RETRY_MS = 3_000
// 同一地址复用同一预加载任务，避免列表里重复头像并发请求。
const avatarPreloadPromises = new Map<string, Promise<boolean>>()
type AvatarLoadEntry = {
  loaded: boolean
  updatedAt: number
  resolvedSrc?: string | null
}
// 记录最近一次加载结果：成功直接复用，失败短时间内不重复探测。
const avatarLoadStates = new Map<string, AvatarLoadEntry>()
let retryTimer: number | null = null

const legacyChannelGradientColors = [
  ['#ff516a', '#ff885e'],
  ['#ffa85c', '#ffcd6a'],
  ['#665fff', '#82b1ff'],
  ['#54cb68', '#a0de7e'],
  ['#4acccd', '#00fcfd'],
  ['#2a9ef1', '#72d5fd'],
  ['#d669ed', '#e0a2f3'],
]

// 头像默认图先渲染，真实图走去重预热；这样在弱网/偶发慢站点下不会出现整列头像空白。
watch([() => props.src, () => props.avatarType], () => {
  clearAvatarRetry()
  imageLoadError.value = false
  void refreshResolvedImageSrc()
}, { immediate: true })

onBeforeUnmount(() => {
  clearAvatarRetry()
})

const defaultSrc = computed(() => {
  if (props.avatarType === 'group') return groupIcon
  if (props.avatarType === 'channel') return channelIcon
  return friendIcon
})

const showImage = computed(() => props.avatarType !== 'text' && (props.avatarType !== 'channel' || !!resolvedImageSrc.value))
const imageSrc = computed<string>(() => resolvedImageSrc.value || defaultSrc.value)
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
  const src = normalizeAvatarSrc(props.src)
  if (src) {
    // 真实渲染报错后把地址标记为失败，防止列表滚动时反复触发同一错误请求。
    rememberResolvedAvatar(src, null, false)
    scheduleAvatarRetry(src)
  }
  resolvedImageSrc.value = null
  imageLoadError.value = true
}

function clearAvatarRetry() {
  if (retryTimer === null || typeof window === 'undefined') return
  window.clearTimeout(retryTimer)
  retryTimer = null
}

function rememberResolvedAvatar(src: string, resolvedSrc: string | null, loaded: boolean) {
  avatarLoadStates.set(src, {
    loaded,
    updatedAt: Date.now(),
    resolvedSrc: loaded ? resolvedSrc : null,
  })
}

function scheduleAvatarRetry(src: string) {
  if (typeof window === 'undefined') return
  clearAvatarRetry()
  // 头像加载失败多是临时网络/缓存文件未就绪，短延迟重试一次，避免一直停留在默认头像。
  retryTimer = window.setTimeout(() => {
    retryTimer = null
    if (normalizeAvatarSrc(props.src) !== src) return
    imageLoadError.value = false
    avatarLoadStates.delete(src)
    void refreshResolvedImageSrc(true)
  }, AVATAR_RETRY_MS)
}

function normalizeAvatarSrc(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getCachedAvatarLoadState(src: string): boolean | null {
  const state = avatarLoadStates.get(src)
  if (!state) return null
  // 失败记录只保留一小段时间，避免永久降级导致头像一直不再重试。
  if (!state.loaded && Date.now() - state.updatedAt > AVATAR_FAIL_RETRY_MS) {
    avatarLoadStates.delete(src)
    return null
  }
  return state.loaded
}

function getCachedResolvedSrc(src: string): string | null {
  const state = avatarLoadStates.get(src)
  if (!state?.loaded || !state.resolvedSrc) return null
  return state.resolvedSrc
}

function preloadAvatar(src: string): Promise<boolean> {
  const cachedTask = avatarPreloadPromises.get(src)
  if (cachedTask) return cachedTask

  const task = new Promise<boolean>((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(false)
      return
    }
    const img = new Image()
    let settled = false
    // 只给短超时窗口，慢链路不阻塞当前头像位的兜底显示。
    const timer = window.setTimeout(() => finish(false), AVATAR_PRELOAD_TIMEOUT_MS)

    function finish(loaded: boolean) {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      img.onload = null
      img.onerror = null
      resolve(loaded)
    }

    img.onload = () => finish(true)
    img.onerror = () => finish(false)
    img.src = src

    if (img.complete && img.naturalWidth > 0) finish(true)
  }).finally(() => {
    avatarPreloadPromises.delete(src)
  })

  avatarPreloadPromises.set(src, task)
  return task
}

async function refreshResolvedImageSrc(forceRetry = false) {
  const token = ++resolveTaskToken
  const src = normalizeAvatarSrc(props.src)
  const srcKey = `${props.avatarType}:${src}`
  if (!forceRetry && src && srcKey === lastResolvedSrcKey && resolvedImageSrc.value) {
    return
  }
  if (!src || (!forceRetry && imageLoadError.value) || props.avatarType === 'text') {
    if (token !== resolveTaskToken) return
    resolvedImageSrc.value = null
    lastResolvedSrcKey = ''
    return
  }

  const cachedResolved = !forceRetry ? getCachedResolvedSrc(src) : null
  if (cachedResolved) {
    if (token !== resolveTaskToken) return
    resolvedImageSrc.value = cachedResolved
    lastResolvedSrcKey = srcKey
    return
  }

  const cachedState = getCachedAvatarLoadState(src)
  if (!forceRetry && cachedState === false) {
    if (token !== resolveTaskToken) return
    resolvedImageSrc.value = null
    lastResolvedSrcKey = ''
    return
  }

  if (canUseNativeImageAvatar(src)) {
    // 桌面端远程头像走 NativeImage：本地缓存 + 候选域名 + 明文/加密识别，避免 WebView 反复直连头像源。
    try {
      const nativeSrc = await resolveNativeAvatarSrc({
        id: props.id,
        type: props.avatarType,
        src,
      })
      if (token !== resolveTaskToken) return
      resolvedImageSrc.value = nativeSrc
      imageLoadError.value = !nativeSrc
      if (nativeSrc) {
        rememberResolvedAvatar(src, nativeSrc, true)
        lastResolvedSrcKey = srcKey
      } else {
        rememberResolvedAvatar(src, null, false)
        lastResolvedSrcKey = ''
      }
    } catch (error) {
      if (token !== resolveTaskToken) return
      // NativeImage 解析失败只影响当前头像，回退到原有默认图/文字头像，不阻断页面渲染。
      console.warn('[TextAvatar] native image resolve failed', error)
      resolvedImageSrc.value = null
      imageLoadError.value = true
      rememberResolvedAvatar(src, null, false)
      lastResolvedSrcKey = ''
    }
    return
  }

  if (cachedState === true) {
    if (token !== resolveTaskToken) return
    resolvedImageSrc.value = src
    lastResolvedSrcKey = srcKey
    return
  }

  const loaded = await preloadAvatar(src)
  rememberResolvedAvatar(src, loaded ? src : null, loaded)
  // 如果这次异步结果已过期（props 又变了），直接丢弃，避免错图闪回。
  if (token !== resolveTaskToken) return
  if (loaded && normalizeAvatarSrc(props.src) === src && !imageLoadError.value) {
    resolvedImageSrc.value = src
    lastResolvedSrcKey = srcKey
    return
  }
  resolvedImageSrc.value = null
  lastResolvedSrcKey = ''
  if (!loaded && normalizeAvatarSrc(props.src) === src) scheduleAvatarRetry(src)
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
