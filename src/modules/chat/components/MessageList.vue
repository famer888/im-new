<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useVirtualScroll } from '@/composables/useVirtualScroll'
import { type Message } from '@/stores/useMessageStore'
import { attachDateSeparators, type MessageListEntry } from '@/utils/chatMessageDate'
import MessageItem from './MessageItem.vue'

const props = defineProps<{
  messages: Message[]
  loading: boolean
  hasMore: boolean
  unreadCount?: number
}>()

const emit = defineEmits<{
  (e: 'load-more'): void
}>()

const containerRef = ref<HTMLElement | null>(null)

/** 与旧 im 列表一致：按发送时间升序，再算「自然日」分隔 */
const sortedMessages = computed(() =>
  [...props.messages].sort((a, b) => a.sendTime - b.sendTime),
)

const entriesWithDate = computed(() => attachDateSeparators(sortedMessages.value))

const { visibleItems, totalHeight, offsetTop, scrollToBottom, updateItemHeight, indexAtScrollTop } =
  useVirtualScroll<MessageListEntry>({
    items: entriesWithDate,
    estimatedItemHeight: 72,
    bufferSize: 5,
    containerRef,
    getItemKey: (entry) => entry.message.id,
  })

/** 与旧 im `floatDate` / `floatDateVisible`：滚动时顶部固定提示当前所处日期 */
const floatDate = ref('')
const floatDateVisible = ref(false)
let floatHideTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 与 `im/chat-msg-list/index.vue::setTimeDayMsg` 一致：
 * scrollTop&lt;100 隐藏；否则取当前滚动位置对应消息的 `showTimeDay`；1s 后淡出。
 */
function setTimeDayMsg() {
  const container = containerRef.value
  if (!container) return
  const currentScrollTop = container.scrollTop
  if (currentScrollTop < 100) {
    floatDateVisible.value = false
    if (floatHideTimer) {
      clearTimeout(floatHideTimer)
      floatHideTimer = null
    }
    return
  }

  const idx = indexAtScrollTop(currentScrollTop)
  const row = entriesWithDate.value[idx]
  if (row) {
    floatDate.value = row.showTimeDay
    floatDateVisible.value = true
  }

  if (floatHideTimer) clearTimeout(floatHideTimer)
  floatHideTimer = setTimeout(() => {
    floatDateVisible.value = false
    floatHideTimer = null
  }, 1000)
}

let throttleTimer: ReturnType<typeof setTimeout> | null = null
let lastThrottleRun = 0
function setTimeDayMsgThrottled() {
  const now = Date.now()
  const wait = 300
  if (now - lastThrottleRun >= wait) {
    lastThrottleRun = now
    setTimeDayMsg()
    return
  }
  if (throttleTimer) clearTimeout(throttleTimer)
  throttleTimer = setTimeout(() => {
    throttleTimer = null
    lastThrottleRun = Date.now()
    setTimeDayMsg()
  }, wait - (now - lastThrottleRun))
}

const isAtBottom = ref(true)
const lastMessageId = ref<string>('')

const unreadDividerIndex = computed(() => {
  if (!props.unreadCount || props.unreadCount <= 0) return -1
  return sortedMessages.value.length - props.unreadCount
})

async function pinToLatest() {
  await nextTick()
  scrollToBottom(true)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = containerRef.value
      if (!el) return
      el.scrollTop = el.scrollHeight
      isAtBottom.value = true
    })
  })
}

function handleScroll() {
  if (!containerRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = containerRef.value
  isAtBottom.value = scrollHeight - scrollTop - clientHeight < 50

  if (scrollTop < 100 && props.hasMore && !props.loading) {
    emit('load-more')
  }

  setTimeDayMsgThrottled()
}

watch(
  () => props.messages.length,
  async () => {
    const list = sortedMessages.value
    const latestId = list.length > 0 ? list[list.length - 1].id : ''
    const prevLatestId = lastMessageId.value
    lastMessageId.value = latestId

    const appendedNewMessage = !!latestId && latestId !== prevLatestId
    if (appendedNewMessage) {
      await pinToLatest()
    }
  },
)

onMounted(() => {
  const list = sortedMessages.value
  lastMessageId.value = list.length > 0 ? list[list.length - 1].id : ''
  scrollToBottom()
})

onUnmounted(() => {
  if (floatHideTimer) clearTimeout(floatHideTimer)
  if (throttleTimer) clearTimeout(throttleTimer)
})

function handleItemResize(key: string, height: number) {
  updateItemHeight(key, height)
  if (isAtBottom.value) {
    void pinToLatest()
  }
}
</script>

<template>
  <!-- 与旧 im `#chatMsgList > section`：浮动日期在滚动区外顶层，列表在下方绝对铺满 -->
  <div class="message-list-shell">
    <p class="float-date showtimeDay" :class="{ 'day-show': floatDateVisible }">
      {{ floatDate }}
    </p>

    <div ref="containerRef" class="message-list" @scroll="handleScroll">
      <div v-if="loading" class="loading-indicator">
        <span>{{ $t('加载中...') }}</span>
      </div>

      <div class="scroll-content" :style="{ height: totalHeight + 'px', position: 'relative' }">
        <div :style="{ transform: `translateY(${offsetTop}px)` }">
          <template v-for="{ item, key, index } in visibleItems" :key="key">
            <div
              v-if="unreadDividerIndex >= 0 && index === unreadDividerIndex"
              class="unread-divider"
            >
              <span>{{ $t('以下为未读消息') }}</span>
            </div>
            <MessageItem
              :message="item.message"
              :date-banner-text="item.showTime ? item.showTimeDay : null"
              @resize="(h: number) => handleItemResize(key, h)"
            />
          </template>
        </div>
      </div>

      <button
        v-if="!isAtBottom"
        class="scroll-bottom-btn"
        @click="scrollToBottom(true)"
      >
        ↓ {{ $t('最新消息') }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.message-list-shell {
  flex: 1;
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 与旧 im `chat-msg-list/index.vue` 全局 `.showtimeDay`（浮动条）一致 */
.float-date {
  position: absolute;
  top: 32px;
  left: 50%;
  z-index: 10;
  transform: translateX(-50%);
  margin-left: -8px;
  background-color: rgba(0, 0, 0, 0.2);
  color: white;
  font-size: 12px;
  padding: 0.5em;
  text-align: center;
  line-height: 1em;
  height: auto;
  border-radius: 5px;
  opacity: 0;
  transition: opacity 0.5s;
  pointer-events: none;

  &.day-show {
    opacity: 1;
  }
}

.message-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  min-height: 0;
  contain: strict;
  background: #f6f6f6;
}

.loading-indicator {
  text-align: center;
  padding: 12px;
  color: #999;
  font-size: 12px;
}

.unread-divider {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  gap: 12px;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #f44e5a;
    opacity: 0.4;
  }

  span {
    font-size: 12px;
    color: #f44e5a;
    white-space: nowrap;
  }
}

.scroll-bottom-btn {
  position: absolute;
  bottom: 16px;
  right: 16px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 20px;
  padding: 6px 16px;
  font-size: 12px;
  color: #3369fe;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;

  &:hover {
    background: #f0f7ff;
  }
}
</style>
