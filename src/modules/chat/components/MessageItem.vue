<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore, FILE_HELPER_TARGET_ID } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useUIStore } from '@/stores/useUIStore'
import { useSearchStore } from '@/stores/useSearchStore'
import { MessageType } from '@/types'
import TextAvatar from '@/components/TextAvatar.vue'
import MessageTimeStatusLabel from '@/components/MessageTimeStatusLabel.vue'

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
const GifMessage = defineAsyncComponent(() => import('./messages/GifMessage.vue'))
const RedPacketMessage = defineAsyncComponent(() => import('./messages/RedPacketMessage.vue'))
const TransferMessage = defineAsyncComponent(() => import('./messages/TransferMessage.vue'))
const LocationMessage = defineAsyncComponent(() => import('./messages/LocationMessage.vue'))
const SystemNotification = defineAsyncComponent(() => import('./messages/SystemNotification.vue'))

const props = defineProps<{
  message: Message
  /** 与旧 im `n.showTime` + `showTimeDay`：本条为「新一天」首条时居中显示日期条 */
  dateBannerText?: string | null
}>()
const emit = defineEmits<{ (e: 'resize', height: number): void }>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const uiStore = useUIStore()
const searchStore = useSearchStore()
const itemRef = ref<HTMLElement | null>(null)
const isSelf = computed(() => props.message.senderId === authStore.uid)
const displayAsSelf = computed(() => isSelf.value || isFileHelperChat.value)
const isSelected = computed(() => uiStore.selectedMessageIds.has(props.message.id))
/** 与 im `getCurrentMsgClass` 里 `active`（搜索定位高亮）一致 */
const isSearchHighlighted = computed(
  () => searchStore.highlightSearchMessageId === props.message.id,
)

const senderName = computed(() => {
  if (isSelf.value) return '我'
  return contactStore.getDisplayName(props.message.senderId)
})

const messageComponent = computed(() => {
  switch (props.message.msgType) {
    case MessageType.Text: return TextMessage
    case MessageType.Image: return ImageMessage
    case MessageType.DynamicImage: return GifMessage
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
    case MessageType.Notice: return SystemNotification
    default: return TextMessage
  }
})

const isSystemMsg = computed(() =>
  props.message.msgType === MessageType.System ||
  props.message.msgType === MessageType.Notice,
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
    case MessageType.RedPacket:
    case MessageType.RedPacketResult:
    case MessageType.ChatTransfer:
    case MessageType.ChatTransferResult:
      return true
    default:
      return false
  }
})

function getQuoteContentDigest(msgType: number, content: string | null): string {
  if (msgType === MessageType.Text) return (content || '').slice(0, 60)
  if (msgType === MessageType.Image) return '[图片]'
  if (msgType === MessageType.Audio) return '[语音]'
  if (msgType === MessageType.Video) return '[视频]'
  if (msgType === MessageType.File) return '[文件]'
  if (msgType === MessageType.Location) return '[位置]'
  if (msgType === MessageType.NameCard) return '[名片]'
  if (msgType === MessageType.RedPacket || msgType === MessageType.RedPacketResult) return '[红包]'
  if (msgType === MessageType.ChatTransfer || msgType === MessageType.ChatTransferResult) return '[转账]'
  if (msgType === MessageType.Html2) return '[富文本]'
  return (content || '').slice(0, 60) || '消息'
}

const isFileHelperChat = computed(
  () => chatStore.currentConversation?.targetId === FILE_HELPER_TARGET_ID,
)
const isGroupChat = computed(
  () => chatStore.currentConversation?.type === 1,
)
const showAvatar = computed(
  // 对齐 im：仅群聊的他人消息显示头像；单聊/传输助手不显示头像
  () => isGroupChat.value && !displayAsSelf.value,
)

function handleContextMenu(e: MouseEvent) {
  if (uiStore.selectionMode) return
  e.preventDefault()
  uiStore.showContextMenu(e.clientX, e.clientY, {
    type: 'message',
    messageId: props.message.id,
    senderId: props.message.senderId,
    isSelf: isSelf.value,
    msgType: props.message.msgType,
    content: props.message.content,
    extra: props.message.extra,
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

onMounted(() => {
  if (itemRef.value) {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        emit('resize', entry.contentRect.height)
      }
    })
    observer.observe(itemRef.value)
  }
})
</script>

<template>
  <div
    ref="itemRef"
    v-memo="[message.status, message.readStatus, message.quoteMessage, uiStore.selectionMode, isSelected, dateBannerText, isSearchHighlighted]"
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
      />
      <div class="bubble-area" @contextmenu.stop="handleContextMenu">
        <span v-if="showAvatar" class="sender-name">{{ senderName }}</span>
        <!-- In-bubble quote block (matches im's msg/quote.vue) -->
        <div v-if="message.quoteMessage" class="inline-quote-block">
          <h3 class="inline-quote-sender">{{ message.quoteMessage.senderName }}</h3>
          <p class="inline-quote-content">{{ getQuoteContentDigest(message.quoteMessage.msgType, message.quoteMessage.content) }}</p>
        </div>
        <!-- 文本/default：时间与状态在 TextMessage 气泡内（对齐旧 im）；媒体等在容器右下角叠加 -->
        <component
          v-if="!useOuterTimeOverlay"
          :is="messageComponent"
          :message="message"
        />
        <div v-else class="non-text-bubble-host">
          <component :is="messageComponent" :message="message" />
          <MessageTimeStatusLabel :message="message" :is-self="displayAsSelf" />
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
  padding: 4px 0;
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
</style>
