import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import {
  CHANNEL_NOTIFICATION_TARGET_ID,
  GROUP_NOTIFICATION_TARGET_ID,
  isFileHelperTargetId,
  isOfficialAccountTargetId,
  useChatStore,
} from './useChatStore'
import { useAuthStore } from './useAuthStore'
import { useContactStore } from './useContactStore'
import { useGroupStore } from './useGroupStore'
import { useScheduleDeletionStore } from './useScheduleDeletionStore'
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
import { getDeviceConfig, getPlatformSysModel } from '@/api/request'
import { getRuntimePlatform } from '@/utils/runtimePlatform'
import { isProdSafeDomain } from '@/utils/domainSafety'
import {
  getChannelHistoryMessages,
  getChannelLastMsgInfo,
  type ChannelHistoryMessage,
} from '@/api/imChannel'
import { MessageType, isHiddenMessageType } from '@/types'
import { getOrCreateInstallCode } from '@/utils/installCode'
import {
  formatGroupNoticeDisplayText,
  getGroupNoticeActorId,
  getGroupNoticeGroupId,
} from '@/utils/groupNoticeDisplay'
import { resolveGroupMemberDisplayName } from '@/utils/groupRemovedMemberNameCache'
import { ingestGroupSenderProfilesFromMessages } from '@/utils/groupMessageSender'
import { isGroupIntroNoticeMessage } from '@/utils/groupIntroNotice'
import {
  isGroupMemberLeaveNoticeHiddenForCurrentUser,
  isGroupRemoveNoticeHiddenForCurrentUser,
} from '@/utils/chatUnreadVisibility'
import { filterSensitiveWords, shouldFakeSendMessage } from '@/utils/sensitiveWords'

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

const MAX_WS_CONNECT_CANDIDATES = 8
const WS_CONNECT_STATUS_CHECK_COUNT = 10
const WS_CONNECT_STATUS_CHECK_DELAY_MS = 150
const LEGACY_LAST_SUCCESSFUL_WS_URL_KEY = 'last-successful-ws-url'
const LAST_SUCCESSFUL_WS_URL_KEY = `${LEGACY_LAST_SUCCESSFUL_WS_URL_KEY}:${API_CONFIG.env}:${API_CONFIG.brandId}`

function recordSendDiagnosticTrace(message: string, data?: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info') {
  void message
  void data
  void level
}

const CHANNEL_SYSTEM_MESSAGE_TYPE = 6
const CHANNEL_DELETE_CONTROL_MSG_ID = 1

function messageUsesWsSend(convType: number, msgType: number): boolean {
  // msgType 17 是频道多图消息，和图片/视频一样必须走实时发送链路。
  const wsTypes = [0, 1, 2, 3, 7, 8, 9, 12, 17, 18]
  if (![0, 1, 2].includes(convType)) return false
  return wsTypes.includes(msgType) || (convType === 0 && msgType === 5)
}

function normalizeWsUrl(input: string): string {
  const raw = (input || '').trim()
  if (!raw) return ''
  if (/^ws:\/\/[^/]+:443(?:\/|$)/i.test(raw)) {
    // 修复旧缓存/旧归一化写入的 ws://*:443；443 生产 webSession 需要按 TLS WebSocket 连接。
    return `wss://${raw.slice('ws://'.length)}`
  }
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw
  if (raw.startsWith('https://')) return `wss://${raw.slice('https://'.length)}`
  if (raw.startsWith('http://')) return `ws://${raw.slice('http://'.length)}`
  // 对齐旧 im 登录域名检查：生产 webSession 裸域名默认按 TLS WebSocket 连接，避免 443 被误连成明文 ws。
  return `wss://${raw}`
}

function isIpAddressHost(host: string): boolean {
  const normalized = String(host || '').trim().toLowerCase()
  return /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(normalized)
}

function isWsUrlCompatibleWithEnv(input: string): boolean {
  const raw = normalizeWsUrl(input)
  if (!raw) return false
  if (API_CONFIG.env !== 'prod' && API_CONFIG.env !== 'production') return true
  try {
    const parsed = new URL(raw)
    // 生产 WS 必须走 TLS 且不能复用测试 IP/域名缓存，否则回包会用另一套 AES key 导致全部解密失败。
    return parsed.protocol === 'wss:'
      && !isIpAddressHost(parsed.host)
      && isProdSafeDomain(raw)
  } catch {
    return false
  }
}

async function resolveCurrentConnectedWsUrl(): Promise<string> {
  try {
    const diagnostics = await tauriInvoke<{ events?: Array<{ event?: string; detail?: string }> }>('get_ws_diagnostics')
    const latestConnected = [...(diagnostics.events || [])]
      .reverse()
      .find(item => item?.event === 'CONNECTED' || item?.event === 'CONNECT_JOB_BEGIN' || item?.event === 'CONNECT_START')
    return normalizeWsUrl(latestConnected?.detail || '')
  } catch {
    return ''
  }
}

interface WsConnectConfig {
  wsUrl: string
  aesKey: string
  sessionId: string
  installCode: string
  uid: string
  appVer: number
  packageCode: number
  plat: number
  language: number
  sysMac: string
  sysModel: string
}

