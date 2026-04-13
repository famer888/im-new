<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { useVirtualScroll } from '@/composables/useVirtualScroll'
import { type Message } from '@/stores/useMessageStore'
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
const messagesRef = computed(() => props.messages)

const { visibleItems, totalHeight, offsetTop, scrollToBottom, updateItemHeight } =
  useVirtualScroll({
    items: messagesRef,
    estimatedItemHeight: 60,
    bufferSize: 5,
    containerRef,
    getItemKey: (msg: Message) => msg.id,
  })

const isAtBottom = ref(true)
const lastMessageId = ref<string>('')

const unreadDividerIndex = computed(() => {
  if (!props.unreadCount || props.unreadCount <= 0) return -1
  return props.messages.length - props.unreadCount
})

async function pinToLatest() {
  await nextTick()
  // 第一阶段：走虚拟列表内置滚动
  scrollToBottom(true)
  // 第二阶段：等待高度回流后再强制兜底一次，避免最后一条被输入区遮住
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
}

watch(
  () => props.messages.length,
  async () => {
    const list = props.messages
    const latestId = list.length > 0 ? list[list.length - 1].id : ''
    const prevLatestId = lastMessageId.value
    lastMessageId.value = latestId

    // 仅在“新增尾部消息”时强制置底，避免上滑加载历史时被拉回底部
    const appendedNewMessage = !!latestId && latestId !== prevLatestId
    if (appendedNewMessage) {
      await pinToLatest()
    }
  },
)

onMounted(() => {
  const list = props.messages
  lastMessageId.value = list.length > 0 ? list[list.length - 1].id : ''
  scrollToBottom()
})

function handleItemResize(key: string, height: number) {
  updateItemHeight(key, height)
  // 新消息高度变化（文本换行、状态文案出现）后，保持底部对齐
  if (isAtBottom.value) {
    void pinToLatest()
  }
}
</script>

<template>
  <div ref="containerRef" class="message-list" @scroll="handleScroll">
    <div v-if="loading" class="loading-indicator">
      <span>{{ $t('加载中...') }}</span>
    </div>

    <div class="scroll-content" :style="{ height: totalHeight + 'px', position: 'relative' }">
      <div :style="{ transform: `translateY(${offsetTop}px)` }">
        <template v-for="({ item, key }, idx) in visibleItems" :key="key">
          <!-- 未读分隔线 -->
          <div
            v-if="unreadDividerIndex >= 0 && messages.indexOf(item) === unreadDividerIndex"
            class="unread-divider"
          >
            <span>{{ $t('以下为未读消息') }}</span>
          </div>
          <MessageItem
            :message="item"
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
</template>

<style lang="scss" scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
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

  &:hover { background: #f0f7ff; }
}
</style>
