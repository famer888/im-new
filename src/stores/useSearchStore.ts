import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Contact } from './useContactStore'
import type { Group } from './useGroupStore'
import type { Channel } from './useChannelStore'
import type { Message } from './useMessageStore'
import { useContactStore } from './useContactStore'
import { useGroupStore } from './useGroupStore'
import { useChannelStore } from './useChannelStore'
import { useMessageStore } from './useMessageStore'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export interface SearchResults {
  contacts: Contact[]
  groups: Group[]
  channels: Channel[]
  messages: Message[]
}

/** 与 im `search-specified-chat` / `top.vue serachChat` 传入的 `info` 一致：id + type + pic + name */
export type SearchSpecifiedChatType = 'friend' | 'group' | 'channel'

export interface SearchSpecifiedChatInfo {
  id: string
  type: SearchSpecifiedChatType
  pic?: string
  name: string
}

/** 与 im `linkTo` → `chatMsgListSearchScrollTo` 的 data 字段一致，并补充 im-new 定位用字段 */
export interface ChatMsgListSearchScrollToPayload {
  id: string
  type: SearchSpecifiedChatType
  pic?: string
  name: string
  searchMsgInfo: null
  customMsgId: string | null
  sendTime: number
  comType: 'chat'
  conversationId: string
  messageId: string
}

export function conversationIdFromSearchSpecified(info: SearchSpecifiedChatInfo): string {
  const t = info.type === 'friend' ? 0 : info.type === 'group' ? 1 : 2
  return `${t}_${info.id}`
}

function parseConversationRef(conversationId: string): { type: number; targetId: string } {
  const i = conversationId.indexOf('_')
  if (i <= 0) return { type: 0, targetId: conversationId }
  const type = Number(conversationId.slice(0, i))
  return {
    type: Number.isFinite(type) ? type : 0,
    targetId: conversationId.slice(i + 1),
  }
}

