<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useSearchStore } from '@/stores/useSearchStore'
import { attachDateSeparators, type MessageListEntry } from '@/utils/chatMessageDate'
import MessageItem from './MessageItem.vue'
import readBurnBackUrl from '@/assets/images/chat/read-burn-back.png'

const props = withDefaults(defineProps<{
  /** 切换会话时用于重置滚动（避免沿用上一会话的 scrollTop / 未触发 length 监听） */
  conversationId?: string
  messages: Message[]
  loading: boolean
  hasMore: boolean
  unreadCount?: number
  /** 对齐旧 im：少量消息从顶部开始排列，不做吸底留白 */
  alignTop?: boolean
  /** 仅在好友开启阅后即焚时显示中间背景图 */
  showReadBurnBackground?: boolean
}>(), {
  showReadBurnBackground: false,
})

const emit = defineEmits<{
  (e: 'load-more'): void
}>()

const { t, locale } = useI18n()
const messageStore = useMessageStore()
const authStore = useAuthStore()
const searchStore = useSearchStore()

const containerRef = ref<HTMLElement | null>(null)
const floatDateRef = ref<HTMLElement | null>(null)

/** 与旧 im 列表一致：按发送时间升序，再算「自然日」分隔 */
const sortedMessages = computed(() =>
  [...props.messages].sort((a, b) => a.sendTime - b.sendTime),
)

const entriesWithDate = computed(() =>
  attachDateSeparators(sortedMessages.value, t, locale.value),
)

/** 用户点击「未读消息」条后隐藏（对齐旧 im 点击消失） */
const unreadBannerDismissed = ref(false)

watch(
  () => props.conversationId,
  () => {
    unreadBannerDismissed.value = false
  },
)

/** 实际用于分隔线逻辑：父组件快照未读数，可被点击清除 */
const effectiveUnreadCount = computed(() => {
  if (unreadBannerDismissed.value) return 0
  return props.unreadCount ?? 0
})

/** 首条未读在排序列表中的下标（升序：末尾 N 条为未读区） */
const unreadDividerIndex = computed(() => {
  const n = effectiveUnreadCount.value
  if (n <= 0) return -1
  const len = sortedMessages.value.length
  if (len === 0) return -1
  return Math.max(0, len - n)
})

/**
 * 将「未读消息」条作为独立行，避免插在气泡旁影响整体消息流。
 */
type ChatListRow =
  | { kind: 'unread'; key: string }
  | { kind: 'msg'; entry: MessageListEntry }

const rowsForList = computed((): ChatListRow[] => {
  const entries = entriesWithDate.value
  const divIdx = unreadDividerIndex.value
  const rows: ChatListRow[] = []
  for (let i = 0; i < entries.length; i++) {
    if (divIdx >= 0 && i === divIdx) {
      rows.push({ kind: 'unread', key: `unread-${i}` })
    }
    rows.push({ kind: 'msg', entry: entries[i] })
  }
  return rows
})

/** 与旧 im `floatDate` / `floatDateVisible`：滚动时顶部固定提示当前所处日期 */
const floatDate = ref('')
const floatDateVisible = ref(false)
let floatHideTimer: ReturnType<typeof setTimeout> | null = null

