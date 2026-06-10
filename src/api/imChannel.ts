/**
 * Channel API compatible with legacy IM implementation.
 * Request body: AES-128-ECB encrypted JSON with binary packet header.
 * Response body: AES-128-ECB encrypted JSON with binary packet header.
 */
import { aesEncrypt, aesDecrypt } from '@/utils/crypto'
import { API_CONFIG, getOpenChatBaseUrl } from './config'
import { getOpenChatSignedApiHeaders, getSessionIdFromStorage } from './request'
import { getRuntimePlatform } from '@/utils/runtimePlatform'
import { getOrderedDomainUrls, markDomainError } from '@/utils/domainPool'
import { ungzip } from 'pako'

let cachedPackagedDesktopProxyRuntime: boolean | null = null

async function isTauriPackagedDesktopProxyRuntime(): Promise<boolean> {
  if (cachedPackagedDesktopProxyRuntime !== null) return cachedPackagedDesktopProxyRuntime
  if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
    cachedPackagedDesktopProxyRuntime = false
    return cachedPackagedDesktopProxyRuntime
  }
  if (!import.meta.env.PROD) {
    cachedPackagedDesktopProxyRuntime = false
    return cachedPackagedDesktopProxyRuntime
  }
  // 复用项目统一的平台判定，Windows/macOS 打包端都走 Tauri 代理，避免 WebView 对二进制频道协议的差异。
  const platform = await getRuntimePlatform()
  cachedPackagedDesktopProxyRuntime = platform === 'macos' || platform === 'windows'
  return cachedPackagedDesktopProxyRuntime
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(String(base64 || ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function getUint32Bytes(num: number): Uint8Array {
  const buf = new ArrayBuffer(4)
  const view = new DataView(buf)
  view.setUint32(0, num)
  return new Uint8Array(buf)
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

function encodePacketWithAesJson(data: unknown, aesKey: string): Uint8Array {
  const json = JSON.stringify(data)
  const plain = new TextEncoder().encode(json)
  const encrypted = aesEncrypt(aesKey, plain)
  const header = Uint8Array.from([0xC1, 0x80])
  const length = getUint32Bytes(encrypted.length)
  return concatUint8Arrays(header, length, encrypted)
}

function tryParsePlainJsonResponse(bytes: Uint8Array): { ok: true; value: any } | { ok: false } {
  try {
    const text = new TextDecoder().decode(bytes).trim()
    if (!text || (text[0] !== '{' && text[0] !== '[')) return { ok: false }
    return { ok: true, value: JSON.parse(quoteLargeIntegerIds(text)) }
  } catch {
    return { ok: false }
  }
}

function isLegacyAesJsonPacket(raw: Uint8Array): boolean {
  if (raw.length < 6) return false
  const head = raw[0]
  const flag = raw[1]
  return (head === 0xC0 || head === 0xC1) && (flag === 0x80 || flag === 0xC0)
}

function byteHead(bytes: Uint8Array, length = 8): string {
  return Array.from(bytes.slice(0, length))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join(' ')
}

function decodePacketWithAesJson(buffer: ArrayBuffer, aesKey: string): any {
  const raw = new Uint8Array(buffer)
  if (!isLegacyAesJsonPacket(raw)) {
    const plainJson = tryParsePlainJsonResponse(raw)
    if (plainJson.ok) return plainJson.value
    throw new Error(`channel api response is not legacy packet: bytes=${raw.byteLength}, head=${byteHead(raw)}`)
  }

  let encrypted = raw.slice(6)

  // 老 im 的频道接口响应有时会走 gzip 压缩，这里要和 requestAxios 的兼容行为保持一致。
  if (raw[1] === 0xC0) {
    try {
      encrypted = ungzip(encrypted)
    } catch (err) {
      console.warn('[ChannelAPI] gzip decode failed, fallback to raw payload:', err)
    }
  }

  try {
    const plain = aesDecrypt(encrypted, aesKey)
    const json = new TextDecoder().decode(plain)
    return JSON.parse(quoteLargeIntegerIds(json))
  } catch (error) {
    // 对齐旧 im requestAxios：频道网关偶发返回普通 JSON 错误体时，不继续按 AES 包解密。
    const fullPlainJson = tryParsePlainJsonResponse(raw)
    if (fullPlainJson.ok) return fullPlainJson.value
    const bodyPlainJson = tryParsePlainJsonResponse(raw.slice(6))
    if (bodyPlainJson.ok) return bodyPlainJson.value
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`channel api encrypted response decode failed: ${message}; bytes=${raw.byteLength}, head=${byteHead(raw)}`)
  }
}

function quoteLargeIntegerIds(json: string): string {
  return json.replace(/"([A-Za-z0-9_]*(?:id|Id|ID)[A-Za-z0-9_]*)"\s*:\s*(-?\d{16,})/g, '"$1":"$2"')
}

class ChannelHttpError extends Error {
  status: number
  url: string

  constructor(status: number, url: string, detail?: string) {
    super(`HTTP ${status}${detail ? `; ${detail}` : ''}`)
    this.name = 'ChannelHttpError'
    this.status = status
    this.url = url
  }
}

function normalizeHttpBaseUrl(value: string): string {
  try {
    const parsed = new URL(String(value || '').trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return ''
  }
}

function channelDiag(message: string, data?: Record<string, unknown>) {
  console.warn(`[ChannelAPI] ${message}`, data || {})
}

function getOpenChatBaseCandidates(): string[] {
  const candidates = [
    getOpenChatBaseUrl(),
    ...getOrderedDomainUrls('openchatChannel'),
    API_CONFIG.rawOpenChatDomain,
  ]
  const seen = new Set<string>()
  return candidates
    .map(normalizeHttpBaseUrl)
    .filter((base) => {
      if (!base || seen.has(base)) return false
      seen.add(base)
      return true
    })
}

function shouldRetryOpenChatError(error: unknown): boolean {
  // HTTP 401/487 以及主进程网络错误都可能是单个 openchatChannel 节点异常，继续尝试候选域名。
  return error instanceof ChannelHttpError || !(error instanceof Error && error.message.includes('decode failed'))
}

async function sendChannelRequest<T>(
  url: string,
  headers: Record<string, string>,
  packet: Uint8Array,
): Promise<T> {
  if (await isTauriPackagedDesktopProxyRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    const result = await invoke<{
      ok: boolean
      status: number
      bodyBase64: string
      error?: string
    }>('proxy_http_binary', {
      request: {
        url,
        method: 'POST',
        headers,
        bodyBase64: encodeBase64(packet),
      },
    })
    if (!result?.ok) {
      throw new ChannelHttpError(Number(result?.status || 0), url, result?.error || '')
    }
    const buf = decodeBase64ToArrayBuffer(result.bodyBase64 || '')
    if (buf.byteLength === 0) {
      throw new Error(`channel api response too short: ${buf.byteLength}`)
    }
    return decodePacketWithAesJson(buf, API_CONFIG.secretKey) as T
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: packet.buffer as ArrayBuffer,
  })
  if (!res.ok) {
    console.error('[ChannelAPI] http error', { status: res.status, url })
    throw new ChannelHttpError(res.status, url)
  }
  const buf = await res.arrayBuffer()
  if (buf.byteLength === 0) {
    throw new Error(`channel api response too short: ${buf.byteLength}`)
  }
  return decodePacketWithAesJson(buf, API_CONFIG.secretKey) as T
}

export interface ChannelListItem {
  channelId: number | string
  id?: number | string
  channelName?: string
  icon?: string
  alias?: string
  logoColor?: string
  memberCount?: number
  status?: number
  isDisable?: boolean
  adminPrivacy?: number
  isDisturb?: boolean | number
  channelDesc?: string
  remark?: string
  linkType?: number
  memberType?: number
  updateTime?: number
  createTime?: number
}

export interface ChannelListResp {
  code: number
  msg?: string
  data?: {
    rowList?: ChannelListItem[]
    total?: number
  }
}

export interface ChannelDetailResp {
  code: number
  msg?: string
  data?: ChannelListItem & {
    id?: number | string
    channelDesc?: string
    memberType?: number
  }
}

export interface ChannelUsersResp {
  code: number
  msg?: string
  data?: {
    rowList?: Array<{
      uid?: number | string
      id?: number | string
      nickName?: string
      nickname?: string
      name?: string
      icon?: string
      type?: number
      role?: number
      memberType?: number
      userInfoDTO?: {
        uid?: number | string
        id?: number | string
        nickName?: string
        nickname?: string
        name?: string
        icon?: string
      }
    }>
    total?: number
  }
}

export interface ChannelManageListResp {
  code: number
  msg?: string
  data?: {
    rowList?: Array<{
      uid?: number | string
      id?: number | string
      type?: number
      memberType?: number
      setterUid?: number | string
      setterName?: string
      setterNickName?: string
      setter?: string
      userInfoDTO?: {
        uid?: number | string
        id?: number | string
        nickName?: string
        nickname?: string
        name?: string
        icon?: string
        onLineStatus?: boolean | number | string
        online?: boolean | number | string
        createTime?: number | string
        lastTime?: number | string
      }
    }>
    total?: number
    adminNumMax?: number
  }
}

export interface ChannelUpdateMemberResp {
  code: number
  msg?: string
  errCode?: number
  errMsg?: string
  data?: unknown
}

export interface ChannelEventReqItem {
  id?: number | string
  jumpPage?: boolean
  channelName?: string
  channelId?: number | string
  uid?: number | string
  icon?: string
  logoColor?: string
  noticeMsg?: string
  createTime?: number | string
  updateTime?: number | string
  reqStatus?: number
  reqType?: number
}

export interface ChannelEventListResp {
  code: number
  msg?: string
  data?: {
    rowList?: ChannelEventReqItem[]
    total?: number
  }
}

export interface ChannelLinkResp {
  code: number
  msg?: string
  data?: ChannelListItem & {
    link?: string
    channelId?: number | string
    channelName?: string
    memberType?: number
    linkType?: number
  } | null
}

export interface HistoryDomainItem {
  type?: number | string
  currentDomain?: string
  historyDomainList?: string[]
}

export interface HistoryDomainResp {
  code: number
  msg?: string
  data?: HistoryDomainItem[]
}

export interface SearchAliasContentResp {
  code: number
  msg?: string
  data?: {
    searchType?: number | string
    groupAlias?: unknown
    userDetail?: unknown
    channelInfo?: ChannelListItem & {
      link?: string
      channelId?: number | string
      channelName?: string
      memberType?: number
      linkType?: number
    } | null
  } | null
}

async function requestChannelJson<T>(path: string, data: Record<string, unknown>): Promise<T> {
  const headers = {
    'Content-Type': 'application/octet-stream',
    Accept: 'application/json',
    ...getOpenChatSignedApiHeaders(),
  }

  // 频道接口不是 protobuf，而是“固定头 + AES(JSON)”这一条老协议，不能复用通用 requestProto。
  const packet = encodePacketWithAesJson(data, API_CONFIG.secretKey)
  const bases = getOpenChatBaseCandidates()
  let lastError: unknown = null
  channelDiag('request start', {
    path,
    candidateCount: bases.length,
    firstBase: bases[0] || '',
    appVer: API_CONFIG.openChatAppVer ?? API_CONFIG.appVer,
    packageCode: API_CONFIG.openChatPackageCode,
    hasSessionId: !!getSessionIdFromStorage(),
  })

  for (const [index, base] of bases.entries()) {
    const url = `${base}${path}`
    const startedAt = Date.now()
    channelDiag('candidate try', {
      path,
      base,
      index,
      candidateCount: bases.length,
    })
    try {
      const result = await sendChannelRequest<T>(url, headers, packet)
      channelDiag('candidate success', {
        path,
        base,
        index,
        elapsedMs: Date.now() - startedAt,
      })
      return result
    } catch (error) {
      lastError = error
      if (normalizeHttpBaseUrl(base)) {
        void markDomainError('openchatChannel', base)
      }
      channelDiag('candidate failed', {
        path,
        base,
        index,
        elapsedMs: Date.now() - startedAt,
        status: error instanceof ChannelHttpError ? error.status : 0,
        message: error instanceof Error ? error.message : String(error),
        willRetry: shouldRetryOpenChatError(error) && index < bases.length - 1,
      })
      if (!shouldRetryOpenChatError(error)) {
        throw error
      }
    }
  }

  channelDiag('request exhausted', {
    path,
    candidateCount: bases.length,
    message: lastError instanceof Error ? lastError.message : String(lastError || ''),
  })
  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'channel api request failed'))
}

