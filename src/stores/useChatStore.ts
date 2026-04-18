import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

/** 与旧 im 一致：系统占位好友 id，会话 id 为 `0_9901` */
export const FILE_HELPER_TARGET_ID = '9901'

/** 群通知伪会话 id（与 im id:"invitation" type:"group" 一致） */
export const GROUP_NOTIFICATION_TARGET_ID = 'invitation'

function getConversationCacheKey(uid: string): string {
  return `${uid}-conversations`
}

function saveConversationsToCache(uid: string, convs: Conversation[]) {
  if (!uid) return
  try {
    localStorage.setItem(getConversationCacheKey(uid), JSON.stringify(convs))
  } catch { /* storage full or unavailable */ }
}

function loadConversationsFromCache(uid: string): Conversation[] {
  if (!uid) return []
  try {
    const stored = localStorage.getItem(getConversationCacheKey(uid))
    if (stored) return JSON.parse(stored)
  } catch { /* corrupted */ }
  return []
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

  function normalizeConversation(raw: any): Conversation {
    return {
      id: String(raw.id ?? ''),
      type: Number(raw.type ?? raw.conv_type ?? 0),
      targetId: String(raw.targetId ?? raw.target_id ?? ''),
      lastMsgId: raw.lastMsgId ?? raw.last_msg_id ?? null,
      lastMsgTime: Number(raw.lastMsgTime ?? raw.last_msg_time ?? 0),
      lastMsgDigest: raw.lastMsgDigest ?? raw.last_msg_digest ?? null,
      unreadCount: Number(raw.unreadCount ?? raw.unread_count ?? 0),
      isPinned: Boolean(raw.isPinned ?? raw.is_pinned ?? false),
      isMuted: Boolean(raw.isMuted ?? raw.is_muted ?? false),
      isArchived: Boolean(raw.isArchived ?? raw.is_archived ?? false),
      draft: raw.draft ?? null,
      senderName: raw.senderName ?? raw.sender_name ?? null,
      atMe: Boolean(raw.atMe ?? raw.at_me ?? false),
      scheduleDeletion: Number(raw.scheduleDeletion ?? raw.schedule_deletion ?? 0),
      updatedAt: Number(raw.updatedAt ?? raw.updated_at ?? Date.now()),
    }
  }

  const currentConversation = computed(() =>
    conversations.value.find((c) => c.id === currentConversationId.value) ?? null,
  )

  const totalUnread = computed(() =>
    conversations.value
      .filter((c) => !c.isMuted && !c.isArchived)
      .reduce((sum, c) => sum + c.unreadCount, 0),
  )

  /** 浏览器模式或无 DB 下发时，保证列表中有「文件传输助手」 */
  function ensureFileHelperConversationInMemory() {
    if (conversations.value.some((c) => c.targetId === FILE_HELPER_TARGET_ID))
      return
    const now = Date.now()
    const id = `0_${FILE_HELPER_TARGET_ID}`
    conversations.value.push({
      id,
      type: 0,
      targetId: FILE_HELPER_TARGET_ID,
      lastMsgId: null,
      lastMsgTime: 0,
      lastMsgDigest: null,
      unreadCount: 0,
      isPinned: true,
      isMuted: false,
      isArchived: false,
      draft: null,
      senderName: null,
      atMe: false,
      scheduleDeletion: 0,
      updatedAt: now,
    })
    sortConversations()
  }

  function ensureGroupNotificationConversation() {
    if (conversations.value.some((c) => c.targetId === GROUP_NOTIFICATION_TARGET_ID))
      return
    const now = Date.now()
    const id = `1_${GROUP_NOTIFICATION_TARGET_ID}`
    conversations.value.push({
      id,
      type: 1,
      targetId: GROUP_NOTIFICATION_TARGET_ID,
      lastMsgId: null,
      lastMsgTime: 0,
      lastMsgDigest: null,
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      isArchived: false,
      draft: null,
      senderName: null,
      atMe: false,
      scheduleDeletion: 0,
      updatedAt: now,
    })
    sortConversations()
  }

  function updateGroupNotificationConv(digest: string, time: number, pendingCount: number) {
    const id = `1_${GROUP_NOTIFICATION_TARGET_ID}`
    const idx = conversations.value.findIndex((c) => c.id === id)
    if (idx >= 0) {
      const conv = conversations.value[idx]
      conversations.value[idx] = {
        ...conv,
        lastMsgDigest: digest,
        lastMsgTime: time,
        unreadCount: pendingCount,
        updatedAt: time || conv.updatedAt,
      }
      sortConversations()
    }
  }

  function clearGroupNotificationUnread() {
    const id = `1_${GROUP_NOTIFICATION_TARGET_ID}`
    const idx = conversations.value.findIndex((c) => c.id === id)
    if (idx >= 0) {
      conversations.value[idx] = { ...conversations.value[idx], unreadCount: 0 }
    }
  }

  let _persistUid = ''

  function enablePersistence(uid: string) {
    _persistUid = uid
  }

  async function loadConversations(uid: string) {
    loading.value = true
    _persistUid = uid
    try {
      let loaded: Conversation[] = []

      if (isTauri()) {
        const result = await tauriInvoke<any[]>('get_conversations', {
          uid,
          limit: 50,
          offset: 0,
        })
        loaded = Array.isArray(result) ? result.map(normalizeConversation) : []
      }

      // Check if we have real conversations beyond the auto-inserted file helper
      const hasRealConversations = loaded.some(
        (c) => c.targetId !== FILE_HELPER_TARGET_ID,
      )

      if (!hasRealConversations) {
        const cached = loadConversationsFromCache(uid)
        if (cached.length > 0) {
          loaded = cached
        }
      }

      conversations.value = loaded
    } catch (e) {
      console.error('[ChatStore] loadConversations failed:', e)
      conversations.value = loadConversationsFromCache(uid)
    } finally {
      ensureFileHelperConversationInMemory()
      ensureGroupNotificationConversation()
      loading.value = false
    }
  }

  watch(conversations, (val) => {
    if (_persistUid) {
      saveConversationsToCache(_persistUid, val)
    }
  }, { deep: true })

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
    const normalized = normalizeConversation(conv as any)
    const index = conversations.value.findIndex((c) => c.id === normalized.id)
    if (index >= 0) {
      conversations.value[index] = normalized
    } else {
      conversations.value.unshift(normalized)
    }
    sortConversations()
  }

  function ensureConversation(type: number, targetId: string): Conversation {
    const id = `${type}_${targetId}`
    const existing = conversations.value.find((c) => c.id === id)
    if (existing) return existing

    const conv: Conversation = {
      id,
      type,
      targetId,
      lastMsgId: null,
      lastMsgTime: 0,
      lastMsgDigest: null,
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      isArchived: false,
      draft: null,
      senderName: null,
      atMe: false,
      scheduleDeletion: 0,
      updatedAt: Date.now(),
    }
    conversations.value.unshift(conv)
    sortConversations()
    return conv
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

  async function clearAllLocalChatHistory(uid: string) {
    if (!isTauri()) {
      conversations.value = []
      currentConversationId.value = null
      ensureFileHelperConversationInMemory()
      return
    }
    await tauriInvoke('clear_all_local_chat_history', { uid })
    currentConversationId.value = null
    await loadConversations(uid)
  }

  return {
    conversations,
    currentConversationId,
    currentConversation,
    totalUnread,
    loading,
    enablePersistence,
    loadConversations,
    setCurrentConversation,
    updateConversation,
    addOrUpdateConversation,
    ensureConversation,
    pinConversation,
    muteConversation,
    markAsRead,
    archiveConversation,
    setDraft,
    recallMessage,
    deleteConversation,
    clearAllLocalChatHistory,
    ensureFileHelperConversationInMemory,
    ensureGroupNotificationConversation,
    updateGroupNotificationConv,
    clearGroupNotificationUnread,
  }
})