function hasInlineDateBannerNearFloat(text: string): boolean {
  const container = containerRef.value
  const floatNode = floatDateRef.value
  if (!container || !floatNode || !text) return false

  const floatRect = floatNode.getBoundingClientRect()
  const inlineBanners = container.querySelectorAll<HTMLElement>('.message-item .showtimeDay')
  for (const banner of inlineBanners) {
    if ((banner.textContent || '').trim() !== text) continue
    const rect = banner.getBoundingClientRect()
    const isVisible = rect.bottom > 0 && rect.top < window.innerHeight
    if (isVisible && Math.abs(rect.top - floatRect.top) < 64) {
      return true
    }
  }
  return false
}

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

  const rowNodes = container.querySelectorAll<HTMLElement>('.message-row[data-show-time-day]')
  for (const rowNode of rowNodes) {
    const topTipsH = 32
    const offsetTop = rowNode.offsetTop
    const height = rowNode.offsetHeight
    if (
      currentScrollTop >= offsetTop - 32 &&
      currentScrollTop <= offsetTop - topTipsH + height
    ) {
      const text = rowNode.dataset.showTimeDay || ''
      floatDate.value = text
      floatDateVisible.value = !hasInlineDateBannerNearFloat(text)
      break
    }
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
/** 进入会话 / 首屏加载：吸底；用户上滑看历史后为 false，避免加载更多后跳回底部 */
const stickToBottom = ref(true)
const lastMessageId = ref<string>('')
let scrollAnimationTimer: ReturnType<typeof setTimeout> | null = null
let isProgrammaticScroll = false

function getBottomScrollTop(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight)
}

function setBottomState(el: HTMLElement) {
  const gap = el.scrollHeight - el.scrollTop - el.clientHeight
  isAtBottom.value = gap < 50
  stickToBottom.value = gap < 40
}

function cancelScrollAnimation() {
  if (scrollAnimationTimer) {
    clearTimeout(scrollAnimationTimer)
    scrollAnimationTimer = null
  }
  isProgrammaticScroll = false
}

function scrollToBottomImmediate() {
  const el = containerRef.value
  if (!el) return
  cancelScrollAnimation()
  isProgrammaticScroll = true
  el.scrollTop = getBottomScrollTop(el)
  setBottomState(el)
  requestAnimationFrame(() => {
    isProgrammaticScroll = false
  })
}

function scrollToBottomAnimated(steps = 12) {
  const el = containerRef.value
  if (!el) return
  cancelScrollAnimation()
  isProgrammaticScroll = true

  const tick = (remaining: number) => {
    const node = containerRef.value
    if (!node) {
      isProgrammaticScroll = false
      return
    }
    const target = getBottomScrollTop(node)
    const delta = (target - node.scrollTop) / remaining
    node.scrollTop += delta
    if (remaining > 1) {
      scrollAnimationTimer = setTimeout(() => tick(remaining - 1), 15)
    } else {
      node.scrollTop = getBottomScrollTop(node)
      setBottomState(node)
      scrollAnimationTimer = null
      isProgrammaticScroll = false
    }
  }

  tick(Math.max(1, steps))
}

/** 用容器真实 scrollHeight 多次对齐底部，抵消虚拟列表首屏估算高度偏小导致的「停在顶部空白」 */
async function flushScrollToBottom() {
  await nextTick()
  scrollToBottomImmediate()
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  scrollToBottomImmediate()
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  scrollToBottomImmediate()
}

/** 有未读时优先滚到「未读消息」条，便于看到分割交互（与旧 im 一致） */
async function scrollUnreadBannerIntoView() {
  const divIdx = unreadDividerIndex.value
  if (divIdx < 0) {
    await flushScrollToBottom()
    return
  }
  await nextTick()
  scrollToRow(`unread-${divIdx}`)
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  const el = containerRef.value
  if (el) {
    el.scrollTop = Math.max(0, el.scrollTop - 20)
  }
  stickToBottom.value = false
}

async function pinToLatest(smooth = true) {
  await nextTick()
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (smooth) {
        scrollToBottomAnimated(12)
      } else {
        scrollToBottomImmediate()
      }
    })
  })
}