export async function getChannelList(data: {
  pageNum: number
  pageSize: number
}): Promise<ChannelListResp> {
  return requestChannelJson<ChannelListResp>('/channel/channelList', data)
}

export async function getChannelDetail(data: {
  channelId: number | string
}): Promise<ChannelDetailResp> {
  return requestChannelJson<ChannelDetailResp>('/channel/getChannelById', data)
}

export async function getChannelUsers(data: {
  channelId: number | string
  pageNum: number
  pageSize: number
}): Promise<ChannelUsersResp> {
  return requestChannelJson<ChannelUsersResp>('/channel/channelMember/pageChannelNormalMember', data)
}

export async function getChannelManages(data: {
  channelId: number | string
  pageNum: number
  pageSize: number
}): Promise<ChannelManageListResp> {
  return requestChannelJson<ChannelManageListResp>('/channel/channelAdminRight/pageAdmin', data)
}

export async function updateMember(data: {
  channelId: number | string
  isDisturb: boolean | number
}): Promise<ChannelUpdateMemberResp> {
  return requestChannelJson<ChannelUpdateMemberResp>('/channel/channelMember/updateMember', data)
}

export async function deleteChannelManage(data: {
  channelId: number | string
  uid: number | string
}): Promise<ChannelUpdateMemberResp> {
  return requestChannelJson<ChannelUpdateMemberResp>('/channel/channelAdminRight/delete', data)
}

