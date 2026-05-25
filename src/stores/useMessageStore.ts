import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import {
  CHANNEL_NOTIFICATION_TARGET_ID,
  GROUP_NOTIFICATION_TARGET_ID,
  isFileHelperTargetId,
  useChatStore,
} from './useChatStore'
import { useAuthStore } from './useAuthStore'
import { useContactStore } from './useContactStore'
import { useGroupStore } from './useGroupStore'
import {
  ensureChannelRelKey,
  ensureFriendRelKey,
  ensureFriendRelKeyForVersion,
  ensureGroupRelKey,
  ensureOwnKeyPair,
  refreshGroupRelKey,
  normalizeResolvedFileKey,
  resolvePrivateAttachmentFileKey,
} from '@/utils/e2ee'
import { API_CONFIG } from '@/api/config'
import { isHiddenMessageType } from '@/types'
import { getOrCreateInstallCode } from '@/utils/installCode'
import {
  formatGroupNoticeDisplayText,
  getGroupNoticeActorId,
  getGroupNoticeGroupId,
} from '@/utils/groupNoticeDisplay'
import { isGroupIntroNoticeMessage } from '@/utils/groupIntroNotice'

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

function recordSendDiagnosticTrace(message: string, data?: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info') {
  try {
    const raw = localStorage.getItem('last-send-diagnostic-trace')
    const list = raw ? JSON.parse(raw) : []
    const next = Array.isArray(list) ? list.slice(-39) : []
    const dataText = data ? ` ${JSON.stringify(data)}` : ''
    next.push(`${new Date().toISOString()} [${level}] ${message}${dataText}`)
    localStorage.setItem('last-send-diagnostic-trace', JSON.stringify(next))
  } catch {
    // ignore diagnostic storage errors
  }
}