async function resolveWsConnectConfig(): Promise<WsConnectConfig> {
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
        const storedWsUrl = normalizeWsUrl(String(parsed.wsUrl || '').trim())
        const compatibleStoredWs = isWsUrlCompatibleWithEnv(storedWsUrl)
        if (compatibleStoredWs) {
          if (!wsUrl) wsUrl = storedWsUrl
          aesKey = aesKey || String(parsed.aesKey || '').trim()
          installCode = installCode || String(parsed.installCode || '').trim()
        } else {
          // 环境切换后旧 WS 缓存可能仍指向测试 IP；连上后会导致线上 AES 回包解密失败。
          localStorage.removeItem('ws-connect-config')
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  if (!sessionId) {
    if ((window as any).__TAURI_INTERNALS__) {
      sessionId = String(authStore.session?.sessionId || '').trim()
    } else {
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
  if (wsUrl && !isWsUrlCompatibleWithEnv(wsUrl)) {
    wsUrl = ''
  }
  if (!aesKey) aesKey = API_CONFIG.aesKey
  installCode = installCode || getOrCreateInstallCode()
  const device = getDeviceConfig()
  // WS 登录 sysModel 必须和旧 im 一致（MAC/WINDOWS），否则同账号跨端踢下线会踢错平台。
  let sysModel = getPlatformSysModel()
  try {
    const runtimePlatform = await getRuntimePlatform()
    if (runtimePlatform === 'macos') sysModel = 'MAC'
    else if (runtimePlatform === 'windows') sysModel = 'WINDOWS'
  } catch {
    // 原生平台探测失败时沿用 getPlatformSysModel 兜底。
  }

  return {
    wsUrl: normalizeWsUrl(wsUrl),
    aesKey,
    sessionId,
    installCode,
    uid,
    // WS 10001 登录包要和 HTTP 登录 clientInfo 一致，避免线上服务已连接但不回发送 ACK。
    appVer: API_CONFIG.appVer,
    packageCode: API_CONFIG.packageCode,
    plat: API_CONFIG.plat,
    language: API_CONFIG.language,
    sysMac: device.sysMac,
    sysModel,
  }
}

async function resolveWsConnectCandidates(): Promise<WsConnectConfig[]> {
  const primary = await resolveWsConnectConfig()
  const lastSuccessfulWsUrl = normalizeWsUrl(localStorage.getItem(LAST_SUCCESSFUL_WS_URL_KEY) || '')
  const legacyLastSuccessfulWsUrl = normalizeWsUrl(localStorage.getItem(LEGACY_LAST_SUCCESSFUL_WS_URL_KEY) || '')
  if (legacyLastSuccessfulWsUrl && !isWsUrlCompatibleWithEnv(legacyLastSuccessfulWsUrl)) {
    localStorage.removeItem(LEGACY_LAST_SUCCESSFUL_WS_URL_KEY)
  }
  const urls = [lastSuccessfulWsUrl, primary.wsUrl]

  try {
    const { collectAllDomainUrls } = await import('@/api/imDomain')
    urls.push(...await collectAllDomainUrls('webSession'))
  } catch {
    // 动态域名接口失败时仍保留登录态保存的 wsUrl 作为兜底。
  }

  // 对齐老 im 的重连行为：每次重连都从 webSession 域名池换候选，避免卡死在单个坏地址。
  const normalizedUrls = [...new Set(
    urls
      .map(url => normalizeWsUrl(url))
      .filter(url => url && isWsUrlCompatibleWithEnv(url)),
  )].slice(0, MAX_WS_CONNECT_CANDIDATES)

  return normalizedUrls.map(wsUrl => ({
    ...primary,
    wsUrl,
  }))
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
const PAGE_SIZE = 80
const CHANNEL_HISTORY_LATEST_SIZE = 30
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
  const currentUid = String(useAuthStore().uid || '').trim()
  if (!currentUid && !(window as any).__TAURI_INTERNALS__) {
    return String(localStorage.getItem('current-uid') || '').trim()
  }
  return currentUid
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

function hasUidInAtList(rawList: unknown, uid: string): boolean {
  if (!Array.isArray(rawList)) return false
  return rawList.some((item) => {
    if (item && typeof item === 'object') {
      const raw = item as Record<string, unknown>
      return String(raw.uid ?? raw.userId ?? raw.id ?? '').trim() === uid
    }
    const value = String(item ?? '').trim()
    return value === uid || value === '-1'
  })
}

function isMessageAtCurrentUser(conversationId: string, msg: Message, uid: string): boolean {
  if (!uid || !conversationId.startsWith('1_')) return false
  const extra = parseExtraObject(msg.extra)
  const content = String(msg.content || '')
  // 对齐旧 im：会话列表 @ 提醒按协议 atUids/atUsers 判断；@全体成员也要提醒当前用户。
  return content.includes('@全体成员')
    || content.includes('@所有人')
    || hasUidInAtList(extra?.atUids ?? extra?.at_uids, uid)
    || hasUidInAtList(extra?.atUsers ?? extra?.at_users, uid)
}

function isIncomingUnreadMessage(
  conversationId: string,
  msg: Message,
  currentUid: string,
  currentConversationId: string,
): boolean {
  return Boolean(
    currentUid
    && msg.senderId
    && String(msg.senderId) !== currentUid
    && currentConversationId !== conversationId
    && Number(msg.readStatus || 0) === 0
    && shouldUseMessageForConversationSummary(conversationId, msg),
  )
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

function getChannelIdFromConversationId(conversationId: string): string {
  return String(conversationId || '').startsWith('2_')
    ? String(conversationId).split('_')[1] || ''
    : ''
}

function toFiniteNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function countByNumber(values: Array<number | string>): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = String(value)
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

function channelHistoryLog(
  message: string,
  data: Record<string, unknown> = {},
  level: 'info' | 'warn' | 'error' = 'info',
) {
  void message
  void data
  void level
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

function privateDecryptSources(source: unknown): string[] {
  const normalized = String(source || '').toLowerCase()
  if (normalized === 'app') return ['app', 'web']
  if (normalized === 'web') return ['web', 'app']
  // 历史消息可能没保存 source；按两端都补 key，再由 protobuf/contentMd5 校验筛掉错 key。
  return ['web', 'app']
}

const DICE_REPLAY_DEBUG_RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
let diceReplayLogStarted = false

function diceLog(message: string, data?: Record<string, unknown>) {
  void message
  void data
}

const SINGLE_VIDEO_DEBUG_RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function isGroupImageMessage(conversationId: string, msgType: number): boolean {
  const type = Number(msgType)
  return /^(0|1|2)_/.test(String(conversationId || '')) && (type === 1 || type === 9 || type === 17)
}

function isSingleImageMessage(conversationId: string, msgType: number): boolean {
  const type = Number(msgType)
  return String(conversationId || '').startsWith('0_') && (type === 1 || type === 9)
}

function isReusableLocalImagePlaceholder(conversationId: string, msgType: number): boolean {
  const type = Number(msgType)
  return /^(0|1|2)_/.test(String(conversationId || '')) && (type === 1 || type === 9)
}

function parseMessageExtraFields(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function readMessageFileKey(message: Message, content?: string | null): string {
  const extra = parseMessageExtraFields(message.extra)
  const fromExtra = String(extra.fileKey || extra.file_key || '').trim()
  if (fromExtra) return fromExtra
  const raw = String(content ?? message.content ?? '').trim()
  if (!raw) return ''
  const imageParsed = parseImageContentObject(raw)
  const imageKey = String(imageParsed?.fileKey || imageParsed?.file_key || '').trim()
  if (imageKey) return imageKey
  const fileParsed = parseFileContentObject(raw)
  return String(fileParsed?.fileKey || fileParsed?.file_key || '').trim()
}

function isOutgoingUploadPendingFilePlaceholder(item: Message, currentUid: string): boolean {
  if (Number(item.msgType) !== 7 || Number(item.status) !== 0) return false
  if (currentUid && String(item.senderId || '') !== currentUid) return false
  const extra = parseMessageExtraFields(item.extra)
  const parsed = parseFileContentObject(item.content)
  return Boolean(extra.uploadPending || parsed?.uploadPending)
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
  const hasLocalPath = Boolean(parsed?.localPath || parsed?.local_path || parsed?.filePath || parsed?.file_path || parsed?.local)
  const hasFileKey = Boolean(parsed?.fileKey || parsed?.file_key)
  return {
    contentLen: raw.length,
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
    // 图片消息可能把 fileKey 放在 content JSON 里，日志只保留摘要和长度。
    contentHead: parsed
      ? shortLogText(JSON.stringify({
          urlHead: shortLogText(url),
          thumbnailHead: shortLogText(thumbnailUrl),
          hasLocalPath,
          hasFileKey,
          fileKeyLen: String(parsed.fileKey ?? parsed.file_key ?? '').length,
        }))
      : shortLogText(raw),
    hasLocalPath,
    hasFileKey,
    fileKeyLen: String(parsed?.fileKey ?? parsed?.file_key ?? '').length,
  }
}

function extraSummary(extra: unknown) {
  const raw = typeof extra === 'string' ? extra : (extra ? JSON.stringify(extra) : '')
  let parsed: Record<string, unknown> | null = null
  try {
    const value = JSON.parse(raw)
    parsed = value && typeof value === 'object' ? value as Record<string, unknown> : null
  } catch {
    parsed = null
  }
  return {
    extraLen: raw.length,
    extraHead: parsed
      ? shortLogText(JSON.stringify({
          keys: Object.keys(parsed).slice(0, 24),
          hasFileKey: Boolean(parsed.fileKey || parsed.file_key),
          fileKeyLen: String(parsed.fileKey ?? parsed.file_key ?? '').length,
          hasAttachmentKey: Boolean(parsed.attachmentKey || parsed.attachment_key),
          attachmentKeyLen: String(parsed.attachmentKey ?? parsed.attachment_key ?? '').length,
          hasClientMsgId: Boolean(parsed.__clientMsgId),
          hasLocalPath: Boolean(parsed.localPath || parsed.local_path || parsed.local),
        }))
      : shortLogText(raw),
    extraKeys: parsed ? Object.keys(parsed).slice(0, 24) : [],
    extraHasFileKey: Boolean(parsed?.fileKey || parsed?.file_key),
    extraFileKeyLen: String(parsed?.fileKey ?? parsed?.file_key ?? '').length,
    hasAttachmentKey: Boolean(parsed?.attachmentKey || parsed?.attachment_key),
    attachmentKeyLen: String(parsed?.attachmentKey ?? parsed?.attachment_key ?? '').length,
    hasClientMsgId: Boolean(parsed?.__clientMsgId),
    hasLocalPath: Boolean(parsed?.localPath || parsed?.local_path || parsed?.local),
    decryptPending: Boolean(parsed?.decryptPending),
    version: parsed?.version ?? null,
    source: parsed?.source ?? null,
    contentMd5Len: String(parsed?.contentMd5 ?? parsed?.content_md5 ?? '').length,
    cipherCandidates: Array.isArray(parsed?.cipherCandidates)
      ? parsed.cipherCandidates.slice(0, 6).map((candidate: any) => ({
          version: Number(candidate?.version || parsed?.version || 0),
          source: String(candidate?.source || parsed?.source || ''),
          cipherHexLen: String(candidate?.cipherHex || candidate?.cipher_hex || '').length,
          attachmentKeyLen: String(candidate?.attachmentKey || candidate?.attachment_key || '').length,
        }))
      : [],
  }
}

function parseImageContentObject(content: string | null | undefined): Record<string, unknown> | null {
  const raw = String(content ?? '').trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

const DECRYPT_PENDING_CIPHER_HINT = '[加密消息，等待密钥同步]'

function isDecryptPendingCipherHint(content: unknown): boolean {
  return String(content ?? '').trim() === DECRYPT_PENDING_CIPHER_HINT
}

function parseFileContentObject(content: string | null | undefined): Record<string, unknown> | null {
  const raw = String(content ?? '').trim()
  if (!raw || isDecryptPendingCipherHint(raw)) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function isUsableFileMessageContent(content: unknown): boolean {
  const raw = String(content ?? '').trim()
  if (!raw || isDecryptPendingCipherHint(raw)) return false
  const parsed = parseFileContentObject(raw)
  if (parsed) {
    const url = String(parsed.url || parsed.fileUrl || parsed.path || '').trim()
    const name = String(parsed.name || parsed.fileName || '').trim()
    return Boolean(url || name)
  }
  if (raw.includes('||')) return true
  return /^https?:\/\//i.test(raw)
}

function mergeFileMessageContent(
  incomingContent: string | null | undefined,
  previousContent: string | null | undefined,
): string | null {
  const incoming = String(incomingContent ?? '').trim()
  const previous = String(previousContent ?? '').trim()
  const incomingUsable = isUsableFileMessageContent(incoming)
  const previousUsable = isUsableFileMessageContent(previous)
  if (incomingUsable && previousUsable) {
    const incomingParsed = parseFileContentObject(incoming)
    const previousParsed = parseFileContentObject(previous)
    const incomingHasUrl = Boolean(String(incomingParsed?.url || incomingParsed?.fileUrl || '').trim())
    const previousHasUrl = Boolean(String(previousParsed?.url || previousParsed?.fileUrl || '').trim())
    if (!incomingHasUrl && previousHasUrl) return previous
    return incoming
  }
  if (incomingUsable) return incoming
  if (previousUsable) return previous
  return null
}

function mergeImageLocalPreviewContent(
  incomingContent: string | null | undefined,
  previousContent: string | null | undefined,
): string | null {
  const incoming = parseImageContentObject(incomingContent)
  const previous = parseImageContentObject(previousContent)
  if (!incoming || !previous) return null

  const previousLocalPath = String(
    previous.localPath || previous.local_path || previous.filePath || previous.file_path || previous.local || '',
  ).trim()
  const previousPreviewUrl = String(previous.localPreviewUrl || previous.local_preview_url || '').trim()
    || [previous.thumbnailUrl, previous.thumbUrl, previous.url]
      .map(value => String(value || '').trim())
      .find(value => /^(data:image\/|blob:)/i.test(value))
    || ''

  if (!previousLocalPath && !previousPreviewUrl) return null

  // 发送成功后只在本地状态里保留预览，远端 url/fileKey 仍来自发送结果，避免改动真实协议内容。
  return JSON.stringify({
    ...incoming,
    ...(previousLocalPath
      ? {
          local: String(previous.local || previousLocalPath),
          localPath: previousLocalPath,
        }
      : {}),
    ...(previousPreviewUrl ? { localPreviewUrl: previousPreviewUrl } : {}),
  })
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

function getCurrentGroupMemberRole(conversationId: string, currentUid: string): number | null {
  if (!conversationId.startsWith('1_') || conversationId === `1_${GROUP_NOTIFICATION_TARGET_ID}`) return null
  const groupId = conversationId.slice(2)
  if (!groupId || !currentUid) return null
  const groupStore = useGroupStore()
  const memberRole = groupStore.getMembers(groupId).find((member) => member.userId === currentUid)?.role
  if (Number.isFinite(Number(memberRole))) return Number(memberRole)
  const ownerId = groupStore.getGroup(groupId)?.ownerId
  return ownerId ? (ownerId === currentUid ? 0 : 2) : null
}

function shouldUseMessageForConversationSummary(conversationId: string, message: Message): boolean {
  const currentUid = useAuthStore().uid
  const currentGroupMemberRole = getCurrentGroupMemberRole(conversationId, currentUid)
  return !isHiddenMessageType(message.msgType)
    && !isPendingGroupReqChatMessage(message)
    && !isRejectedGroupInviteNoticeForNotification(conversationId, message)
    && !isHiddenGroupEventPlaceholderMessage(conversationId, message)
    && !isGroupMemberLeaveNoticeHiddenForCurrentUser(
      conversationId,
      message,
      currentUid,
      { currentGroupMemberRole },
    )
    && !isGroupRemoveNoticeHiddenForCurrentUser(conversationId, message, currentUid)
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
    ...extraSummary(message.extra),
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

function privateCipherCandidateLine(
  candidates: Array<{ version?: number; source?: string; cipherHex?: string; attachmentKey?: string }>,
): string {
  return candidates.slice(0, 8).map((candidate, index) => [
    `#${index}`,
    `version=${Number(candidate.version || 0)}`,
    `source=${String(candidate.source || '') || 'empty'}`,
    `cipherHexLen=${String(candidate.cipherHex || '').length}`,
    `attachmentKeyLen=${String(candidate.attachmentKey || '').length}`,
  ].join(':')).join(',')
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

function collectMessageIdentityKeys(message: Message): string[] {
  const keys: string[] = []
  const id = String(message.id || '').trim()
  const custom = String(message.customMsgId || '').trim()
  if (id) keys.push(`id:${id}`)
  if (custom) keys.push(`custom:${custom}`)
  if (id && custom) keys.push(`pair:${id}:${custom}`)
  return keys
}

function compareMessagesChronologically(a: Message, b: Message): number {
  const timeDiff = Number(a.sendTime || 0) - Number(b.sendTime || 0)
  if (timeDiff !== 0) return timeDiff
  return String(a.id || a.customMsgId || '').localeCompare(String(b.id || b.customMsgId || ''))
}

function sortMessagesChronologically(messages: Message[]): Message[] {
  for (let i = 1; i < messages.length; i++) {
    if (compareMessagesChronologically(messages[i - 1], messages[i]) > 0) {
      return messages.slice().sort(compareMessagesChronologically)
    }
  }
  return messages
}

function mergeUniqueMessagesInOrder(messages: Message[]): Message[] {
  const seen = new Set<string>()
  const merged: Message[] = []
  for (const message of messages) {
    const keys = collectMessageIdentityKeys(message)
    const duplicated = keys.some((key) => seen.has(key))
    if (duplicated) continue
    merged.push(message)
    for (const key of keys) seen.add(key)
  }
  return merged
}

function shouldPreserveMessageDuringLoad(message: Message, loadStartedAt: number): boolean {
  const status = Number(message.status || 0)
  if (status === 0 || status === -1) return true

  const sendTime = Number(message.sendTime || 0)
  return Boolean(loadStartedAt && sendTime >= loadStartedAt - 1000)
}

function mergeLoadedMessagesWithLocal(conversationId: string, loaded: Message[], existing: Message[], loadStartedAt = 0) {
  const loadedIdentityKeys = new Set<string>()
  for (const item of loaded) {
    for (const key of collectMessageIdentityKeys(item)) loadedIdentityKeys.add(key)
  }
  const preservedLocalMessages = existing.filter((message) => (
    message.conversationId === conversationId
    && shouldPreserveMessageDuringLoad(message, loadStartedAt)
    && !collectMessageIdentityKeys(message).some((key) => loadedIdentityKeys.has(key))
  ))
  if (preservedLocalMessages.length === 0) {
    return { messages: sortMessagesChronologically(loaded), preserved: [] as Message[] }
  }
  const merged = sortMessagesChronologically([...loaded, ...preservedLocalMessages])
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

function fillGroupReadBurnMeta(
  conversationId: string,
  msgType: number,
  snapchatTime?: number,
  deleteSeconds?: number,
) {
  if (snapchatTime || deleteSeconds) return { snapchatTime, deleteSeconds }
  if (!conversationId.startsWith('1_')) return { snapchatTime, deleteSeconds }
  if (msgType === MessageType.System || msgType === MessageType.Notice || isHiddenMessageType(msgType)) {
    return { snapchatTime, deleteSeconds }
  }

  const groupId = conversationId.slice(2)
  const group = useGroupStore().getGroup(groupId)
  const seconds = group?.bfGroupReadCancel ? Number(group.groupMsgCancelTime || 0) : 0
  if (!Number.isFinite(seconds) || seconds <= 0) return { snapchatTime, deleteSeconds }

  // 对齐旧 im：群阅后即焚开启后，新到达的普通群消息即使协议没带 snapchatTime，也按群配置补销毁时间。
  return {
    snapchatTime: seconds,
    deleteSeconds: seconds * 1000,
  }
}

function scheduleSelfGroupReadBurnDeletion(message: Message, baseTime = Date.now()) {
  if (!message.conversationId.startsWith('1_')) return
  const uid = String(useAuthStore().uid || '')
  if (!uid || String(message.senderId || '') !== uid) return
  const deleteDelay = Number(message.deleteSeconds || 0)
  if (!Number.isFinite(deleteDelay) || deleteDelay <= 0) return

  const expireAt = baseTime + deleteDelay
  const scheduleDeletionStore = useScheduleDeletionStore()
  const ids = [message.id, message.customMsgId].map((id) => String(id || '')).filter(Boolean)
  // 对齐旧 im：自己发出的群阅后即焚消息新增后立即开始计时；同时注册远端 id 和本地 custom id，防止发送回写换 id 后漏删。
  for (const id of ids) {
    scheduleDeletionStore.addMessageTimer(message.conversationId, id, expireAt)
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
  function resolveUidNick(id: string, groupId?: string) {
    const uid = String(id || '').trim()
    if (!uid) return ''
    const contactName = useContactStore().getDisplayName(uid)
    if (contactName && contactName !== uid) return contactName
    if (groupId) {
      const cachedName = resolveGroupMemberDisplayName(groupId, uid)
      if (cachedName && cachedName !== uid) return cachedName
      const memberName = String(
        useGroupStore().getMembers(groupId).find((member) => member.userId === uid)?.nickname || '',
      ).trim()
      if (memberName && memberName !== uid) return memberName
    }
    return contactName || uid
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
    if (status === 'connected') {
      const currentWsUrl = await resolveCurrentConnectedWsUrl()
      // 已连接时直接走快路径，避免每次发送消息都解析域名池或触发 listDomain 相关等待。
      if (!currentWsUrl || isWsUrlCompatibleWithEnv(currentWsUrl)) return
      // 当前已连接的 WS 可能来自环境切换前的测试缓存；断开后才能重新选择线上 webSession。
      await tauriInvoke('disconnect_ws').catch(() => undefined)
      await sleep(80)
    }

    // 如果已有连接任务在跑，复用同一个 Promise；不要为并发发送重复解析候选域名。
    if (pendingWsConnect) return pendingWsConnect

    const candidates = await resolveWsConnectCandidates()
    if (!candidates[0]?.wsUrl || !candidates[0]?.aesKey || !candidates[0]?.sessionId || !candidates[0]?.uid) {
      // 发送前必须具备完整 10001 登录上下文；否则服务端会拒绝 WS，消息不能只停留在本地乐观气泡。
      throw new Error('[ws] connect config missing (wsUrl/aesKey/sessionId/uid)')
    }

    pendingWsConnect = (async () => {
      for (const [index, candidate] of candidates.entries()) {
        const currentStatus = await tauriInvoke<string>('get_ws_status').catch(() => 'disconnected')
        if (currentStatus === 'connected') return

        // Tauri 的重连循环会固定当前 URL；切换候选前先断开，才能真正换到下一个 webSession。
        if (currentStatus !== 'disconnected') {
          await tauriInvoke('disconnect_ws').catch(() => undefined)
          await sleep(80)
        }

        console.warn('[ws] ensureWsConnected: reconnecting...', {
          status: currentStatus,
          wsUrl: candidate.wsUrl,
          candidateIndex: index + 1,
          candidateTotal: candidates.length,
        })
        await tauriInvoke('connect_ws', {
          url: candidate.wsUrl,
          aesKey: candidate.aesKey,
          sessionId: candidate.sessionId,
          installCode: candidate.installCode,
          uid: candidate.uid,
          appVer: candidate.appVer,
          packageCode: candidate.packageCode,
          plat: candidate.plat,
          language: candidate.language,
          sysMac: candidate.sysMac,
          sysModel: candidate.sysModel,
        })

        for (let i = 0; i < WS_CONNECT_STATUS_CHECK_COUNT; i++) {
          const s = await tauriInvoke<string>('get_ws_status').catch(() => 'disconnected')
          if (s === 'connected') {
            // 发送链路记录实际可用的 WS，下次重连优先尝试它，避免坏域名排在前面导致消息长时间发送中。
            localStorage.setItem(LAST_SUCCESSFUL_WS_URL_KEY, candidate.wsUrl)
            return
          }
          await sleep(WS_CONNECT_STATUS_CHECK_DELAY_MS)
        }
      }
      throw new Error('[ws] reconnect timeout: status did not become connected')
    })().finally(() => {
      pendingWsConnect = null
    })

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
      resolveUidPlaceholder: (id) => resolveUidNick(id, getGroupNoticeGroupId(extra) || ''),
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

  function syncConversationSummary(
    conversationId: string,
    msg: Message,
    options?: { incomingUnreadDelta?: number },
  ) {
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
        resolveUidPlaceholder: (id) => resolveUidNick(id, getGroupNoticeGroupId(groupNoticeExtra) || conversationId.split('_')[1] || ''),
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
      const isIncomingUnread = isIncomingUnreadMessage(
        conversationId,
        msg,
        currentUid,
        currentConversationId,
      )
      // 桌面端未读以 Rust 落库后的 conv:update 为准，避免与 upsert_incoming_messages 竞态把归档等会话红点盖回 1。
      const shouldUpdateUnreadInMemory = !isTauri()
      const incomingUnreadDelta = Math.max(0, Number(options?.incomingUnreadDelta ?? 0))
      const unreadIncrement = incomingUnreadDelta > 0
        ? incomingUnreadDelta
        : (isIncomingUnread ? 1 : 0)
      const nextUnreadCount = shouldUpdateUnreadInMemory && unreadIncrement > 0
        ? Math.max(0, Number(existing.unreadCount || 0)) + unreadIncrement
        : existing.unreadCount
      const nextAtMe = existing.atMe || (isIncomingUnread && isMessageAtCurrentUser(conversationId, msg, currentUid))
      groupIntroMessageTrace('syncConversationSummary', conversationId, msg, {
        digest,
        currentUid,
        currentConversationId,
        isIncomingUnread,
        nextAtMe,
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
        atMe: nextAtMe,
        updatedAt: msg.sendTime || Date.now(),
      })
      return
    }
    const [typeRaw, targetId = ''] = conversationId.split('_')
    const conv = chatStore.ensureConversation(Number(typeRaw || 0), targetId)
    const currentUid = getCurrentUidForUnread()
    const currentConversationId = String(chatStore.currentConversationId || '')
    const isIncomingUnread = isIncomingUnreadMessage(
      conversationId,
      msg,
      currentUid,
      currentConversationId,
    )
    const shouldUpdateUnreadInMemory = !isTauri()
    const incomingUnreadDelta = Math.max(0, Number(options?.incomingUnreadDelta ?? 0))
    const unreadIncrement = incomingUnreadDelta > 0
      ? incomingUnreadDelta
      : (isIncomingUnread ? 1 : 0)
    const nextUnreadCount = shouldUpdateUnreadInMemory && unreadIncrement > 0
      ? Math.max(0, Number(conv.unreadCount || 0)) + unreadIncrement
      : conv.unreadCount
    const nextAtMe = conv.atMe || (isIncomingUnread && isMessageAtCurrentUser(conversationId, msg, currentUid))
    groupIntroMessageTrace('syncConversationSummary:newConversation', conversationId, msg, {
      digest,
      currentUid,
      currentConversationId,
      isIncomingUnread,
      nextAtMe,
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
      atMe: nextAtMe,
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
    // 进入频道时本地快照可能暂时为空；保序刷新不能清掉旧摘要，否则左侧会话会被空历史规则过滤。
    const preserveEmptySummary = options?.preserveListOrder === true && !latest
    chatStore.addOrUpdateConversation({
      ...existing,
      lastMsgId: preserveEmptySummary ? existing.lastMsgId : latest?.id || null,
      lastMsgTime: preserveEmptySummary ? existing.lastMsgTime : latest?.sendTime || 0,
      lastMsgDigest: preserveEmptySummary ? existing.lastMsgDigest : digest || null,
      // 进入会话加载历史消息只修正预览，不改变左侧列表位置，避免点击后列表突然重排。
      updatedAt: options?.preserveListOrder ? existing.updatedAt : latest?.sendTime || 0,
    }, { preserveListOrder: options?.preserveListOrder === true })
  }

  function isChannelDeleteControlMessage(conversationId: string, messageId: string | number, msgType: string | number): boolean {
    // 对齐旧 im：频道 msgId=1 + msgType=6 是删除/清空控制信号，不应作为普通加密内容展示或重试解密。
    return Boolean(getChannelIdFromConversationId(conversationId))
      && toFiniteNumber(messageId) === CHANNEL_DELETE_CONTROL_MSG_ID
      && Number(msgType) === CHANNEL_SYSTEM_MESSAGE_TYPE
  }

  function normalizeMessage(raw: any, options: { fillGroupReadBurnFromCurrentGroup?: boolean } = {}): Message {
    const extraObj = parseExtraObject(raw.extra)
    const extraStr = stringifyExtra(raw.extra)
    let quoteMessage: QuoteMessageInfo | null = raw.quoteMessage ?? null
    if (!quoteMessage && extraObj?.quoteMessage) {
      quoteMessage = extraObj.quoteMessage as QuoteMessageInfo
    }
    const id = String(raw.id ?? raw.msgId ?? raw.msg_id ?? '')
    const conversationId = String(raw.conversationId ?? raw.conversation_id ?? '')
    const msgType = Number(raw.msgType ?? raw.msg_type ?? 0)
    const extractedReadBurnMeta = extractReadBurnMeta(raw, extraObj)
    const readBurnMeta = options.fillGroupReadBurnFromCurrentGroup
      ? fillGroupReadBurnMeta(
          conversationId,
          msgType,
          extractedReadBurnMeta.snapchatTime,
          extractedReadBurnMeta.deleteSeconds,
        )
      : extractedReadBurnMeta
    const isChannelDeleteControl = isChannelDeleteControlMessage(conversationId, id, msgType)
    return {
      id,
      customMsgId: raw.customMsgId ?? raw.custom_msg_id ?? null,
      conversationId,
      senderId: String(raw.senderId ?? raw.sender_id ?? ''),
      msgType,
      content: raw.content ?? null,
      sendTime: Number(raw.sendTime ?? raw.send_time ?? Date.now()),
      status: Number(raw.status ?? 0),
      readStatus: Number(raw.readStatus ?? raw.read_status ?? 0),
      version: Number(raw.version ?? 0),
      isDeleted: Boolean(raw.isDeleted ?? raw.is_deleted ?? false) || isChannelDeleteControl,
      extra: extraStr,
      snapchatTime: readBurnMeta.snapchatTime,
      deleteSeconds: readBurnMeta.deleteSeconds,
      quoteMessage,
    }
  }

  function getMessages(conversationId: string): Message[] {
    return messageMap.value.get(conversationId) ?? []
  }

  function patchDecryptedMessagesInPlace(conversationId: string, resolved: Message[]) {
    const existing = getMessages(conversationId)
    if (!existing.length || !resolved.length) return

    const patchMap = new Map<string, { content: string | null; extra: string | null }>()
    for (const message of resolved) {
      const patch = {
        content: message.content ?? null,
        extra: message.extra ?? null,
      }
      const id = String(message.id || '').trim()
      const custom = String(message.customMsgId || '').trim()
      if (id) patchMap.set(id, patch)
      if (custom) patchMap.set(custom, patch)
    }

    let changed = false
    const next = existing.map((message) => {
      const patch = patchMap.get(String(message.id || ''))
        || (message.customMsgId ? patchMap.get(String(message.customMsgId)) : undefined)
      if (!patch) return message
      if (message.content === patch.content && message.extra === patch.extra) return message
      changed = true
      return {
        ...message,
        content: patch.content,
        extra: patch.extra,
      }
    })
    if (changed) {
      messageMap.value.set(conversationId, next)
    }
  }

  function isLoading(conversationId: string): boolean {
    return loadingMap.value.get(conversationId) ?? false
  }

  function hasMore(conversationId: string): boolean {
    return hasMoreMap.value.get(conversationId) ?? true
  }

  async function retryDecryptPendingPrivateMessages(uid: string, messages: Message[]) {
    if (!isTauri() || !uid || messages.length === 0) return messages

    const privateImageMessages = messages.filter((message) => {
      const conversationId = String(message.conversationId || '')
      return conversationId.startsWith('0_') && isGroupImageMessage(conversationId, message.msgType)
    })
    const pendingPrivateImages = privateImageMessages.filter((message) => {
      const extra = parseExtraObject(message.extra)
      return Boolean(extra?.decryptPending)
    })
    groupImageLog('retry private image scan summary', {
      debugLine: [
        `uid=${uid}`,
        `totalMessages=${messages.length}`,
        `privateImageCount=${privateImageMessages.length}`,
        `pendingPrivateImageCount=${pendingPrivateImages.length}`,
        `pendingIds=${pendingPrivateImages.slice(0, 12).map(message => message.id).join(',') || 'empty'}`,
      ].join(' '),
      uid,
      totalMessages: messages.length,
      privateImageCount: privateImageMessages.length,
      pendingPrivateImageCount: pendingPrivateImages.length,
      pendingIds: pendingPrivateImages.slice(0, 12).map(message => message.id),
    })

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
      if (isGroupImageMessage(conversationId, message.msgType)) {
        groupImageLog('retry private image decrypt pending start', {
          debugLine: [
            `messageId=${message.id}`,
            `conversationId=${conversationId}`,
            `senderId=${senderId}`,
            `peerId=${peerId}`,
            `msgType=${Number(message.msgType || 0)}`,
            `candidateCount=${cipherCandidates.length}`,
            `candidates=${privateCipherCandidateLine(cipherCandidates)}`,
          ].join(' '),
          conversationId,
          message: messageLogSummary(message),
          peerId,
          senderId,
          candidateCount: cipherCandidates.length,
          candidates: cipherCandidates.slice(0, 6).map(candidate => ({
            version: candidate.version,
            source: candidate.source,
            cipherHexLen: String(candidate.cipherHex || '').length,
            attachmentKeyLen: String(candidate.attachmentKey || '').length,
          })),
        })
      }

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
          // 记录实际解密成功的 key 版本/source，避免下次启动继续按失败 source 进入待解密。
          version: Number(candidate.version || extra.version || 0) || extra.version,
          source: String(candidate.source || extra.source || ''),
        } as Record<string, unknown>
        if (resolvedFileKey && !normalizeResolvedFileKey(nextExtra.fileKey)) {
          nextExtra.fileKey = resolvedFileKey
        }

        message.content = plain
        message.extra = stringifyExtra(nextExtra)
        if (isGroupImageMessage(conversationId, message.msgType)) {
          groupImageLog('retry private image decrypt applied', {
            debugLine: [
              `messageId=${message.id}`,
              `conversationId=${conversationId}`,
              `senderId=${senderId}`,
              `peerId=${peerId}`,
              `version=${Number(candidate.version || 0)}`,
              `source=${String(candidate.source || '') || 'empty'}`,
              `resolvedFileKeyLen=${String(resolvedFileKey || '').length}`,
            ].join(' '),
            conversationId,
            message: messageLogSummary(message),
            candidateVersion: candidate.version,
            candidateSource: candidate.source,
            plain: imageContentSummary(plain),
            resolvedFileKeyLen: String(resolvedFileKey || '').length,
          })
        }
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

      candidateLoop:
      for (const candidate of cipherCandidates) {
        for (const candidateSource of privateDecryptSources(candidate.source)) {
          const attemptCandidate = {
            ...candidate,
            source: candidateSource,
          }
          if (isGroupImageMessage(conversationId, message.msgType)) {
            groupImageLog('retry private image decrypt attempt', {
              debugLine: [
                `messageId=${message.id}`,
                `conversationId=${conversationId}`,
                `senderId=${senderId}`,
                `peerId=${peerId}`,
                `version=${Number(candidate.version || 0)}`,
                `source=${candidateSource}`,
                `originalSource=${String(candidate.source || '') || 'empty'}`,
                `cipherHexLen=${String(candidate.cipherHex || '').length}`,
                `attachmentKeyLen=${String(candidate.attachmentKey || '').length}`,
              ].join(' '),
              conversationId,
              messageId: message.id,
              senderId,
              peerId,
              version: candidate.version,
              source: candidateSource,
              originalSource: candidate.source,
              cipherHexLen: String(candidate.cipherHex || '').length,
              attachmentKeyLen: String(candidate.attachmentKey || '').length,
            })
          }
          try {
            try {
              await ensureFriendRelKeyForVersion(
                uid,
                senderId,
                Number(candidate.version || 0),
                candidateSource,
              )
            } catch (keyError) {
              console.warn('[e2ee] ensureFriendRelKeyForVersion on loadMessages failed', {
                messageId: message.id,
                senderId,
                peerId,
                version: candidate.version,
                source: candidateSource,
                originalSource: candidate.source,
                err: String(keyError),
              })
              if (isGroupImageMessage(conversationId, message.msgType)) {
                groupImageLog('retry private image key ensure failed', {
                  debugLine: [
                    `messageId=${message.id}`,
                    `conversationId=${conversationId}`,
                    `senderId=${senderId}`,
                    `peerId=${peerId}`,
                    `version=${Number(candidate.version || 0)}`,
                    `source=${candidateSource}`,
                    `originalSource=${String(candidate.source || '') || 'empty'}`,
                    `err=${String(keyError)}`,
                  ].join(' '),
                  conversationId,
                  messageId: message.id,
                  senderId,
                  peerId,
                  version: candidate.version,
                  source: candidateSource,
                  originalSource: candidate.source,
                  err: String(keyError),
                }, 'warn')
              }
            }

            let hasKeyAfterEnsure = false
            try {
              hasKeyAfterEnsure = await tauriInvoke<boolean>('has_friend_rel_key', {
                friendId: senderId,
                version: Number(candidate.version || 0),
                source: candidateSource,
              })
            } catch {
              hasKeyAfterEnsure = false
            }
            if (isGroupImageMessage(conversationId, message.msgType)) {
              groupImageLog('retry private image key ready', {
                debugLine: [
                  `messageId=${message.id}`,
                  `conversationId=${conversationId}`,
                  `senderId=${senderId}`,
                  `peerId=${peerId}`,
                  `version=${Number(candidate.version || 0)}`,
                  `source=${candidateSource}`,
                  `originalSource=${String(candidate.source || '') || 'empty'}`,
                  `hasKey=${String(hasKeyAfterEnsure)}`,
                ].join(' '),
                conversationId,
                messageId: message.id,
                senderId,
                peerId,
                version: candidate.version,
                source: candidateSource,
                originalSource: candidate.source,
                hasKey: hasKeyAfterEnsure,
              })
            }

            const plain = await tauriInvoke<string>('decrypt_private_incoming', {
              senderId,
              peerId,
              version: Number(candidate.version || 1),
              source: candidateSource,
              ciphertextHex: String(candidate.cipherHex || ''),
              msgType: Number(message.msgType || 0),
              contentMd5: String(extra.contentMd5 || extra.content_md5 || ''),
            })

            await applyDecryptedPlain(plain, attemptCandidate)
            break candidateLoop
          } catch (error) {
            try {
              await ensureFriendRelKeyForVersion(
                uid,
                senderId,
                Number(candidate.version || 0),
                candidateSource,
                true,
              )
              const plain = await tauriInvoke<string>('decrypt_private_incoming', {
                senderId,
                peerId,
                version: Number(candidate.version || 1),
                source: candidateSource,
                ciphertextHex: String(candidate.cipherHex || ''),
                msgType: Number(message.msgType || 0),
                contentMd5: String(extra.contentMd5 || extra.content_md5 || ''),
              })
              await applyDecryptedPlain(plain, attemptCandidate)
              break candidateLoop
            } catch (refreshError) {
              console.warn('[e2ee] retry decrypt_private on loadMessages failed', {
                messageId: message.id,
                conversationId,
                senderId,
                peerId,
                version: candidate.version,
                source: candidateSource,
                originalSource: candidate.source,
                err: String(refreshError),
                firstErr: String(error),
              })
              if (isGroupImageMessage(conversationId, message.msgType)) {
                groupImageLog('retry private image decrypt failed', {
                  debugLine: [
                    `messageId=${message.id}`,
                    `conversationId=${conversationId}`,
                    `senderId=${senderId}`,
                    `peerId=${peerId}`,
                    `version=${Number(candidate.version || 0)}`,
                    `source=${candidateSource}`,
                    `originalSource=${String(candidate.source || '') || 'empty'}`,
                    `err=${String(refreshError)}`,
                    `firstErr=${String(error)}`,
                  ].join(' '),
                  conversationId,
                  messageId: message.id,
                  senderId,
                  peerId,
                  version: candidate.version,
                  source: candidateSource,
                  originalSource: candidate.source,
                  err: String(refreshError),
                  firstErr: String(error),
                }, 'warn')
              }
            }
          }
        }
      }
    }

    return messages
  }

  async function retryDecryptPendingChannelMessages(uid: string, messages: Message[]) {
    if (!isTauri() || !uid || messages.length === 0) return messages

    const pendingChannelIds = Array.from(new Set(
      messages
        .filter((message) => {
          if (!getChannelIdFromConversationId(message.conversationId)) return false
          const extra = parseExtraObject(message.extra)
          return Boolean(extra?.decryptPending && extra?.cipherHex)
        })
        .map((message) => {
          const extra = parseExtraObject(message.extra)
          return String(extra?.channelId || getChannelIdFromConversationId(message.conversationId) || '')
        })
        .filter((channelId) => !!channelId),
    ))
    for (const channelId of pendingChannelIds) {
      try {
        await ensureChannelRelKey(uid, channelId)
      } catch (error) {
        channelHistoryLog('ensure channel rel key on loadMessages retry failed', {
          uid,
          channelId,
          err: String(error),
        }, 'warn')
      }
    }

    const persisted: Message[] = []
    for (const message of messages) {
      const conversationId = String(message.conversationId || '')
      const channelId = getChannelIdFromConversationId(conversationId)
      if (!channelId) continue

      const extra = parseExtraObject(message.extra) || {}
      const cipherHex = String(extra.cipherHex || '')
      if (!extra.decryptPending || !cipherHex) continue
      if (isChannelDeleteControlMessage(conversationId, message.id, message.msgType)) {
        const nextExtra = {
          ...extra,
          decryptPending: false,
          skippedDecryptReason: 'channel-delete-control',
        } as Record<string, unknown>
        // 旧缓存里已落成普通 pending 的频道删除/清空控制信号，不能继续送进 AES 解密。
        message.content = ''
        message.isDeleted = true
        message.extra = stringifyExtra(nextExtra)
        persisted.push(message)
        continue
      }

      try {
        const plain = await tauriInvoke<string>('decrypt_channel_incoming', {
          channelId: String(extra.channelId || channelId),
          ciphertextHex: cipherHex,
          msgType: Number(message.msgType || 0),
        })
        const nextExtra = {
          ...extra,
          decryptPending: false,
          cipherHex,
        } as Record<string, unknown>
        const attachmentKey = String(nextExtra.attachmentKey || nextExtra.attachment_key || '')
        const fileKey = await resolveChannelAttachmentFileKey(channelId, attachmentKey)
        if (fileKey && !normalizeResolvedFileKey(nextExtra.fileKey)) {
          nextExtra.fileKey = fileKey
        }

        // 频道本地缓存里的 decryptPending 消息打开会话时重试，避免旧占位一直留在 UI。
        message.content = plain
        message.extra = stringifyExtra(nextExtra)
        persisted.push(message)
        channelHistoryLog('retry pending channel decrypted', {
          uid,
          channelId,
          messageId: message.id,
          msgType: message.msgType,
          contentLen: plain.length,
          contentHead: plain.slice(0, 180),
        })
      } catch (error) {
        channelHistoryLog('retry pending channel decrypt failed', {
          uid,
          channelId,
          messageId: message.id,
          msgType: message.msgType,
          cipherLen: cipherHex.length,
          err: String(error),
        }, 'warn')
      }
    }

    if (persisted.length > 0) {
      await tauriInvoke('upsert_incoming_messages', {
        uid,
        messages: persisted.map((message) => ({
          id: message.id,
          customMsgId: message.customMsgId,
          conversationId: message.conversationId,
          senderId: message.senderId,
          msgType: message.msgType,
          content: message.content,
          sendTime: message.sendTime,
          status: message.status,
          readStatus: message.readStatus,
          version: message.version,
          isDeleted: message.isDeleted,
          extra: parseExtraObject(message.extra),
        })),
      }).catch((error) => {
        channelHistoryLog('persist retried channel messages failed', {
          uid,
          count: persisted.length,
          err: String(error),
        }, 'warn')
      })
    }

    // 返回新对象，确保频道 decryptPending 占位被真实内容替换后，消息组件能收到 props 更新。
    return messages.map((message) => ({ ...message }))
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

  function getLatestChannelMsgId(resp: unknown): number {
    const rows = (resp as { data?: Array<{ msgType?: number | string; latestMsgId?: number | string }> })?.data
    if (!Array.isArray(rows)) return 0
    const item = rows.find((row) => Number(row?.msgType ?? 0) === 0)
    return toFiniteNumber(item?.latestMsgId)
  }

  function hasVisibleChannelMessageId(messages: Message[], msgId: number): boolean {
    if (!msgId) return false
    const target = String(msgId)
    return messages.some((message) => {
      const id = String(message.id)
      return id === target
        || id === `${target}-channel-join`
        || id === `${target}-channel-create`
    })
  }

  async function fetchChannelRecentHistoryItems(params: {
    bizType: number
    bizId: string
    msgType: number
    latestMsgId: number
    latestSize: number
  }): Promise<ChannelHistoryMessage[]> {
    const shared = {
      bizType: params.bizType,
      bizId: params.bizId,
      msgType: params.msgType,
      latestSize: params.latestSize,
      latestMsgId: params.latestMsgId,
    }
    // 频道创建等系统消息在 CHANNEL_EVENT(1)，订阅加入等在 CHANNEL_SUBSCRIBER_EVENT(2)，需合并补拉。
    const [channelEvents, subscriberEvents] = await Promise.all([
      getChannelHistoryMessages({ ...shared, eventType: 1 }),
      getChannelHistoryMessages({ ...shared, eventType: 2 }),
    ])
    const merged = new Map<string, ChannelHistoryMessage>()
    for (const item of [...channelEvents, ...subscriberEvents]) {
      if (!item?.msgId) continue
      merged.set(String(item.msgId), item)
    }
    return Array.from(merged.values())
  }

  async function resolveChannelAttachmentFileKey(channelId: string, attachmentKey: string): Promise<string> {
    const plain = normalizeResolvedFileKey(attachmentKey)
    if (plain) return plain
    if (!attachmentKey || !channelId) return ''
    try {
      const resolved = await tauriInvoke<string>('decrypt_channel_incoming', {
        channelId,
        ciphertextHex: attachmentKey,
        msgType: 0,
      })
      return normalizeResolvedFileKey(resolved)
    } catch (error) {
      channelHistoryLog('resolve attachment fileKey failed', {
        channelId,
        attachmentKeyLen: attachmentKey.length,
        err: String(error),
      }, 'warn')
      return ''
    }
  }

  async function normalizeChannelHistoryMessage(
    uid: string,
    conversationId: string,
    channelId: string,
    item: ChannelHistoryMessage,
  ): Promise<Message | null> {
    if (!item.msgId || !item.channelId || String(item.channelId) !== channelId) return null
    if (isChannelDeleteControlMessage(conversationId, item.msgId, item.msgType)) {
      return null
    }
    let content = '[加密消息，等待密钥同步]'
    let decryptPending = false
    try {
      content = await tauriInvoke<string>('decrypt_channel_incoming', {
        channelId,
        ciphertextHex: item.contentHex,
        msgType: item.msgType,
      })
    } catch (error) {
      decryptPending = true
      channelHistoryLog('decrypt content failed', {
        uid,
        channelId,
        msgId: item.msgId,
        msgType: item.msgType,
        cipherLen: item.contentHex.length,
        err: String(error),
      }, 'warn')
    }

    const fileKey = await resolveChannelAttachmentFileKey(channelId, item.attachmentKey)
    const extra = {
      channelId,
      version: item.version,
      contentMd5: item.contentMd5,
      readTotal: item.readTotal,
      decryptPending,
      cipherHex: item.contentHex,
      attachmentKey: item.attachmentKey,
      fileKey,
    }
    return {
      id: item.msgId,
      customMsgId: null,
      conversationId,
      senderId: item.sendUid,
      msgType: item.msgType,
      content,
      sendTime: item.msgTime || Date.now(),
      status: 1,
      readStatus: 0,
      version: item.version,
      isDeleted: false,
      extra: stringifyExtra(extra),
    }
  }

  async function syncChannelRecentHistory(uid: string, conversationId: string, loadedMessages: Message[]) {
    const channelId = getChannelIdFromConversationId(conversationId)
    if (!isTauri() || !uid || !channelId) {
      channelHistoryLog('sync skipped: invalid runtime or params', {
        isTauri: isTauri(),
        hasUid: Boolean(uid),
        uid,
        conversationId,
        channelId,
        loadedCount: loadedMessages.length,
      }, 'warn')
      return
    }

    try {
      channelHistoryLog('sync start', {
        uid,
        conversationId,
        channelId,
        loadedCount: loadedMessages.length,
        loadedIds: loadedMessages.slice(-10).map((message) => message.id),
        loadedTypes: loadedMessages.slice(-10).map((message) => message.msgType),
      })
      const latestResp = await getChannelLastMsgInfo({
        bizType: 2,
        bizId: channelId,
      })
      const latestMsgId = getLatestChannelMsgId(latestResp)
      channelHistoryLog('latest check', {
        uid,
        conversationId,
        channelId,
        latestMsgId,
        loadedCount: loadedMessages.length,
        loadedTailIds: loadedMessages.slice(-5).map((message) => message.id),
        rawRows: (latestResp as any)?.data || [],
      })
      if (!latestMsgId) {
        channelHistoryLog('skip: empty latest msg id', {
          uid,
          conversationId,
          channelId,
          latestResp,
        }, 'warn')
        return
      }

      const recentMessages = loadedMessages.slice(-10)
      const hasLastOne = hasVisibleChannelMessageId(recentMessages, latestMsgId)
      const hasLastTwo = latestMsgId <= 1 || hasVisibleChannelMessageId(recentMessages, latestMsgId - 1)
      if (hasLastOne && hasLastTwo) {
        channelHistoryLog('skip: local already latest', {
          uid,
          conversationId,
          channelId,
          latestMsgId,
          recentIds: recentMessages.map((message) => message.id),
          expectedPrevId: latestMsgId - 1,
        })
        return
      }

      // 对齐旧 im：本地不是频道最新时只补最近 30 条，避免长时间离线后一次性拉全量历史。
      await ensureChannelRelKey(uid, channelId).catch((error) => {
        channelHistoryLog('ensure channel rel key failed before history decrypt', {
          uid,
          channelId,
          err: String(error),
        }, 'warn')
      })
      const historyParams = {
        bizType: 2,
        bizId: channelId,
        msgType: 0,
        latestSize: latestMsgId > CHANNEL_HISTORY_LATEST_SIZE ? CHANNEL_HISTORY_LATEST_SIZE : latestMsgId,
        latestMsgId: latestMsgId + 1,
      }
      channelHistoryLog('request history start', {
        uid,
        conversationId,
        channelId,
        latestMsgId,
        hasLastOne,
        hasLastTwo,
        historyParams,
      })
      const historyItems = await fetchChannelRecentHistoryItems(historyParams)
      channelHistoryLog('request history done', {
        uid,
        conversationId,
        channelId,
        count: historyItems.length,
        msgTypeCounts: countByNumber(historyItems.map((item) => item.msgType)),
        samples: historyItems.slice(0, 5).map((item) => ({
          msgId: item.msgId,
          msgType: item.msgType,
          sendUid: item.sendUid,
          msgTime: item.msgTime,
          contentHexLen: item.contentHex.length,
          attachmentKeyLen: item.attachmentKey.length,
        })),
        mediasCaptionSamples: historyItems
          .filter((item) => Number(item.msgType) === 17)
          .slice(0, 5)
          .map((item) => ({
            msgId: item.msgId,
            msgTime: item.msgTime,
            contentHexLen: item.contentHex.length,
            attachmentKeyLen: item.attachmentKey.length,
          })),
      })
      if (historyItems.length === 0) {
        channelHistoryLog('skip: history api returned empty', {
          uid,
          conversationId,
          channelId,
          historyParams,
        }, 'warn')
        return
      }

      const normalized = (await Promise.all(
        historyItems.map((item) => normalizeChannelHistoryMessage(uid, conversationId, channelId, item)),
      ))
        .filter((item): item is Message => !!item)
        .sort((a, b) => a.sendTime - b.sendTime)
      channelHistoryLog('normalized messages', {
        uid,
        conversationId,
        channelId,
        count: normalized.length,
        msgTypeCounts: countByNumber(normalized.map((message) => message.msgType)),
        samples: normalized.slice(0, 5).map((message) => {
          const extra = parseExtraObject(message.extra)
          return {
            id: message.id,
            msgType: message.msgType,
            contentHead: String(message.content || '').slice(0, 120),
            fileKeyLen: String(extra?.fileKey || '').length,
            attachmentKeyLen: String(extra?.attachmentKey || '').length,
            decryptPending: Boolean(extra?.decryptPending),
          }
        }),
        mediasCaptionSamples: normalized
          .filter((message) => Number(message.msgType) === 17)
          .slice(0, 5)
          .map((message) => {
            const extra = parseExtraObject(message.extra)
            const content = String(message.content || '')
            return {
              id: message.id,
              contentLen: content.length,
              contentHead: content.slice(0, 180),
              fileKeyLen: String(extra?.fileKey || '').length,
              attachmentKeyLen: String(extra?.attachmentKey || '').length,
              decryptPending: Boolean(extra?.decryptPending),
            }
          }),
      })
      if (normalized.length === 0) {
        channelHistoryLog('skip: normalized history empty', {
          uid,
          conversationId,
          channelId,
          historyCount: historyItems.length,
        }, 'warn')
        return
      }

      batchAppendMessages(normalized, { preserveConversationOrder: true })
      channelHistoryLog('append normalized messages', {
        uid,
        conversationId,
        channelId,
        count: normalized.length,
        ids: normalized.map((message) => message.id),
        currentCountAfterAppend: getMessages(conversationId).length,
      })
      await tauriInvoke('upsert_incoming_messages', {
        uid,
        messages: normalized.map((message) => ({
          id: message.id,
          customMsgId: message.customMsgId,
          conversationId: message.conversationId,
          senderId: message.senderId,
          msgType: message.msgType,
          content: message.content,
          sendTime: message.sendTime,
          status: message.status,
          readStatus: message.readStatus,
          version: message.version,
          isDeleted: message.isDeleted,
          extra: parseExtraObject(message.extra),
        })),
      }).catch((error) => {
        channelHistoryLog('persist fetched messages failed', {
          uid,
          channelId,
          count: normalized.length,
          err: String(error),
        }, 'warn')
      })
    } catch (error) {
      channelHistoryLog('sync recent history failed', {
        uid,
        conversationId,
        channelId,
        err: String(error),
      }, 'warn')
    }
  }

  async function loadMessages(uid: string, conversationId: string, force = false) {
    const channelIdForHistory = getChannelIdFromConversationId(conversationId)
    if (channelIdForHistory) {
      channelHistoryLog('loadMessages enter', {
        uid,
        conversationId,
        channelId: channelIdForHistory,
        force,
        isTauri: isTauri(),
        isLoading: isLoading(conversationId),
        currentCount: getMessages(conversationId).length,
        currentTailIds: getMessages(conversationId).slice(-10).map((message) => message.id),
      })
    }
    if (!isTauri()) {
      if (channelIdForHistory) {
        channelHistoryLog('loadMessages skipped: not tauri runtime', {
          uid,
          conversationId,
          channelId: channelIdForHistory,
        }, 'warn')
      }
      return
    }
    if (isLoading(conversationId) && !force) {
      if (channelIdForHistory) {
        channelHistoryLog('loadMessages skipped: already loading', {
          uid,
          conversationId,
          channelId: channelIdForHistory,
          force,
        }, 'warn')
      }
      return
    }

    const existingBeforeLoad = getMessages(conversationId)
    if (!force && existingBeforeLoad.length > 0) {
      if (channelIdForHistory) {
        channelHistoryLog('loadMessages skipped: use memory cache', {
          uid,
          conversationId,
          channelId: channelIdForHistory,
          cachedCount: existingBeforeLoad.length,
        })
        void syncChannelRecentHistory(uid, conversationId, existingBeforeLoad)
      }
      return
    }

    const loadStartedAt = Date.now()
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
    // 底层命令偶发卡住时，兜底清理 loading 状态，避免界面长期停在“加载中...”。
    const loadingWatchdog = setTimeout(() => {
      if (isLoading(conversationId)) {
        console.warn('[msg] loadMessages watchdog reset loading', { conversationId })
        loadingMap.value.set(conversationId, false)
      }
    }, 12000)
    try {
      const result = await tauriInvoke<any[]>('get_messages', {
        uid,
        conversationId,
        limit: PAGE_SIZE,
      })
      const normalizedBase = Array.isArray(result) ? result.map((item) => normalizeMessage(item)) : []
      const applyLoadedSnapshot = (snapshot: Message[]) => {
        const filteredResult = filterMessagesHiddenByLogoutClear(uid, snapshot)
        const latestExisting = getMessages(conversationId)
        const mergedResult = mergeLoadedMessagesWithLocal(
          conversationId,
          filteredResult.messages,
          latestExisting,
          loadStartedAt,
        )
        messageMap.value.set(conversationId, sortMessagesChronologically(mergedResult.messages))
        if (conversationId.startsWith('1_')) {
          const groupId = conversationId.slice(2)
          if (groupId && groupId !== GROUP_NOTIFICATION_TARGET_ID) {
            ingestGroupSenderProfilesFromMessages(groupId, mergedResult.messages)
          }
        }
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
          !filteredResult.hitLogoutClearBoundary && snapshot.length >= PAGE_SIZE,
        )
      }

      // 先渲染首屏，避免被解密耗时阻塞；解密成功后再静默回填真实文案/附件信息。
      applyLoadedSnapshot(normalizedBase)
      // 频道会话对齐旧 im：进入聊天窗口后校验服务端最新消息，必要时补最近 30 条离线漏消息。
      if (getChannelIdFromConversationId(conversationId)) {
        channelHistoryLog('loadMessages local snapshot applied', {
          uid,
          conversationId,
          channelId: channelIdForHistory,
          rawCount: Array.isArray(result) ? result.length : 0,
          normalizedCount: normalizedBase.length,
          currentCount: getMessages(conversationId).length,
          currentTailIds: getMessages(conversationId).slice(-10).map((message) => message.id),
        })
        await syncChannelRecentHistory(uid, conversationId, getMessages(conversationId))
      }
      const hasDecryptPending = normalizedBase.some((message) => {
        const extra = parseExtraObject(message.extra)
        return Boolean(extra?.decryptPending)
      })
      if (hasDecryptPending) {
        const retryPendingMessages = getChannelIdFromConversationId(conversationId)
          ? retryDecryptPendingChannelMessages(uid, normalizedBase)
          : retryDecryptPendingPrivateMessages(uid, normalizedBase)
        void retryPendingMessages
          .then((resolved) => {
            patchDecryptedMessagesInPlace(conversationId, resolved)
          })
          .catch((error) => {
            console.warn('[msg] async decrypt on loadMessages failed', {
              conversationId,
              err: String(error),
            })
          })
      }
    } finally {
      clearTimeout(loadingWatchdog)
      loadingMap.value.set(conversationId, false)
    }
  }

  async function loadOlderMessages(
    uid: string,
    conversationId: string,
    options?: { silent?: boolean },
  ) {
    if (!isTauri()) return
    if (isLoading(conversationId) || !hasMore(conversationId)) return
    const silent = options?.silent === true

    const existing = getMessages(conversationId)
    const beforeTime = existing.length > 0 ? existing[0].sendTime : undefined

    // 后台补齐未读分隔线时使用静默分页，不展示顶部“加载中...”并避免打断当前阅读位置。
    let loadingWatchdog: ReturnType<typeof setTimeout> | null = null
    if (!silent) {
      loadingMap.value.set(conversationId, true)
      // 与首屏加载同样兜底，避免历史分页请求挂起时 loading 长时间不消失。
      loadingWatchdog = setTimeout(() => {
        if (isLoading(conversationId)) {
          console.warn('[msg] loadOlderMessages watchdog reset loading', { conversationId })
          loadingMap.value.set(conversationId, false)
        }
      }, 12000)
    }
    try {
      const result = await tauriInvoke<any[]>('get_messages', {
        uid,
        conversationId,
        beforeTime,
        limit: PAGE_SIZE,
      })
      const normalizedBase = Array.isArray(result) ? result.map((item) => normalizeMessage(item)) : []
      const applyOlderSnapshot = (snapshot: Message[]) => {
        const filteredResult = filterMessagesHiddenByLogoutClear(uid, snapshot)
        if (filteredResult.messages.length > 0) {
          const latestExisting = getMessages(conversationId)
          // 旧消息分页可能触发“原始列表 + 解密回填”两次合并，这里线性去重避免重复气泡和 O(n²) 开销。
          const merged = sortMessagesChronologically(
            mergeUniqueMessagesInOrder([...filteredResult.messages, ...latestExisting]),
          )
          if (merged.length > MAX_CACHED_MESSAGES) {
            merged.splice(0, merged.length - MAX_CACHED_MESSAGES)
          }
          messageMap.value.set(conversationId, merged)
          if (conversationId.startsWith('1_')) {
            const groupId = conversationId.slice(2)
            if (groupId && groupId !== GROUP_NOTIFICATION_TARGET_ID) {
              ingestGroupSenderProfilesFromMessages(groupId, filteredResult.messages)
            }
          }
        }
        hasMoreMap.value.set(
          conversationId,
          !filteredResult.hitLogoutClearBoundary && snapshot.length >= PAGE_SIZE,
        )
      }

      // 分页先回显，保证历史区加载不被解密阻塞；解密回填放后台执行。
      applyOlderSnapshot(normalizedBase)
      const hasDecryptPending = normalizedBase.some((message) => {
        const extra = parseExtraObject(message.extra)
        return Boolean(extra?.decryptPending)
      })
      if (hasDecryptPending) {
        const retryPendingMessages = getChannelIdFromConversationId(conversationId)
          ? retryDecryptPendingChannelMessages(uid, normalizedBase)
          : retryDecryptPendingPrivateMessages(uid, normalizedBase)
        void retryPendingMessages
          .then((resolved) => {
            patchDecryptedMessagesInPlace(conversationId, resolved)
          })
          .catch((error) => {
            console.warn('[msg] async decrypt on loadOlderMessages failed', {
              conversationId,
              err: String(error),
              silent,
            })
          })
      }
    } finally {
      if (loadingWatchdog) clearTimeout(loadingWatchdog)
      if (!silent) loadingMap.value.set(conversationId, false)
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
    const [typeRaw, targetId = ''] = conversationId.split('_')
    const convType = Number(typeRaw || 0)
    const isFileHelperSend = convType === 0 && isFileHelperTargetId(targetId)
    let sendExtra = sanitizeSendExtra(extra)

    if (msgType === 0) {
      const originalContent = content
      content = filterSensitiveWords(content)
      if ((convType === 0 || convType === 1) && shouldFakeSendMessage(originalContent)) {
        // 对齐旧 im：假发送词本机仍显示发送气泡，但发送协议要带 isHide 让服务端按隐藏消息处理。
        sendExtra = { ...(sendExtra ?? {}), isHide: true }
      }
    }

    const quoteMsg = (sendExtra?.quoteMessage as QuoteMessageInfo) ?? null
    const extraJson = sendExtra && Object.keys(sendExtra).length > 0 ? JSON.stringify(sendExtra) : null
    const { snapchatTime, deleteSeconds } = extractReadBurnMeta(sendExtra)

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
      scheduleSelfGroupReadBurnDeletion(localMsg, now)
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

    // 文件发送在上传前已插入本地占位；复用同一条消息，避免正式发送阶段重新追加导致状态/回执看起来卡住。
    const canReuseClientPlaceholder = isReusableLocalImagePlaceholder(conversationId, msgType) || Number(msgType) === 7 || Number(msgType) === 17
    const existingClientPlaceholder = clientMsgId && canReuseClientPlaceholder && !isFileHelperSend
      ? getMessages(conversationId).find((m) => m.id === clientMsgId || m.customMsgId === clientMsgId)
      : undefined
    const shouldKeepSingleImagePreview = Boolean(existingClientPlaceholder)
    const optimisticId = clientMsgId || String(Date.now())
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

    // 乐观追加：先插一条 status=0（发送中）的本地消息，立即反馈到 UI。
    // 单聊图片在上传前已插入本地占位，这里保留占位，等 send_message 成功后再替换为远端消息，
    // 避免发送中提前下载/解密远端图片并短暂显示“图片加载失败”。
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
      const placeholder = existingClientPlaceholder as Message
      // 复用本地图片/文件占位时不会 append optimistic；这里仍要按旧 im 立即启动阅后即焚倒计时。
      scheduleSelfGroupReadBurnDeletion({
        ...optimistic,
        id: placeholder.id || optimistic.id,
        customMsgId: placeholder.customMsgId || optimistic.customMsgId,
        sendTime: placeholder.sendTime || optimisticSendTime,
      }, optimisticSendTime)
      syncConversationSummary(conversationId, existingClientPlaceholder as Message)
    } else {
      appendMessage(conversationId, optimistic)
      scheduleSelfGroupReadBurnDeletion(optimistic, optimisticSendTime)
      syncConversationSummary(conversationId, optimistic)
    }
    logSendStep('optimistic message visible', {
      listSizeAfterAppend: getMessages(conversationId).length,
      msFromEntry: Math.round(performance.now() - sendStartedAt),
      reusedClientPlaceholder: shouldKeepSingleImagePreview,
    })
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

    logSendStep('sendMessage entry', {
      usesWsSend: messageUsesWsSend(convType, msgType),
      contentLen: String(content || '').length,
      contentHead: isGroupImageMessage(conversationId, msgType)
        ? imageContentSummary(content).contentHead
        : shortLogText(content, 160),
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
    } else if (
      convType === 0
      && targetId
      && !isOfficialAccountTargetId(targetId)
      && msgType !== 12
      && msgType !== 18
    ) {
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
      // Rust 返回只表示消息已落本地并压入 WS 队列；成功状态统一等 msg:sent 回执更新，避免重复合并 sending 气泡。
      logSendStep('sendMessage queued by Rust', {
        totalMs: Math.round(performance.now() - sendStartedAt),
        normalizedId: normalized.id,
        normalizedCustomMsgId: normalized.customMsgId,
        status: normalized.status,
      })
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
          // 重试返回同样只是重新入队，界面仍等待服务端回执来更新真实 msgId/状态。
          logSendStep('sendMessage retry after group key queued by Rust', {
            totalMs: Math.round(performance.now() - sendStartedAt),
            normalizedId: normalized.id,
            status: normalized.status,
          })
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
          // 重连后的发送返回不再重复 append，避免发送中状态被本地返回值覆盖回去。
          logSendStep('sendMessage retry after ws queued by Rust', {
            totalMs: Math.round(performance.now() - sendStartedAt),
            normalizedId: normalized.id,
            status: normalized.status,
          })
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
      logSendStep('sendMessage failed final', {
        totalMs: Math.round(performance.now() - sendStartedAt),
        error: errText,
      }, 'error')
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

  function findOutgoingSendingPlaceholderIndex(
    conversationId: string,
    message: Message,
    list: Message[],
    currentUid: string,
  ): number {
    if (!currentUid || String(message.senderId || '') !== currentUid) return -1
    if (!/^(0|1|2)_/.test(String(conversationId || ''))) return -1

    const incomingId = String(message.id || '').trim()
    const incomingContent = String(message.content ?? '').trim()
    const incomingStatus = Number(message.status ?? 0)
    if (!incomingId) return -1
    // 仍是本地 flag 占位时不在这里处理，避免把发送中气泡误判成服务端副本。
    if (incomingStatus === 0 && incomingId === String(message.customMsgId || message.id || '')) return -1

    return list.findIndex((item) => {
      if (Number(item.status) !== 0) return false
      if (String(item.senderId || '') !== currentUid) return false
      if (Number(item.msgType) !== Number(message.msgType)) return false

      const placeholderId = String(item.id || item.customMsgId || '').trim()
      if (!placeholderId || placeholderId === incomingId) return false

      const placeholderContent = String(item.content ?? '').trim()
      if (incomingContent && placeholderContent && incomingContent === placeholderContent) return true

      // 频道多图本地预览与服务端正文格式不同，但同批发送中的占位通常只有一条。
      if (Number(message.msgType) === 17) {
        const localCaption = placeholderContent.split('##caption##')[1] || ''
        const remoteCaption = incomingContent.split('##caption##')[1] || ''
        if (localCaption && remoteCaption && localCaption === remoteCaption) return true
      }

      // 图片/文件占位与服务端回显正文格式不同；按 __clientMsgId / fileKey 合并。
      if (Number(message.msgType) === 1 || Number(message.msgType) === 9 || Number(message.msgType) === 7) {
        const incomingExtra = parseMessageExtraFields(message.extra)
        const placeholderExtra = parseMessageExtraFields(item.extra)
        const incomingClientId = String(incomingExtra.__clientMsgId || message.customMsgId || '')
        const placeholderClientId = String(placeholderExtra.__clientMsgId || item.customMsgId || item.id || '')
        if (incomingClientId && placeholderClientId && incomingClientId === placeholderClientId) return true
        const incomingKey = readMessageFileKey(message, incomingContent)
        const placeholderKey = readMessageFileKey(item, placeholderContent)
        if (incomingKey && placeholderKey && incomingKey === placeholderKey) return true
      }
      return false
    })
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
      const mergedSingleImageContent = isReusableLocalImagePlaceholder(conversationId, message.msgType)
        ? mergeImageLocalPreviewContent(message.content, previous.content)
        : null
      const mergedFileContent = Number(message.msgType) === 7
        ? mergeFileMessageContent(message.content, previous.content)
        : null
      let nextContent = message.content
      if (mergedSingleImageContent) {
        nextContent = mergedSingleImageContent
      } else if (mergedFileContent) {
        nextContent = mergedFileContent
      } else if (
        (previous.msgType === 12 || message.msgType === 12)
        && incomingDiceResult <= 0
        && previousDiceResult > 0
      ) {
        nextContent = previous.content
      } else if (!incomingHasContent && (previous.msgType === 18 || message.msgType === 18) && previous.content) {
        nextContent = previous.content
      }
      next[existIndex] = {
        ...previous,
        ...message,
        content: nextContent,
        extra: message.extra ?? previous.extra,
        quoteMessage: message.quoteMessage ?? previous.quoteMessage,
        snapchatTime: message.snapchatTime ?? previous.snapchatTime,
        deleteSeconds: message.deleteSeconds ?? previous.deleteSeconds,
      }
    } else {
      const placeholderIdx = findOutgoingSendingPlaceholderIndex(
        conversationId,
        message,
        next,
        getCurrentUidForUnread(),
      )
      if (placeholderIdx >= 0) {
        const placeholder = next[placeholderIdx]
        const mergedSingleImageContent = isReusableLocalImagePlaceholder(conversationId, message.msgType)
          ? mergeImageLocalPreviewContent(message.content, placeholder.content)
          : null
        const mergedFileContent = Number(message.msgType) === 7
          ? mergeFileMessageContent(message.content, placeholder.content)
          : null
        const incomingContent = String(message.content ?? '').trim()
        next[placeholderIdx] = {
          ...placeholder,
          ...message,
          id: String(message.id || placeholder.id),
          customMsgId: placeholder.customMsgId || placeholder.id,
          content: mergedSingleImageContent
            || mergedFileContent
            || (incomingContent && !isDecryptPendingCipherHint(incomingContent) ? message.content : placeholder.content),
          extra: message.extra ?? placeholder.extra,
          quoteMessage: message.quoteMessage ?? placeholder.quoteMessage,
          snapchatTime: message.snapchatTime ?? placeholder.snapchatTime,
          deleteSeconds: message.deleteSeconds ?? placeholder.deleteSeconds,
          status: Math.max(Number(placeholder.status || 0), Number(message.status || 0), 1),
          readStatus: Math.max(Number(placeholder.readStatus || 0), Number(message.readStatus || 0)),
        }
        if (isReusableLocalImagePlaceholder(conversationId, message.msgType)) {
          const pruned = removeStaleOutgoingFilePlaceholdersForImage(
            next,
            next[placeholderIdx],
            getCurrentUidForUnread(),
            placeholderIdx,
          )
          next.splice(0, next.length, ...pruned)
        }
      } else {
        next.push(message)
      }
    }
    if (next.length > MAX_CACHED_MESSAGES) {
      next.splice(0, next.length - MAX_CACHED_MESSAGES)
    }
    messageMap.value.set(conversationId, next)
  }

  function batchAppendMessages(
    messages: Message[],
    options: { preserveConversationOrder?: boolean; fillGroupReadBurnFromCurrentGroup?: boolean } = {},
  ) {
    const grouped = new Map<string, Message[]>()
    for (const raw of messages as any[]) {
      const msg = normalizeMessage(raw, {
        // 只允许实时消息按当前群配置补阅后即焚；历史加载不传该选项，避免旧消息误显示火焰。
        fillGroupReadBurnFromCurrentGroup: options.fillGroupReadBurnFromCurrentGroup === true,
      })
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
          rawExtra: extraSummary((raw as any)?.extra),
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

    const currentUid = getCurrentUidForUnread()
    const currentConversationId = String(chatStore.currentConversationId || '')
    for (const [convId, msgs] of grouped) {
      let incomingUnreadDelta = 0
      for (const msg of msgs) {
        const listBefore = messageMap.value.get(convId) ?? []
        const existedBefore = listBefore.some((item) =>
          item.id === msg.id || (item.customMsgId && item.customMsgId === msg.customMsgId),
        )
        appendMessage(convId, msg)
        if (!existedBefore && isIncomingUnreadMessage(convId, msg, currentUid, currentConversationId)) {
          incomingUnreadDelta += 1
        }
      }
      if (options.preserveConversationOrder) {
        // 频道进入会话时补最近历史只修正摘要，不改变 updatedAt，避免点击后左侧列表重排跳动。
        refreshConversationSummary(convId, getMessages(convId), { preserveListOrder: true })
        continue
      }
      const latest = [...msgs].reverse().find((item) => shouldUseMessageForConversationSummary(convId, item))
      if (latest) {
        syncConversationSummary(convId, latest, { incomingUnreadDelta })
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
    // 服务端副本可能先到；发送成功回执合并时保留远端协议字段，
    // 同时带回本地预览字段，避免已发送图片在窗口恢复后重新下载。
    const remoteOrCurrentContent = duplicateContent && duplicateContent.length > 0 ? duplicateContent : current.content
    const mergedReceiptImageContent = isReusableLocalImagePlaceholder(params.conversationId, current.msgType)
      ? mergeImageLocalPreviewContent(remoteOrCurrentContent, current.content)
      : null
    const mergedReceiptFileContent = Number(current.msgType) === 7
      ? mergeFileMessageContent(remoteOrCurrentContent, current.content)
      : null
    const nextContent = mergedReceiptImageContent
      ? mergedReceiptImageContent
      : mergedReceiptFileContent
      ? mergedReceiptFileContent
      : current.msgType === 12
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
      : remoteOrCurrentContent
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
    scheduleSelfGroupReadBurnDeletion(msg, current.sendTime || msg.sendTime || Date.now())
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

  function pruneOutgoingMisclassifiedFilePlaceholders(
    conversationId: string,
    options: { fileName?: string; fileKey?: string; senderId?: string },
  ) {
    const list = messageMap.value.get(conversationId)
    if (!list?.length) return

    const uid = String(options.senderId || getCurrentUidForUnread() || '')
    const targetName = String(options.fileName || '').trim()
    const targetKey = String(options.fileKey || '').trim()
    if (!targetName && !targetKey) return

    const next = list.filter((item) => {
      if (!isOutgoingUploadPendingFilePlaceholder(item, uid)) return true
      const parsed = parseFileContentObject(item.content)
      const itemName = String(parsed?.name || parsed?.fileName || '').trim()
      const itemKey = readMessageFileKey(item)
      if (targetKey && itemKey && itemKey === targetKey) return false
      if (targetName && itemName && itemName === targetName) return false
      return true
    })
    if (next.length !== list.length) {
      messageMap.value.set(conversationId, next)
    }
  }

  function removeStaleOutgoingFilePlaceholdersForImage(
    list: Message[],
    anchor: Message,
    currentUid: string,
    keepIndex: number,
  ): Message[] {
    const fileKey = readMessageFileKey(anchor)
    const parsed = parseImageContentObject(anchor.content)
    const fileName = String(parsed?.name || parsed?.fileName || '').trim()
    if (!fileKey && !fileName) return list

    return list.filter((item, index) => {
      if (index === keepIndex) return true
      if (!isOutgoingUploadPendingFilePlaceholder(item, currentUid)) return true
      const itemKey = readMessageFileKey(item)
      if (fileKey && itemKey && itemKey === fileKey) return false
      const itemParsed = parseFileContentObject(item.content)
      const itemName = String(itemParsed?.name || itemParsed?.fileName || '').trim()
      if (fileName && itemName && itemName === fileName) return false
      return true
    })
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
    pruneOutgoingMisclassifiedFilePlaceholders,
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
