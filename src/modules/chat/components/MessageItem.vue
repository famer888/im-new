<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore, isFileHelperTargetId } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useUIStore } from '@/stores/useUIStore'
import { useSearchStore } from '@/stores/useSearchStore'
import { ConversationType, MessageType, isHiddenMessageType } from '@/types'
import { isGroupIntroNoticeMessage } from '@/utils/groupIntroNotice'
import TextAvatar from '@/components/TextAvatar.vue'
import MessageTimeStatusLabel from '@/components/MessageTimeStatusLabel.vue'
import readDeleteFireUrl from '@/assets/images/read-delete01.svg'

const TextMessage = defineAsyncComponent(() => import('./messages/TextMessage.vue'))
const ImageMessage = defineAsyncComponent(() => import('./messages/ImageMessage.vue'))
const AudioMessage = defineAsyncComponent(() => import('./messages/AudioMessage.vue'))
const VideoMessage = defineAsyncComponent(() => import('./messages/VideoMessage.vue'))
const FileMessage = defineAsyncComponent(() => import('./messages/FileMessage.vue'))
const BusinessCardMessage = defineAsyncComponent(() => import('./messages/BusinessCardMessage.vue'))
const DiceMessage = defineAsyncComponent(() => import('./messages/DiceMessage.vue'))
const PokerMessage = defineAsyncComponent(() => import('./messages/PokerMessage.vue'))
const RichTextMessage = defineAsyncComponent(() => import('./messages/RichTextMessage.vue'))
const QuoteMessage = defineAsyncComponent(() => import('./messages/QuoteMessage.vue'))
const RedPacketMessage = defineAsyncComponent(() => import('./messages/RedPacketMessage.vue'))
const TransferMessage = defineAsyncComponent(() => import('./messages/TransferMessage.vue'))
const LocationMessage = defineAsyncComponent(() => import('./messages/LocationMessage.vue'))
const SystemNotification = defineAsyncComponent(() => import('./messages/SystemNotification.vue'))
const GroupIntroNoticeMessage = defineAsyncComponent(() => import('./messages/GroupIntroNoticeMessage.vue'))

