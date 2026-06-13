import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { API_CONFIG } from '@/api/config'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

/** 与旧 im/文档一致：系统占位好友 id，会话 id 为 `0_9901` */
export const FILE_HELPER_TARGET_ID = '9901'
const LEGACY_FILE_HELPER_TARGET_ID = '10008'
/** 与旧 im 一致：官方号固定使用 9900；名称按当前品牌动态显示。 */
export const OFFICIAL_ACCOUNT_TARGET_ID = '9900'
export const OFFICIAL_ACCOUNT_NAME = `${API_CONFIG.brandId} Messenger`

export function isFileHelperTargetId(targetId: string | number | null | undefined): boolean {
  const id = String(targetId ?? '')
  return id === FILE_HELPER_TARGET_ID || id === LEGACY_FILE_HELPER_TARGET_ID
}

export function isOfficialAccountTargetId(targetId: string | number | null | undefined): boolean {
  return String(targetId ?? '') === OFFICIAL_ACCOUNT_TARGET_ID
}

/** 群通知伪会话 id（与 im id:"invitation" type:"group" 一致） */
export const GROUP_NOTIFICATION_TARGET_ID = 'invitation'
/** 频道通知伪会话 id（与 im id:"channelNotice" type:"friend" 一致） */
export const CHANNEL_NOTIFICATION_TARGET_ID = 'channelNotice'

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

