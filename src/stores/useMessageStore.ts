import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import {
  CHANNEL_NOTIFICATION_TARGET_ID,
  GROUP_NOTIFICATION_TARGET_ID,
  isFileHelperTargetId,
  useChatStore,
} from './useChatStore'
import { useAuthStore } from './useAuthStore'
import { ensureChannelRelKey, ensureFriendRelKey, ensureGroupRelKey, ensureOwnKeyPair } from '@/utils/e2ee'
import { API_CONFIG } from '@/api/config'
import { isHiddenMessageType } from '@/types'

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

const DICE_REPLAY_DEBUG_RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
let diceReplayLogStarted = false

function diceLog(message: string, data?: Record<string, unknown>) {
  const payload = { debugRunId: DICE_REPLAY_DEBUG_RUN_ID, ...(data || {}) }
  if (!diceReplayLogStarted) {
    diceReplayLogStarted = true
    console.clear()
    console.warn('[dice-replay] RESET copy logs after this line', { debugRunId: DICE_REPLAY_DEBUG_RUN_ID })
    if (isTauri()) {
      tauriInvoke('image_send_log', {
        payload: {
          level: 'warn',
          message: '[dice-replay] RESET copy logs after this line',
          data: { debugRunId: DICE_REPLAY_DEBUG_RUN_ID },
        },
      }).catch(() => {})
    }
  }
  console.warn(`[dice] ${message}`, payload)
  if (!isTauri()) return
  tauriInvoke('image_send_log', {
    payload: {
      level: 'warn',
      message: `[dice] ${message}`,
      data: payload,
    },
  }).catch(() => {})
}

const GROUP_IMAGE_DEBUG_RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const SINGLE_VIDEO_DEBUG_RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function isGroupImageMessage(conversationId: string, msgType: number): boolean {
  return String(conversationId || '').startsWith('1_') && Number(msgType) === 1
}

function isSingleVideoMessage(conversationId: string, msgType: number): boolean {
  return String(conversationId || '').startsWith('0_') && Number(msgType) === 3
}

