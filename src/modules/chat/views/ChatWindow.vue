<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/useAuthStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useChatStore } from '@/stores/useChatStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { ConversationType } from '@/types'
import ChatHeader from '../components/ChatHeader.vue'
import MessageList from '../components/MessageList.vue'
import MessageInput from '../components/MessageInput.vue'
import lockIcon from '@/assets/images/message/lock.png'

const route = useRoute()
const { t } = useI18n()
const authStore = useAuthStore()
const messageStore = useMessageStore()
const chatStore = useChatStore()
const groupStore = useGroupStore()

const conversationId = computed(() => (route.query.id as string) || chatStore.currentConversationId || '')

const messages = computed(() => messageStore.getMessages(conversationId.value))
const isLoading = computed(() => messageStore.isLoading(conversationId.value))

/** 进入会话时的未读条数快照，供「未读消息」分隔条（markAsRead 后列表里会变成 0，故单独存） */
const sessionInitialUnread = ref(0)
/** 已为当前会话执行过 markAsRead 后，不再用 store 覆盖快照，避免把已算好的 N 冲掉 */
const unreadSnapshotLocked = ref(false)

function captureUnreadSnapshot(convId: string) {
  const conv = chatStore.conversations.find((c) => c.id === convId)
  const n = conv?.unreadCount ?? 0
  sessionInitialUnread.value = Math.max(sessionInitialUnread.value, n)
}

/**
 * 会话列表可能晚于路由到达：在 locked 前持续用 store 里的 unread 抬快照，
 * 解决「第一次 capture 为 0、分隔条永远不出现」。
 */
watch(
  [conversationId, () => chatStore.conversations],
  () => {
    if (unreadSnapshotLocked.value) return
    const id = conversationId.value
    if (!id) return
    captureUnreadSnapshot(id)
  },
  { deep: true, immediate: true },
)

function loadGroupMembersIfNeeded(convId: string) {
  if (!authStore.uid || !convId) return
  const conv = chatStore.conversations.find((c) => c.id === convId)
  if (conv?.type === ConversationType.Group && conv.targetId) {
    groupStore.loadMembers(authStore.uid, conv.targetId).catch(() => {})
  }
}

watch(
  conversationId,
  async (newId, oldId) => {
    if (oldId !== undefined && newId !== oldId) {
      sessionInitialUnread.value = 0
      unreadSnapshotLocked.value = false
    }
    if (!newId) {
      sessionInitialUnread.value = 0
      unreadSnapshotLocked.value = false
      return
    }
    if (!authStore.uid) return
    const myId = newId
    await nextTick()
    captureUnreadSnapshot(myId)
    await messageStore.loadMessages(authStore.uid, myId)
    if (conversationId.value !== myId) return
    await chatStore.markAsRead(authStore.uid, myId)
    if (conversationId.value !== myId) return
    unreadSnapshotLocked.value = true
    loadGroupMembersIfNeeded(myId)
  },
  { immediate: true },
)

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
    <div class="e2e-notice">
      <!-- 视觉 10px：浏览器常限制最小字号，用 12px 基准 + scale(10/12) -->
      <div class="e2e-notice-scale">
        <img class="e2e-lock" :src="lockIcon" alt="" />
        <span class="e2e-text">{{ t('此对话中的信息和通话已经进行端对端加密') }}</span>
      </div>
    </div>
    <MessageList
      :conversation-id="conversationId"
      :messages="messages"
      :loading="isLoading"
      :has-more="messageStore.hasMore(conversationId)"
      :unread-count="sessionInitialUnread"
      align-top
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