interface ReadProcessingResult {
  readMessageIds: string[]
  localReadMessageIds?: string[]
  scheduledDeletions: Array<{
    conversationId: string
    messageId: string
    expireAt: number
  }>
  groupReadUpdates?: Array<{
    conversationId: string
    messageId: string
    readStatus: number
    extra?: string | null
  }>
  conversationReadUpdates?: Array<{
    conversationId: string
    unreadCount: number
  }>
}

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const currentConversationId = ref<string | null>(null)
  const pendingGroupInviteConversationIds = ref<Set<string>>(new Set())
  const loading = ref(false)
  let _persistUid = ''

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
      .filter((c) => !c.isMuted && !c.isArchived && !(c.type === 1 && isPendingGroupInviteConversation(c.targetId)))
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

  function updateGroupNotificationConv(digest: string, time: number, unreadCount?: number | null) {
    const id = `1_${GROUP_NOTIFICATION_TARGET_ID}`
    // 对齐旧 im：群通知红点表示“未读通知”，不是“待处理申请数”。
    // 是否已读由调用方显式传入；这里只负责规整为 0/1，避免 stale currentConversationId 误清红点。
    const idx = conversations.value.findIndex((c) => c.id === id)
    const existingUnread = idx >= 0 ? Number(conversations.value[idx].unreadCount || 0) : 0
    const explicitUnread = unreadCount === null || unreadCount === undefined ? null : Number(unreadCount)
    const normalizedUnread = explicitUnread === null || !Number.isFinite(explicitUnread)
        ? (existingUnread > 0 ? 1 : 0)
        : (explicitUnread > 0 ? 1 : 0)
    console.warn('[group-notification-unread] update conv', {
      conversationId: id,
      currentConversationId: currentConversationId.value || '',
      existingUnread,
      inputUnread: unreadCount ?? null,
      normalizedUnread,
      time,
    })
    if (idx >= 0) {
      const conv = conversations.value[idx]
      conversations.value[idx] = {
        ...conv,
        lastMsgDigest: digest,
        lastMsgTime: time,
        unreadCount: normalizedUnread,
        updatedAt: time || conv.updatedAt,
      }
      sortConversations()
      return
    }

    conversations.value.push({
      id,
      type: 1,
      targetId: GROUP_NOTIFICATION_TARGET_ID,
      lastMsgId: null,
      lastMsgTime: time,
      lastMsgDigest: digest,
      unreadCount: normalizedUnread,
      isPinned: false,
      isMuted: false,
      isArchived: false,
      draft: null,
      senderName: null,
      atMe: false,
      scheduleDeletion: 0,
      updatedAt: time || Date.now(),
    })
    sortConversations()
  }

  function clearGroupNotificationUnread() {
    const id = `1_${GROUP_NOTIFICATION_TARGET_ID}`
    const idx = conversations.value.findIndex((c) => c.id === id)
    const unreadBefore = idx >= 0 ? Number(conversations.value[idx].unreadCount || 0) : 0
    if (idx >= 0) {
      conversations.value[idx] = { ...conversations.value[idx], unreadCount: 0 }
    }
    console.warn('[group-notification-unread] clear', {
      conversationId: id,
      currentConversationId: currentConversationId.value || '',
      unreadBefore,
    })
    if (isTauri() && _persistUid) {
      tauriInvoke('mark_as_read', { uid: _persistUid, conversationId: id }).catch((error) => {
        console.warn('[ChatStore] clear group notification unread failed:', error)
      })
      const unreadTotal = conversations.value
        .filter((c) => !c.isMuted && !c.isArchived)
        .reduce((sum, c) => sum + Math.max(0, Number(c.unreadCount || 0)), 0)
      tauriInvoke('update_tray_unread_count', {
        count: unreadTotal,
        flash: false,
      }).catch((error) => {
        console.warn('[ChatStore] update tray unread after clear group notification failed:', error)
      })
    }
  }

  function removeGroupNotificationConversation() {
    const id = `1_${GROUP_NOTIFICATION_TARGET_ID}`
    conversations.value = conversations.value.filter((c) => c.id !== id)
    if (currentConversationId.value === id) {
      currentConversationId.value = null
    }
  }

  function updateChannelNotificationConv(digest: string, time: number, pendingCount: number) {
    const id = `0_${CHANNEL_NOTIFICATION_TARGET_ID}`
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
      return
    }

    conversations.value.push({
      id,
      type: 0,
      targetId: CHANNEL_NOTIFICATION_TARGET_ID,
      lastMsgId: null,
      lastMsgTime: time,
      lastMsgDigest: digest,
      unreadCount: pendingCount,
      isPinned: false,
      isMuted: false,
      isArchived: false,
      draft: null,
      senderName: null,
      atMe: false,
      scheduleDeletion: 0,
      updatedAt: time || Date.now(),
    })
    sortConversations()
  }

  function clearChannelNotificationUnread() {
    const id = `0_${CHANNEL_NOTIFICATION_TARGET_ID}`
    const idx = conversations.value.findIndex((c) => c.id === id)
    if (idx >= 0) {
      conversations.value[idx] = { ...conversations.value[idx], unreadCount: 0 }
    }
    if (isTauri() && _persistUid) {
      tauriInvoke('mark_as_read', { uid: _persistUid, conversationId: id }).catch((error) => {
        console.warn('[ChatStore] clear channel notification unread failed:', error)
      })
    }
  }

  function removeChannelNotificationConversation() {
    const id = `0_${CHANNEL_NOTIFICATION_TARGET_ID}`
    conversations.value = conversations.value.filter((c) => c.id !== id)
    if (currentConversationId.value === id) {
      currentConversationId.value = null
    }
  }

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
        (c) => !isFileHelperTargetId(c.targetId),
      )

      if (!isTauri() && !hasRealConversations) {
        const cached = loadConversationsFromCache(uid)
        if (cached.length > 0) {
          loaded = cached
        }
      }

      conversations.value = loaded
    } catch (e) {
      console.error('[ChatStore] loadConversations failed:', e)
      conversations.value = isTauri() ? [] : loadConversationsFromCache(uid)
    } finally {
      ensureFileHelperConversationInMemory()
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

  function addOrUpdateConversation(conv: Conversation, options?: { preserveListOrder?: boolean }) {
    const normalized = normalizeConversation(conv as any)
    if (normalized.type === 1 && isPendingGroupInviteConversation(normalized.targetId)) return
    const index = conversations.value.findIndex((c) => c.id === normalized.id)
    if (index >= 0) {
      const previous = conversations.value[index]
      conversations.value[index] = options?.preserveListOrder
        ? { ...normalized, updatedAt: previous.updatedAt }
        : normalized
    } else {
      conversations.value.unshift(normalized)
    }
    // 对齐旧 im：只有新消息/置顶等会影响排序的更新才重排；局部状态更新保留当前列表位置。
    if (options?.preserveListOrder && index >= 0) return
    sortConversations()
  }

  function ensureConversation(type: number, targetId: string): Conversation {
    const id = `${type}_${targetId}`
    const existing = conversations.value.find((c) => c.id === id)
    if (existing) return existing
    if (type === 1 && isPendingGroupInviteConversation(targetId)) {
      return {
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
    }

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

  function isPendingGroupInviteConversation(targetId: string | number | null | undefined): boolean {
    const id = String(targetId ?? '')
    return Boolean(id)
      && id !== GROUP_NOTIFICATION_TARGET_ID
      && pendingGroupInviteConversationIds.value.has(id)
  }

  function markPendingGroupInviteConversation(groupId: string | number | null | undefined) {
    const id = String(groupId ?? '').trim()
    if (!id || id === GROUP_NOTIFICATION_TARGET_ID) return
    const next = new Set(pendingGroupInviteConversationIds.value)
    next.add(id)
    pendingGroupInviteConversationIds.value = next
    if (currentConversationId.value === `1_${id}`) {
      currentConversationId.value = null
    }
  }

  function clearPendingGroupInviteConversation(groupId: string | number | null | undefined) {
    const id = String(groupId ?? '').trim()
    if (!id) return
    if (!pendingGroupInviteConversationIds.value.has(id)) return
    const next = new Set(pendingGroupInviteConversationIds.value)
    next.delete(id)
    pendingGroupInviteConversationIds.value = next
  }

  function sortConversations() {
    conversations.value.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      const timeDelta = b.updatedAt - a.updatedAt
      if (timeDelta !== 0) return timeDelta
      const aIsGroupNotification = a.type === 1 && a.targetId === GROUP_NOTIFICATION_TARGET_ID
      const bIsGroupNotification = b.type === 1 && b.targetId === GROUP_NOTIFICATION_TARGET_ID
      if (aIsGroupNotification !== bIsGroupNotification) {
        return aIsGroupNotification ? 1 : -1
      }
      return 0
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
    const result = await tauriInvoke<ReadProcessingResult>('mark_as_read', { uid, conversationId })
    updateConversation({ id: conversationId, unreadCount: 0, atMe: false })
    const unreadTotal = conversations.value
      .filter((c) => !c.isMuted && !c.isArchived)
      .reduce((sum, c) => sum + Math.max(0, Number(c.unreadCount || 0)), 0)
    tauriInvoke('update_tray_unread_count', {
      count: unreadTotal,
      flash: false,
    }).catch((error) => {
      console.warn('[ChatStore] update tray unread after markAsRead failed:', error)
    })

    const readMessageIds = Array.isArray(result?.readMessageIds) ? result.readMessageIds : []
    const scheduledDeletions = Array.isArray(result?.scheduledDeletions)
      ? result.scheduledDeletions
      : []
    const groupReadUpdates = Array.isArray(result?.groupReadUpdates)
      ? result.groupReadUpdates
      : []
    const conversationReadUpdates = Array.isArray(result?.conversationReadUpdates)
      ? result.conversationReadUpdates
      : []

    if (readMessageIds.length > 0 || scheduledDeletions.length > 0 || groupReadUpdates.length > 0 || conversationReadUpdates.length > 0) {
      const [{ useMessageStore }, { useScheduleDeletionStore }] = await Promise.all([
        import('./useMessageStore'),
        import('./useScheduleDeletionStore'),
      ])
      const messageStore = useMessageStore()
      const scheduleDeletionStore = useScheduleDeletionStore()

      if (readMessageIds.length > 0) {
        messageStore.markMessagesRead(readMessageIds, 1)
      }
      if (groupReadUpdates.length > 0) {
        messageStore.applyGroupReadReceiptPatches(groupReadUpdates)
      }
      for (const item of conversationReadUpdates) {
        const unreadCount = Math.max(0, Number(item.unreadCount || 0))
        updateConversation({
          id: String(item.conversationId || ''),
          unreadCount,
          ...(unreadCount > 0 ? {} : { atMe: false }),
        })
      }
      for (const item of scheduledDeletions) {
        scheduleDeletionStore.addMessageTimer(
          String(item.conversationId || conversationId),
          String(item.messageId || ''),
          Number(item.expireAt || 0),
        )
      }
    }

    return result
  }

  async function archiveConversation(uid: string, conversationId: string, archived: boolean) {
    if (!isTauri()) return
    await tauriInvoke('archive_conversation', { uid, conversationId, archived })
    updateConversation({ id: conversationId, isArchived: archived })
  }

  function setDraft(conversationId: string, draft: string | null) {
    const normalizedDraft = draft && draft.trim() ? draft : null
    updateConversation({ id: conversationId, draft: normalizedDraft })
    if (isTauri() && _persistUid) {
      tauriInvoke('set_conversation_draft', {
        uid: _persistUid,
        conversationId,
        draft: normalizedDraft,
      }).catch((error) => {
        console.warn('[ChatStore] set conversation draft failed:', error)
      })
    }
  }

  async function recallMessage(uid: string, messageId: string) {
    if (!isTauri()) return
    await tauriInvoke('recall_message', { uid, messageId })
  }

  async function deleteConversation(uid: string, conversationId: string) {
    if (isTauri()) {
      await tauriInvoke('delete_conversation', { uid, conversationId })
    }
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
    isPendingGroupInviteConversation,
    markPendingGroupInviteConversation,
    clearPendingGroupInviteConversation,
    pinConversation,
    muteConversation,
    markAsRead,
    archiveConversation,
    setDraft,
    recallMessage,
    deleteConversation,
    clearAllLocalChatHistory,
    ensureFileHelperConversationInMemory,
    updateGroupNotificationConv,
    clearGroupNotificationUnread,
    removeGroupNotificationConversation,
    updateChannelNotificationConv,
    clearChannelNotificationUnread,
    removeChannelNotificationConversation,
  }
})