function handleScroll() {
  if (!containerRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = containerRef.value
  const gap = scrollHeight - scrollTop - clientHeight
  isAtBottom.value = gap < 50
  if (!isProgrammaticScroll) {
    if (gap > 100) {
      stickToBottom.value = false
    } else if (gap < 40) {
      stickToBottom.value = true
    }
  }

  if (scrollTop < 100 && props.hasMore && !props.loading) {
    emit('load-more')
  }

  setTimeDayMsgThrottled()
}

watch(
  () => props.conversationId,
  async () => {
    await nextTick()
    lastMessageId.value = ''
    stickToBottom.value = true
    const list = sortedMessages.value
    lastMessageId.value = list.length > 0 ? list[list.length - 1].id : ''
    if (effectiveUnreadCount.value > 0 && unreadDividerIndex.value >= 0) {
      await scrollUnreadBannerIntoView()
    } else {
      await flushScrollToBottom()
    }
  },
  { immediate: true },
)

watch(
  () => props.loading,
  async (loading) => {
    if (loading) return
    if (props.messages.length === 0) return
    const hasUnread = effectiveUnreadCount.value > 0 && unreadDividerIndex.value >= 0
    if (hasUnread) {
      await scrollUnreadBannerIntoView()
      return
    }
    if (!stickToBottom.value) return
    await flushScrollToBottom()
  },
)

/** 父组件补写未读快照时，补滚到未读条 */
watch(
  () => props.unreadCount,
  async (n, prev) => {
    if (n === prev) return
    if (props.loading || props.messages.length === 0) return
    if ((n ?? 0) <= 0 || unreadBannerDismissed.value) return
    if (unreadDividerIndex.value < 0) return
    await scrollUnreadBannerIntoView()
  },
)

watch(
  () => props.messages.length,
  async () => {
    const list = sortedMessages.value
    const latestId = list.length > 0 ? list[list.length - 1].id : ''
    const prevLatestId = lastMessageId.value
    lastMessageId.value = latestId

    const appendedNewMessage = !!latestId && latestId !== prevLatestId
    if (appendedNewMessage && stickToBottom.value) {
      await pinToLatest()
    }
  },
)

onMounted(async () => {
  const list = sortedMessages.value
  lastMessageId.value = list.length > 0 ? list[list.length - 1].id : ''
  stickToBottom.value = true
  if (list.length > 0) {
    if (effectiveUnreadCount.value > 0 && unreadDividerIndex.value >= 0) {
      await scrollUnreadBannerIntoView()
    } else {
      await flushScrollToBottom()
    }
  }
})

function onClickScrollToLatest() {
  stickToBottom.value = true
  void pinToLatest(true)
}

onUnmounted(() => {
  if (floatHideTimer) clearTimeout(floatHideTimer)
  if (throttleTimer) clearTimeout(throttleTimer)
  cancelScrollAnimation()
})

/**
 * 与 im `chat-msg-list` 监听 `chatMsgListSearchScrollTo` → `handleMoveToId` + `handleHighlightedSet` 一致。
 */
watch(
  () => searchStore.chatMsgListSearchScrollRequest,
  async (req) => {
    const convId = props.conversationId
    if (!req || !convId || req.conversationId !== convId) return
    const rid = req.requestId
    const uid = authStore.uid
    if (!uid) {
      searchStore.clearChatMsgListSearchScrollRequest()
      return
    }

    stickToBottom.value = false

    for (let i = 0; i < 100; i++) {
      if (messageStore.getMessages(convId).length > 0) break
      if (!messageStore.isLoading(convId)) break
      await new Promise<void>((r) => setTimeout(r, 40))
    }

    const findInList = () =>
      messageStore.getMessages(convId).find(
        (m) =>
          m.id === req.messageId ||
          (req.customMsgId != null && String(m.customMsgId) === String(req.customMsgId)),
      )

    let found = findInList()
    let guard = 0
    while (!found && messageStore.hasMore(convId) && guard < 60) {
      guard += 1
      await messageStore.loadOlderMessages(uid, convId)
      if (searchStore.chatMsgListSearchScrollRequest?.requestId !== rid) return
      found = findInList()
    }

    await nextTick()
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    if (searchStore.chatMsgListSearchScrollRequest?.requestId !== rid) return

    if (found) {
      for (let i = 0; i < 4; i++) {
        scrollToRow(req.messageId)
        await nextTick()
        await new Promise<void>((r) => requestAnimationFrame(() => r()))
      }
      const el = containerRef.value
      if (el) {
        el.scrollTop = Math.max(0, el.scrollTop - 50)
      }
      searchStore.setSearchMessageHighlight(req.messageId)
    }

    if (searchStore.chatMsgListSearchScrollRequest?.requestId === rid) {
      searchStore.clearChatMsgListSearchScrollRequest()
    }
  },
)

function handleItemResize(messageId: string, height: number) {
  void messageId
  void height
  if (stickToBottom.value || isAtBottom.value) {
    void pinToLatest(false)
  }
}

function scrollToRow(key: string) {
  const container = containerRef.value
  if (!container) return
  const rows = Array.from(container.querySelectorAll<HTMLElement>('.message-row'))
  const target = rows.find((row) => row.dataset.rowKey === key)
  if (target) {
    container.scrollTop = target.offsetTop
  }
}

/** 点击「未读消息」条后隐藏，并吸底避免虚拟列表少一行后视口错位 */
function onUnreadBannerClick() {
  unreadBannerDismissed.value = true
  stickToBottom.value = true
  void nextTick(() => {
    void flushScrollToBottom()
  })
}
</script>

<template>
  <!-- 与旧 im `#chatMsgList > section`：浮动日期在滚动区外顶层，列表在下方绝对铺满 -->
  <div class="message-list-shell">
    <p ref="floatDateRef" class="float-date showtimeDay" :class="{ 'day-show': floatDateVisible }">
      {{ floatDate }}
    </p>
    <img
      v-if="showReadBurnBackground"
      class="read-burn-background"
      :src="readBurnBackUrl"
      alt=""
    />

    <div
      ref="containerRef"
      class="message-list"
      @scroll="handleScroll"
      @wheel.passive="cancelScrollAnimation"
      @touchstart.passive="cancelScrollAnimation"
    >
      <div v-if="loading" class="loading-indicator">
        <span>{{ $t('加载中...') }}</span>
      </div>

      <div class="scroll-content" :class="{ 'align-top': alignTop }">
        <template
          v-for="row in rowsForList"
          :key="row.kind === 'unread' ? row.key : row.entry.message.id"
        >
          <div
            v-if="row.kind === 'unread'"
            class="message-row unread-divider"
            :data-row-key="row.key"
            role="button"
            tabindex="0"
            @click.stop="onUnreadBannerClick"
            @keydown.enter.prevent="onUnreadBannerClick"
          >
            <span class="unread-divider-label">{{ $t('未读消息') }}</span>
          </div>
          <div
            v-else
            class="message-row"
            :data-row-key="row.entry.message.id"
            :data-show-time-day="row.entry.showTimeDay"
          >
            <MessageItem
              :message="row.entry.message"
              :date-banner-text="row.entry.showTime ? row.entry.showTimeDay : null"
              @resize="(h: number) => handleItemResize(row.entry.message.id, h)"
            />
          </div>
        </template>
      </div>

      <button
        v-if="!isAtBottom"
        class="scroll-bottom-btn"
        type="button"
        @click="onClickScrollToLatest"
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
  background: #f6f6f6;
}

.read-burn-background {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  height: 176px;
  z-index: 1;
  opacity: 0.1;
  pointer-events: none;
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
  background: transparent;
  z-index: 2;
}

.scroll-content {
  min-height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  box-sizing: border-box;
}

.scroll-content.align-top {
  justify-content: flex-start;
}

.message-row {
  flex: 0 0 auto;
}

.loading-indicator {
  text-align: center;
  padding: 12px;
  color: #999;
  font-size: 12px;
}

/* 与旧 im / 参考稿：整行浅灰底，居中蓝字；可点击关闭 */
.unread-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 16px 12px;
  margin: 0;
  background: #eee;
  cursor: pointer;
  user-select: none;

  &:hover {
    filter: brightness(0.97);
  }

  .unread-divider-label {
    font-size: 14px;
    font-weight: bold;
    color: #2273ad;
    white-space: nowrap;
    pointer-events: none;
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
