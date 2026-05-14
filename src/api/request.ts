/**
 * Binary protobuf + AES-128-ECB API request pipeline.
 * Matches OCS protocol: [0xC1, 0x80] + uint32(len) + AES(protobuf)
 */
import { aesEncrypt, aesDecrypt } from '@/utils/crypto'
import { API_CONFIG, getBaseUrl } from './config'
import { getActiveSessionId } from './sessionContext'
import * as proto from '@/proto/generated'
import { ungzip } from 'pako'

function generateMacAddress(): string {
  return Array.from(Array(16), () =>
    Math.floor(Math.random() * 36).toString(36)
  ).join('')
}

let cachedDeviceConfig: { sysModel: string; sysMac: string } | null = null

export function getDeviceConfig() {
  if (cachedDeviceConfig) return cachedDeviceConfig

  const stored = localStorage.getItem('device-config')
  if (stored) {
    try {
      cachedDeviceConfig = JSON.parse(stored)
      return cachedDeviceConfig!
    } catch { /* ignore */ }
  }

  cachedDeviceConfig = {
    sysModel: Array.from(Array(16), () =>
      Math.floor(Math.random() * 36).toString(36)
    ).join(''),
    sysMac: generateMacAddress(),
  }
  localStorage.setItem('device-config', JSON.stringify(cachedDeviceConfig))
  return cachedDeviceConfig
}

function getSessionIdFromStorage(): string {
  const activeSessionId = getActiveSessionId()
  if (activeSessionId) return activeSessionId

  try {
    const currentUid = localStorage.getItem('current-uid') || ''
    const accountListText = localStorage.getItem('login-account-list')
    const accountList = accountListText ? JSON.parse(accountListText) : []
    if (currentUid && Array.isArray(accountList)) {
      const current = accountList.find((item: any) => String(item?.id || '') === currentUid)
      if (current?.sessionId) return String(current.sessionId)
    }

    const browserSessionText = localStorage.getItem('browser-session')
    if (browserSessionText) {
      const browserSession = JSON.parse(browserSessionText)
      if (browserSession?.sessionId) return String(browserSession.sessionId)
    }
  } catch {
    // ignore parse errors and fallback to empty session
  }
  return ''
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

/**
 * 与老 im fnClientInfoGet 完全对齐：
 * - sysModel 为平台名字符串（"MAC"/"WINDOWS"），不是设备指纹！服务端扫码配对靠它识别 PC 客户端
 * - clientInfo 里 *不含* sysMac 字段（老 im 也没有）；sysMac 只在 IsLoginReq 顶层字段传
 * - appVer 与老 im 的 1.6.8 → "168" 对齐
 * - plat 固定 WIN=4（老 im 硬编码 4）
 */
function getPlatformSysModel(): string {
  const ua = (navigator.userAgent || '').toLowerCase()
  if (ua.includes('mac')) return 'MAC'
  return 'WINDOWS'
}

function getClientInfo(withSessionId = true): proto.IClientInfo {
  const sessionId = withSessionId ? getSessionIdFromStorage() : ''
  return {
    sessionId,
    appVer: 168,
    packageCode: 7100,
    language: 2,
    plat: proto.Platform.WIN,
    sysModel: getPlatformSysModel(),
  }
}

/**
 * Encode a protobuf request message into the OCS binary packet format.
 *
 * Packet layout:
 * [0xC1] [0x80] [uint32 BE length] [AES-encrypted protobuf bytes]
 */
function encodePacket(protoBytes: Uint8Array, aesKey: string): Uint8Array {
  const encrypted = aesEncrypt(aesKey, protoBytes)
  const header = Uint8Array.from([0xC1, 0x80])
  const length = getUint32Bytes(encrypted.length)
  return concatUint8Arrays(header, length, encrypted)
}

/**
 * Decode an OCS binary response packet.
 *
 * Packet layout:
 *   byte[0]  = 0xC0/0xC1 (固定头)
 *   byte[1]  = 压缩标志：0xC0 = gzip 压缩，0x80 = 未压缩
 *   byte[2-5]= uint32 BE 内容长度
 *   byte[6+] = 密文（可能经过 gzip）
 *
 * 与老 im 的 handleDecompress + handleDecode 完全对齐。
 */
function decodePacket(data: ArrayBuffer, aesKey: string): Uint8Array {
  const raw = new Uint8Array(data)
  const compressFlag = raw[1]

  let payload: Uint8Array
  if (compressFlag === 0xC0) {
    try {
      const compressed = raw.slice(6)
      payload = ungzip(compressed)
    } catch (err) {
      console.error('[decodePacket] gzip 解压失败，回退到原始数据:', err)
      payload = raw.slice(6)
    }
  } else {
    payload = raw.slice(6)
  }

  return aesDecrypt(payload, aesKey)
}

type ProtoMessageType<T> = {
  create(properties?: Partial<T>): T
  encode(message: T): { finish(): Uint8Array }
  decode(reader: Uint8Array): T
}

/**
 * Make a binary protobuf + AES encrypted API request.
 */
export async function requestProto<TReq, TResp>(opts: {
  url: string
  reqType: ProtoMessageType<TReq>
  respType: ProtoMessageType<TResp>
  data?: Partial<TReq>
  aesKey?: string
  withSessionId?: boolean
}): Promise<TResp> {
  const { url, reqType, respType, aesKey = API_CONFIG.aesKey, withSessionId = true } = opts

  const reqData = {
    clientInfo: getClientInfo(withSessionId),
    ...opts.data,
  } as unknown as Partial<TReq>
  const reqMessage = reqType.create(reqData)

  const protoBytes = reqType.encode(reqMessage).finish()
  const packet = encodePacket(protoBytes, aesKey)

  const response = await fetch(url, {
    method: 'POST',
    body: packet.buffer as ArrayBuffer,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const respBuffer = await response.arrayBuffer()
  const decrypted = decodePacket(respBuffer, aesKey)
  const message = respType.decode(decrypted)

  return message
}

export { proto }