const props = defineProps<{
  message: Message
  /** 与旧 im `n.showTime` + `showTimeDay`：本条为「新一天」首条时居中显示日期条 */
  dateBannerText?: string | null
}>()
const emit = defineEmits<{
  (e: 'resize', height: number): void
  (e: 'open-group-notice', payload: { message: Message }): void
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const uiStore = useUIStore()
const searchStore = useSearchStore()
const itemRef = ref<HTMLElement | null>(null)
const isSelf = computed(() => props.message.senderId === authStore.uid)
const isSelected = computed(() => uiStore.selectedMessageIds.has(props.message.id))
const shouldRenderMessage = computed(() => !isHiddenMessageType(props.message.msgType))
/** 与 im `getCurrentMsgClass` 里 `active`（搜索定位高亮）一致 */
const isSearchHighlighted = computed(
  () => searchStore.highlightSearchMessageId === props.message.id,
)
const isGroupIntroNotice = computed(() => isGroupIntroNoticeMessage(props.message))

const senderName = computed(() => {
  if (isSelf.value) return '我'
  return contactStore.getDisplayName(props.message.senderId)
})

const messageComponent = computed(() => {
  switch (props.message.msgType) {
    case MessageType.Text: return TextMessage
    case MessageType.Image: return ImageMessage
    // DynamicImage still needs the robust local/remote image pipeline here.
    // A plain <img> GIF component regressed on macOS and group messages.
    case MessageType.DynamicImage: return ImageMessage
    case MessageType.Video: return VideoMessage
    case MessageType.Audio: return AudioMessage
    case MessageType.Location: return LocationMessage
    case MessageType.File: return FileMessage
    case MessageType.NameCard: return BusinessCardMessage
    case MessageType.SetImage: return DiceMessage
    case MessageType.AnimatedGame: return PokerMessage
    case MessageType.Html2: return RichTextMessage
    case MessageType.RedPacket:
    case MessageType.RedPacketResult: return RedPacketMessage
    case MessageType.ChatTransfer:
    case MessageType.ChatTransferResult: return TransferMessage
    case MessageType.System:
      return SystemNotification
    case MessageType.Notice:
      return isGroupIntroNotice.value ? GroupIntroNoticeMessage : SystemNotification
    default: return TextMessage
  }
})

const isSystemMsg = computed(() =>
  props.message.msgType === MessageType.System ||
  (props.message.msgType === MessageType.Notice && !isGroupIntroNotice.value),
)

/** 与 `messageComponent` 一致：仅「非纯文本气泡」在外层叠加时间条，其余走 TextMessage 内嵌（含 default 分支） */
const useOuterTimeOverlay = computed(() => {
  switch (props.message.msgType) {
    case MessageType.Image:
    case MessageType.DynamicImage:
    case MessageType.Video:
    case MessageType.Audio:
    case MessageType.Location:
    case MessageType.File:
    case MessageType.NameCard:
    case MessageType.SetImage:
    case MessageType.AnimatedGame:
    case MessageType.Html2:
      return true
    case MessageType.Notice:
      return isGroupIntroNotice.value
    default:
      return false
  }
})

function handleOpenGroupNotice() {
  if (!isGroupIntroNotice.value) return
  emit('open-group-notice', { message: props.message })
}

const isImageLikeBubble = computed(() =>
  props.message.msgType === MessageType.Image ||
  props.message.msgType === MessageType.DynamicImage ||
  props.message.msgType === MessageType.Video,
)

function getQuoteContentDigest(msgType: number, content: string | null): string {
  if (msgType === MessageType.Text) return (content || '').slice(0, 60)
  if (msgType === MessageType.Image) return '[图片]'
  if (msgType === MessageType.DynamicImage) return '[动画表情]'
  if (msgType === MessageType.Audio) return '[语音]'
  if (msgType === MessageType.Video) return '[视频]'
  if (msgType === MessageType.File) return '[文件]'
  if (msgType === MessageType.Location) return '[位置]'
  if (msgType === MessageType.NameCard) return getNameCardQuoteDigest(content)
  if (msgType === MessageType.SetImage) return '[骰子]'
  if (msgType === MessageType.AnimatedGame) return '[扑克牌]'
  if (msgType === MessageType.RedPacket || msgType === MessageType.RedPacketResult) return '暂不支持该消息类型'
  if (msgType === MessageType.ChatTransfer || msgType === MessageType.ChatTransferResult) return '暂不支持该消息类型'
  if (msgType === MessageType.Html2) return '[富文本]'
  return (content || '').slice(0, 60) || '消息'
}

function getNameCardQuoteDigest(content: string | null): string {
  const name = getNameCardDisplayName(content)
  return name ? `[名片]${name}` : '[名片]'
}

function getNameCardDisplayName(content: string | null): string {
  const raw = String(content || '').trim()
  if (!raw) return ''
  if (raw.includes('*|*|*')) {
    return String(raw.split('*|*|*')[0] || '').trim()
  }
  try {
    const parsed = JSON.parse(raw)
    const value = parsed?.nickname ?? parsed?.name ?? parsed?.nickName ?? parsed?.nick_name ?? parsed?.uid ?? parsed?.id
    return String(value || '').trim()
  } catch {
    return raw.match(/\d{6,}/)?.[0] || ''
  }
}

const isFileHelperChat = computed(
  () => isFileHelperTargetId(chatStore.currentConversation?.targetId),
)
const isChannelChat = computed(
  () => chatStore.currentConversation?.type === ConversationType.Channel,
)
const isGroupChat = computed(
  () => chatStore.currentConversation?.type === 1,
)
/** 旧 im 频道消息统一按左侧白色气泡展示，即使是自己发送的消息也不右对齐。 */
const displayAsSelf = computed(() => (isSelf.value || isFileHelperChat.value) && !isChannelChat.value)
const showAvatar = computed(
  // 对齐 im：仅群聊的他人消息显示头像；单聊/传输助手不显示头像
  () => isGroupChat.value && !displayAsSelf.value,
)
const showReadBurnFire = computed(() => Boolean(props.message.deleteSeconds))
let itemResizeObserver: ResizeObserver | null = null

function getSelectedTextInside(node: EventTarget | null): string {
  if (!(node instanceof HTMLElement)) return ''
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.rangeCount) return ''

  // 只接受当前消息气泡内的选区，避免右键时误复制页面其它位置选中的文字。
  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i)
    if (range.intersectsNode(node)) {
      return selection.toString()
    }
  }
  return ''
}

