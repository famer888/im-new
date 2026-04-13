/**
 * Binary protobuf + AES-128-ECB API request pipeline.
 * Matches OCS protocol: [0xC1, 0x80] + uint32(len) + AES(protobuf)
 */
import { aesEncrypt, aesDecrypt } from '@/utils/crypto'
import { API_CONFIG, getBaseUrl } from './config'
import * as proto from '@/proto/generated'

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
  try {
    const currentUid = localStorage.getItem('current-uid') || ''
    const accountListText = localStorage.getItem('login-account-list')
    const accountList = accountListText ? JSON.parse(accountListText) : []
    if (currentUid) {
      if (Array.isArray(accountList)) {
        const current = accountList.find((item: any) => String(item?.id || '') === currentUid)
        if (current?.sessionId) return String(current.sessionId)
      }
    }
    if (Array.isArray(accountList) && accountList.length > 0) {
      const lastWithSession = [...accountList].reverse().find((item: any) => item?.sessionId)
      if (lastWithSession?.sessionId) {
        return String(lastWithSession.sessionId)
      }
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

function getClientInfo(): proto.IClientInfo {
  const device = getDeviceConfig()
  const sessionId = getSessionIdFromStorage()
  return {
    sessionId,
    appVer: 167,
    sysMac: device.sysMac,
    sysModel: device.sysModel,
    packageCode: 7100,
    plat: proto.Platform.WIN,
    language: 2,
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
 * Skip first 6 bytes (2 header + 4 length), decrypt remaining.
 */
function decodePacket(data: ArrayBuffer, aesKey: string): Uint8Array {
  const encrypted = new Uint8Array(data.slice(6))
  return aesDecrypt(encrypted, aesKey)
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
}): Promise<TResp> {
  const { url, reqType, respType, aesKey = API_CONFIG.aesKey } = opts

  const reqData = {
    clientInfo: getClientInfo(),
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

  const urlPath = url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api/, '')
  console.log(`[API] ${urlPath}`, message)

  return message
}

export { proto }
