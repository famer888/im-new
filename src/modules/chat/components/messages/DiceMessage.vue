<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
const visibleResult = ref(0)
let stopTimer: ReturnType<typeof window.setTimeout> | null = null

const diceResult = computed(() => {
  const raw = String(props.message.content ?? '').trim()
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw)
    const value = Number(
      parsed.currentImage ??
      parsed.current_image ??
      parsed.result ??
      parsed.value ??
      0,
    )
    return Number.isFinite(value) ? value : 0
  } catch {
    const value = Number(raw.split('||')[0] || 0)
    return Number.isFinite(value) ? value : 0
  }
})

watch(diceResult, (result) => {
  if (stopTimer) {
    window.clearTimeout(stopTimer)
    stopTimer = null
  }

  visibleResult.value = 0
  if (result >= 1 && result <= 6) {
    stopTimer = window.setTimeout(() => {
      visibleResult.value = result
      stopTimer = null
    }, 1000)
  }
}, { immediate: true })

onBeforeUnmount(() => {
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
