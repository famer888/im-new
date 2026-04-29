import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { FILE_HELPER_TARGET_ID, useChatStore } from './useChatStore'
import { useAuthStore } from './useAuthStore'
import { ensureFriendRelKey, ensureGroupRelKey, ensureOwnKeyPair } from '@/utils/e2ee'
import { API_CONFIG } from '@/api/config'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeWsUrl(input: string): string {
  const raw = (input || '').trim()
  if (!raw) return ''
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw
  if (raw.startsWith('https://')) return `wss://${raw.slice('https://'.length)}`
  if (raw.startsWith('http://')) return `ws://${raw.slice('http://'.length)}`
  return `ws://${raw}`
}

async function resolveWsConnectConfig(): Promise<{
  wsUrl: string
  aesKey: string
  sessionId: string
  installCode: string
}> {
  const authStore = useAuthStore()
  let wsUrl = authStore.wsConnectConfig?.wsUrl?.trim() || ''
  let aesKey = authStore.wsConnectConfig?.aesKey?.trim() || ''
  let sessionId = String(authStore.session?.sessionId || '').trim()
  let installCode = ''

  // 兼容历史缓存：若 authStore 尚未带出，直接读 localStorage 的持久化配置
  if (!wsUrl || !aesKey) {
    try {
      const raw = localStorage.getItem('ws-connect-config')
      if (raw) {
        const parsed = JSON.parse(raw) as { wsUrl?: string; aesKey?: string }
        wsUrl = wsUrl || String(parsed.wsUrl || '').trim()
        aesKey = aesKey || String(parsed.aesKey || '').trim()
      }
    } catch {
      // ignore parse errors
    }
  }

  if (!sessionId) {
    try {
      const currentUid = localStorage.getItem('current-uid') || ''
      const accountListText = localStorage.getItem('login-account-list')
      const accountList = accountListText ? JSON.parse(accountListText) : []
      if (Array.isArray(accountList) && accountList.length > 0) {
        const current = accountList.find((item: any) => String(item?.id || '') === currentUid)
        const preferred = current || accountList[accountList.length - 1]
        sessionId = String(preferred?.sessionId || '').trim()
      }
    } catch {
      // ignore parse errors
    }
  }

  // 不再回退到 webbiz baseUrl（会导致 ws 握手 key mismatch）；
  // 尝试按老链路从 webSession 域名池推导 session ws 域名。
  if (!wsUrl) {
    try {
      const { collectAllDomainUrls } = await import('@/api/imDomain')
      const candidates = await collectAllDomainUrls('webSession')
      if (Array.isArray(candidates) && candidates.length > 0) {
        wsUrl = String(candidates[0] || '').trim()
      }
    } catch {
      // ignore dynamic domain resolve failures
    }
  }

  // 最后一层兜底：历史环境里常见 webbiz/websession 仅一段词差异
  if (wsUrl && /webbiz/i.test(wsUrl)) {
    wsUrl = wsUrl.replace(/webbiz/gi, 'websession')
  }
  if (!aesKey) aesKey = API_CONFIG.aesKey

  return {
    wsUrl: normalizeWsUrl(wsUrl),
    aesKey,
    sessionId,
    installCode,
  }
}

export interface QuoteMessageInfo {
  id: string
  customMsgId?: string | null
  senderId: string
  senderName: string
  msgType: number
  content: string | null
}

export interface Message {
  id: string
  customMsgId: string | null
  conversationId: string
  senderId: string
  msgType: number
  content: string | null
  sendTime: number
  status: number // 0: sending, 1: sent, 2: delivered, 3: read
  readStatus: number
  version: number
  isDeleted: boolean
  extra: string | null
  snapchatTime?: number
  deleteSeconds?: number
  quoteMessage?: QuoteMessageInfo | null
}

const MAX_CACHED_MESSAGES = 500
const PAGE_SIZE = 50
const LOGOUT_CLEARED_HISTORY_FLAG_PREFIX = 'logout-cleared-history:'

function getLogoutClearedHistoryAt(uid: string): number {
  if (!uid) return 0
  const raw = localStorage.getItem(`${LOGOUT_CLEARED_HISTORY_FLAG_PREFIX}${uid}`)
  const value = Number(raw || 0)
  return Number.isFinite(value) ? value : 0
}

