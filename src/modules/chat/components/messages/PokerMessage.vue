<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import startGif from '@/assets/images/game/start.gif'
import waitGif from '@/assets/images/game/wait.gif'
import endGif from '@/assets/images/game/end.gif'

const props = defineProps<{ message: Message }>()

const resultImageModules = import.meta.glob('../../../../assets/images/game/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>
const resultImages = Object.entries(resultImageModules).reduce<Record<string, string>>((map, [path, src]) => {
  const fileName = path.split('/').pop()?.replace(/\.png$/i, '')
  if (fileName) map[fileName] = src
  return map
}, {})

const START_ANIMATION_MS = 700
const END_ANIMATION_MS = 1200
const TOTAL_ANIMATION_MS = START_ANIMATION_MS + END_ANIMATION_MS
const MAX_POKER_ANIMATION_STATES = 2000

type PokerAnimationState = {
  result: string
  startedAt: number
  stopped: boolean
}
type PokerAnimationGlobal = typeof globalThis & {
  __OCS_POKER_ANIMATION_STATES__?: Map<string, PokerAnimationState>
}

const pokerGlobal = globalThis as PokerAnimationGlobal
const pokerAnimationStates = pokerGlobal.__OCS_POKER_ANIMATION_STATES__ ?? new Map<string, PokerAnimationState>()
pokerGlobal.__OCS_POKER_ANIMATION_STATES__ = pokerAnimationStates

const resultSrc = ref('')
const imageError = ref(false)
const animationSrc = ref(startGif)
let animationTimer: ReturnType<typeof window.setTimeout> | null = null
let animationRunId = 0

function clearAnimationTimer() {
  if (!animationTimer) return
  window.clearTimeout(animationTimer)
  animationTimer = null
}

function delay(ms: number, runId: number) {
  return new Promise<boolean>((resolve) => {
    clearAnimationTimer()
    animationTimer = window.setTimeout(() => {
      animationTimer = null
      resolve(runId === animationRunId)
    }, ms)
  })
}

async function playAnimation(type: 1 | 2 | 3, runId: number) {
  if (type === 1) {
    animationSrc.value = startGif
    return delay(START_ANIMATION_MS, runId)
  }
  if (type === 2) {
    animationSrc.value = waitGif
    return true
  }
  animationSrc.value = endGif
  return delay(END_ANIMATION_MS, runId)
}

function normalizeResult(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (resultImages[raw]) return raw

  const fileName = raw
    .split(/[?#]/)[0]
    .split('/')
    .pop()
    ?.replace(/\.png$/i, '')
    .replace(/^(.+)\.[A-Za-z0-9_-]{6,}$/, '$1')
    || raw
  if (resultImages[fileName]) return fileName

  const upper = fileName.toUpperCase()
  const rank = upper === '1' ? 'A' : upper
  const htName = `ht_${rank}`
  if (resultImages[htName]) return htName

  return fileName
}

const gameContent = computed(() => {
  const raw = String(props.message.content ?? '').trim()
  const [mainContent, seenContent] = raw.split('|SEE|')
  let result = normalizeResult(mainContent.split('||')[0])

  if (result.startsWith('{')) {
    try {
      const parsed = JSON.parse(mainContent) as Record<string, unknown>
      result = normalizeResult(
        parsed.currentImage ?? parsed.current_image ?? parsed.result ?? parsed.value,
      )
    } catch {
      result = ''
    }
  }

  return {
    result,
    seen: seenContent === '1',
  }
})

const animationKey = computed(() =>
  String(props.message.customMsgId || props.message.id || props.message.content || ''),
)

function isHistoricalPokerMessage(message: Message): boolean {
  const sendTime = Number(message.sendTime || 0)
  return sendTime > 0 && Date.now() - sendTime >= TOTAL_ANIMATION_MS
}

function ensurePokerAnimationState(key: string, result: string, message: Message) {
  const existing = pokerAnimationStates.get(key)
  if (existing && existing.result === result) return existing

  const state = {
    result,
    startedAt: Date.now(),
    stopped: isHistoricalPokerMessage(message),
  }
  if (state.stopped) {
    state.startedAt = Number(message.sendTime || Date.now())
  }
  pokerAnimationStates.set(key, state)
  if (pokerAnimationStates.size > MAX_POKER_ANIMATION_STATES) {
    const oldestKey = pokerAnimationStates.keys().next().value
    if (oldestKey) pokerAnimationStates.delete(oldestKey)
  }
  return state
}

watch([gameContent, animationKey], async ([content, key]) => {
  const runId = ++animationRunId
  clearAnimationTimer()
  resultSrc.value = ''
  imageError.value = false

  if (!content.result) {
    if (await playAnimation(1, runId)) {
      await playAnimation(2, runId)
    }
    return
  }

  const image = resultImages[content.result]
  if (!image) {
    imageError.value = true
    return
  }

  const state = ensurePokerAnimationState(key, content.result, props.message)
  const elapsed = Date.now() - state.startedAt
  const remainingDelay = Math.max(0, TOTAL_ANIMATION_MS - elapsed)
  if (content.seen || state.stopped || remainingDelay <= 0) {
    state.stopped = true
    resultSrc.value = image
    return
  }

  const startOk = await playAnimation(1, runId)
  if (!startOk) return
  const endOk = await playAnimation(3, runId)
  if (!endOk) return

  state.stopped = true
  resultSrc.value = image
}, { immediate: true })

onBeforeUnmount(() => {
  animationRunId += 1
  clearAnimationTimer()
})
</script>

<template>
  <div class="poker-message">
    <div class="content">
      <img v-if="resultSrc" :src="resultSrc" alt="" @error="imageError = true" />
      <p v-else-if="imageError" class="error-message">[{{ gameContent.result || '扑克牌结果异常' }}]</p>
      <img v-else :src="animationSrc" alt="" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.poker-message {
  position: relative;
  padding: 10px 75px 15px 10px;
  border-radius: 10px;
  border-top-left-radius: 0;

  .content {
    height: 120px;
  }

  img {
    display: block;
    height: 120px;
    max-width: 220px;
    object-fit: contain;
  }
}

.error-message {
  margin: 0;
  line-height: 120px;
  color: #666;
  font-size: 14px;
}
</style>
