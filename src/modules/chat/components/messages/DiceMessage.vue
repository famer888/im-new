<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import touziGif from '@/assets/images/message/touzi.gif'
import touz1 from '@/assets/images/message/touz_1.jpg'
import touz2 from '@/assets/images/message/touz_2.jpg'
import touz3 from '@/assets/images/message/touz_3.jpg'
import touz4 from '@/assets/images/message/touz_4.jpg'
import touz5 from '@/assets/images/message/touz_5.jpg'
import touz6 from '@/assets/images/message/touz_6.jpg'

const props = defineProps<{ message: Message }>()

const diceImages = ['', touz1, touz2, touz3, touz4, touz5, touz6]
const DICE_STOP_DELAY = 1000
const MAX_DICE_ANIMATION_STATES = 2000
type DiceAnimationState = {
  result: number
  startedAt: number
  stopped: boolean
}
type DiceAnimationGlobal = typeof globalThis & {
  __OCS_DICE_ANIMATION_STATES__?: Map<string, DiceAnimationState>
  __OCS_DICE_DEBUG_RUN_ID__?: string
}
const diceGlobal = globalThis as DiceAnimationGlobal
const DICE_REPLAY_COMPONENT_DEBUG_RUN_ID = diceGlobal.__OCS_DICE_DEBUG_RUN_ID__
  ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
diceGlobal.__OCS_DICE_DEBUG_RUN_ID__ = DICE_REPLAY_COMPONENT_DEBUG_RUN_ID
const diceAnimationStates = diceGlobal.__OCS_DICE_ANIMATION_STATES__
  ?? new Map<string, DiceAnimationState>()
diceGlobal.__OCS_DICE_ANIMATION_STATES__ = diceAnimationStates
const visibleResult = ref(0)
let stopTimer: ReturnType<typeof window.setTimeout> | null = null
const DICE_MESSAGE_DEBUG = false

function diceMessageLog(message: string, data?: Record<string, unknown>) {
  if (!DICE_MESSAGE_DEBUG) return
  const payload = {
    debugRunId: DICE_REPLAY_COMPONENT_DEBUG_RUN_ID,
    stateCount: diceAnimationStates.size,
    ...(data || {}),
  }
  console.warn(`[dice-message] ${message}`, payload)
  if (!(window as any).__TAURI_INTERNALS__) return
  import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('image_send_log', {
      payload: {
        level: 'warn',
        message: `[dice-message] ${message}`,
        data: payload,
      },
    }))
    .catch(() => {})
}

function diceAnimationKey(message: Message): string {
  return String(message.customMsgId || message.id || message.content || '')
}

function diceAnimationStateSnapshot(key: string) {
  const state = diceAnimationStates.get(key)
  if (!state) return null
  return {
    result: state.result,
    startedAt: state.startedAt,
    elapsed: Date.now() - state.startedAt,
    stopped: state.stopped,
  }
}

function isHistoricalDiceMessage(message: Message): boolean {
  const sendTime = Number(message.sendTime || 0)
  return sendTime > 0 && Date.now() - sendTime >= DICE_STOP_DELAY
}

function ensureDiceAnimationState(key: string, result: number, message: Message) {
  const existing = diceAnimationStates.get(key)
  if (existing && existing.result === result) return existing

  const state = {
    result,
    startedAt: Date.now(),
    stopped: isHistoricalDiceMessage(message),
  }
  if (state.stopped) {
    state.startedAt = Number(message.sendTime || Date.now())
  }
  diceAnimationStates.set(key, state)
  if (diceAnimationStates.size > MAX_DICE_ANIMATION_STATES) {
    const oldestKey = diceAnimationStates.keys().next().value
    if (oldestKey) diceAnimationStates.delete(oldestKey)
  }
  return state
}

const diceResult = computed(() => {
  const raw = String(props.message.content ?? '').trim()
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw) as unknown
    const directValue = Number(parsed)
    if (Number.isFinite(directValue) && directValue >= 1 && directValue <= 6) {
      return directValue
    }
    if (parsed && typeof parsed === 'object') {
      const parsedObj = parsed as Record<string, unknown>
      for (const key of ['currentImage', 'current_image', 'result', 'value']) {
        const value = Number(parsedObj[key])
        if (Number.isFinite(value) && value >= 1 && value <= 6) return value
      }
    }
    return 0
  } catch {
    const value = Number(raw.split('||')[0] || 0)
    return Number.isFinite(value) && value >= 1 && value <= 6 ? value : 0
  }
})

const animationKey = computed(() => diceAnimationKey(props.message))

watch([diceResult, animationKey], ([result, key]) => {
  const raw = String(props.message.content ?? '').trim()
  const existingState = diceAnimationStateSnapshot(key)
  diceMessageLog('watch diceResult', {
    messageId: props.message.id,
    customMsgId: props.message.customMsgId,
    animationKey: key,
    rawContent: raw,
    result,
    visibleResult: visibleResult.value,
    status: props.message.status,
    readStatus: props.message.readStatus,
    existingState,
  })
  if (stopTimer) {
    window.clearTimeout(stopTimer)
    stopTimer = null
    diceMessageLog('clear previous stop timer', {
      messageId: props.message.id,
      customMsgId: props.message.customMsgId,
    })
  }

  visibleResult.value = 0
  if (result >= 1 && result <= 6) {
    const state = ensureDiceAnimationState(key, result, props.message)
    const elapsed = Date.now() - state.startedAt
    const remainingDelay = Math.max(0, DICE_STOP_DELAY - elapsed)
    if (state.stopped || remainingDelay <= 0) {
      state.stopped = true
      visibleResult.value = result
      diceMessageLog('skip replay', {
        messageId: props.message.id,
        customMsgId: props.message.customMsgId,
        animationKey: key,
        result,
        elapsed,
      })
      return
    }

    diceMessageLog('schedule stop', {
      messageId: props.message.id,
      customMsgId: props.message.customMsgId,
      animationKey: key,
      result,
      stopDelay: remainingDelay,
    })
    stopTimer = window.setTimeout(() => {
      state.stopped = true
      visibleResult.value = result
      stopTimer = null
      diceMessageLog('stopped', {
        messageId: props.message.id,
        customMsgId: props.message.customMsgId,
        animationKey: key,
        result,
      })
    }, remainingDelay)
  }
}, { immediate: true })

onMounted(() => {
  const key = animationKey.value
  diceMessageLog('mounted', {
    messageId: props.message.id,
    customMsgId: props.message.customMsgId,
    animationKey: key,
    rawContent: String(props.message.content ?? ''),
    result: diceResult.value,
    visibleResult: visibleResult.value,
    existingState: diceAnimationStateSnapshot(key),
  })
})

onBeforeUnmount(() => {
  const key = animationKey.value
  diceMessageLog('before unmount', {
    messageId: props.message.id,
    customMsgId: props.message.customMsgId,
    animationKey: key,
    result: diceResult.value,
    visibleResult: visibleResult.value,
    hasStopTimer: Boolean(stopTimer),
    existingState: diceAnimationStateSnapshot(key),
  })
  if (stopTimer) window.clearTimeout(stopTimer)
})

const diceImage = computed(() => diceImages[visibleResult.value] || touziGif)
</script>

<template>
  <div class="dice-message">
    <div class="content">
      <img :src="diceImage" alt="" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.dice-message {
  position: relative;
  padding: 10px 75px 15px 10px;
  border-radius: 10px;
  border-top-left-radius: 0;

  .content {
    height: 40px;
  }

  img {
    display: block;
    height: 40px;
  }
}
</style>
