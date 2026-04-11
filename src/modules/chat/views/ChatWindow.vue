<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useChatStore } from '@/stores/useChatStore'
import ChatHeader from '../components/ChatHeader.vue'
import MessageList from '../components/MessageList.vue'
import MessageInput from '../components/MessageInput.vue'

const route = useRoute()
const authStore = useAuthStore()
const messageStore = useMessageStore()
const chatStore = useChatStore()

const conversationId = computed(() => (route.query.id as string) || chatStore.currentConversationId || '')

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

async function handleSend(content: string, msgType: number) {
  if (!conversationId.value || !authStore.uid) return
  await messageStore.sendMessage(authStore.uid, conversationId.value, msgType, content)
}
</script>

<template>
  <div class="chat-window">
    <ChatHeader :conversation-id="conversationId" />
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
  width: 100%;
  height: 100%;
  background: #fff;
}
</style>
