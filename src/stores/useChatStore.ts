import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export interface Conversation {
  id: string
  type: number // 0: friend, 1: group, 2: channel
  targetId: string
  lastMsgId: string | null
  lastMsgTime: number
  lastMsgDigest: string | null
  unreadCount: number
  isPinned: boolean
  isMuted: boolean
  isArchived: boolean
  draft: string | null
  senderName: string | null
  atMe: boolean
  scheduleDeletion: number
  updatedAt: number
}

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const currentConversationId = ref<string | null>(null)
  const loading = ref(false)

  const currentConversation = computed(() =>
    conversations.value.find((c) => c.id === currentConversationId.value) ?? null,
  )

  const totalUnread = computed(() =>
    conversations.value
      .filter((c) => !c.isMuted && !c.isArchived)
      .reduce((sum, c) => sum + c.unreadCount, 0),
  )

  async function loadConversations(uid: string) {
    if (!isTauri()) return
    loading.value = true
    try {
      const result = await tauriInvoke<Conversation[]>('get_conversations', {
        uid,
        limit: 50,
        offset: 0,
      })
      conversations.value = result
    } finally {
      loading.value = false
    }
  }

  function setCurrentConversation(id: string | null) {
    currentConversationId.value = id
  }

  function updateConversation(updated: Partial<Conversation> & { id: string }) {
    const index = conversations.value.findIndex((c) => c.id === updated.id)
    if (index >= 0) {
      conversations.value[index] = { ...conversations.value[index], ...updated }
    }
  }

  function addOrUpdateConversation(conv: Conversation) {
    const index = conversations.value.findIndex((c) => c.id === conv.id)
    if (index >= 0) {
      conversations.value[index] = conv
    } else {
      conversations.value.unshift(conv)
    }
    sortConversations()
  }

  function sortConversations() {
    conversations.value.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      return b.updatedAt - a.updatedAt
    })
  }

  async function pinConversation(uid: string, conversationId: string, pinned: boolean) {
    if (!isTauri()) return
    await tauriInvoke('pin_conversation', { uid, conversationId, pinned })
    updateConversation({ id: conversationId, isPinned: pinned })
    sortConversations()
  }

  async function muteConversation(uid: string, conversationId: string, muted: boolean) {
    if (!isTauri()) return
    await tauriInvoke('mute_conversation', { uid, conversationId, muted })
    updateConversation({ id: conversationId, isMuted: muted })
  }

  async function markAsRead(uid: string, conversationId: string) {
    if (!isTauri()) return
    await tauriInvoke('mark_as_read', { uid, conversationId })
    updateConversation({ id: conversationId, unreadCount: 0, atMe: false })
  }

  async function archiveConversation(uid: string, conversationId: string, archived: boolean) {
    if (!isTauri()) return
    await tauriInvoke('archive_conversation', { uid, conversationId, archived })
    updateConversation({ id: conversationId, isArchived: archived })
  }

  function setDraft(conversationId: string, draft: string | null) {
    updateConversation({ id: conversationId, draft })
  }

  async function recallMessage(uid: string, messageId: string) {
    if (!isTauri()) return
    await tauriInvoke('recall_message', { uid, messageId })
  }

  async function deleteConversation(uid: string, conversationId: string) {
    if (!isTauri()) return
    await tauriInvoke('delete_conversation', { uid, conversationId })
    conversations.value = conversations.value.filter(c => c.id !== conversationId)
    if (currentConversationId.value === conversationId) {
      currentConversationId.value = null
    }
  }

  return {
    conversations,
    currentConversationId,
    currentConversation,
    totalUnread,
    loading,
    loadConversations,
    setCurrentConversation,
    updateConversation,
    addOrUpdateConversation,
    pinConversation,
    muteConversation,
    markAsRead,
    archiveConversation,
    setDraft,
    recallMessage,
    deleteConversation,
  }
})
