<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore, FILE_HELPER_TARGET_ID } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useUIStore } from '@/stores/useUIStore'
import { MessageType } from '@/types'
import TextAvatar from '@/components/TextAvatar.vue'

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

const props = defineProps<{ message: Message }>()
const emit = defineEmits<{ (e: 'resize', height: number): void }>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const uiStore = useUIStore()
const itemRef = ref<HTMLElement | null>(null)
const isSelf = computed(() => props.message.senderId === authStore.uid)
const displayAsSelf = computed(() => isSelf.value || isFileHelperChat.value)
const isSelected = computed(() => uiStore.selectedMessageIds.has(props.message.id))

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
    uiStore.toggleMessageSelection(props.message.id)
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
    v-memo="[message.status, message.readStatus, message.quoteMessage, uiStore.selectionMode, isSelected]"
    :class="['message-item', { 'is-self': displayAsSelf, 'selection-mode': uiStore.selectionMode, 'is-selected': isSelected }]"
    @contextmenu="handleContextMenu"
    @click="handleClick"
  >
    <div v-if="uiStore.selectionMode && !isSystemMsg" class="selection-checkbox">
      <div :class="['checkbox', { checked: isSelected }]">
        <svg v-if="isSelected" viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 8l3 3 6-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
    </div>
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
      <div class="bubble-area">
        <span v-if="showAvatar" class="sender-name">{{ senderName }}</span>
        <!-- In-bubble quote block (matches im's msg/quote.vue) -->
        <div v-if="message.quoteMessage" class="inline-quote-block">
          <h3 class="inline-quote-sender">{{ message.quoteMessage.senderName }}</h3>
          <p class="inline-quote-content">{{ getQuoteContentDigest(message.quoteMessage.msgType, message.quoteMessage.content) }}</p>
        </div>
        <component :is="messageComponent" :message="message" />
        <div class="message-meta">
          <span v-if="message.status === 0" class="status sending">发送中</span>
          <span v-else-if="message.status === -1" class="status failed">发送失败</span>
          <span v-else-if="message.status === 3" class="status read">已读</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.message-item {
  padding: 6px 16px;
  contain: content;

  &.selection-mode {
    display: flex;
    align-items: flex-start;
    cursor: pointer;
    user-select: none;

    &:hover { background: rgba(51, 105, 254, 0.04); }
    &.is-selected { background: rgba(51, 105, 254, 0.08); }
  }
}

.selection-checkbox {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding-top: 8px;
  margin-right: 8px;
}

.checkbox {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &.checked {
    background: #3369fe;
    border-color: #3369fe;
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

.message-meta {
  font-size: 11px;

  .status {
    &.sending { color: #e6a23c; }
    &.failed { color: #f44e5a; }
    &.read { color: #67c23a; }
  }
}
</style>
