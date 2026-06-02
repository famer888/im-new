<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useSearchStore } from '@/stores/useSearchStore'
import { attachDateSeparators, type MessageListEntry } from '@/utils/chatMessageDate'
import { isMessageEligibleForUnreadAnchor, isMessageVisibleInTimeline } from '@/utils/chatUnreadVisibility'
import MessageItem from './MessageItem.vue'
import readBurnBackUrl from '@/assets/images/chat/read-burn-back.png'

const props = withDefaults(defineProps<{
  /** 切换会话时用于重置滚动（避免沿用上一会话的 scrollTop / 未触发 length 监听） */
  conversationId?: string
  messages: Message[]
  loading: boolean
  hasMore: boolean
  unreadCount?: number
  unreadMessageIds?: string[]
  /** 对齐旧 im：少量消息从顶部开始排列，不做吸底留白 */
  alignTop?: boolean
  /** 仅在好友开启阅后即焚时显示中间背景图 */
  showReadBurnBackground?: boolean
}>(), {
  showReadBurnBackground: false,
})

const emit = defineEmits<{
  (e: 'load-more'): void
  (e: 'open-group-notice', payload: { message: Message }): void
}>()

const { t, locale } = useI18n()
const messageStore = useMessageStore()
const authStore = useAuthStore()
const searchStore = useSearchStore()

const containerRef = ref<HTMLElement | null>(null)
const floatDateRef = ref<HTMLElement | null>(null)

function ensureMessagesAscending(messages: Message[]): Message[] {
  for (let i = 1; i < messages.length; i++) {
    if (messages[i - 1].sendTime > messages[i].sendTime) {
      return messages.slice().sort((a, b) => a.sendTime - b.sendTime)
    }
  }
  return messages
}

/** 与旧 im 列表一致：按发送时间升序，再算「自然日」分隔 */
const sortedMessages = computed(() =>
  ensureMessagesAscending(
    props.messages.filter((message) => isMessageVisibleInTimeline(
      props.conversationId,
      message,
      String(authStore.uid || ''),
    )),
  ),
)

const entriesWithDate = computed(() =>
  attachDateSeparators(sortedMessages.value, t, locale.value),
)

/** 用户点击「未读消息」条后隐藏（对齐旧 im 点击消失） */
const unreadBannerDismissed = ref(false)
/** 右侧未读数量浮层独立隐藏：点击跳转后保留中间分隔条，行为对齐旧 im 的 initialUnreadCount。 */
const unreadFloatDismissed = ref(false)

watch(
  () => props.conversationId,
  () => {
    unreadBannerDismissed.value = false
    unreadFloatDismissed.value = false
  },
)

/** 实际用于分隔线逻辑：父组件快照未读数，可被点击清除 */
const effectiveUnreadCount = computed(() => {
  if (unreadBannerDismissed.value) return 0
  return props.unreadCount ?? 0
})

const unreadMessageIdSet = computed(() => new Set(
  (props.unreadMessageIds ?? []).map((id) => String(id || '')).filter(Boolean),
))

const unreadFloatCount = computed(() => {
  if (unreadFloatDismissed.value) return 0
  return Math.max(0, Number(effectiveUnreadCount.value || 0))
})

const unreadFloatCountText = computed(() =>
  unreadFloatCount.value > 99 ? '99+' : String(unreadFloatCount.value),
)

/**
 * 对齐旧 im：未读分隔条必须锚到一条真实消息（旧逻辑用 unreadID/unreadMsgID）。
 * 只凭 unreadCount 反推位置会在消息未加载/未落库时误显示一条孤立的「未读消息」。
 */
