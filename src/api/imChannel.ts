/**
 * Channel API compatible with legacy IM implementation.
 * Request body: AES-128-ECB encrypted JSON with binary packet header.
 * Response body: AES-128-ECB encrypted JSON with binary packet header.
 */
import { aesEncrypt, aesDecrypt, aesEncryptString } from '@/utils/crypto'
import { API_CONFIG, getRawBaseUrl } from './config'
import { getDeviceConfig } from './request'

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
    appVer: API_CONFIG.appVer,
    packageCode: API_CONFIG.packageCode,
    language: API_CONFIG.language,
    plat: API_CONFIG.plat,
    sysModel: device.sysModel,
    sysMac: device.sysMac,
  }
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
  const encrypted = new Uint8Array(buffer.slice(6))
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
  channelName?: string
  icon?: string
  logoColor?: string
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

export async function getChannelList(data: {
  pageNum: number
  pageSize: number
}): Promise<ChannelListResp> {
  const base = getRawBaseUrl()
  const url = `${base}/channel/channelList`
  const signClient = getClientInfoForSign()
  console.info('[ChannelAPI] request', {
    url,
    pageNum: data.pageNum,
    pageSize: data.pageSize,
    appVer: signClient.appVer,
    packageCode: signClient.packageCode,
    language: signClient.language,
    plat: signClient.plat,
    hasSessionId: !!signClient.sessionId,
  })

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
  const decoded = decodePacketWithAesJson(buf, API_CONFIG.secretKey)
  console.info('[ChannelAPI] response', {
    code: decoded?.code,
    msg: decoded?.msg,
    rowListLen: decoded?.data?.rowList?.length ?? 0,
    total: decoded?.data?.total,
    pageNum: data.pageNum,
  })
  return decoded
}
