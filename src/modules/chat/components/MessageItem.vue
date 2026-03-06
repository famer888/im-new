<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
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
const contactStore = useContactStore()
const uiStore = useUIStore()
const itemRef = ref<HTMLElement | null>(null)
const isSelf = computed(() => props.message.senderId === authStore.uid)

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

function handleContextMenu(e: MouseEvent) {
  e.preventDefault()
  uiStore.showContextMenu(e.clientX, e.clientY, {
    type: 'message',
    messageId: props.message.id,
    senderId: props.message.senderId,
    isSelf: isSelf.value,
    msgType: props.message.msgType,
    content: props.message.content,
  })
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
    v-memo="[message.status, message.readStatus]"
    :class="['message-item', { 'is-self': isSelf }]"
    @contextmenu="handleContextMenu"
  >
    <div v-if="isSystemMsg" class="system-message">
      <component :is="messageComponent" :message="message" />
    </div>
    <div v-else class="message-bubble-wrapper">
      <TextAvatar
        :name="senderName"
        :size="36"
        class="msg-avatar"
      />
      <div class="bubble-area">
        <span v-if="!isSelf" class="sender-name">{{ senderName }}</span>
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
