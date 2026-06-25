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
import * as $protobuf from 'protobufjs/minimal'

let cachedDesktopProxyRuntime: boolean | null = null

async function isTauriDesktopProxyRuntime(): Promise<boolean> {
  if (cachedDesktopProxyRuntime !== null) return cachedDesktopProxyRuntime
  if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
    cachedDesktopProxyRuntime = false
    return cachedDesktopProxyRuntime
  }
  // Tauri 桌面端开发/打包都走主进程代理，避免 WebView fetch 被频道网关 CORS 或二进制协议差异拦截。
  const platform = await getRuntimePlatform()
  cachedDesktopProxyRuntime = platform === 'macos' || platform === 'windows'
  return cachedDesktopProxyRuntime
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

function encodePacketWithAesBytes(bytes: Uint8Array, aesKey: string): Uint8Array {
  const encrypted = aesEncrypt(aesKey, bytes)
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
    } catch {
      // gzip 失败时沿用旧 im 兼容策略，继续用原始 payload 解密。
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

function decodePacketWithAesBytes(buffer: ArrayBuffer, aesKey: string): Uint8Array {
  const raw = new Uint8Array(buffer)
  if (!isLegacyAesJsonPacket(raw)) {
    throw new Error(`channel api response is not legacy packet: bytes=${raw.byteLength}, head=${byteHead(raw)}`)
  }

  let encrypted = raw.slice(6)
  if (raw[1] === 0xC0) {
    try {
      encrypted = ungzip(encrypted)
    } catch {
      // gzip 失败时沿用旧 im 兼容策略，继续用原始 payload 解密。
    }
  }

  return aesDecrypt(encrypted, aesKey)
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
  void message
  void data
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
  if (await isTauriDesktopProxyRuntime()) {
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
    throw new ChannelHttpError(res.status, url)
  }
  const buf = await res.arrayBuffer()
  if (buf.byteLength === 0) {
    throw new Error(`channel api response too short: ${buf.byteLength}`)
  }
  return decodePacketWithAesJson(buf, API_CONFIG.secretKey) as T
}

async function sendChannelRawRequest(
  url: string,
  headers: Record<string, string>,
  packet: Uint8Array,
): Promise<ArrayBuffer> {
  if (await isTauriDesktopProxyRuntime()) {
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
    return buf
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: packet.buffer as ArrayBuffer,
  })
  if (!res.ok) {
    throw new ChannelHttpError(res.status, url)
  }
  const buf = await res.arrayBuffer()
  if (buf.byteLength === 0) {
    throw new Error(`channel api response too short: ${buf.byteLength}`)
  }
  return buf
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
  contentLimit?: boolean
  content_limit?: boolean
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

export interface ChannelLastMsgInfoResp {
  code?: number
  msg?: string
  data?: Array<{
    msgType?: number | string
    latestMsgId?: number | string
  }>
}

export interface ChannelHistoryMessage {
  sendUid: string
  channelId: string
  msgType: number
  contentHex: string
  msgId: string
  readTotal: number
  msgTime: number
  version: number
  contentMd5: string
  attachmentKey: string
}

async function requestChannelJson<T>(
  path: string,
  data: Record<string, unknown>,
  options?: { contentType?: string },
): Promise<T> {
  const headers = {
    'Content-Type': options?.contentType || 'application/octet-stream',
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

function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')
}

function protoLongToString(value: unknown): string {
  if (value === null || value === undefined) return '0'
  if (typeof value === 'number' || typeof value === 'string') return String(value)
  const maybeLong = value as { toString?: () => string }
  return typeof maybeLong.toString === 'function' ? maybeLong.toString() : String(value)
}

function protoLongToNumber(value: unknown): number {
  const n = Number(protoLongToString(value))
  return Number.isFinite(n) ? n : 0
}

function encodeMessageListReq(data: {
  bizType: number
  bizId: number | string
  msgType: number
  eventType: number
  latestMsgId: number | string
  latestSize: number
}): Uint8Array {
  const writer = $protobuf.Writer.create()
  writer.uint32(8).int32(data.bizType)
  writer.uint32(16).int64(data.bizId as any)
  writer.uint32(24).int32(data.msgType)
  writer.uint32(32).int32(data.eventType)
  writer.uint32(40).int64(data.latestMsgId as any)
  writer.uint32(48).int32(data.latestSize)
  return writer.finish()
}

function decodeMessageListResp(bytes: Uint8Array): Uint8Array[] {
  const reader = $protobuf.Reader.create(bytes)
  const messageBytes: Uint8Array[] = []
  while (reader.pos < reader.len) {
    const tag = reader.uint32()
    switch (tag >>> 3) {
      case 2:
        messageBytes.push(reader.bytes())
        break
      default:
        reader.skipType(tag & 7)
        break
    }
  }
  return messageBytes
}

function decodeChannelMessage(reader: $protobuf.Reader, length: number): ChannelHistoryMessage {
  const end = reader.pos + length
  const message: ChannelHistoryMessage = {
    sendUid: '0',
    channelId: '0',
    msgType: 0,
    contentHex: '',
    msgId: '0',
    readTotal: 0,
    msgTime: 0,
    version: 0,
    contentMd5: '',
    attachmentKey: '',
  }
  while (reader.pos < end) {
    const tag = reader.uint32()
    switch (tag >>> 3) {
      case 1:
        message.sendUid = protoLongToString(reader.int64())
        break
      case 2:
        message.channelId = protoLongToString(reader.int64())
        break
      case 3:
        message.msgType = reader.int32()
        break
      case 4:
        message.contentHex = uint8ToHex(reader.bytes())
        break
      case 5:
        message.msgId = protoLongToString(reader.int64())
        break
      case 6:
        message.readTotal = reader.int32()
        break
      case 7:
        message.msgTime = protoLongToNumber(reader.int64())
        break
      case 8:
        message.version = reader.int32()
        break
      case 9:
        message.contentMd5 = reader.string()
        break
      case 10:
        message.attachmentKey = reader.string()
        break
      default:
        reader.skipType(tag & 7)
        break
    }
  }
  return message
}

function decodePushChannelMessage(bytes: Uint8Array): ChannelHistoryMessage | null {
  const reader = $protobuf.Reader.create(bytes)
  while (reader.pos < reader.len) {
    const tag = reader.uint32()
    if ((tag >>> 3) === 1) {
      return decodeChannelMessage(reader, reader.uint32())
    }
    reader.skipType(tag & 7)
  }
  return null
}

async function requestChannelProtoBytes(path: string, data: {
  bizType: number
  bizId: number | string
  msgType: number
  eventType: number
  latestMsgId: number | string
  latestSize: number
}): Promise<Uint8Array> {
  const headers = {
    Accept: 'application/x-protobuf',
    'Content-Type': 'application/x-protobuf',
    ...getOpenChatSignedApiHeaders(),
  }
  const packet = encodePacketWithAesBytes(encodeMessageListReq(data), API_CONFIG.secretKey)
  const bases = getOpenChatBaseCandidates()
  let lastError: unknown = null

  for (const [index, base] of bases.entries()) {
    const url = `${base}${path}`
    const startedAt = Date.now()
    try {
      const buf = await sendChannelRawRequest(url, headers, packet)
      channelDiag('protobuf candidate success', {
        path,
        base,
        index,
        elapsedMs: Date.now() - startedAt,
      })
      return decodePacketWithAesBytes(buf, API_CONFIG.secretKey)
    } catch (error) {
      lastError = error
      if (normalizeHttpBaseUrl(base)) {
        void markDomainError('openchatChannel', base)
      }
      channelDiag('protobuf candidate failed', {
        path,
        base,
        index,
        elapsedMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
        willRetry: index < bases.length - 1,
      })
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'channel protobuf api request failed'))
}

export async function getChannelList(data: {
  pageNum: number
  pageSize: number
}): Promise<ChannelListResp> {
  return requestChannelJson<ChannelListResp>('/channel/channelList', data)
}

export async function getChannelLastMsgInfo(data: {
  bizType: number
  bizId: number | string
}): Promise<ChannelLastMsgInfoResp> {
  // 对齐旧 im：latestId 的 bizId 传 Number(channelId)，且网关要求 Content-Type=application/json。
  const bizIdNumber = Number(data.bizId)
  return requestChannelJson<ChannelLastMsgInfoResp>('/message/channelMessage/latestId', {
    ...data,
    bizId: Number.isFinite(bizIdNumber) ? bizIdNumber : data.bizId,
  }, {
    contentType: 'application/json',
  })
}

export async function getChannelHistoryMessages(data: {
  bizType: number
  bizId: number | string
  msgType: number
  eventType: number
  latestMsgId: number | string
  latestSize: number
}): Promise<ChannelHistoryMessage[]> {
  // 对齐旧 im：频道历史消息列表走 protobuf + SECRET_KEY，不复用频道资料的 AES(JSON) 接口。
  const decrypted = await requestChannelProtoBytes('/message/channelMessage/list', data)
  const messageBytes = decodeMessageListResp(decrypted)
  const messages = messageBytes
    .map(decodePushChannelMessage)
    .filter((item): item is ChannelHistoryMessage => !!item)
  channelDiag('history decoded', {
    requestBizId: data.bizId,
    latestMsgId: data.latestMsgId,
    latestSize: data.latestSize,
    decryptedLen: decrypted.length,
    rawMessageBytesCount: messageBytes.length,
    decodedCount: messages.length,
    samples: messages.slice(0, 5).map((item) => ({
      msgId: item.msgId,
      msgType: item.msgType,
      channelId: item.channelId,
      contentHexLen: item.contentHex.length,
      attachmentKeyLen: item.attachmentKey.length,
    })),
  })
  return messages
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