export const useSearchStore = defineStore('search', () => {
  const keyword = ref('')
  const isSearching = ref(false)
  const results = ref<SearchResults>({ contacts: [], groups: [], channels: [], messages: [] })
  const specifiedChatId = ref<string | null>(null)
  const chatSearchResults = ref<Message[]>([])
  /** 与 im `home-left` 的 `searchSpecifiedChat` 一致：非空时中间栏展示「当前会话内搜索」 */
  const searchSpecifiedChatInfo = ref<SearchSpecifiedChatInfo | null>(null)
  /**
   * 与 im `eventBase.fnCommunicationSendMsg({ operator: 'chatMsgListSearchScrollTo', data })` 等效：
   * MessageList 消费后清空。
   */
  const chatMsgListSearchScrollRequest = ref<(ChatMsgListSearchScrollToPayload & { requestId: number }) | null>(null)
  let scrollRequestSeq = 0
  /** 与 im `chat-msg-list` 的 `idHighlighted` 一致（按服务端 message id） */
  const highlightSearchMessageId = ref<string | null>(null)
  let highlightTimer: ReturnType<typeof setTimeout> | null = null

  const hasResults = computed(() =>
    results.value.contacts.length > 0 ||
    results.value.groups.length > 0 ||
    results.value.channels.length > 0 ||
    results.value.messages.length > 0,
  )

  /**
   * 与 im searchs.vue handleSearchFriendAndGroup 一致：在已加载的通讯录数据上做内存过滤。
   * 浏览器/Web 无 Tauri DB 时仅走此逻辑；桌面端在 SQLite 结果基础上合并本地匹配（去重）。
   */
  function filterLocalContacts(q: string): Contact[] {
    const trimmed = q.trim()
    if (!trimmed) return []
    const upper = trimmed.toUpperCase()
    return useContactStore().contacts.filter((c) => {
      const id = String(c.id || '')
      if (id && id === trimmed) return true
      const nick = (c.nickname || '').toUpperCase()
      const remark = (c.remark || '').toUpperCase()
      const py = (c.pinyin || '').toUpperCase()
      return nick.includes(upper) || remark.includes(upper) || py.includes(upper) || id.includes(trimmed)
    })
  }

  function filterLocalGroups(q: string): Group[] {
    const trimmed = q.trim()
    if (!trimmed) return []
    const upper = trimmed.toUpperCase()
    return useGroupStore().groups.filter(
      (g) => !!g.name && g.name.toUpperCase().includes(upper),
    )
  }

  function filterLocalChannels(q: string): Channel[] {
    const trimmed = q.trim()
    if (!trimmed) return []
    const upper = trimmed.toUpperCase()
    return useChannelStore().channels.filter((ch) => {
      const name = (ch.name || ch.channelName || '').toUpperCase()
      return name.includes(upper)
    })
  }

  function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
    const map = new Map<string, T>()
    for (const x of a) map.set(String(x.id), x)
    for (const x of b) {
      if (!map.has(String(x.id))) map.set(String(x.id), x)
    }
    return Array.from(map.values())
  }

  function normalizeSearchMessage(raw: any): Message {
    return {
      id: String(raw.id ?? ''),
      customMsgId: raw.customMsgId ?? raw.custom_msg_id ?? null,
      conversationId: String(raw.conversationId ?? raw.conversation_id ?? ''),
      senderId: String(raw.senderId ?? raw.sender_id ?? ''),
      msgType: Number(raw.msgType ?? raw.msg_type ?? 0),
      content: raw.content ?? null,
      sendTime: Number(raw.sendTime ?? raw.send_time ?? Date.now()),
      status: Number(raw.status ?? 0),
      readStatus: Number(raw.readStatus ?? raw.read_status ?? 0),
      version: Number(raw.version ?? 0),
      isDeleted: Boolean(raw.isDeleted ?? raw.is_deleted ?? false),
      extra: raw.extra ?? null,
    }
  }

  function messageDigestForSearch(m: Message): string {
    if (m.msgType === 1) return '[图片]'
    if (m.msgType === 9) return '[动画表情]'
    if (m.msgType === 2) return '[语音]'
    if (m.msgType === 3) return '[视频]'
    if (m.msgType === 7) return '[文件]'
    if (m.msgType === 12) return '[骰子]'
    if (m.msgType === 18) return '[扑克牌]'
    return (m.content || '').trim().replace(/\s+/g, ' ').slice(0, 200)
  }

  /** 浏览器 / 内存缓存：扫描已加载消息（与 im 本地 getListSearch 思路一致，范围限于当前缓存） */
  function searchMessagesInMemory(query: string, limit: number): Message[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const messageStore = useMessageStore()
    const matched: Message[] = []
    for (const [, list] of messageStore.messageMap) {
      for (const m of list) {
        if (m.isDeleted) continue
        const digest = messageDigestForSearch(m)
        const text = (m.content || '').toLowerCase()
        if (text.includes(q) || digest.toLowerCase().includes(q)) {
          matched.push(m)
        }
      }
    }
    matched.sort((a, b) => b.sendTime - a.sendTime)
    return matched.slice(0, limit)
  }

  function mergeMessagesByConvAndId(a: Message[], b: Message[]): Message[] {
    const key = (m: Message) => `${m.conversationId}:${m.id}`
    const map = new Map<string, Message>()
    for (const m of a) map.set(key(m), m)
    for (const m of b) {
      const k = key(m)
      if (!map.has(k)) map.set(k, m)
    }
    return Array.from(map.values()).sort((x, y) => y.sendTime - x.sendTime)
  }

  async function search(uid: string, query: string) {
    keyword.value = query
    if (!query.trim()) {
      clearResults()
      return
    }

    const localContacts = filterLocalContacts(query)
    const localGroups = filterLocalGroups(query)
    const localChannels = filterLocalChannels(query)
    const qLower = query.trim().toLowerCase()

    const memoryMsgs = searchMessagesInMemory(query, 80)

    if (!isTauri()) {
      results.value = {
        contacts: localContacts,
        groups: localGroups,
        channels: localChannels,
        messages: memoryMsgs.slice(0, 50),
      }
      return
    }

    isSearching.value = true
    try {
      const msgPromise = tauriInvoke<any[]>('search_messages', {
        uid,
        keyword: query.trim(),
        limit: 50,
      }).catch((err) => {
        console.warn('[SearchStore] search_messages:', err)
        return [] as any[]
      })

      const [dbContacts, allGroups, allChannels, rawMsgs] = await Promise.all([
        tauriInvoke<Contact[]>('search_contacts', { uid, keyword: query }),
        tauriInvoke<Group[]>('get_groups', { uid }),
        tauriInvoke<Channel[]>('get_channels', { uid }),
        msgPromise,
      ])
      const groups = allGroups.filter((g) => g.name?.toLowerCase().includes(qLower))
      const channels = allChannels.filter((c) =>
        (c.name || c.channelName || '').toLowerCase().includes(qLower),
      )
      const dbMsgs = Array.isArray(rawMsgs)
        ? rawMsgs.map(normalizeSearchMessage).filter((m) => !m.isDeleted)
        : []
      const messages = mergeMessagesByConvAndId(dbMsgs, memoryMsgs).slice(0, 50)

      results.value = {
        contacts: mergeById(dbContacts, localContacts),
        groups: mergeById(groups, localGroups),
        channels: mergeById(channels, localChannels),
        messages,
      }
    } catch (e) {
      console.error('[SearchStore] search failed:', e)
      results.value = {
        contacts: localContacts,
        groups: localGroups,
        channels: localChannels,
        messages: memoryMsgs.slice(0, 50),
      }
    } finally {
      isSearching.value = false
    }
  }

  async function searchInChat(uid: string, conversationId: string, query: string) {
    specifiedChatId.value = conversationId
    const q = query.trim()
    if (!q) {
      chatSearchResults.value = []
      return
    }
    const messageStore = useMessageStore()
    const qLower = q.toLowerCase()
    const local = messageStore
      .getMessages(conversationId)
      .filter((m) => {
        if (m.isDeleted) return false
        const text = (m.content || '').toLowerCase()
        const digest = messageDigestForSearch(m).toLowerCase()
        return text.includes(qLower) || digest.includes(qLower)
      })

    if (!isTauri()) {
      chatSearchResults.value = [...local].sort((a, b) => b.sendTime - a.sendTime)
      return
    }

    try {
      const raw = await tauriInvoke<any[]>('search_messages', {
        uid,
        keyword: q,
        limit: 100,
        conversationId,
      })
      const db = Array.isArray(raw)
        ? raw.map(normalizeSearchMessage).filter((m) => !m.isDeleted)
        : []
      chatSearchResults.value = mergeMessagesByConvAndId(db, local).slice(0, 100)
    } catch (e) {
      console.warn('[SearchStore] searchInChat:', e)
      chatSearchResults.value = [...local].sort((a, b) => b.sendTime - a.sendTime)
    }
  }

  function clearResults() {
    keyword.value = ''
    results.value = { contacts: [], groups: [], channels: [], messages: [] }
  }

  function clearChatSearch() {
    specifiedChatId.value = null
    chatSearchResults.value = []
  }

  function openSearchSpecifiedChat(info: SearchSpecifiedChatInfo) {
    searchSpecifiedChatInfo.value = info
    specifiedChatId.value = conversationIdFromSearchSpecified(info)
    chatSearchResults.value = []
  }

  function closeSearchSpecifiedChat() {
    searchSpecifiedChatInfo.value = null
    clearChatSearch()
    chatMsgListSearchScrollRequest.value = null
  }

  /**
   * 与 im `search-specified-chat.vue` / `searchs.vue` 里 `linkTo` 发往 `chatMsgListSearchScrollTo` 的 data 对齐。
   */
  function requestChatMsgListSearchScrollTo(payload: ChatMsgListSearchScrollToPayload) {
    scrollRequestSeq += 1
    chatMsgListSearchScrollRequest.value = { ...payload, requestId: scrollRequestSeq }
  }

  function clearChatMsgListSearchScrollRequest() {
    chatMsgListSearchScrollRequest.value = null
  }

  /** 从全局搜索结果的一条 Message 构造与 im `linkTo` 相同的参数 */
  function buildScrollPayloadFromMessage(m: Message, convName: string, pic?: string): ChatMsgListSearchScrollToPayload {
    const { type, targetId } = parseConversationRef(m.conversationId)
    const typeStr: SearchSpecifiedChatType = type === 1 ? 'group' : type === 2 ? 'channel' : 'friend'
    return {
      id: targetId,
      type: typeStr,
      pic,
      name: convName,
      searchMsgInfo: null,
      customMsgId: m.customMsgId,
      sendTime: m.sendTime,
      comType: 'chat',
      conversationId: m.conversationId,
      messageId: m.id,
    }
  }

  function setSearchMessageHighlight(messageId: string) {
    if (highlightTimer) {
      clearTimeout(highlightTimer)
      highlightTimer = null
    }
    highlightSearchMessageId.value = messageId
    highlightTimer = setTimeout(() => {
      highlightSearchMessageId.value = null
      highlightTimer = null
    }, 2000)
  }

  return {
    keyword,
    isSearching,
    results,
    hasResults,
    specifiedChatId,
    chatSearchResults,
    searchSpecifiedChatInfo,
    chatMsgListSearchScrollRequest,
    highlightSearchMessageId,
    search,
    searchInChat,
    clearResults,
    clearChatSearch,
    openSearchSpecifiedChat,
    closeSearchSpecifiedChat,
    requestChatMsgListSearchScrollTo,
    clearChatMsgListSearchScrollRequest,
    buildScrollPayloadFromMessage,
    setSearchMessageHighlight,
    conversationIdFromSearchSpecified,
  }
})