function shortLogText(value: unknown, max = 120): string {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function imageContentSummary(content: string | null | undefined) {
  const raw = String(content ?? '')
  let parsed: Record<string, unknown> | null = null
  try {
    const value = JSON.parse(raw)
    parsed = value && typeof value === 'object' ? value as Record<string, unknown> : null
  } catch {
    parsed = null
  }
  const url = String(parsed?.url ?? parsed?.text ?? (raw.startsWith('data:image/') || raw.startsWith('http') ? raw : ''))
  const thumbnailUrl = String(parsed?.thumbnailUrl ?? parsed?.thumbUrl ?? '')
  return {
    contentLen: raw.length,
    contentHead: shortLogText(raw),
    isJson: Boolean(parsed),
    isDataUrl: raw.includes('data:image/') || url.startsWith('data:image/'),
    urlLen: url.length,
    urlHead: shortLogText(url),
    thumbnailLen: thumbnailUrl.length,
    thumbnailHead: shortLogText(thumbnailUrl),
    width: parsed?.width ?? null,
    height: parsed?.height ?? null,
    size: parsed?.size ?? null,
    name: parsed?.name ?? null,
  }
}

function videoContentSummary(content: string | null | undefined) {
  const raw = String(content ?? '')
  let parsed: Record<string, unknown> | null = null
  try {
    const value = JSON.parse(raw)
    parsed = value && typeof value === 'object' ? value as Record<string, unknown> : null
  } catch {
    parsed = null
  }
  const url = String(parsed?.url ?? parsed?.fileUrl ?? parsed?.path ?? '')
  const thumbUrl = String(parsed?.thumbUrl ?? parsed?.thumbnailUrl ?? parsed?.thumbnail ?? parsed?.cover ?? '')
  return {
    contentLen: raw.length,
    contentHead: shortLogText(raw),
    isJson: Boolean(parsed),
    urlLen: url.length,
    urlHead: shortLogText(url),
    thumbUrlLen: thumbUrl.length,
    thumbUrlHead: shortLogText(thumbUrl),
    width: parsed?.width ?? null,
    height: parsed?.height ?? null,
    duration: parsed?.duration ?? null,
    size: parsed?.size ?? parsed?.fileSize ?? null,
    name: parsed?.name ?? null,
    fileKeyLen: String(parsed?.fileKey ?? parsed?.file_key ?? '').length,
  }
}

function groupInviteDebug(message: string, data?: Record<string, unknown>) {
  const payload = data || {}
  console.warn(`[group-invite-debug][message-store] ${message}`, payload)
  if (!isTauri()) return
  tauriInvoke('image_send_log', {
    payload: {
      level: 'warn',
      message: `[group-invite-debug][message-store] ${message}`,
      data: payload,
    },
  }).catch(() => {})
}

function messageLogSummary(message: Message | null | undefined) {
  if (!message) return null
  return {
    id: message.id,
    customMsgId: message.customMsgId,
    conversationId: message.conversationId,
    senderId: message.senderId,
    msgType: message.msgType,
    status: message.status,
    readStatus: message.readStatus,
    sendTime: message.sendTime,
    ...imageContentSummary(message.content),
  }
}

function groupImageLog(
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
) {
  const payload = { debugRunId: GROUP_IMAGE_DEBUG_RUN_ID, ...(data || {}) }
  const log = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  log(`[group-image] ${message}`, payload)
  if (!isTauri()) return
  tauriInvoke('image_send_log', {
    payload: {
      level,
      message: `[group-image] ${message}`,
      data: payload,
    },
  }).catch(() => {})
}

function singleVideoLog(
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
) {
  const payload = { debugRunId: SINGLE_VIDEO_DEBUG_RUN_ID, ...(data || {}) }
  const log = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  log(`[single-video-send][store] ${message}`, payload)
  if (!isTauri()) return
  tauriInvoke('image_send_log', {
    payload: {
      level,
      message: `[single-video-send][store] ${message}`,
      data: payload,
    },
  }).catch(() => {})
}

function isSameMessageIdentity(a: Message, b: Message): boolean {
  if (a.id && b.id && String(a.id) === String(b.id)) return true
  if (a.customMsgId && b.customMsgId && String(a.customMsgId) === String(b.customMsgId)) return true
  if (a.customMsgId && b.id && String(a.customMsgId) === String(b.id)) return true
  if (a.id && b.customMsgId && String(a.id) === String(b.customMsgId)) return true
  return false
}

function mergeLoadedMessagesWithLocal(conversationId: string, loaded: Message[], existing: Message[]) {
  const localGroupImages = existing.filter((message) => (
    isGroupImageMessage(conversationId, message.msgType)
    && (message.status === 0 || message.status === -1)
    && !loaded.some((item) => isSameMessageIdentity(item, message))
  ))
  if (localGroupImages.length === 0) {
    return { messages: loaded, preserved: [] as Message[] }
  }
  const merged = [...loaded, ...localGroupImages].sort((a, b) => a.sendTime - b.sendTime)
  if (merged.length > MAX_CACHED_MESSAGES) {
    merged.splice(0, merged.length - MAX_CACHED_MESSAGES)
  }
  return { messages: merged, preserved: localGroupImages }
}

function getDiceResultFromContent(content: string | null | undefined): number {
  const raw = String(content ?? '').trim()
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw) as unknown
    const directValue = Number(parsed)
    if (Number.isFinite(directValue) && directValue >= 1 && directValue <= 6) {
      return directValue
    }
    if (parsed && typeof parsed === 'object') {
      const parsedObj = parsed as Record<string, unknown>
      for (const key of ['currentImage', 'current_image', 'result', 'value']) {
        const value = Number(parsedObj[key])
        if (Number.isFinite(value) && value >= 1 && value <= 6) return value
      }
    }
    return 0
  } catch {
    const value = Number(raw.split('||')[0] || 0)
    return Number.isFinite(value) && value >= 1 && value <= 6 ? value : 0
  }
}

function getDiceReferenceFromContent(content: string | null | undefined): { result: string; refId: string } | null {
  const raw = String(content ?? '').trim()
  const [resultText = '', refText = ''] = raw.split('||')
  const result = Number(resultText)
  const refId = refText.trim()
  if (!Number.isFinite(result) || result < 1 || result > 6 || !refId) return null
  return { result: String(result), refId }
}

function getPokerReferenceFromContent(content: string | null | undefined): { result: string; refId: string } | null {
  const raw = String(content ?? '').trim()
  const [resultText = '', refText = ''] = raw.split('||')
  const result = resultText.trim()
  const refId = refText.trim()
  if (!result || !refId) return null
  return { result, refId }
}