function parseExtraObject(rawExtra: unknown): Record<string, unknown> | null {
  if (!rawExtra) return null
  if (typeof rawExtra === 'string') {
    try {
      const parsed = JSON.parse(rawExtra)
      if (typeof parsed === 'string') {
        try {
          const nested = JSON.parse(parsed)
          return nested && typeof nested === 'object' ? nested as Record<string, unknown> : null
        } catch {
          return null
        }
      }
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
  return typeof rawExtra === 'object' ? rawExtra as Record<string, unknown> : null
}

function stringifyExtra(rawExtra: unknown): string | null {
  if (!rawExtra) return null
  if (typeof rawExtra === 'string') return rawExtra
  if (typeof rawExtra === 'object') {
    try {
      return JSON.stringify(rawExtra)
    } catch {
      return null
    }
  }
  return null
}

function sanitizeSendExtra(extra?: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (!key.startsWith('__')) cleaned[key] = value
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}

function extractReadBurnMeta(raw: any, extraObj?: Record<string, unknown> | null) {
  const snapchatTime = Number(
    raw?.snapchatTime ??
    raw?.snapchat_time ??
    extraObj?.snapchatTime ??
    extraObj?.snapchat_time ??
    0,
  )
  const deleteSeconds = Number(
    raw?.deleteSeconds ??
    raw?.delete_seconds ??
    extraObj?.deleteSeconds ??
    0,
  )
  const normalizedSnapchatTime = snapchatTime > 0 ? snapchatTime : undefined
  const normalizedDeleteSeconds = deleteSeconds > 0
    ? deleteSeconds
    : (normalizedSnapchatTime ? normalizedSnapchatTime * 1000 : undefined)
  return {
    snapchatTime: normalizedSnapchatTime,
    deleteSeconds: normalizedDeleteSeconds,
  }
}

function filterMessagesHiddenByLogoutClear(uid: string, messages: Message[]) {
  const logoutClearedHistoryAt = getLogoutClearedHistoryAt(uid)
  if (logoutClearedHistoryAt <= 0) {
    return {
      messages,
      hitLogoutClearBoundary: false,
    }
  }

  const filtered = messages.filter((item) => !(item.sendTime > 0 && item.sendTime <= logoutClearedHistoryAt))
  const latestFetchedSendTime = messages.length > 0 ? messages[messages.length - 1].sendTime : 0

  return {
    messages: filtered,
    hitLogoutClearBoundary: latestFetchedSendTime > 0 && latestFetchedSendTime <= logoutClearedHistoryAt,
  }
}

export const useMessageStore = defineStore('message', () => {
  const chatStore = useChatStore()
  const messageMap = ref<Map<string, Message[]>>(new Map())
  const loadingMap = ref<Map<string, boolean>>(new Map())
  const hasMoreMap = ref<Map<string, boolean>>(new Map())
  let pendingWsConnect: Promise<void> | null = null

  async function ensureWsConnected(): Promise<void> {
    if (!isTauri()) return

    const status = await tauriInvoke<string>('get_ws_status').catch(() => 'disconnected')
    if (status === 'connected') return

    const { wsUrl, aesKey, sessionId, installCode } = await resolveWsConnectConfig()
    if (!wsUrl || !aesKey) {
      throw new Error('[ws] connect config missing (wsUrl/aesKey)')
    }

    if (!pendingWsConnect) {
      pendingWsConnect = (async () => {
        console.warn('[ws] ensureWsConnected: reconnecting...', { status, wsUrl })
        await tauriInvoke('connect_ws', { url: wsUrl, aesKey, sessionId, installCode })
        for (let i = 0; i < 20; i++) {
          const s = await tauriInvoke<string>('get_ws_status').catch(() => 'disconnected')
          if (s === 'connected') return
          await sleep(150)
        }
        throw new Error('[ws] reconnect timeout: status did not become connected')
      })().finally(() => {
        pendingWsConnect = null
      })
    }

    return pendingWsConnect
  }

  function getDigestByMessage(msgType: number, content: string | null): string {
    if (msgType === 0) {
      return (content || '').trim().replace(/\s+/g, ' ').slice(0, 200)
    }
    if (msgType === 1) return '[图片]'
    if (msgType === 2) return '[语音]'
    if (msgType === 3) return '[视频]'
    if (msgType === 5) return '[名片]'
    if (msgType === 7) return '[文件]'
    return (content || '').trim().replace(/\s+/g, ' ').slice(0, 200)
  }

  function syncConversationSummary(conversationId: string, msg: Message) {
    if (!conversationId || !conversationId.includes('_')) {
      console.warn('[msg] skip syncConversationSummary: invalid conversationId', { conversationId, msgId: msg.id })
      return
    }
    const digest = getDigestByMessage(msg.msgType, msg.content)
    const existing = chatStore.conversations.find((c) => c.id === conversationId)
    if (existing) {
      chatStore.addOrUpdateConversation({
        ...existing,
        lastMsgId: msg.id || existing.lastMsgId,
        lastMsgTime: msg.sendTime || Date.now(),
        lastMsgDigest: digest || existing.lastMsgDigest,
        updatedAt: msg.sendTime || Date.now(),
      })
      return
    }
    const [typeRaw, targetId = ''] = conversationId.split('_')
    const conv = chatStore.ensureConversation(Number(typeRaw || 0), targetId)
    chatStore.addOrUpdateConversation({
      ...conv,
      lastMsgId: msg.id || conv.lastMsgId,
      lastMsgTime: msg.sendTime || Date.now(),
      lastMsgDigest: digest || conv.lastMsgDigest,
      updatedAt: msg.sendTime || Date.now(),
    })
  }

  function refreshConversationSummary(conversationId: string, messages?: Message[]) {
    if (!conversationId || !conversationId.includes('_')) return
    const existing = chatStore.conversations.find((c) => c.id === conversationId)
    if (!existing) return

    // 最后一条消息被阅后即焚/本地删除后，左侧会话预览要回退到仍可见的最后一条。
    const list = messages ?? getMessages(conversationId)
    const latest = list.length > 0 ? list[list.length - 1] : null
    const digest = latest ? getDigestByMessage(latest.msgType, latest.content) : null

    chatStore.addOrUpdateConversation({
      ...existing,
      lastMsgId: latest?.id || null,
      lastMsgTime: latest?.sendTime || 0,
      lastMsgDigest: digest || null,
      updatedAt: latest?.sendTime || existing.updatedAt,
    })
  }

  function normalizeMessage(raw: any): Message {
    const extraObj = parseExtraObject(raw.extra)
    const extraStr = stringifyExtra(raw.extra)
    let quoteMessage: QuoteMessageInfo | null = raw.quoteMessage ?? null
    if (!quoteMessage && extraObj?.quoteMessage) {
      quoteMessage = extraObj.quoteMessage as QuoteMessageInfo
    }
    const { snapchatTime, deleteSeconds } = extractReadBurnMeta(raw, extraObj)
    return {
      id: String(raw.id ?? raw.msgId ?? raw.msg_id ?? ''),
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
      extra: extraStr,
      snapchatTime,
      deleteSeconds,
      quoteMessage,
    }
  }

  function getMessages(conversationId: string): Message[] {
    return messageMap.value.get(conversationId) ?? []
  }

  function isLoading(conversationId: string): boolean {
    return loadingMap.value.get(conversationId) ?? false
  }

  function hasMore(conversationId: string): boolean {
    return hasMoreMap.value.get(conversationId) ?? true
  }

  async function loadMessages(uid: string, conversationId: string) {
    if (!isTauri()) return
    if (isLoading(conversationId)) return

    loadingMap.value.set(conversationId, true)
    try {
      const result = await tauriInvoke<any[]>('get_messages', {
        uid,
        conversationId,
        limit: PAGE_SIZE,
      })
      const normalized = Array.isArray(result) ? result.map(normalizeMessage) : []
      const filteredResult = filterMessagesHiddenByLogoutClear(uid, normalized)
      messageMap.value.set(conversationId, filteredResult.messages)
      hasMoreMap.value.set(
        conversationId,
        !filteredResult.hitLogoutClearBoundary && normalized.length >= PAGE_SIZE,
      )
    } finally {
      loadingMap.value.set(conversationId, false)
    }
  }

  async function loadOlderMessages(uid: string, conversationId: string) {
    if (!isTauri()) return
    if (isLoading(conversationId) || !hasMore(conversationId)) return

    const existing = getMessages(conversationId)
    const beforeTime = existing.length > 0 ? existing[0].sendTime : undefined

    loadingMap.value.set(conversationId, true)
    try {
      const result = await tauriInvoke<any[]>('get_messages', {
        uid,
        conversationId,
        beforeTime,
        limit: PAGE_SIZE,
      })
      const normalized = Array.isArray(result) ? result.map(normalizeMessage) : []
      const filteredResult = filterMessagesHiddenByLogoutClear(uid, normalized)
      if (filteredResult.messages.length > 0) {
        const merged = [...filteredResult.messages, ...existing]
        if (merged.length > MAX_CACHED_MESSAGES) {
          merged.splice(0, merged.length - MAX_CACHED_MESSAGES)
        }
        messageMap.value.set(conversationId, merged)
      }
      hasMoreMap.value.set(
        conversationId,
        !filteredResult.hitLogoutClearBoundary && normalized.length >= PAGE_SIZE,
      )
    } finally {
      loadingMap.value.set(conversationId, false)
    }
  }

  async function sendMessage(
    uid: string,
    conversationId: string,
    msgType: number,
    content: string,
    extra?: Record<string, unknown>,
  ) {
    const clientMsgId = typeof extra?.__clientMsgId === 'string' ? extra.__clientMsgId : ''
    const sendExtra = sanitizeSendExtra(extra)
    const quoteMsg = (sendExtra?.quoteMessage as QuoteMessageInfo) ?? null
    const extraJson = sendExtra && Object.keys(sendExtra).length > 0 ? JSON.stringify(sendExtra) : null
    const { snapchatTime, deleteSeconds } = extractReadBurnMeta(sendExtra)

    if (!isTauri()) {
      const now = Date.now()
      const localId = `local-${now}-${Math.random().toString(36).slice(2, 8)}`
      const localMsg: Message = {
        id: localId,
        customMsgId: localId,
        conversationId,
        senderId: uid,
        msgType,
        content,
        sendTime: now,
        status: 1,
        readStatus: 0,
        version: 0,
        isDeleted: false,
        extra: extraJson,
        snapchatTime,
        deleteSeconds,
        quoteMessage: quoteMsg,
      }
      appendMessage(conversationId, localMsg)
      syncConversationSummary(conversationId, localMsg)
      return localMsg
    }

    const [typeRaw, targetId = ''] = conversationId.split('_')
    const convType = Number(typeRaw || 0)
    const isFileHelperSend = convType === 0 && targetId === FILE_HELPER_TARGET_ID

    // 乐观追加：先插一条 status=0（发送中）的本地消息，立即反馈到 UI。
    // Rust 端 `send_message` 也会返回同结构的一条行，下面 normalizedResult
    // 用它覆盖占位（会按 customMsgId 精准替换，避免重复）。
    const clientFlag = clientMsgId ? Number(clientMsgId) || Date.now() : Date.now()
    const optimisticId = String(clientFlag)
    const optimistic: Message = {
      id: optimisticId,
      customMsgId: optimisticId,
      conversationId,
      senderId: uid,
      msgType,
      content,
      sendTime: clientFlag,
      status: 0, // sending
      readStatus: 0,
      version: 0,
      isDeleted: false,
      extra: extraJson,
      snapchatTime,
      deleteSeconds,
      quoteMessage: quoteMsg,
    }
    appendMessage(conversationId, optimistic)
    syncConversationSummary(conversationId, optimistic)

    const sendStartedAt = performance.now()
    const logSendStep = (
      message: string,
      data?: Record<string, unknown>,
      level: 'info' | 'warn' | 'error' = 'info',
    ) => {
      const log = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
      log(`[send] ${message}`, {
        elapsedMs: Math.round(performance.now() - sendStartedAt),
        conversationId,
        msgType,
        optimisticId,
        ...(data || {}),
      })
    }

    console.log('[send] begin', {
      uid,
      conversationId,
      convType,
      targetId,
      msgType,
      contentLen: (content || '').length,
      optimisticId,
    })

    // 发送前先保证对应会话的 relKey 已在 Rust 缓存里；失败则标记为发送失败。
    if (convType === 1 && targetId) {
      try {
        const stepStartedAt = performance.now()
        await ensureGroupRelKey(uid, targetId)
        logSendStep('ensureGroupRelKey OK', {
          targetId,
          stepMs: Math.round(performance.now() - stepStartedAt),
        })
      } catch (e) {
        logSendStep('ensureGroupRelKey failed', {
          targetId,
          message: (e as Error)?.message || String(e),
        }, 'error')
        updateMessageStatus(optimisticId, -1)
        throw e
      }
    }
    if (isFileHelperSend) {
      try {
        const stepStartedAt = performance.now()
        await ensureOwnKeyPair(uid)
        logSendStep('ensureOwnKeyPair OK for file helper', {
          stepMs: Math.round(performance.now() - stepStartedAt),
        })
      } catch (e) {
        logSendStep('ensureOwnKeyPair failed for file helper', {
          message: (e as Error)?.message || String(e),
        }, 'error')
        updateMessageStatus(optimisticId, -1)
        throw e
      }
    } else if (convType === 0 && targetId) {
      try {
        const stepStartedAt = performance.now()
        await ensureFriendRelKey(uid, targetId)
        logSendStep('ensureFriendRelKey OK', {
          targetId,
          stepMs: Math.round(performance.now() - stepStartedAt),
        })
      } catch (e) {
        logSendStep('ensureFriendRelKey failed', {
          targetId,
          message: (e as Error)?.message || String(e),
        }, 'error')
        updateMessageStatus(optimisticId, -1)
        throw e
      }
    }

    try {
      if ([0, 1, 2, 7].includes(msgType) && (convType === 1 || convType === 0)) {
        const stepStartedAt = performance.now()
        await ensureWsConnected()
        logSendStep('ensureWsConnected OK', {
          stepMs: Math.round(performance.now() - stepStartedAt),
        })
      }
      const rustStartedAt = performance.now()
      logSendStep('invoking Rust send_message')
      const result = await tauriInvoke<any>('send_message', {
        uid,
        request: {
          conversation_id: conversationId,
          msg_type: msgType,
          content,
          extra: sendExtra ?? null,
          custom_msg_id: optimisticId,
          snapchat_time: snapchatTime ?? 0,
        },
      })
      logSendStep('Rust send_message result', {
        stepMs: Math.round(performance.now() - rustStartedAt),
        resultId: String(result?.id || result?.customMsgId || result?.custom_msg_id || ''),
        resultStatus: Number(result?.status ?? 0),
      })
      const normalized = normalizeMessage(result)
      if (quoteMsg && !normalized.quoteMessage) {
        normalized.quoteMessage = quoteMsg
      }
      if (extraJson && !normalized.extra) {
        normalized.extra = extraJson
      }
      appendMessage(conversationId, normalized)
      syncConversationSummary(conversationId, normalized)
      return normalized
    } catch (e) {
      const errText = String((e as any)?.message || e || '')
      const canRetryWs = [0, 1, 2, 7].includes(msgType) && (convType === 1 || convType === 0) && /Not connected/i.test(errText)
      if (canRetryWs) {
        try {
          console.warn('[send] send_message got Not connected, reconnect + retry once')
          await ensureWsConnected()
          const retry = await tauriInvoke<any>('send_message', {
            uid,
            request: {
              conversation_id: conversationId,
              msg_type: msgType,
              content,
              extra: sendExtra ?? null,
              custom_msg_id: optimisticId,
              snapchat_time: snapchatTime ?? 0,
            },
          })
          const normalized = normalizeMessage(retry)
          if (quoteMsg && !normalized.quoteMessage) {
            normalized.quoteMessage = quoteMsg
          }
          if (extraJson && !normalized.extra) {
            normalized.extra = extraJson
          }
          appendMessage(conversationId, normalized)
          syncConversationSummary(conversationId, normalized)
          return normalized
        } catch (retryErr) {
          console.error('[send] retry after reconnect failed:', retryErr)
        }
      }
      console.error('[send] send_message failed:', e)
      updateMessageStatus(optimisticId, -1)
      throw e
    }
  }

  async function resendMessage(uid: string, message: Message) {
    if (!uid || !message.conversationId || message.status !== -1) return null

    const extra = parseExtraObject(message.extra) ?? {}
    if (message.quoteMessage && !extra.quoteMessage) {
      extra.quoteMessage = message.quoteMessage
    }

    const failedId = message.id || message.customMsgId || ''
    if (failedId) {
      deleteMessage(message.conversationId, failedId)
      if (isTauri()) {
        tauriInvoke('delete_message', { uid, messageId: failedId }).catch((err) => {
          console.warn('[msg] delete failed message before resend failed:', err)
        })
      }
    }

    return sendMessage(
      uid,
      message.conversationId,
      message.msgType,
      message.content || '',
      Object.keys(extra).length > 0 ? extra : undefined,
    )
  }

  function appendMessage(conversationId: string, message: Message) {
    if (!conversationId || !conversationId.includes('_')) {
      console.warn('[msg] skip appendMessage: invalid conversationId', { conversationId, messageId: message.id })
      return
    }
    const list = messageMap.value.get(conversationId) ?? []
    const existIndex = list.findIndex(
      (m) => m.id === message.id || (m.customMsgId && m.customMsgId === message.customMsgId),
    )
    if (existIndex >= 0) {
      const previous = list[existIndex]
      list[existIndex] = {
        ...previous,
        ...message,
        extra: message.extra ?? previous.extra,
        quoteMessage: message.quoteMessage ?? previous.quoteMessage,
        snapchatTime: message.snapchatTime ?? previous.snapchatTime,
        deleteSeconds: message.deleteSeconds ?? previous.deleteSeconds,
      }
    } else {
      list.push(message)
    }
    if (list.length > MAX_CACHED_MESSAGES) {
      list.splice(0, list.length - MAX_CACHED_MESSAGES)
    }
    messageMap.value.set(conversationId, list)
  }

  function batchAppendMessages(messages: Message[]) {
    const grouped = new Map<string, Message[]>()
    for (const raw of messages as any[]) {
      const msg = normalizeMessage(raw)
      const convId = String(msg.conversationId || '')
      if (!convId || !convId.includes('_')) {
        console.warn('[msg] drop batch item: invalid conversationId', {
          conversationId: (raw as any)?.conversationId ?? (raw as any)?.conversation_id,
          messageId: (raw as any)?.id,
        })
        continue
      }
      const list = grouped.get(convId) ?? []
      list.push(msg)
      grouped.set(convId, list)
    }

    for (const [convId, msgs] of grouped) {
      for (const msg of msgs) {
        appendMessage(convId, msg)
      }
      const latest = msgs[msgs.length - 1]
      if (latest) {
        syncConversationSummary(convId, latest)
      }
    }
  }

  function appendLocalSystemNotice(conversationId: string, content: string) {
    const now = Date.now()
    const localId = `local-notice-${now}-${Math.random().toString(36).slice(2, 8)}`
    appendMessage(conversationId, {
      id: localId,
      customMsgId: localId,
      conversationId,
      senderId: '',
      msgType: 6,
      content,
      sendTime: now,
      status: 1,
      readStatus: 0,
      version: 0,
      isDeleted: false,
      extra: null,
    })
  }

  function updateMessageStatus(messageId: string, status: number) {
    for (const [convId, list] of messageMap.value.entries()) {
      const idx = list.findIndex((m) => m.id === messageId || m.customMsgId === messageId)
      if (idx >= 0) {
        const next = [...list]
        next[idx] = { ...next[idx], status }
        messageMap.value.set(convId, next)
        break
      }
    }
  }

  function updateMessage(messageId: string, updates: Partial<Message>) {
    for (const [convId, list] of messageMap.value.entries()) {
      const idx = list.findIndex((m) => m.id === messageId || m.customMsgId === messageId)
      if (idx >= 0) {
        const next = [...list]
        next[idx] = { ...next[idx], ...updates }
        messageMap.value.set(convId, next)
        break
      }
    }
  }

  function markMessagesRead(messageIds: string[], readStatus = 1) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) return
    const idSet = new Set(messageIds.filter(Boolean).map(String))
    if (idSet.size === 0) return

    for (const [convId, list] of messageMap.value.entries()) {
      let changed = false
      const next = list.map((item) => {
        const matched = idSet.has(String(item.id)) || (item.customMsgId && idSet.has(String(item.customMsgId)))
        if (!matched || item.readStatus === readStatus) return item
        changed = true
        return {
          ...item,
          readStatus,
        }
      })
      if (changed) {
        messageMap.value.set(convId, next)
      }
    }
  }

  function applyGroupReadReceiptPatches(patches: Array<{
    conversationId: string
    messageId: string
    readStatus: number
    extra?: string | null
  }>) {
    if (!Array.isArray(patches) || patches.length === 0) return

    for (const patch of patches) {
      const convId = String(patch.conversationId || '')
      const messageId = String(patch.messageId || '')
      if (!convId || !messageId) continue

      const list = messageMap.value.get(convId)
      if (!list) continue

      const idx = list.findIndex((m) => m.id === messageId || m.customMsgId === messageId)
      if (idx < 0) continue

      const next = [...list]
      next[idx] = {
        ...next[idx],
        readStatus: Number(patch.readStatus || 0),
        extra: patch.extra ?? next[idx].extra,
      }
      messageMap.value.set(convId, next)
    }
  }

  function applySendFailed(params: {
    flag: number | string
    conversationId?: string
    reason?: string
  }) {
    const flag = String(params.flag || '')
    if (!flag) return

    const scan = (convId: string, list: Message[]): boolean => {
      const idx = list.findIndex((m) => m.customMsgId === flag || m.id === flag)
      if (idx < 0) return false
      const next = [...list]
      next[idx] = { ...next[idx], status: -1 }
      messageMap.value.set(convId, next)
      if (params.reason) {
        console.warn('[msg:send-failed]', { convId, flag, reason: params.reason })
      }
      return true
    }

    if (params.conversationId) {
      const list = messageMap.value.get(params.conversationId)
      if (list) scan(params.conversationId, list)
      return
    }

    for (const [convId, list] of messageMap.value.entries()) {
      if (scan(convId, list)) break
    }
  }

  /**
   * 群消息 20201 回执落地。
   *
   * - 根据 `customMsgId (= flag)` 匹配本地乐观占位的那条；
   * - 把 `id` 更新为服务端下发的真实 msgId、状态升级到 `sent(1)`、
   *   `sendTime` 校正为服务端发送完成时间；
   * - 同步更新会话最后一条消息 id，避免下次加载出现占位/真实 id 不一致。
   */
  function applySendReceipt(params: {
    conversationId: string
    flag: number | string
    serverMsgId: number | string
    sentOverTime?: number
  }) {
    const customMsgId = String(params.flag)
    const serverId = String(params.serverMsgId)
    const list = messageMap.value.get(params.conversationId)
    if (!list) return
    const idx = list.findIndex(
      (m) => m.customMsgId === customMsgId || m.id === customMsgId,
    )
    if (idx < 0) return
    const next = [...list]
    const msg = {
      ...next[idx],
      id: serverId,
      status: 1,
      readStatus: Math.max(Number(next[idx].readStatus || 0), 1),
    }
    if (params.sentOverTime && params.sentOverTime > 0) {
      msg.sendTime = params.sentOverTime
    }
    next[idx] = msg
    messageMap.value.set(params.conversationId, next)

    const chatStore = useChatStore()
    const conv = chatStore.conversations.find((c) => c.id === params.conversationId)
    if (conv && conv.lastMsgId === customMsgId) {
      chatStore.addOrUpdateConversation({ ...conv, lastMsgId: serverId })
    }
  }

  function deleteMessage(conversationId: string, messageId: string) {
    const list = messageMap.value.get(conversationId)
    if (!list) return
    const next = list.filter((m) => m.id !== messageId && m.customMsgId !== messageId)
    if (next.length !== list.length) {
      messageMap.value.set(conversationId, next)
      refreshConversationSummary(conversationId, next)
    }
  }

  function clearConversationMessages(conversationId: string) {
    messageMap.value.delete(conversationId)
    hasMoreMap.value.delete(conversationId)
  }

  async function clearConversationHistory(conversationId: string, remote = false) {
    clearConversationMessages(conversationId)

    if (!isTauri()) return

    const authStore = useAuthStore()
    if (!authStore.uid) return

    await tauriInvoke('clear_conversation_history', {
      uid: authStore.uid,
      request: {
        conversationId,
        remote,
      },
    })
  }

  function clearAllMessageCaches() {
    messageMap.value = new Map()
    loadingMap.value = new Map()
    hasMoreMap.value = new Map()
  }

  return {
    messageMap,
    getMessages,
    isLoading,
    hasMore,
    loadMessages,
    loadOlderMessages,
    sendMessage,
    resendMessage,
    appendMessage,
    batchAppendMessages,
    appendLocalSystemNotice,
    updateMessageStatus,
    updateMessage,
    markMessagesRead,
    applyGroupReadReceiptPatches,
    applySendReceipt,
    applySendFailed,
    deleteMessage,
    clearConversationMessages,
    clearConversationHistory,
    clearAllMessageCaches,
  }
})
