/**
 * Channel API compatible with legacy IM implementation.
 * Request body: AES-128-ECB encrypted JSON with binary packet header.
 * Response body: AES-128-ECB encrypted JSON with binary packet header.
 */
import { aesEncrypt, aesDecrypt, aesEncryptString } from '@/utils/crypto'
import { API_CONFIG, getOpenChatBaseUrl } from './config'
import { getDeviceConfig } from './request'
import { ungzip } from 'pako'

const CHANNEL_PACKAGE_CODE = 5520

function getSessionIdFromStorage(): string {
  try {
    const currentUid = localStorage.getItem('current-uid') || ''
    const accountListText = localStorage.getItem('login-account-list')
    const accountList = accountListText ? JSON.parse(accountListText) : []
    if (currentUid && Array.isArray(accountList)) {
      const current = accountList.find((item: any) => String(item?.id || '') === currentUid)
      if (current?.sessionId) return String(current.sessionId)
    }
    if (Array.isArray(accountList) && accountList.length > 0) {
      const lastWithSession = [...accountList].reverse().find((item: any) => item?.sessionId)
      if (lastWithSession?.sessionId) return String(lastWithSession.sessionId)
    }
    const browserSessionText = localStorage.getItem('browser-session')
    if (browserSessionText) {
      const browserSession = JSON.parse(browserSessionText)
      if (browserSession?.sessionId) return String(browserSession.sessionId)
    }
  } catch {
    // ignore parse errors
  }
  return ''
}

function getClientInfoForSign() {
  const device = getDeviceConfig()
  return {
    sessionId: getSessionIdFromStorage(),
    // 频道接口签名必须和老 im 的 getSignHeader 对齐，否则服务端会把请求判成异常。
    appVer: API_CONFIG.appVer,
    packageCode: CHANNEL_PACKAGE_CODE,
    language: API_CONFIG.language,
    plat: 4,
    sysModel: getPlatformSysModel(),
    sysMac: device.sysMac,
  }
}

function getPlatformSysModel(): string {
  const ua = (navigator.userAgent || '').toLowerCase()
  if (ua.includes('mac')) return 'MAC'
  return 'WINDOWS'
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
  return JSON.parse(json)
}

function getSignHeaders() {
  const client = getClientInfoForSign()
  const clientStr = JSON.stringify(client)
  const timestamp = Date.now()
  const tenOrigin = `${clientStr}//${timestamp}`
  const oneOrigin = `${API_CONFIG.secretName},${timestamp}`
  return {
    'X-one': aesEncryptString(oneOrigin, API_CONFIG.headAesKey),
    'X-ten': aesEncryptString(tenOrigin, API_CONFIG.headAesKey),
    'X-ten-origin': JSON.stringify(tenOrigin),
  }
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

export interface ChannelUpdateMemberResp {
  code: number
  msg?: string
  data?: unknown
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
  const signClient = getClientInfoForSign()
  console.info('[ChannelAPI] request', {
    url,
    data,
    appVer: signClient.appVer,
    packageCode: signClient.packageCode,
    language: signClient.language,
    plat: signClient.plat,
    hasSessionId: !!signClient.sessionId,
  })

  // 频道接口不是 protobuf，而是“固定头 + AES(JSON)”这一条老协议，不能复用通用 requestProto。
  const packet = encodePacketWithAesJson(data, API_CONFIG.secretKey)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      Accept: 'application/json',
      ...getSignHeaders(),
    },
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

export async function updateMember(data: {
  channelId: number | string
  isDisturb: boolean | number
}): Promise<ChannelUpdateMemberResp> {
  return requestChannelJson<ChannelUpdateMemberResp>('/channel/channelMember/updateMember', data)
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

export async function isChannelLink(data: {
  link: string
}): Promise<ChannelLinkResp> {
  return requestChannelJson<ChannelLinkResp>('/channel/getChannelByLink', data)
}

export async function searchAliasContent(data: {
  fromUid: number | string
  content: string
}): Promise<SearchAliasContentResp> {
  return requestChannelJson<SearchAliasContentResp>('/user/search/content', data)
}