function messageUsesWsSend(convType: number, msgType: number): boolean {
  const wsTypes = [0, 1, 2, 3, 7, 8, 9, 12, 18]
  if (![0, 1, 2].includes(convType)) return false
  return wsTypes.includes(msgType) || (convType === 0 && msgType === 5)
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
  uid: string
}> {
  const authStore = useAuthStore()
  let wsUrl = authStore.wsConnectConfig?.wsUrl?.trim() || ''
  let aesKey = authStore.wsConnectConfig?.aesKey?.trim() || ''
  let sessionId = String(authStore.session?.sessionId || '').trim()
  let installCode = String(authStore.wsConnectConfig?.installCode || '').trim()
  let uid = String(authStore.uid || '').trim()

  // 兼容历史缓存：若 authStore 尚未带出，直接读 localStorage 的持久化配置
  if (!wsUrl || !aesKey) {
    try {
      const raw = localStorage.getItem('ws-connect-config')
      if (raw) {
        const parsed = JSON.parse(raw) as { wsUrl?: string; aesKey?: string; installCode?: string }
        wsUrl = wsUrl || String(parsed.wsUrl || '').trim()
        aesKey = aesKey || String(parsed.aesKey || '').trim()
        installCode = installCode || String(parsed.installCode || '').trim()
      }
    } catch {
      // ignore parse errors
    }
  }

  if (!sessionId) {
    try {
      const currentUid = localStorage.getItem('current-uid') || ''
      uid = uid || String(currentUid || '').trim()
      const accountListText = localStorage.getItem('login-account-list')
      const accountList = accountListText ? JSON.parse(accountListText) : []
      if (currentUid && Array.isArray(accountList)) {
        const current = accountList.find((item: any) => String(item?.id || '') === currentUid)
        sessionId = String(current?.sessionId || '').trim()
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
  installCode = installCode || getOrCreateInstallCode()

  return {
    wsUrl: normalizeWsUrl(wsUrl),
    aesKey,
    sessionId,
    installCode,
    uid,
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
const groupIntroMessageTraceCache = new Set<string>()
const HIDDEN_GROUP_EVENT_TEXT = '群聊事件'

function getLogoutClearedHistoryAt(uid: string): number {
  if (!uid) return 0
  const raw = localStorage.getItem(`${LOGOUT_CLEARED_HISTORY_FLAG_PREFIX}${uid}`)
  const value = Number(raw || 0)
  return Number.isFinite(value) ? value : 0
}

function getCurrentUidForUnread(): string {
  return String(useAuthStore().uid || localStorage.getItem('current-uid') || '').trim()
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

function buildPrivateCipherCandidates(extra: Record<string, unknown>) {
  const candidates = Array.isArray(extra.cipherCandidates)
    ? extra.cipherCandidates
        .map((item: any) => ({
          version: Number(item?.version || extra?.version || 1),
          source: String(item?.source || ''),
          cipherHex: String(item?.cipherHex || ''),
          attachmentKey: String(item?.attachmentKey || item?.attachment_key || ''),
        }))
        .filter((item: { cipherHex: string }) => !!item.cipherHex)
    : []

  const cipherHex = String(extra.cipherHex || '')
  if (cipherHex && candidates.length === 0) {
    candidates.push({
      version: Number(extra.version || 1),
      source: '',
      cipherHex,
      attachmentKey: String(extra.attachmentKey || extra.attachment_key || ''),
    })
  }

  return candidates
}

const DICE_REPLAY_DEBUG_RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
let diceReplayLogStarted = false

function diceLog(message: string, data?: Record<string, unknown>) {
  void message
  void data
}

const GROUP_IMAGE_DEBUG_RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const SINGLE_VIDEO_DEBUG_RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function isGroupImageMessage(conversationId: string, msgType: number): boolean {
  return String(conversationId || '').startsWith('1_') && Number(msgType) === 1
}

function isSingleImageMessage(conversationId: string, msgType: number): boolean {
  const type = Number(msgType)
  return String(conversationId || '').startsWith('0_') && (type === 1 || type === 9)
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
  void message
  void data
}

function groupNotificationUnreadLog(message: string, data?: Record<string, unknown>) {
  console.warn(`[group-notification-unread] ${message}`, data || {})
}

function groupIntroMessageTrace(
  stage: string,
  conversationId: string,
  message: Message,
  data: Record<string, unknown> = {},
) {
  if (message.msgType !== 8 || !conversationId.startsWith('1_')) return
  const extra = parseExtraObject(message.extra)
  const key = [
    stage,
    conversationId,
    message.id || '',
    message.customMsgId || '',
    message.sendTime || 0,
    message.content || '',
    message.extra || '',
    JSON.stringify(data),
  ].join('|')
  if (groupIntroMessageTraceCache.has(key)) return
  groupIntroMessageTraceCache.add(key)
  if (groupIntroMessageTraceCache.size > 200) {
    groupIntroMessageTraceCache.clear()
  }
  console.info('[message-store] group intro summary trace', {
    stage,
    conversationId,
    messageId: message.id || '',
    customMsgId: message.customMsgId || '',
    senderId: message.senderId || '',
    msgType: message.msgType,
    content: message.content || '',
    sendTime: message.sendTime || 0,
    readStatus: message.readStatus ?? null,
    extra,
    isGroupIntro: isGroupIntroNoticeMessage(message),
    ...data,
  })
}

function isPendingGroupReqChatMessage(message: Message): boolean {
  const conversationId = String(message.conversationId || '')
  if (!conversationId.startsWith('1_') || conversationId === `1_${GROUP_NOTIFICATION_TARGET_ID}`) return false
  if (message.msgType !== 8) return false
  const extra = parseExtraObject(message.extra)
  return String(extra?.source || '') === 'group-event-req-chat'
    && Number(extra?.groupReqStatus ?? 0) !== 1
}

function isRejectedGroupInviteNoticeForNotification(conversationId: string, message: Message): boolean {
  if (!conversationId.startsWith('1_') || conversationId === `1_${GROUP_NOTIFICATION_TARGET_ID}`) return false
  if (message.msgType !== 8) return false

  const extra = parseExtraObject(message.extra)
  if (!extra || String(extra.source || '') !== 'group-event') return false
  if (Number(extra.groupReqStatus ?? 0) !== 2) return false

  const reqType = Number(extra.groupReqType ?? 0)
  const content = String(message.content || '')
  return [3, 4, 5].includes(reqType) || content.includes('拒绝')
}

function isHiddenGroupEventPlaceholderMessage(conversationId: string, message: Message): boolean {
  if (!conversationId.startsWith('1_') || conversationId === `1_${GROUP_NOTIFICATION_TARGET_ID}`) return false
  if (message.msgType !== 8) return false
  if (String(message.content || '').trim() !== HIDDEN_GROUP_EVENT_TEXT) return false

  const extra = parseExtraObject(message.extra)
  return String(extra?.source || '') === 'group-event'
}

function shouldUseMessageForConversationSummary(conversationId: string, message: Message): boolean {
  return !isHiddenMessageType(message.msgType)
    && !isPendingGroupReqChatMessage(message)
    && !isRejectedGroupInviteNoticeForNotification(conversationId, message)
    && !isHiddenGroupEventPlaceholderMessage(conversationId, message)
}

function cloneGroupNoticeToNotificationMessage(conversationId: string, message: Message): Message {
  const targetId = conversationId.split('_').slice(1).join('_')
  const extra = parseExtraObject(message.extra) || {}
  const noticeExtra = {
    ...extra,
    source: 'group-event-req',
    groupId: String(extra.groupId || targetId || ''),
  }
  return {
    ...message,
    id: message.id ? `notice-${message.id}` : `notice-${conversationId}-${message.sendTime || Date.now()}`,
    customMsgId: message.customMsgId
      ? `notice-${message.customMsgId}`
      : `notice-${conversationId}-${message.sendTime || Date.now()}`,
    conversationId: `1_${GROUP_NOTIFICATION_TARGET_ID}`,
    extra: JSON.stringify(noticeExtra),
  }
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
  void message
  void data
  void level
}

function singleVideoLog(
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
) {
  void message
  void data
  void level
}

function isSameMessageIdentity(a: Message, b: Message): boolean {
  if (a.id && b.id && String(a.id) === String(b.id)) return true
  if (a.customMsgId && b.customMsgId && String(a.customMsgId) === String(b.customMsgId)) return true
  if (a.customMsgId && b.id && String(a.customMsgId) === String(b.id)) return true
  if (a.id && b.customMsgId && String(a.id) === String(b.customMsgId)) return true
  return false
}

function shouldPreserveMessageDuringLoad(message: Message, loadStartedAt: number): boolean {
  const status = Number(message.status || 0)
  if (status === 0 || status === -1) return true

  const sendTime = Number(message.sendTime || 0)
  return Boolean(loadStartedAt && sendTime >= loadStartedAt - 1000)
}

function mergeLoadedMessagesWithLocal(conversationId: string, loaded: Message[], existing: Message[], loadStartedAt = 0) {
  const preservedLocalMessages = existing.filter((message) => (
    message.conversationId === conversationId
    && shouldPreserveMessageDuringLoad(message, loadStartedAt)
    && !loaded.some((item) => isSameMessageIdentity(item, message))
  ))
  if (preservedLocalMessages.length === 0) {
    return { messages: loaded, preserved: [] as Message[] }
  }
  const merged = [...loaded, ...preservedLocalMessages].sort((a, b) => a.sendTime - b.sendTime)
  if (merged.length > MAX_CACHED_MESSAGES) {
    merged.splice(0, merged.length - MAX_CACHED_MESSAGES)
  }
  return { messages: merged, preserved: preservedLocalMessages }
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
  function resolveUidNick(id: string) {
    return useContactStore().getDisplayName(id)
  }
  const messageMap = ref<Map<string, Message[]>>(new Map())
  const loadingMap = ref<Map<string, boolean>>(new Map())
  const hasMoreMap = ref<Map<string, boolean>>(new Map())
  let pendingWsConnect: Promise<void> | null = null

  function getGroupNoticeActorRole(extra: Record<string, unknown> | null): number | null {
    if (!extra) return null
    const groupId = getGroupNoticeGroupId(extra)
    const actorId = getGroupNoticeActorId(extra)
    if (!groupId || !actorId) return null
    const role = useGroupStore().getMembers(groupId).find((member) => member.userId === actorId)?.role
    return Number.isFinite(Number(role)) ? Number(role) : null
  }

  function getGroupNoticeContextMembers(extra: Record<string, unknown> | null) {
    if (!extra) return []
    const groupId = getGroupNoticeGroupId(extra)
    return groupId ? useGroupStore().getMembers(groupId) : []
  }

  async function ensureWsConnected(): Promise<void> {
    if (!isTauri()) return

    const status = await tauriInvoke<string>('get_ws_status').catch(() => 'disconnected')
    if (status === 'connected') return

    const { wsUrl, aesKey, sessionId, installCode, uid } = await resolveWsConnectConfig()
    if (!wsUrl || !aesKey) {
      throw new Error('[ws] connect config missing (wsUrl/aesKey)')
    }

    if (!pendingWsConnect) {
      pendingWsConnect = (async () => {
        console.warn('[ws] ensureWsConnected: reconnecting...', { status, wsUrl })
        await tauriInvoke('connect_ws', { url: wsUrl, aesKey, sessionId, installCode, uid })
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
    if (msgType === 9) return '[动画表情]'
    if (msgType === 2) return '[语音]'
    if (msgType === 3) return '[视频]'
    if (msgType === 5) return '[名片]'
    if (msgType === 7) return '[文件]'
    if (msgType === 12) return '[骰子]'
    if (msgType === 18) return '[扑克牌]'
    if (isHiddenMessageType(msgType)) return ''
    return (content || '').trim().replace(/\s+/g, ' ').slice(0, 200)
  }

  function formatGroupIntroDigest(msg: Message, digest: string): string {
    if (!isGroupIntroNoticeMessage(msg)) return digest
    const normalized = digest.trim().replace(/\s+/g, ' ')
    if (!normalized) return '[群简介]'
    if (normalized.startsWith('[群简介]')) return normalized.slice(0, 200)
    return `[群简介] ${normalized}`.slice(0, 200)
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

  function formatGroupNotificationDigest(content: string, extra: Record<string, unknown> | null): string {
    const raw = content.trim().replace(/\s+/g, ' ')
    if (!extra) return raw
    const formatted = formatGroupNoticeDisplayText(raw, extra, {
      currentUid: useAuthStore().uid,
      actorRole: getGroupNoticeActorRole(extra),
      resolveUidPlaceholder: resolveUidNick,
    })
    if (formatted !== raw) return formatted.slice(0, 200)
    if (/^\S*(?:群主|管理员|（群员）|（管理员）|（群主）)/.test(raw)) return raw

    const type = Number(extra.groupReqType ?? 0)
    const status = Number(extra.groupReqStatus ?? 0)
    if (status === 2) return raw
    const shouldPrefix =
      /^(拒绝加入|同意加入|申请加入|邀请你加入|加入)/.test(raw) ||
      [1, 2, 3, 4, 14, 15].includes(type)
    if (!shouldPrefix) return raw

    const user =
      status === 2
        ? extra.targetUser || extra.fromUser || extra.checkUser
        : extra.fromUser || extra.targetUser || extra.checkUser
    const fallbackId = status === 2 ? extra.receiveUid : extra.sendUid
    const name = getGroupReqUserName(user, fallbackId)
    if (!name || raw.includes(name)) return raw

    return `${name}${raw}`.slice(0, 200)
  }

  function syncConversationSummary(conversationId: string, msg: Message) {
    if (!shouldUseMessageForConversationSummary(conversationId, msg)) return
    if (!conversationId || !conversationId.includes('_')) {
      console.warn('[msg] skip syncConversationSummary: invalid conversationId', { conversationId, msgId: msg.id })
      return
    }
    let digest = getDigestByMessage(msg.msgType, msg.content)
    const groupNoticeExtra = msg.msgType === 8 ? parseExtraObject(msg.extra) : null
    const isGroupNotificationConversation = conversationId === `1_${GROUP_NOTIFICATION_TARGET_ID}`
    if (groupNoticeExtra) {
      digest = formatGroupNoticeDisplayText(digest, groupNoticeExtra, {
        currentUid: useAuthStore().uid,
        actorRole: getGroupNoticeActorRole(groupNoticeExtra),
        contextMembers: isGroupNotificationConversation ? [] : getGroupNoticeContextMembers(groupNoticeExtra),
        resolveUidPlaceholder: resolveUidNick,
      }).slice(0, 200)
    }
    digest = formatGroupIntroDigest(msg, digest)
    const existing = chatStore.conversations.find((c) => c.id === conversationId)
    if (isRejectedGroupInviteNoticeForNotification(conversationId, msg)) {
      const noticeMessage = cloneGroupNoticeToNotificationMessage(conversationId, msg)
      const noticeExtra = parseExtraObject(noticeMessage.extra)
      const groupDigest = formatGroupNotificationDigest(digest, noticeExtra)
      appendMessage(noticeMessage.conversationId, noticeMessage)
      chatStore.updateGroupNotificationConv(
        groupDigest || digest || '',
        msg.sendTime || Date.now(),
        chatStore.currentConversationId === noticeMessage.conversationId ? 0 : 1,
      )
      return
    }
    if (conversationId === `1_${GROUP_NOTIFICATION_TARGET_ID}`) {
      const extra = groupNoticeExtra || parseExtraObject(msg.extra)
      const groupDigest = formatGroupNotificationDigest(digest, extra)
      const isCurrentGroupNotification = chatStore.currentConversationId === `1_${GROUP_NOTIFICATION_TARGET_ID}`
      const hasServerUnread = Boolean(extra && (
        Object.prototype.hasOwnProperty.call(extra, 'unReadNum')
        || Object.prototype.hasOwnProperty.call(extra, 'unreadCount')
        || Object.prototype.hasOwnProperty.call(extra, 'unread_count')
      ))
      const serverUnread = hasServerUnread
        ? Number(extra?.unReadNum ?? extra?.unreadCount ?? extra?.unread_count ?? 0)
        : null
      const unreadCount = isCurrentGroupNotification
          ? 0
          : Math.max(
              1,
              Number.isFinite(Number(serverUnread)) ? Number(serverUnread) : 0,
              Number(existing?.unreadCount || 0),
            )
      groupNotificationUnreadLog('sync summary', {
        messageId: msg.id,
        senderId: msg.senderId,
        currentConversationId: chatStore.currentConversationId || '',
        isCurrentGroupNotification,
        hasServerUnread,
        serverUnread,
        existingUnread: Number(existing?.unreadCount || 0),
        nextUnread: unreadCount,
        sendTime: msg.sendTime || 0,
      })
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
      const currentUid = getCurrentUidForUnread()
      const currentConversationId = String(chatStore.currentConversationId || '')
      const isIncomingUnread = Boolean(
        currentUid
        && msg.senderId
        && String(msg.senderId) !== currentUid
        && currentConversationId !== conversationId
        && Number(msg.readStatus || 0) === 0
      )
      const nextUnreadCount = isIncomingUnread
        ? Math.max(0, Number(existing.unreadCount || 0)) + 1
        : existing.unreadCount
      groupIntroMessageTrace('syncConversationSummary', conversationId, msg, {
        digest,
        currentUid,
        currentConversationId,
        isIncomingUnread,
        nextUnreadCount,
        existingUnreadCount: existing.unreadCount ?? null,
        existingLastMsgDigest: existing.lastMsgDigest || '',
        existingLastMsgId: existing.lastMsgId || '',
      })
      chatStore.addOrUpdateConversation({
        ...existing,
        lastMsgId: msg.id || existing.lastMsgId,
        lastMsgTime: msg.sendTime || Date.now(),
        lastMsgDigest: digest || existing.lastMsgDigest,
        unreadCount: nextUnreadCount,
        updatedAt: msg.sendTime || Date.now(),
      })
      return
    }
    const [typeRaw, targetId = ''] = conversationId.split('_')
    const conv = chatStore.ensureConversation(Number(typeRaw || 0), targetId)
    const currentUid = getCurrentUidForUnread()
    const currentConversationId = String(chatStore.currentConversationId || '')
    const isIncomingUnread = Boolean(
      currentUid
      && msg.senderId
      && String(msg.senderId) !== currentUid
      && currentConversationId !== conversationId
      && Number(msg.readStatus || 0) === 0
    )
    const nextUnreadCount = isIncomingUnread ? Math.max(1, Number(conv.unreadCount || 0) + 1) : conv.unreadCount
    groupIntroMessageTrace('syncConversationSummary:newConversation', conversationId, msg, {
      digest,
      currentUid,
      currentConversationId,
      isIncomingUnread,
      nextUnreadCount,
      existingUnreadCount: conv.unreadCount ?? null,
      existingLastMsgDigest: conv.lastMsgDigest || '',
      existingLastMsgId: conv.lastMsgId || '',
    })
    chatStore.addOrUpdateConversation({
      ...conv,
      lastMsgId: msg.id || conv.lastMsgId,
      lastMsgTime: msg.sendTime || Date.now(),
      lastMsgDigest: digest || conv.lastMsgDigest,
      unreadCount: nextUnreadCount,
      updatedAt: msg.sendTime || Date.now(),
    })
  }

  function refreshConversationSummary(
    conversationId: string,
    messages?: Message[],
    options?: { preserveListOrder?: boolean },
  ) {
    if (!conversationId || !conversationId.includes('_')) return
    const existing = chatStore.conversations.find((c) => c.id === conversationId)
    if (!existing) return

    // 最后一条消息被阅后即焚/本地删除后，左侧会话预览要回退到仍可见的最后一条。
    const list = messages ?? getMessages(conversationId)
    const latest = [...list].reverse().find((item) => shouldUseMessageForConversationSummary(conversationId, item)) ?? null
    const digest = latest ? formatGroupIntroDigest(latest, getDigestByMessage(latest.msgType, latest.content)) : null

    chatStore.addOrUpdateConversation({
      ...existing,
      lastMsgId: latest?.id || null,
      lastMsgTime: latest?.sendTime || 0,
      lastMsgDigest: digest || null,
      // 进入会话加载历史消息只修正预览，不改变左侧列表位置，避免点击后列表突然重排。
      updatedAt: options?.preserveListOrder ? existing.updatedAt : latest?.sendTime || 0,
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

  async function retryDecryptPendingPrivateMessages(uid: string, messages: Message[]) {
    if (!isTauri() || !uid || messages.length === 0) return messages

    const pendingPeerIds = Array.from(new Set(
      messages
        .filter((message) => {
          if (!String(message.conversationId || '').startsWith('0_')) return false
          const extra = parseExtraObject(message.extra)
          return Boolean(extra?.decryptPending)
        })
        .map((message) => String(message.conversationId || '').split('_')[1] || '')
        .filter((peerId) => !!peerId && peerId !== uid),
    ))
    for (const peerId of pendingPeerIds) {
      try {
        await ensureFriendRelKey(uid, peerId, true)
      } catch (error) {
        console.warn('[e2ee] ensureFriendRelKey on loadMessages failed', {
          peerId,
          err: String(error),
        })
      }
    }

    await ensureOwnKeyPair(uid).catch(() => {})

    for (const message of messages) {
      const conversationId = String(message.conversationId || '')
      if (!conversationId.startsWith('0_')) continue

      const extra = parseExtraObject(message.extra) || {}
      if (!extra.decryptPending) continue

      const cipherCandidates = buildPrivateCipherCandidates(extra)
      if (cipherCandidates.length === 0) continue

      const peerId = String(conversationId.split('_')[1] || '')
      const senderId = String(message.senderId || '')
      if (!senderId) continue

      const applyDecryptedPlain = async (
        plain: string,
        candidate: { cipherHex: string; attachmentKey?: string; version?: number; source?: string },
      ) => {
        const resolvedFileKey = await resolvePrivateAttachmentFileKey({
          uid,
          senderId,
          version: Number(candidate.version || 0),
          source: String(candidate.source || ''),
          attachmentKey: String(candidate.attachmentKey || ''),
        })
        const nextExtra = {
          ...extra,
          decryptPending: false,
          cipherHex: candidate.cipherHex,
        } as Record<string, unknown>
        if (resolvedFileKey && !normalizeResolvedFileKey(nextExtra.fileKey)) {
          nextExtra.fileKey = resolvedFileKey
        }

        message.content = plain
        message.extra = stringifyExtra(nextExtra)
        await tauriInvoke('mark_private_message_decrypted', {
          uid,
          request: {
            messageId: message.id,
            conversationId,
            content: plain,
            extra: nextExtra,
          },
        }).catch((persistError) => {
          console.warn('[e2ee] persist decrypted private message failed', {
            messageId: message.id,
            conversationId,
            err: String(persistError),
          })
        })
      }

      for (const candidate of cipherCandidates) {
        try {
          try {
            await ensureFriendRelKeyForVersion(
              uid,
              senderId,
              Number(candidate.version || 0),
              String(candidate.source || ''),
            )
          } catch (keyError) {
            console.warn('[e2ee] ensureFriendRelKeyForVersion on loadMessages failed', {
              messageId: message.id,
              senderId,
              peerId,
              version: candidate.version,
              source: candidate.source,
              err: String(keyError),
            })
          }

          const plain = await tauriInvoke<string>('decrypt_private_incoming', {
            senderId,
            peerId,
            version: Number(candidate.version || 1),
            source: String(candidate.source || ''),
            ciphertextHex: String(candidate.cipherHex || ''),
            msgType: Number(message.msgType || 0),
            contentMd5: String(extra.contentMd5 || extra.content_md5 || ''),
          })

          await applyDecryptedPlain(plain, candidate)
          break
        } catch (error) {
          try {
            await ensureFriendRelKeyForVersion(
              uid,
              senderId,
              Number(candidate.version || 0),
              String(candidate.source || ''),
              true,
            )
            const plain = await tauriInvoke<string>('decrypt_private_incoming', {
              senderId,
              peerId,
              version: Number(candidate.version || 1),
              source: String(candidate.source || ''),
              ciphertextHex: String(candidate.cipherHex || ''),
              msgType: Number(message.msgType || 0),
              contentMd5: String(extra.contentMd5 || extra.content_md5 || ''),
            })
            await applyDecryptedPlain(plain, candidate)
            break
          } catch (refreshError) {
            console.warn('[e2ee] retry decrypt_private on loadMessages failed', {
              messageId: message.id,
              conversationId,
              senderId,
              peerId,
              version: candidate.version,
              source: candidate.source,
              err: String(refreshError),
              firstErr: String(error),
            })
          }
        }
      }
    }

    return messages
  }
  async function retryDecryptPendingPrivateConversations(uid: string, conversationIds?: string[]) {
    if (!isTauri() || !uid) return
    const targets = (conversationIds && conversationIds.length > 0
      ? conversationIds
      : Array.from(messageMap.value.keys()))
      .map((id) => String(id || ''))
      .filter((id, index, list) => id.startsWith('0_') && list.indexOf(id) === index)

    for (const conversationId of targets) {
      const current = messageMap.value.get(conversationId)
      if (!current || current.length === 0) continue
      const hasPending = current.some((message) => {
        const extra = parseExtraObject(message.extra)
        return Boolean(extra?.decryptPending)
      })
      if (!hasPending) continue

      const before = current.map((message) => `${message.id}:${message.content}:${message.extra}`).join('\n')
      await retryDecryptPendingPrivateMessages(uid, current)
      const after = current.map((message) => `${message.id}:${message.content}:${message.extra}`).join('\n')
      if (after !== before) {
        messageMap.value.set(conversationId, [...current])
        const latest = current[current.length - 1]
        if (latest) syncConversationSummary(conversationId, latest)
      }
    }
  }

  async function loadMessages(uid: string, conversationId: string, force = false) {
    if (!isTauri()) return
    if (isLoading(conversationId) && !force) return

    const loadStartedAt = Date.now()
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
      const normalizedBase = Array.isArray(result) ? result.map(normalizeMessage) : []
      const normalized = await retryDecryptPendingPrivateMessages(uid, normalizedBase)
      const filteredResult = filterMessagesHiddenByLogoutClear(uid, normalized)
      const latestExisting = getMessages(conversationId)
      const mergedResult = mergeLoadedMessagesWithLocal(
        conversationId,
        filteredResult.messages,
        latestExisting,
        loadStartedAt,
      )
      messageMap.value.set(conversationId, mergedResult.messages)
      refreshConversationSummary(conversationId, mergedResult.messages, { preserveListOrder: true })
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
      const normalizedBase = Array.isArray(result) ? result.map(normalizeMessage) : []
      const normalized = await retryDecryptPendingPrivateMessages(uid, normalizedBase)
      const filteredResult = filterMessagesHiddenByLogoutClear(uid, normalized)
      if (filteredResult.messages.length > 0) {
        const latestExisting = getMessages(conversationId)
        const merged = [...filteredResult.messages, ...latestExisting]
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

    const existingClientPlaceholder = clientMsgId && isSingleImageMessage(conversationId, msgType) && !isFileHelperSend
      ? getMessages(conversationId).find((m) => m.id === clientMsgId || m.customMsgId === clientMsgId)
      : undefined
    const shouldKeepSingleImagePreview = Boolean(existingClientPlaceholder)

    // 乐观追加：先插一条 status=0（发送中）的本地消息，立即反馈到 UI。
    // 单聊图片在上传前已插入本地占位，这里保留占位，等 send_message 成功后再替换为远端消息，
    // 避免发送中提前下载/解密远端图片并短暂显示“图片加载失败”。
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
    if (shouldKeepSingleImagePreview) {
      syncConversationSummary(conversationId, existingClientPlaceholder as Message)
    } else {
      appendMessage(conversationId, optimistic)
      syncConversationSummary(conversationId, optimistic)
    }
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
      // 对齐老 im“发送诊断”：只记录最近发送链路步骤，供设置里的发送诊断弹窗复制排查。
      recordSendDiagnosticTrace(message, {
        uid,
        conversationId,
        convType,
        targetId,
        msgType,
        optimisticId,
        ...data,
      }, level)
    }
    logSendStep('sendMessage entry', {
      usesWsSend: messageUsesWsSend(convType, msgType),
      contentLen: String(content || '').length,
      contentHead: shortLogText(content, 160),
      extraKeys: Object.keys(sendExtra ?? {}),
      hasClientMsgId: Boolean(clientMsgId),
      isFileHelperSend,
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
      logSendStep('before channel selection', {
        usesWsSend: messageUsesWsSend(convType, msgType),
      })
      if (messageUsesWsSend(convType, msgType)) {
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
      logSendStep('sendMessage catch', {
        error: errText,
      }, 'error')
      if (isSingleVideo) {
        singleVideoLog('sendMessage catch', {
          optimisticId,
          error: errText,
          stack: (e as Error)?.stack || '',
        }, 'error')
      }
      const canRetryGroupWithFreshKey = convType === 1
        && Boolean(targetId)
        && /group rel key not cached|missing publickey\/msgkey|getkeypair\(group|derive_group_rel_key/i.test(errText)
      if (canRetryGroupWithFreshKey) {
        try {
          // 对齐旧 im：群密钥异常时先清理并重新派生 relKey，再补发一次，避免直接把本地气泡标记失败。
          await refreshGroupRelKey(uid, targetId)
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
          console.warn('[send] retry after refreshGroupRelKey failed:', retryErr)
        }
      }
      const canRetryWs = messageUsesWsSend(convType, msgType) && /Not connected/i.test(errText)
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
      if (isPendingGroupReqChatMessage(msg)) continue
      const convId = String(msg.conversationId || '')
      if (convId.startsWith('1_') && msg.msgType === 8) {
        groupIntroMessageTrace('batchAppendMessages', convId, msg, {
          rawId: String((raw as any)?.id ?? (raw as any)?.msgId ?? (raw as any)?.msg_id ?? ''),
          rawCustomMsgId: String((raw as any)?.customMsgId ?? (raw as any)?.custom_msg_id ?? ''),
          rawExtra: stringifyExtra((raw as any)?.extra),
        })
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
      const latest = [...msgs].reverse().find((item) => shouldUseMessageForConversationSummary(convId, item))
      if (latest) {
        syncConversationSummary(convId, latest)
      } else {
        refreshConversationSummary(convId)
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

  function applyChannelReadReceiptPatches(patches: Array<{
    conversationId: string
    messageId: string
    readTotal: number
    extra?: string | null
  }>) {
    const result = {
      applied: 0,
      invalid: 0,
      noList: 0,
      noMatch: 0,
    }
    if (!Array.isArray(patches) || patches.length === 0) return result

    for (const patch of patches) {
      const convId = String(patch.conversationId || '')
      const messageId = String(patch.messageId || '')
      const readTotal = Math.max(0, Number(patch.readTotal || 0))
      if (!convId || !messageId || readTotal <= 0) {
        result.invalid += 1
        continue
      }

      const list = messageMap.value.get(convId)
      if (!list) {
        result.noList += 1
        continue
      }

      const idx = list.findIndex((m) => m.id === messageId || m.customMsgId === messageId)
      if (idx < 0) {
        result.noMatch += 1
        continue
      }

      let nextExtra = patch.extra ?? null
      if (!nextExtra) {
        let extraObj: Record<string, unknown> = {}
        try {
          const parsed = JSON.parse(list[idx].extra || '{}')
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            extraObj = parsed as Record<string, unknown>
          }
        } catch {
          extraObj = {}
        }
        extraObj.readTotal = readTotal
        nextExtra = JSON.stringify(extraObj)
      }

      const next = [...list]
      next[idx] = {
        ...next[idx],
        extra: nextExtra,
      }
      messageMap.value.set(convId, next)
      result.applied += 1
    }
    return result
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
    ensureWsConnected,
    getMessages,
    isLoading,
    hasMore,
    loadMessages,
    loadOlderMessages,
    retryDecryptPendingPrivateConversations,
    sendMessage,
    resendMessage,
    appendMessage,
    batchAppendMessages,
    appendLocalSystemNotice,
    updateMessageStatus,
    updateMessage,
    markMessagesRead,
    applyGroupReadReceiptPatches,
    applyChannelReadReceiptPatches,
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
