/**
 * Channel API compatible with legacy IM implementation.
 * Request body: AES-128-ECB encrypted JSON with binary packet header.
 * Response body: AES-128-ECB encrypted JSON with binary packet header.
 */
import { aesEncrypt, aesDecrypt } from '@/utils/crypto'
import { API_CONFIG, getOpenChatBaseUrl } from './config'
import { getOpenChatSignedApiHeaders } from './request'
import { getRuntimePlatform } from '@/utils/runtimePlatform'
import { ungzip } from 'pako'

let cachedPackagedMacRuntime: boolean | null = null

async function isTauriPackagedMacRuntime(): Promise<boolean> {
  if (cachedPackagedMacRuntime !== null) return cachedPackagedMacRuntime
  if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
    cachedPackagedMacRuntime = false
    return cachedPackagedMacRuntime
  }
  if (!import.meta.env.PROD) {
    cachedPackagedMacRuntime = false
    return cachedPackagedMacRuntime
  }
  // 复用项目统一的平台判定，避免各处重复维护 UA 规则导致端差异。
  const platform = await getRuntimePlatform()
  cachedPackagedMacRuntime = platform === 'macos'
  return cachedPackagedMacRuntime
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

function decodePacketWithAesJson(buffer: ArrayBuffer, aesKey: string): any {
  const raw = new Uint8Array(buffer)
  let encrypted = raw.slice(6)

  // 老 im 的频道接口响应有时会走 gzip 压缩，这里要和 requestAxios 的兼容行为保持一致。
  if (raw[1] === 0xC0) {
    try {
      encrypted = ungzip(encrypted)
    } catch (err) {
      console.warn('[ChannelAPI] gzip decode failed, fallback to raw payload:', err)
    }
  }

  const plain = aesDecrypt(encrypted, aesKey)
  const json = new TextDecoder().decode(plain)
  return JSON.parse(quoteLargeIntegerIds(json))
}

function quoteLargeIntegerIds(json: string): string {
  return json.replace(/"([A-Za-z0-9_]*(?:id|Id|ID)[A-Za-z0-9_]*)"\s*:\s*(-?\d{16,})/g, '"$1":"$2"')
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
  const base = getOpenChatBaseUrl()
  const url = `${base}${path}`
  const headers = {
    'Content-Type': 'application/octet-stream',
    Accept: 'application/json',
    ...getOpenChatSignedApiHeaders(),
  }

  // 频道接口不是 protobuf，而是“固定头 + AES(JSON)”这一条老协议，不能复用通用 requestProto。
  const packet = encodePacketWithAesJson(data, API_CONFIG.secretKey)

  // 先仅对 mac 打包端启用代理转发，避免影响已稳定的 Windows 打包链路。
  if (await isTauriPackagedMacRuntime()) {
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
      throw new Error(`HTTP ${Number(result?.status || 0)}${result?.error ? `; ${result.error}` : ''}`)
    }
    const buf = decodeBase64ToArrayBuffer(result.bodyBase64 || '')
    if (buf.byteLength < 6) {
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
    throw new Error(`HTTP ${res.status}`)
  }
  const buf = await res.arrayBuffer()
  if (buf.byteLength < 6) {
    throw new Error(`channel api response too short: ${buf.byteLength}`)
  }
  return decodePacketWithAesJson(buf, API_CONFIG.secretKey) as T
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