function handleContextMenu(e: MouseEvent, options?: { isAvatar?: boolean }) {
  if (uiStore.selectionMode) return
  e.preventDefault()
  const isAvatarMenu = options?.isAvatar === true
  const menuX = displayAsSelf.value ? e.clientX - 180 : e.clientX
  const imageEl = !isAvatarMenu && e.currentTarget instanceof HTMLElement
    ? e.currentTarget.querySelector('.image-message .image-wrapper img')
    : null
  const imageSrc = imageEl instanceof HTMLImageElement
    ? (imageEl.currentSrc || imageEl.src || '')
    : ''
  const imagePath = imageEl instanceof HTMLImageElement
    ? (imageEl.dataset.localPath || '')
    : ''
  uiStore.showContextMenu(menuX, e.clientY, {
    type: 'message',
    ...props.message,
    messageId: props.message.id,
    msgId: props.message.id,
    customMsgId: props.message.customMsgId,
    senderId: props.message.senderId,
    isSelf: isSelf.value,
    msgType: props.message.msgType,
    isGroupIntroNotice: isGroupIntroNotice.value,
    readStatus: props.message.readStatus,
    // 头像右键单独走“艾特菜单”，避免和普通消息右键项混在一起。
    avatarMenu: isAvatarMenu,
    conversationType: chatStore.currentConversation?.type,
    content: props.message.content,
    extra: props.message.extra,
    senderName: senderName.value,
    selectedText: isAvatarMenu ? '' : getSelectedTextInside(e.currentTarget),
    imageSrc,
    imagePath,
  })
}

function handleClick() {
  if (uiStore.selectionMode) {
    uiStore.toggleMessageSelection({
      id: props.message.id,
      msgId: props.message.id,
      isSelf: isSelf.value,
    })
  }
}

const canJumpToQuote = computed(() =>
  Boolean(props.message.quoteMessage?.id || props.message.quoteMessage?.customMsgId),
)

function handleQuoteClick() {
  if (uiStore.selectionMode || !canJumpToQuote.value) return
  const quote = props.message.quoteMessage
  const conversationId = props.message.conversationId || chatStore.currentConversationId
  if (!quote || !conversationId) return

  const currentConversation = chatStore.currentConversation
  const type = currentConversation?.type === 1
    ? 'group'
    : currentConversation?.type === 2
      ? 'channel'
      : 'friend'
  const targetId = currentConversation?.targetId || conversationId.split('_').slice(1).join('_')

  searchStore.requestChatMsgListSearchScrollTo({
    id: targetId,
    type,
    pic: undefined,
    name: currentConversation?.senderName || quote.senderName || '',
    searchMsgInfo: null,
    customMsgId: quote.customMsgId ?? null,
    sendTime: props.message.sendTime,
    comType: 'chat',
    conversationId,
    messageId: quote.id || quote.customMsgId || '',
  })
}

onMounted(() => {
  if (itemRef.value) {
    // 监听气泡尺寸变化（如图片加载后高度变化），用于保持吸底状态同步。
    itemResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        emit('resize', entry.contentRect.height)
      }
    })
    itemResizeObserver.observe(itemRef.value)
  }
})

onUnmounted(() => {
  itemResizeObserver?.disconnect()
  itemResizeObserver = null
})
</script>

