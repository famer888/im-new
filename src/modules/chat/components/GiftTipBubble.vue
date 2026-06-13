<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import giftRewardCoinIcon from '@/assets/images/gift-reward-coin.svg'

export interface GiftTipItem {
  /** 父组件已把 2217 协议字段转换成旧 im 气泡需要的展示文本。 */
  fromUid?: string | number
  userName?: string
  actionText: string
  displayAmount: string
}

interface VisibleGiftTipItem extends GiftTipItem {
  /** 本地自增 id 只用于 TransitionGroup 动画和定时器索引，不对应服务端消息。 */
  id: number
  leaving: boolean
}

const props = defineProps<{
  tips: GiftTipItem[]
}>()

const MAX_VISIBLE = 3
// 与旧 im 保持同一节奏：停留 3.2s，再播放 420ms 退出动画。
const DISPLAY_MS = 3200
const LEAVE_MS = 420

let giftTipId = 0
const visibleItems = ref<VisibleGiftTipItem[]>([])
// 每条气泡有独立离场和移除定时器，避免高频打赏时旧定时器误删新气泡。
const timers = new Map<number, { leave: ReturnType<typeof window.setTimeout>; remove: ReturnType<typeof window.setTimeout> }>()

function clearItemTimer(id: number) {
  const itemTimers = timers.get(id)
  if (!itemTimers) return
  window.clearTimeout(itemTimers.leave)
  window.clearTimeout(itemTimers.remove)
  timers.delete(id)
}

function scheduleRemove(id: number) {
  clearItemTimer(id)

  // 先标记 leaving 播放退出动画，再延迟从列表移除，避免气泡突然消失。
  const leave = window.setTimeout(() => {
    const target = visibleItems.value.find((item) => item.id === id)
    if (target) target.leaving = true
  }, DISPLAY_MS)

  const remove = window.setTimeout(() => {
    visibleItems.value = visibleItems.value.filter((item) => item.id !== id)
    timers.delete(id)
  }, DISPLAY_MS + LEAVE_MS)

  timers.set(id, { leave, remove })
}

function enqueue(tip: GiftTipItem) {
  const id = ++giftTipId
  const item: VisibleGiftTipItem = {
    id,
    fromUid: tip.fromUid,
    userName: tip.userName || String(tip.fromUid || ''),
    actionText: tip.actionText,
    displayAmount: tip.displayAmount,
    leaving: false,
  }

  // 旧 im 只保留最近 3 条临时打赏提示，超出的旧提示立即出队。
  const dropped = [...visibleItems.value, item].slice(0, -MAX_VISIBLE)
  for (const oldItem of dropped) clearItemTimer(oldItem.id)
  visibleItems.value = [...visibleItems.value, item].slice(-MAX_VISIBLE)
  scheduleRemove(id)
}

watch(
  () => props.tips.length,
  (length, oldLength) => {
    // 父组件只追加 tips；这里只消费最新一条，避免重复渲染历史提示。
    if (!length || length <= oldLength) return
    const latest = props.tips[length - 1]
    if (latest) enqueue(latest)
  },
)

onBeforeUnmount(() => {
  for (const id of timers.keys()) clearItemTimer(id)
})
</script>

<template>
  <div v-if="visibleItems.length" class="gift-tip-bubble-layer">
    <TransitionGroup name="gift-tip" tag="div" class="gift-tip-list">
      <div
        v-for="item in visibleItems"
        :key="item.id"
        class="gift-tip-item"
        :class="{ leaving: item.leaving }"
      >
        <div class="gift-tip-content">
          <div class="gift-tip-text">
            <span class="gift-tip-name">{{ item.userName }}</span>
            <span class="gift-tip-action">{{ item.actionText }}</span>
          </div>
          <div class="gift-tip-reward">
            <img class="gift-tip-icon" :src="giftRewardCoinIcon" alt="" />
            <span class="gift-tip-amount">{{ item.displayAmount }}</span>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
.gift-tip-bubble-layer {
  position: absolute;
  right: 16px;
  bottom: 200px;
  z-index: 200;
  pointer-events: none;
}

.gift-tip-list {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.gift-tip-item {
  animation: gift-tip-enter 0.55s cubic-bezier(0.22, 1.12, 0.36, 1) both;
  transform-origin: right center;

  &.leaving {
    animation: gift-tip-leave 0.42s cubic-bezier(0.4, 0, 1, 1) forwards;
  }
}

.gift-tip-content {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  max-width: 280px;
  height: 34px;
  padding: 4px 12px;
  border-radius: 100px;
  background: rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.gift-tip-text {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  min-width: 0;
  height: 26px;
  gap: 0;
  overflow: hidden;
}

.gift-tip-reward {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
}

.gift-tip-name {
  height: 14px;
  color: #fff;
  font-size: 12px;
  font-weight: 400;
  line-height: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gift-tip-action {
  height: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 10px;
  font-weight: 400;
  line-height: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gift-tip-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.gift-tip-amount {
  flex-shrink: 0;
  height: 18px;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  font-style: italic;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}

.gift-tip-enter-active,
.gift-tip-leave-active,
.gift-tip-move {
  transition: transform 0.35s ease, opacity 0.35s ease;
}

.gift-tip-enter-from {
  opacity: 0;
  transform: translateX(120%);
}

.gift-tip-leave-to {
  opacity: 0;
  transform: translateX(40px) translateY(-16px);
}

@keyframes gift-tip-enter {
  0% {
    opacity: 0;
    transform: translateX(120%) scale(0.92);
  }

  65% {
    opacity: 1;
    transform: translateX(-6px) scale(1.02);
  }

  100% {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes gift-tip-leave {
  0% {
    opacity: 1;
    transform: translateX(0) translateY(0) scale(1);
  }

  100% {
    opacity: 0;
    transform: translateX(24px) translateY(-18px) scale(0.92);
  }
}
</style>