const unreadDividerIndex = computed(() => {
  if (effectiveUnreadCount.value <= 0) return -1
  const ids = unreadMessageIdSet.value
  if (ids.size === 0) return -1
  return sortedMessages.value.findIndex((message) =>
    isMessageEligibleForUnreadAnchor(props.conversationId, message, String(authStore.uid || ''))
    && (ids.has(String(message.id || '')) || ids.has(String(message.customMsgId || ''))),
  )
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

function messageRenderKey(message: Message): string {
  return String(message.customMsgId || message.id)
}

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
const newMessageCount = ref(0)
const latestNewMessageKey = ref('')
let scrollAnimationTimer: ReturnType<typeof setTimeout> | null = null
let isProgrammaticScroll = false
let resizePinRaf: number | null = null
let topAutoLoadArmed = true

function getBottomScrollTop(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight)
}

function setBottomState(el: HTMLElement) {
  const gap = el.scrollHeight - el.scrollTop - el.clientHeight
  isAtBottom.value = gap < 50
  stickToBottom.value = gap < 40
  if (isAtBottom.value) {
    clearNewMessageTip()
  }
}

function isVisibleIncomingMessage(message: Message): boolean {
  return !message.isDeleted && message.senderId !== authStore.uid
}

function clearNewMessageTip() {
  newMessageCount.value = 0
  latestNewMessageKey.value = ''
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
  if (isAtBottom.value) {
    clearNewMessageTip()
  }
  if (!isProgrammaticScroll) {
    if (gap > 100) {
      stickToBottom.value = false
    } else if (gap < 40) {
      stickToBottom.value = true
    }
  }

  if (scrollTop > 140) {
    // 重新离开顶部后再允许下一次自动分页，避免在阈值附近反复触发导致“长期加载中”。
    topAutoLoadArmed = true
  }
  if (scrollTop < 100 && props.hasMore && !props.loading && topAutoLoadArmed) {
    // 顶部触发历史分页时，明确关闭吸底，避免分页结束后被 loading watcher 拉回底部。
    stickToBottom.value = false
    topAutoLoadArmed = false
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
    topAutoLoadArmed = true
    clearNewMessageTip()
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
    const latestMessage = list.length > 0 ? list[list.length - 1] : null
    const appendedSelfMessage = appendedNewMessage && latestMessage?.senderId === authStore.uid
    if (appendedNewMessage && (stickToBottom.value || appendedSelfMessage)) {
      clearNewMessageTip()
      await pinToLatest()
      return
    }

    if (appendedNewMessage && prevLatestId) {
      const prevIdx = list.findIndex((item) => item.id === prevLatestId)
      const appended = prevIdx >= 0 ? list.slice(prevIdx + 1) : [list[list.length - 1]]
      const visibleIncoming = appended.filter(isVisibleIncomingMessage)
      if (visibleIncoming.length > 0) {
        if (newMessageCount.value === 0) {
          latestNewMessageKey.value = messageRenderKey(visibleIncoming[0])
        }
        newMessageCount.value += visibleIncoming.length
      }
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
  clearNewMessageTip()
  void pinToLatest(true)
}

onUnmounted(() => {
  if (floatHideTimer) clearTimeout(floatHideTimer)
  if (throttleTimer) clearTimeout(throttleTimer)
  if (resizePinRaf !== null) cancelAnimationFrame(resizePinRaf)
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
      const targetMessageId = found.id || req.messageId
      for (let i = 0; i < 4; i++) {
        scrollToRow(targetMessageId)
        await nextTick()
        await new Promise<void>((r) => requestAnimationFrame(() => r()))
      }
      const el = containerRef.value
      if (el) {
        el.scrollTop = Math.max(0, el.scrollTop - 50)
      }
      searchStore.setSearchMessageHighlight(targetMessageId)
    }

    if (searchStore.chatMsgListSearchScrollRequest?.requestId === rid) {
      searchStore.clearChatMsgListSearchScrollRequest()
    }
  },
)

function handleItemResize(messageId: string, height: number) {
  void messageId
  void height
  if (!stickToBottom.value && !isAtBottom.value) return
  // 合并同一帧内大量消息的 ResizeObserver 回调，避免首屏渲染时重复触发吸底滚动。
  if (resizePinRaf !== null) return
  resizePinRaf = requestAnimationFrame(() => {
    resizePinRaf = null
    if (stickToBottom.value || isAtBottom.value) {
      void pinToLatest(false)
    }
  })
}

function scrollToRow(key: string) {
  const container = containerRef.value
  if (!container) return
  const rows = Array.from(container.querySelectorAll<HTMLElement>('.message-row'))
  const target = rows.find((row) =>
    row.dataset.rowKey === key || row.dataset.rowCustomKey === key,
  )
  if (target) {
    container.scrollTop = target.offsetTop
  }
}

/** 点击「未读消息」条后隐藏，并吸底避免虚拟列表少一行后视口错位 */
function onUnreadBannerClick() {
  unreadBannerDismissed.value = true
  unreadFloatDismissed.value = true
  stickToBottom.value = true
  void nextTick(() => {
    void flushScrollToBottom()
  })
}

/** 点击右侧未读数量浮层：跳到第一条未读锚点并隐藏浮层，保留分隔条供用户确认位置。 */
function onUnreadFloatClick() {
  const divIdx = unreadDividerIndex.value
  if (divIdx < 0) return
  unreadFloatDismissed.value = true
  stickToBottom.value = false
  void nextTick(() => {
    scrollToRow(`unread-${divIdx}`)
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
          :key="row.kind === 'unread' ? row.key : messageRenderKey(row.entry.message)"
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
            :data-row-custom-key="row.entry.message.customMsgId || ''"
            :data-show-time-day="row.entry.showTimeDay"
          >
            <MessageItem
              :message="row.entry.message"
              :date-banner-text="row.entry.showTime ? row.entry.showTimeDay : null"
              @resize="(h: number) => handleItemResize(row.entry.message.id, h)"
              @open-group-notice="emit('open-group-notice', $event)"
            />
          </div>
        </template>
      </div>

    </div>

    <button
      v-if="unreadFloatCount > 0"
      class="unread-float-btn"
      type="button"
      @mousedown.stop.prevent
      @click.stop="onUnreadFloatClick"
    >
      <span class="unread-float-icon" aria-hidden="true"></span>
      <span class="unread-float-count">{{ unreadFloatCountText }}</span>{{ $t('条未读消息') }}
    </button>

    <button
      v-if="!isAtBottom"
      class="scroll-bottom-btn"
      type="button"
      @mousedown.stop.prevent
      @click.stop="onClickScrollToLatest"
    >
      <span v-if="newMessageCount > 0" class="scroll-bottom-count">
        {{ newMessageCount > 99 ? '99+' : newMessageCount }}
      </span>
      <img src="@/assets/images/message/arrow-down.png" alt="" />
    </button>
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

.unread-float-btn {
  position: absolute;
  right: 0;
  top: 50%;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #e5e5e5;
  border-right: 0;
  border-radius: 16px 0 0 16px;
  background: #1681ef;
  color: #fff;
  font-size: 12px;
  line-height: 30px;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 10;
  display: flex;
  align-items: center;
  white-space: nowrap;

  &:hover {
    background: #327cc5;
  }
}

.unread-float-icon {
  position: relative;
  width: 14px;
  height: 12px;
  margin-right: 4px;
  flex: 0 0 auto;

  &::before,
  &::after {
    content: '';
    position: absolute;
    left: 3px;
    width: 7px;
    height: 7px;
    border-top: 2px solid #fff;
    border-left: 2px solid #fff;
    transform: rotate(45deg);
  }

  &::before {
    top: 1px;
  }

  &::after {
    top: 6px;
  }
}

.unread-float-count {
  margin: 0 4px;
}

.scroll-bottom-btn {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  padding: 0;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;

  &:hover {
    background: #f0f7ff;
  }

  > img {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 16px;
    height: 16px;
    transform: translate(-50%, -50%);
    object-fit: contain;
  }
}

.scroll-bottom-count {
  position: absolute;
  left: 50%;
  top: -10px;
  transform: translateX(-50%);
  min-width: 20px;
  height: 20px;
  padding: 0 7px;
  box-sizing: border-box;
  border-radius: 20px;
  background: #178aff;
  color: #fff;
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
  z-index: 1;
}
</style>