<template>
  <div
    v-if="shouldRenderMessage"
    ref="itemRef"
    v-memo="[
      message.id,
      message.customMsgId,
      message.senderId,
      message.msgType,
      message.content,
      message.status,
      message.readStatus,
      message.extra,
      message.deleteSeconds,
      message.quoteMessage,
      uiStore.selectionMode,
      isSelected,
      dateBannerText,
      isSearchHighlighted,
    ]"
    :class="['message-item', { 'is-self': displayAsSelf, showTime: !!dateBannerText, 'search-hit-active': isSearchHighlighted }]"
  >
    <span v-if="dateBannerText" class="showtimeDay">{{ dateBannerText }}</span>
    <!-- Full-area selection overlay (matches im select-item.vue) -->
    <div
      v-if="uiStore.selectionMode && !isSystemMsg"
      :class="['select-overlay', { active: isSelected }]"
      @click.stop="handleClick"
    ></div>
    <div v-if="isSystemMsg" class="system-message">
      <component :is="messageComponent" :message="message" />
    </div>
    <div v-else class="message-bubble-wrapper">
      <TextAvatar
        v-if="showAvatar"
        :name="senderName"
        :size="36"
        class="msg-avatar"
        style="cursor: pointer;"
        @click="uiStore.openMemberInfo(message.senderId)"
        @contextmenu.prevent.stop="handleContextMenu($event, { isAvatar: true })"
      />
      <div class="bubble-area" @contextmenu.stop="handleContextMenu">
        <span v-if="showAvatar" class="sender-name" style="cursor: pointer;" @click="uiStore.openMemberInfo(message.senderId)">{{ senderName }}</span>
        <div class="message-content-host">
          <!-- In-bubble quote block (matches im's msg/quote.vue) -->
          <div
            v-if="message.quoteMessage"
            class="inline-quote-block"
            :role="canJumpToQuote ? 'button' : undefined"
            :tabindex="canJumpToQuote ? 0 : undefined"
            @click.stop="handleQuoteClick"
            @keydown.enter.prevent="handleQuoteClick"
            @keydown.space.prevent="handleQuoteClick"
          >
            <h3 class="inline-quote-sender">{{ message.quoteMessage.senderName }}</h3>
            <p class="inline-quote-content">{{ getQuoteContentDigest(message.quoteMessage.msgType, message.quoteMessage.content) }}</p>
          </div>
          <!-- 文本/default：时间与状态在 TextMessage 气泡内（对齐旧 im）；媒体等在容器右下角叠加 -->
          <component
            v-if="!useOuterTimeOverlay"
            :is="messageComponent"
            :message="message"
            @open="handleOpenGroupNotice"
          />
          <div
            v-else
            :class="[
              'non-text-bubble-host',
              {
                'image-like-bubble-host': isImageLikeBubble,
                'video-bubble-host': message.msgType === MessageType.Video,
                'name-card-bubble-host': message.msgType === MessageType.NameCard,
              },
            ]"
          >
            <component :is="messageComponent" :message="message" @open="handleOpenGroupNotice" />
            <MessageTimeStatusLabel :message="message" :is-self="displayAsSelf" />
          </div>
          <img v-if="showReadBurnFire" class="read-burn-fire" :src="readDeleteFireUrl" alt="" />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.message-item {
  padding: 6px 16px;
  position: relative;

  /* 与旧 im `chat-msg-list/index.vue`：有日期条时上留白，条绝对定位居中 */
  &.showTime {
    padding-top: 40px;
  }

  /* 搜索定位：整行淡淡底色铺满聊天区宽度（抵消自身左右 padding，避免只高亮中间一截） */
  &.search-hit-active {
    margin-left: -16px;
    margin-right: -16px;
    padding-left: 32px;
    padding-right: 32px;
    padding-bottom: 6px;
    padding-top: 6px;
    background: rgba(241, 245, 247);
    border-radius: 0;

    &.showTime {
      padding-top: 40px;
    }
  }
}

.showtimeDay {
  position: absolute;
  top: 10px;
  left: 50%;
  z-index: 2;
  transform: translateX(-50%);
  margin-left: 0;
  background-color: rgba(0, 0, 0, 0.2);
  color: white;
  font-size: 12px;
  padding: 0.5em;
  text-align: center;
  line-height: 1em;
  height: auto;
  border-radius: 5px;
}

.select-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 5;
  border-radius: 10px;
  cursor: pointer;

  &:hover {
    background: rgba(51, 105, 254, 0.1);
  }

  &.active {
    background: rgba(51, 105, 254, 0.2);

    &:hover {
      background: rgba(51, 105, 254, 0.2);
    }
  }
}

.system-message {
  text-align: center;
  padding: 0;
}

.message-bubble-wrapper {
  display: flex;
  gap: 8px;
  max-width: 70%;

  .is-self & {
    flex-direction: row-reverse;
    margin-left: auto;
  }
}

.msg-avatar { flex-shrink: 0; }

.bubble-area {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.message-content-host {
  position: relative;
  width: fit-content;
  max-width: 100%;
}

.inline-quote-block {
  padding-left: 7px;
  border-left: 2px solid #3369fe;
  margin-bottom: 5px;
  height: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-top-right-radius: 3px;
  border-bottom-right-radius: 3px;
  overflow: hidden;
  cursor: pointer;

  &:hover { background: rgba(51, 105, 254, 0.1); }
}

.inline-quote-sender {
  margin: 0;
  padding: 0;
  line-height: 20px;
  font-size: 14px;
  font-weight: bold;
  color: #3369fe;
}

.inline-quote-content {
  margin: 0;
  font-size: 12px;
  color: #555;
  line-height: 20px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.sender-name {
  font-size: 12px;
  color: #999;
  margin-bottom: 2px;
}

.non-text-bubble-host {
  position: relative;
  display: inline-block;
  max-width: 100%;
  vertical-align: top;
}

.image-like-bubble-host {
  padding-bottom: 25px;
}

.video-bubble-host {
  margin-left: 16px;

  .is-self & {
    margin-left: 0;
    margin-right: 16px;
  }
}

.name-card-bubble-host {
  width: 300px;
  max-width: calc(100vw - 120px);
}

.read-burn-fire {
  position: absolute;
  top: 50%;
  right: -28px;
  width: 20px;
  height: 20px;
  transform: translateY(-50%);
  pointer-events: none;

  .is-self & {
    left: -28px;
    right: auto;
  }
}
</style>