function getFunctionalMessageReference(message: Message): { result: string; refId: string } | null {
  if (message.msgType === 12) return getDiceReferenceFromContent(message.content)
  if (message.msgType === 18) return getPokerReferenceFromContent(message.content)
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
    if (msgType === 12) return '[骰子]'
    if (msgType === 18) return '[扑克牌]'
    if (isHiddenMessageType(msgType)) return ''
    return (content || '').trim().replace(/\s+/g, ' ').slice(0, 200)
  }

  function getGroupReqUserName(user: unknown, fallbackId?: unknown): string {
    const raw = user && typeof user === 'object' ? user as Record<string, unknown> : null
    const relation = raw?.friendRelation && typeof raw.friendRelation === 'object'
      ? raw.friendRelation as Record<string, unknown>
      : null
    const names = [
      raw?.remarkName,
      relation?.remarkName,
      raw?.nickName,
      raw?.nickname,
      raw?.nick_name,
      raw?.name,
      raw?.identify,
      raw?.uid,
      raw?.userId,
      fallbackId,
    ]
    return names.map((v) => String(v ?? '').trim()).find(Boolean) || ''
  }

  function getGroupReqUserId(user: unknown): string {
    const raw = user && typeof user === 'object' ? user as Record<string, unknown> : null
    return String(raw?.uid ?? raw?.userId ?? '').trim()
  }

  function formatGroupNotificationDigest(content: string, extra: Record<string, unknown> | null): string {
    const raw = content.trim().replace(/\s+/g, ' ')
    if (!extra) return raw
    if (/^\S*(?:群主|管理员|（群员）|（管理员）|（群主）)/.test(raw)) return raw

    const type = Number(extra.groupReqType ?? 0)
    const status = Number(extra.groupReqStatus ?? 0)
    const shouldPrefix =
      /^(拒绝加入|同意加入|申请加入|邀请你加入|加入)/.test(raw) ||
      (status === 2 && raw.includes('拒绝')) ||
      [1, 2, 3, 4, 14, 15].includes(type)
    if (!shouldPrefix) return raw

    const user =
      status === 2
        ? extra.targetUser || extra.fromUser || extra.checkUser
        : extra.fromUser || extra.targetUser || extra.checkUser
    const fallbackId = status === 2 ? extra.receiveUid : extra.sendUid
    const name = getGroupReqUserName(user, fallbackId)
    if (!name || raw.includes(name)) return raw

    const userId = getGroupReqUserId(user)
    const role = userId && userId === String(extra.groupHostUid ?? '') ? '群主' : '群员'
    return `${name}（${role}） ${raw}`.slice(0, 200)
  }

  function syncConversationSummary(conversationId: string, msg: Message) {
    if (isHiddenMessageType(msg.msgType)) return
    if (!conversationId || !conversationId.includes('_')) {
      console.warn('[msg] skip syncConversationSummary: invalid conversationId', { conversationId, msgId: msg.id })
      return
    }
    const digest = getDigestByMessage(msg.msgType, msg.content)
    const existing = chatStore.conversations.find((c) => c.id === conversationId)
    if (conversationId === `1_${GROUP_NOTIFICATION_TARGET_ID}`) {
      const extra = parseExtraObject(msg.extra)
      const groupDigest = formatGroupNotificationDigest(digest, extra)
      const unreadCount = Number(extra?.unReadNum ?? existing?.unreadCount ?? 0)
      chatStore.updateGroupNotificationConv(
        groupDigest || existing?.lastMsgDigest || '',
        msg.sendTime || Date.now(),
        unreadCount,
      )
      return
    }
    if (conversationId === `0_${CHANNEL_NOTIFICATION_TARGET_ID}`) {
      const extra = parseExtraObject(msg.extra)
      const unreadCount = Number(extra?.unReadNum ?? existing?.unreadCount ?? 0)
      chatStore.updateChannelNotificationConv(
        digest || existing?.lastMsgDigest || '',
        msg.sendTime || Date.now(),
        unreadCount,
      )
      return
    }
    if (conversationId.startsWith('1_') && msg.msgType === 8) {
      groupInviteDebug('syncConversationSummary for group notice', {
        conversationId,
        msgId: msg.id,
        senderId: msg.senderId,
        msgType: msg.msgType,
        content: msg.content,
        digest,
        existedBefore: Boolean(existing),
        conversationCount: chatStore.conversations.length,
      })
    }
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
    const latest = [...list].reverse().find((item) => !isHiddenMessageType(item.msgType)) ?? null
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

  async function loadMessages(uid: string, conversationId: string, force = false) {
    if (!isTauri()) return
    if (isLoading(conversationId) && !force) return

    const existingBeforeLoad = getMessages(conversationId)
    const existingGroupImages = existingBeforeLoad.filter((message) => isGroupImageMessage(conversationId, message.msgType))
    if (existingGroupImages.length > 0) {
      groupImageLog('loadMessages start', {
        uid,
        conversationId,
        force,
        existingCount: existingBeforeLoad.length,
        existingGroupImages: existingGroupImages.slice(-5).map(messageLogSummary),
      })
    }
    loadingMap.value.set(conversationId, true)
    try {
      const result = await tauriInvoke<any[]>('get_messages', {
        uid,
        conversationId,
        limit: PAGE_SIZE,
      })
      const normalized = Array.isArray(result) ? result.map(normalizeMessage) : []
      const filteredResult = filterMessagesHiddenByLogoutClear(uid, normalized)
      const mergedResult = mergeLoadedMessagesWithLocal(conversationId, filteredResult.messages, existingBeforeLoad)
      messageMap.value.set(conversationId, mergedResult.messages)
      const loadedGroupImages = filteredResult.messages.filter((message) => isGroupImageMessage(conversationId, message.msgType))
      if (existingGroupImages.length > 0 || loadedGroupImages.length > 0 || mergedResult.preserved.length > 0) {
        groupImageLog('loadMessages done', {
          uid,
          conversationId,
          force,
          rawCount: Array.isArray(result) ? result.length : 0,
          storedCount: mergedResult.messages.length,
          loadedGroupImages: loadedGroupImages.slice(-5).map(messageLogSummary),
          preservedLocalGroupImages: mergedResult.preserved.map(messageLogSummary),
        })
      }
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
    const [typeRaw, targetId = ''] = conversationId.split('_')
    const convType = Number(typeRaw || 0)
    const isFileHelperSend = convType === 0 && isFileHelperTargetId(targetId)

    if ((msgType === 12 || msgType === 18) && !(convType === 0 || convType === 1)) {
      throw new Error('功能表情暂仅支持单聊和群聊')
    }

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

    if (convType === 2) {
      console.clear()
      console.info('[channel] ===== 清空旧日志，开始频道发送调试 =====', {
        uid,
        conversationId,
        targetId,
        msgType,
        contentLen: (content || '').length,
      })
    }
    const isSingleVideo = isSingleVideoMessage(conversationId, msgType)
    if (isSingleVideo) {
      singleVideoLog('sendMessage entry', {
        uid,
        conversationId,
        convType,
        targetId,
        content: videoContentSummary(content),
        extraKeys: Object.keys(extra ?? {}),
        hasClientMsgId: typeof extra?.__clientMsgId === 'string',
        hasFileKey: Boolean(extra?.fileKey),
        hasLocalThumbDataUrl: Boolean(extra?.localThumbDataUrl),
      })
    }

    // 乐观追加：先插一条 status=0（发送中）的本地消息，立即反馈到 UI。
    // Rust 端 `send_message` 也会返回同结构的一条行，下面 normalizedResult
    // 用它覆盖占位（会按 customMsgId 精准替换，避免重复）。
    const optimisticId = clientMsgId || String(Date.now())
    const optimisticSendTime = Date.now()
    const optimistic: Message = {
      id: optimisticId,
      customMsgId: optimisticId,
      conversationId,
      senderId: uid,
      msgType,
      content,
      sendTime: optimisticSendTime,
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
    if (isSingleVideo) {
      singleVideoLog('optimistic appended', {
        optimisticId,
        listSizeAfterAppend: getMessages(conversationId).length,
        extraJsonLen: String(extraJson || '').length,
        content: videoContentSummary(content),
      })
    }
    if (isGroupImageMessage(conversationId, msgType)) {
      groupImageLog('sendMessage optimistic appended', {
        uid,
        conversationId,
        convType,
        targetId,
        optimisticId,
        sendTime: optimisticSendTime,
        listSizeAfterAppend: getMessages(conversationId).length,
        content: imageContentSummary(content),
        extraKeys: Object.keys(sendExtra ?? {}),
      })
    }
    if (msgType === 12) {
      diceLog('sendMessage optimistic appended', {
        uid,
        conversationId,
        convType,
        targetId,
        optimisticId,
        content,
        extraJson,
        sendTime: optimisticSendTime,
      })
    }

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
    if (convType === 1 && targetId && msgType !== 12 && msgType !== 18) {
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
    } else if (convType === 0 && targetId && msgType !== 12 && msgType !== 18) {
      try {
        const stepStartedAt = performance.now()
        if (isSingleVideo) {
          singleVideoLog('ensureFriendRelKey start', { targetId, optimisticId })
        }
        await ensureFriendRelKey(uid, targetId)
        logSendStep('ensureFriendRelKey OK', {
          targetId,
          stepMs: Math.round(performance.now() - stepStartedAt),
        })
        if (isSingleVideo) {
          singleVideoLog('ensureFriendRelKey OK', {
            targetId,
            optimisticId,
            stepMs: Math.round(performance.now() - stepStartedAt),
          })
        }
      } catch (e) {
        logSendStep('ensureFriendRelKey failed', {
          targetId,
          message: (e as Error)?.message || String(e),
        }, 'error')
        if (isSingleVideo) {
          singleVideoLog('ensureFriendRelKey failed', {
            targetId,
            optimisticId,
            message: (e as Error)?.message || String(e),
            stack: (e as Error)?.stack || '',
          }, 'error')
        }
        updateMessageStatus(optimisticId, -1)
        throw e
      }
    } else if (convType === 2 && targetId) {
      try {
        const stepStartedAt = performance.now()
        await ensureChannelRelKey(uid, targetId)
        logSendStep('ensureChannelRelKey OK', {
          targetId,
          stepMs: Math.round(performance.now() - stepStartedAt),
        })
      } catch (e) {
        logSendStep('ensureChannelRelKey failed', {
          targetId,
          message: (e as Error)?.message || String(e),
        }, 'error')
        updateMessageStatus(optimisticId, -1)
        throw e
      }
    }

    try {
      if ([0, 1, 2, 3, 7, 12, 18].includes(msgType) && (convType === 1 || convType === 0 || convType === 2)) {
        const stepStartedAt = performance.now()
        if (isSingleVideo) {
          singleVideoLog('ensureWsConnected start', { optimisticId })
        }
        await ensureWsConnected()
        logSendStep('ensureWsConnected OK', {
          stepMs: Math.round(performance.now() - stepStartedAt),
        })
        if (isSingleVideo) {
          singleVideoLog('ensureWsConnected OK', {
            optimisticId,
            stepMs: Math.round(performance.now() - stepStartedAt),
          })
        }
      }
      const rustStartedAt = performance.now()
      logSendStep('invoking Rust send_message')
      if (isSingleVideo) {
        singleVideoLog('invoke Rust send_message', {
          optimisticId,
          content: videoContentSummary(content),
          extraKeys: Object.keys(sendExtra ?? {}),
        })
      }
      if (isGroupImageMessage(conversationId, msgType)) {
        groupImageLog('invoke Rust send_message', {
          uid,
          conversationId,
          optimisticId,
          content: imageContentSummary(content),
        })
      }
      if (convType === 2) {
        console.info('[channel] invoke send_message -> Rust', {
          conversationId,
          targetId,
          msgType,
          optimisticId,
        })
      }
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
      if (isSingleVideo) {
        singleVideoLog('Rust send_message result', {
          optimisticId,
          stepMs: Math.round(performance.now() - rustStartedAt),
          resultId: String(result?.id || result?.customMsgId || result?.custom_msg_id || ''),
          resultCustomMsgId: String(result?.customMsgId || result?.custom_msg_id || ''),
          resultStatus: Number(result?.status ?? 0),
          resultReadStatus: Number(result?.readStatus ?? result?.read_status ?? 0),
          resultContent: videoContentSummary(String(result?.content ?? '')),
        })
      }
      if (isGroupImageMessage(conversationId, msgType)) {
        groupImageLog('Rust send_message result', {
          optimisticId,
          stepMs: Math.round(performance.now() - rustStartedAt),
          resultId: String(result?.id || result?.customMsgId || result?.custom_msg_id || ''),
          resultCustomMsgId: String(result?.customMsgId || result?.custom_msg_id || ''),
          resultStatus: Number(result?.status ?? 0),
          resultReadStatus: Number(result?.readStatus ?? result?.read_status ?? 0),
          resultContent: imageContentSummary(String(result?.content ?? '')),
        })
      }
      if (convType === 2) {
        console.info('[channel] Rust send_message returned', {
          optimisticId,
          resultId: String(result?.id || result?.customMsgId || result?.custom_msg_id || ''),
          resultStatus: Number(result?.status ?? 0),
        })
      }
      if (msgType === 12) {
        diceLog('sendMessage Rust result raw', {
          optimisticId,
          resultId: String(result?.id || result?.customMsgId || result?.custom_msg_id || ''),
          resultCustomMsgId: String(result?.customMsgId || result?.custom_msg_id || ''),
          resultContent: String(result?.content ?? ''),
          resultStatus: Number(result?.status ?? 0),
          resultReadStatus: Number(result?.readStatus ?? result?.read_status ?? 0),
        })
      }
      const normalized = normalizeMessage(result)
      if (quoteMsg && !normalized.quoteMessage) {
        normalized.quoteMessage = quoteMsg
      }
      if (extraJson && !normalized.extra) {
        normalized.extra = extraJson
      }
      appendMessage(conversationId, normalized)
      syncConversationSummary(conversationId, normalized)
      if (isSingleVideo) {
        singleVideoLog('normalized appended', {
          optimisticId,
          normalizedId: normalized.id,
          normalizedCustomMsgId: normalized.customMsgId,
          status: normalized.status,
          listSizeAfterAppend: getMessages(conversationId).length,
        })
      }
      return normalized
    } catch (e) {
      const errText = String((e as any)?.message || e || '')
      if (isSingleVideo) {
        singleVideoLog('sendMessage catch', {
          optimisticId,
          error: errText,
          stack: (e as Error)?.stack || '',
        }, 'error')
      }
      const canRetryWs = [0, 1, 2, 3, 7, 12, 18].includes(msgType) && (convType === 1 || convType === 0 || convType === 2) && /Not connected/i.test(errText)
      if (canRetryWs) {
        try {
          console.warn('[send] send_message got Not connected, reconnect + retry once')
          if (isSingleVideo) {
            singleVideoLog('retry after Not connected start', { optimisticId }, 'warn')
          }
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
          if (msgType === 12) {
            diceLog('sendMessage retry Rust result raw', {
              optimisticId,
              resultId: String(retry?.id || retry?.customMsgId || retry?.custom_msg_id || ''),
              resultCustomMsgId: String(retry?.customMsgId || retry?.custom_msg_id || ''),
              resultContent: String(retry?.content ?? ''),
              resultStatus: Number(retry?.status ?? 0),
              resultReadStatus: Number(retry?.readStatus ?? retry?.read_status ?? 0),
            })
          }
          if (quoteMsg && !normalized.quoteMessage) {
            normalized.quoteMessage = quoteMsg
          }
          if (extraJson && !normalized.extra) {
            normalized.extra = extraJson
          }
          appendMessage(conversationId, normalized)
          syncConversationSummary(conversationId, normalized)
          if (isSingleVideo) {
            singleVideoLog('retry send_message result appended', {
              optimisticId,
              normalizedId: normalized.id,
              status: normalized.status,
            })
          }
          return normalized
        } catch (retryErr) {
          if (isSingleVideo) {
            singleVideoLog('retry after Not connected failed', {
              optimisticId,
              error: String((retryErr as any)?.message || retryErr || ''),
              stack: (retryErr as Error)?.stack || '',
            }, 'error')
          }
          if (isGroupImageMessage(conversationId, msgType)) {
            groupImageLog('send_message retry failed', {
              optimisticId,
              error: String((retryErr as any)?.message || retryErr || ''),
            }, 'error')
          }
          console.error('[send] retry after reconnect failed:', retryErr)
        }
      }
      if (isGroupImageMessage(conversationId, msgType)) {
        groupImageLog('send_message failed', {
          optimisticId,
          error: errText,
        }, 'error')
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
    const currentList = messageMap.value.get(conversationId) ?? []
    const next = [...currentList]
    const functionalRef = getFunctionalMessageReference(message)
    if (functionalRef) {
      const refIndex = next.findIndex((m) => m.id === functionalRef.refId || m.customMsgId === functionalRef.refId)
      if (refIndex >= 0) {
        const previous = next[refIndex]
        next[refIndex] = {
          ...previous,
          content: functionalRef.result,
          status: Math.max(Number(previous.status || 0), Number(message.status || 0), 1),
          readStatus: Math.max(Number(previous.readStatus || 0), Number(message.readStatus || 0)),
          sendTime: message.sendTime || previous.sendTime,
          extra: message.extra ?? previous.extra,
        }
        messageMap.value.set(conversationId, next)
        diceLog('appendMessage merged dice result ref', {
          conversationId,
          refId: functionalRef.refId,
          result: functionalRef.result,
          incomingId: message.id,
          previousId: previous.id,
          previousCustomMsgId: previous.customMsgId,
        })
        return
      }
    }
    const existIndex = next.findIndex(
      (m) => m.id === message.id || (m.customMsgId && m.customMsgId === message.customMsgId),
    )
    if (isGroupImageMessage(conversationId, message.msgType)) {
      const previous = existIndex >= 0 ? next[existIndex] : null
      groupImageLog('appendMessage', {
        conversationId,
        existIndex,
        listSizeBefore: currentList.length,
        incoming: messageLogSummary(message),
        previous: messageLogSummary(previous),
      })
    }
    if (message.msgType === 12) {
      const previous = existIndex >= 0 ? next[existIndex] : null
      diceLog('appendMessage', {
        conversationId,
        incomingId: message.id,
        incomingCustomMsgId: message.customMsgId,
        incomingContent: message.content ?? '',
        incomingStatus: message.status,
        incomingReadStatus: message.readStatus,
        existIndex,
        previousId: previous?.id ?? '',
        previousCustomMsgId: previous?.customMsgId ?? '',
        previousContent: previous?.content ?? '',
        previousStatus: previous?.status ?? null,
      })
    }
    if (existIndex >= 0) {
      const previous = next[existIndex]
      const incomingDiceResult = getDiceResultFromContent(message.content)
      const previousDiceResult = getDiceResultFromContent(previous.content)
      const incomingHasContent = String(message.content ?? '').trim().length > 0
      next[existIndex] = {
        ...previous,
        ...message,
        content: (
          (previous.msgType === 12 || message.msgType === 12)
          && incomingDiceResult <= 0
          && previousDiceResult > 0
        )
          ? previous.content
          : (!incomingHasContent && (previous.msgType === 18 || message.msgType === 18) && previous.content)
            ? previous.content
            : message.content,
        extra: message.extra ?? previous.extra,
        quoteMessage: message.quoteMessage ?? previous.quoteMessage,
        snapchatTime: message.snapchatTime ?? previous.snapchatTime,
        deleteSeconds: message.deleteSeconds ?? previous.deleteSeconds,
      }
    } else {
      next.push(message)
    }
    if (next.length > MAX_CACHED_MESSAGES) {
      next.splice(0, next.length - MAX_CACHED_MESSAGES)
    }
    messageMap.value.set(conversationId, next)
  }

  function batchAppendMessages(messages: Message[]) {
    const grouped = new Map<string, Message[]>()
    for (const raw of messages as any[]) {
      const msg = normalizeMessage(raw)
      const convId = String(msg.conversationId || '')
      if (convId.startsWith('1_') && msg.msgType === 8) {
        groupInviteDebug('batchAppendMessages normalized group notice', {
          rawId: String((raw as any)?.id ?? (raw as any)?.msgId ?? (raw as any)?.msg_id ?? ''),
          conversationId: convId,
          senderId: msg.senderId,
          msgType: msg.msgType,
          content: msg.content,
          extra: msg.extra,
        })
      }
      if (isGroupImageMessage(convId, msg.msgType)) {
        groupImageLog('batchAppendMessages normalized', {
          rawId: String((raw as any)?.id ?? (raw as any)?.msgId ?? (raw as any)?.msg_id ?? ''),
          rawCustomMsgId: String((raw as any)?.customMsgId ?? (raw as any)?.custom_msg_id ?? ''),
          normalized: messageLogSummary(msg),
          rawContent: imageContentSummary(String((raw as any)?.content ?? '')),
        })
      }
      if (msg.msgType === 12) {
        diceLog('batchAppendMessages normalized', {
          rawId: String((raw as any)?.id ?? (raw as any)?.msgId ?? (raw as any)?.msg_id ?? ''),
          rawCustomMsgId: String((raw as any)?.customMsgId ?? (raw as any)?.custom_msg_id ?? ''),
          rawContent: String((raw as any)?.content ?? ''),
          normalizedId: msg.id,
          normalizedCustomMsgId: msg.customMsgId,
          normalizedContent: msg.content ?? '',
          conversationId: convId,
          senderId: msg.senderId,
          status: msg.status,
          readStatus: msg.readStatus,
          extra: msg.extra ?? null,
        })
      }
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
  }): boolean {
    const customMsgId = String(params.flag)
    const serverId = String(params.serverMsgId)
    const list = messageMap.value.get(params.conversationId)
    if (!list) {
      if (String(params.conversationId || '').startsWith('1_')) {
        groupImageLog('applySendReceipt no list', {
          conversationId: params.conversationId,
          customMsgId,
          serverId,
          sentOverTime: Number(params.sentOverTime || 0),
        }, 'warn')
      }
      return false
    }
    if (String(params.conversationId || '').startsWith('1_')) {
      groupImageLog('applySendReceipt start', {
        conversationId: params.conversationId,
        customMsgId,
        serverId,
        sentOverTime: Number(params.sentOverTime || 0),
        listSize: list.length,
        tail: list.slice(-8).map(messageLogSummary),
      })
    }
    const idx = list.findIndex(
      (m) => m.customMsgId === customMsgId || m.id === customMsgId,
    )
    if (idx < 0) {
      if (String(params.conversationId || '').startsWith('1_')) {
        groupImageLog('applySendReceipt no optimistic message', {
          conversationId: params.conversationId,
          customMsgId,
          serverId,
          listSize: list.length,
          tail: list.slice(-8).map(messageLogSummary),
        }, 'warn')
      }
      return false
    }
    const next = [...list]
    const duplicateIdx = next.findIndex((m, i) => i !== idx && m.id === serverId)
    const duplicate = duplicateIdx >= 0 ? next[duplicateIdx] : null
    const resultRefIdx = next.findIndex((m, i) => {
      if (i === idx) return false
      const ref = getFunctionalMessageReference(m)
      return ref?.refId === serverId
    })
    const resultRef = resultRefIdx >= 0 ? getFunctionalMessageReference(next[resultRefIdx]) : null
    const duplicateContent = duplicate?.content ?? null
    const current = next[idx]
    const duplicateDiceResult = getDiceResultFromContent(duplicateContent)
    const currentDiceResult = getDiceResultFromContent(current.content)
    const nextContent = current.msgType === 12
      ? (
          resultRef
            ? resultRef.result
            : duplicateDiceResult > 0
            ? duplicateContent
            : currentDiceResult > 0
              ? current.content
              : current.content
        )
      : current.msgType === 18
        ? (
            resultRef
              ? resultRef.result
              : duplicateContent && duplicateContent.length > 0
                ? duplicateContent
                : current.content
          )
      : (duplicateContent && duplicateContent.length > 0 ? duplicateContent : current.content)
    if (current.msgType === 12 || duplicate?.msgType === 12) {
      diceLog('applySendReceipt merge start', {
        conversationId: params.conversationId,
        customMsgId,
        serverId,
        idx,
        duplicateIdx,
        resultRefIdx,
        sentOverTime: Number(params.sentOverTime || 0),
        currentId: current.id,
        currentCustomMsgId: current.customMsgId,
        currentContent: current.content ?? '',
        currentStatus: current.status,
        currentReadStatus: current.readStatus,
        duplicateId: duplicate?.id ?? '',
        duplicateCustomMsgId: duplicate?.customMsgId ?? '',
        duplicateContent: duplicate?.content ?? '',
        duplicateStatus: duplicate?.status ?? null,
        duplicateReadStatus: duplicate?.readStatus ?? null,
        duplicateDiceResult,
        currentDiceResult,
        resultRef,
        nextContent,
      })
    }
    if (isGroupImageMessage(params.conversationId, current.msgType) || (duplicate && isGroupImageMessage(params.conversationId, duplicate.msgType))) {
      groupImageLog('applySendReceipt merge start', {
        conversationId: params.conversationId,
        customMsgId,
        serverId,
        idx,
        duplicateIdx,
        sentOverTime: Number(params.sentOverTime || 0),
        current: messageLogSummary(current),
        duplicate: messageLogSummary(duplicate),
        nextContent: imageContentSummary(nextContent),
      })
    }
    const msg = {
      ...current,
      extra: duplicate?.extra ?? current.extra,
      quoteMessage: duplicate?.quoteMessage ?? current.quoteMessage,
      snapchatTime: duplicate?.snapchatTime ?? current.snapchatTime,
      deleteSeconds: duplicate?.deleteSeconds ?? current.deleteSeconds,
      content: nextContent,
      id: serverId,
      status: 1,
      readStatus: Math.max(Number(current.readStatus || 0), Number(duplicate?.readStatus || 0), 1),
    }
    if (params.sentOverTime && params.sentOverTime > 0) {
      msg.sendTime = params.sentOverTime
    } else if (duplicate?.sendTime) {
      msg.sendTime = duplicate.sendTime
    }
    if (duplicateIdx >= 0) {
      next.splice(duplicateIdx, 1)
    }
    const refIdxAfterDuplicate = resultRefIdx >= 0 && duplicateIdx >= 0 && duplicateIdx < resultRefIdx
      ? resultRefIdx - 1
      : resultRefIdx
    if (refIdxAfterDuplicate >= 0 && refIdxAfterDuplicate !== (duplicateIdx >= 0 && duplicateIdx < idx ? idx - 1 : idx)) {
      next.splice(refIdxAfterDuplicate, 1)
    }
    const removedBeforeIdx = Number(duplicateIdx >= 0 && duplicateIdx < idx) + Number(refIdxAfterDuplicate >= 0 && refIdxAfterDuplicate < idx)
    const nextIdx = idx - removedBeforeIdx
    next[nextIdx] = msg
    messageMap.value.set(params.conversationId, next)
    if (msg.msgType === 12) {
      diceLog('applySendReceipt merge done', {
        conversationId: params.conversationId,
        customMsgId,
        serverId,
        nextIdx,
        finalId: msg.id,
        finalContent: msg.content ?? '',
        finalStatus: msg.status,
        finalReadStatus: msg.readStatus,
        finalSendTime: msg.sendTime,
      })
    }
    if (isGroupImageMessage(params.conversationId, msg.msgType)) {
      groupImageLog('applySendReceipt merge done', {
        conversationId: params.conversationId,
        customMsgId,
        serverId,
        nextIdx,
        final: messageLogSummary(msg),
        listSizeAfter: next.length,
      })
    }

    const chatStore = useChatStore()
    const conv = chatStore.conversations.find((c) => c.id === params.conversationId)
    if (conv && (conv.lastMsgId === customMsgId || conv.lastMsgId === current.id || conv.lastMsgId === current.customMsgId)) {
      chatStore.addOrUpdateConversation({
        ...conv,
        lastMsgId: serverId,
        lastMsgTime: msg.sendTime || conv.lastMsgTime,
        lastMsgDigest: getDigestByMessage(msg.msgType, msg.content) || conv.lastMsgDigest,
        updatedAt: msg.sendTime || conv.updatedAt,
      })
    }
    return true
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

  function deleteMessageFromAllCaches(messageId: string) {
    for (const [convId, list] of messageMap.value.entries()) {
      const next = list.filter((m) => m.id !== messageId && m.customMsgId !== messageId)
      if (next.length !== list.length) {
        messageMap.value.set(convId, next)
        refreshConversationSummary(convId, next)
      }
    }
  }

  async function deleteMessageLocal(conversationId: string, messageId: string) {
    deleteMessage(conversationId, messageId)
    if (!isTauri()) return

    const authStore = useAuthStore()
    if (!authStore.uid) return

    await tauriInvoke('delete_message', {
      uid: authStore.uid,
      messageId,
    })
  }

  async function deleteMessageLocalById(messageId: string) {
    deleteMessageFromAllCaches(messageId)
    if (!isTauri()) return

    const authStore = useAuthStore()
    if (!authStore.uid) return

    await tauriInvoke('delete_message', {
      uid: authStore.uid,
      messageId,
    })
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
    deleteMessageFromAllCaches,
    deleteMessageLocal,
    deleteMessageLocalById,
    clearConversationMessages,
    clearConversationHistory,
    clearAllMessageCaches,
  }
})
