<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/useAuthStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useChatStore, FILE_HELPER_TARGET_ID } from '@/stores/useChatStore'
import ChatHeader from '../components/ChatHeader.vue'
import MessageList from '../components/MessageList.vue'
import MessageInput from '../components/MessageInput.vue'
import lockIcon from '@/assets/images/message/lock.png'

const route = useRoute()
const { t } = useI18n()
const authStore = useAuthStore()
const messageStore = useMessageStore()
const chatStore = useChatStore()

const conversationId = computed(() => (route.query.id as string) || chatStore.currentConversationId || '')

const isFileHelperChat = computed(() => {
  const id = conversationId.value
  if (!id) return false
  if (id === `0_${FILE_HELPER_TARGET_ID}`) return true
  const conv = chatStore.conversations.find((c) => c.id === id)
  return conv?.targetId === FILE_HELPER_TARGET_ID
})

const isContactChat = computed(() => {
  const id = conversationId.value
  if (!id) return false
  const conv = chatStore.conversations.find((c) => c.id === id)
  if (conv) return conv.type === 0
  // 兜底：会话尚未入 store 时按 id 前缀判断
  return id.startsWith('0_')
})

const messages = computed(() => messageStore.getMessages(conversationId.value))
const isLoading = computed(() => messageStore.isLoading(conversationId.value))

onMounted(async () => {
  if (conversationId.value && authStore.uid) {
    await messageStore.loadMessages(authStore.uid, conversationId.value)
    await chatStore.markAsRead(authStore.uid, conversationId.value)
  }
})

watch(conversationId, async (newId) => {
  if (newId && authStore.uid) {
    await messageStore.loadMessages(authStore.uid, newId)
    await chatStore.markAsRead(authStore.uid, newId)
  }
})

async function handleLoadMore() {
  if (conversationId.value && authStore.uid) {
    await messageStore.loadOlderMessages(authStore.uid, conversationId.value)
  }
}

async function handleSend(content: string, msgType: number, extra?: Record<string, unknown>) {
  if (!conversationId.value || !authStore.uid) return
  await messageStore.sendMessage(authStore.uid, conversationId.value, msgType, content, extra)
}
</script>

<template>
  <div class="chat-window">
    <ChatHeader :conversation-id="conversationId" />
    <div v-if="isContactChat" class="e2e-notice">
      <!-- 视觉 10px：浏览器常限制最小字号，用 12px 基准 + scale(10/12) -->
      <div class="e2e-notice-scale">
        <img class="e2e-lock" :src="lockIcon" alt="" />
        <span class="e2e-text">{{ t('此对话中的信息和通话已经进行端对端加密') }}</span>
      </div>
    </div>
    <MessageList
      :messages="messages"
      :loading="isLoading"
      :has-more="messageStore.hasMore(conversationId)"
      @load-more="handleLoadMore"
    />
    <MessageInput @send="handleSend" />
  </div>
</template>

<style lang="scss" scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
  background: #fff;
}

/* 传输助手：顶栏下加密说明（与消息区同底色） */
.e2e-notice {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 16px;
  background: #f6f6f6;
}

/* 基准 12px，整体缩放为视觉约 10px（规避 Chrome 等最小字号） */
.e2e-notice-scale {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  line-height: 1.4;
  color: #333;
  transform: scale(calc(11 / 12));
  transform-origin: center center;
}

.e2e-lock {
  flex-shrink: 0;
  display: block;
  width: 12px;
  height: 12px;
}

.e2e-text {
  text-align: center;
}
</style>
