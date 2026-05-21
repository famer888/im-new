/**
 * Binary protobuf + AES-128-ECB API request pipeline.
 * Matches OCS protocol: [0xC1, 0x80] + uint32(len) + AES(protobuf)
 */
import { aesEncrypt, aesDecrypt, aesEncryptString } from '@/utils/crypto'
import { API_CONFIG, OPEN_CHAT_PACKAGE_CODE, getBaseUrl } from './config'
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
 * - appVer / packageCode / language 跟随当前环境配置，默认对齐老 im 55.1.7.0
 * - plat 固定 WIN=4（老 im 硬编码 4）
 */
function getPlatformSysModel(): string {
  const ua = (navigator.userAgent || '').toLowerCase()
  if (ua.includes('mac')) return 'MAC'
  return 'WINDOWS'
}

export function getApiMetaHeaders(options?: {
  appVer?: number
  packageCode?: number
}): Record<string, string> {
  const appVer = options?.appVer ?? API_CONFIG.appVer
  const packageCode = options?.packageCode ?? API_CONFIG.packageCode
  return {
    // 对齐老 im：元数据头须与 X-ten 内 clientInfo 的 appVer/packageCode 一致
    'X-App-Version': String(appVer),
    'X-Package-Code': String(packageCode),
    'X-Secret-Name': API_CONFIG.secretName,
  }
}

function getSignClientInfo(
  withSessionId = true,
  packageCode = API_CONFIG.packageCode,
  appVer = API_CONFIG.appVer,
) {
  const device = getDeviceConfig()
  return {
    sessionId: withSessionId ? getSessionIdFromStorage() : '',
    appVer,
    packageCode,
    language: API_CONFIG.language,
    plat: 4,
    sysModel: getPlatformSysModel(),
    sysMac: device.sysMac,
  }
}

export function getSignedApiHeaders(options?: {
  withSessionId?: boolean
  packageCode?: number
  appVer?: number
}): Record<string, string> {
  const packageCode = options?.packageCode ?? API_CONFIG.packageCode
  const appVer = options?.appVer ?? API_CONFIG.appVer
  const client = getSignClientInfo(
    options?.withSessionId ?? true,
    packageCode,
    appVer,
  )
  const clientStr = JSON.stringify(client)
  const timestamp = Date.now()
  const tenOrigin = `${clientStr}//${timestamp}`
  const oneOrigin = `${API_CONFIG.secretName},${timestamp}`
  return {
    ...getApiMetaHeaders({ appVer, packageCode }),
    'X-one': aesEncryptString(oneOrigin, API_CONFIG.headAesKey),
    'X-ten': aesEncryptString(tenOrigin, API_CONFIG.headAesKey),
    'X-ten-origin': JSON.stringify(tenOrigin),
  }
}

/**
 * OpenChat（test-gateway）频道/群相关接口签名：
 * - packageCode 5520
 * - 与普通接口共用 5520；真正区分的是 SECRET_* 与 openChatAppVer
 */
export function getOpenChatSignedApiHeaders(options?: {
  withSessionId?: boolean
}): Record<string, string> {
  const appVer = API_CONFIG.openChatAppVer ?? API_CONFIG.appVer
  return getSignedApiHeaders({
    withSessionId: options?.withSessionId,
    packageCode: OPEN_CHAT_PACKAGE_CODE,
    appVer,
  })
}

function getClientInfo(withSessionId = true): proto.IClientInfo {
  const sessionId = withSessionId ? getSessionIdFromStorage() : ''
  return {
    sessionId,
    appVer: API_CONFIG.appVer,
    packageCode: API_CONFIG.packageCode,
    language: API_CONFIG.language,
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
    headers: getSignedApiHeaders({ withSessionId }),
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