export async function updateChannel(data: {
  channelId: number | string
  remark?: string
}): Promise<ChannelUpdateMemberResp> {
  return requestChannelJson<ChannelUpdateMemberResp>('/channel/updateChannel', data)
}

export async function subscribeChannel(data: {
  channelId: number | string
  link?: string
}): Promise<ChannelUpdateMemberResp> {
  return requestChannelJson<ChannelUpdateMemberResp>('/channel/channelMember/subscribeChannel', data)
}

export async function getChannelEventList(data: {
  pageNum: number
  pageSize: number
}): Promise<ChannelEventListResp> {
  return requestChannelJson<ChannelEventListResp>('/channel/channelEventReq/listChannelEventReq', data)
}

export async function channelCheckJoin(data: {
  id: number | string
  flag: boolean
}): Promise<ChannelUpdateMemberResp> {
  return requestChannelJson<ChannelUpdateMemberResp>('/channel/channelEventReq/userCheckJoin', data)
}

export async function isChannelLink(data: {
  link: string
}): Promise<ChannelLinkResp> {
  return requestChannelJson<ChannelLinkResp>('/channel/getChannelByLink', data)
}

export async function getHistoryDomain(data: Record<string, unknown> = {}): Promise<HistoryDomainResp> {
  return requestChannelJson<HistoryDomainResp>('/sys/h5HistoryDomain/list', data)
}

export async function searchAliasContent(data: {
  fromUid: number | string
  content: string
}): Promise<SearchAliasContentResp> {
  return requestChannelJson<SearchAliasContentResp>('/user/search/content', data)
}
