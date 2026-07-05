/**
 * Binary protobuf + AES-128-ECB API request pipeline.
 * Matches OCS protocol: [0xC1, 0x80] + uint32(len) + AES(protobuf)
 */
import { aesEncrypt, aesDecrypt, aesEncryptString } from '@/utils/crypto'
import {
  API_CONFIG,
  OPEN_CHAT_PACKAGE_CODE,
  getBaseUrl,
  getRawBaseUrl,
  isLoginOnlyBaseUrl,
  setBaseUrl,
  syncBaseUrlWithDomainPool,
} from './config'
import { getActiveSessionId } from './sessionContext'
import { getAllDomains, getOrderedDomainUrls, markDomainError } from '@/utils/domainPool'
import * as proto from '@/proto/generated'
import { ungzip } from 'pako'

function generateMacAddress(): string {
  return Array.from(Array(16), () =>
    Math.floor(Math.random() * 36).toString(36)
  ).join('')
}

function generateLegacyStyleSysMac(): string {
  const packageName = String(import.meta.env.VITE_APP_PACKNAME || API_CONFIG.brandId || '97').trim() || '97'
  const hex = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0'))
  return `${packageName}-${hex.join(':')}`
}

function shouldMigrateLegacyDeviceConfig(config: { sysModel?: string; sysMac?: string } | null): boolean {
  if (!config) return true
  const sysModel = String(config.sysModel || '').trim()
  const sysMac = String(config.sysMac || '').trim()
  if (!sysModel || !sysMac) return true
  // 对齐旧 im：sysMac 应为 “packname-xx:xx:xx:xx:xx:xx” 形态；早期随机串会导致扫码登录确认态无法完成。
  return !sysMac.includes('-') || !sysMac.includes(':')
}

let cachedDeviceConfig: { sysModel: string; sysMac: string } | null = null

export function getDeviceConfig() {
  if (cachedDeviceConfig) return cachedDeviceConfig

  const stored = localStorage.getItem('device-config')
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      if (shouldMigrateLegacyDeviceConfig(parsed)) {
        cachedDeviceConfig = {
          sysModel: String(parsed?.sysModel || '').trim() || generateMacAddress(),
          sysMac: generateLegacyStyleSysMac(),
        }
        localStorage.setItem('device-config', JSON.stringify(cachedDeviceConfig))
      } else {
        cachedDeviceConfig = parsed
      }
      return cachedDeviceConfig!
    } catch { /* ignore */ }
  }

  cachedDeviceConfig = {
    sysModel: Array.from(Array(16), () =>
      Math.floor(Math.random() * 36).toString(36)
    ).join(''),
    // 对齐旧 im：扫码轮询请求里的 sysMac 需要稳定且具备 packname-mac 形态。
    sysMac: generateLegacyStyleSysMac(),
  }
  localStorage.setItem('device-config', JSON.stringify(cachedDeviceConfig))
  return cachedDeviceConfig
}

export function getSessionIdFromStorage(): string {
  const activeSessionId = getActiveSessionId()
  if (activeSessionId) return activeSessionId

  // 桌面端多开时 localStorage 会在进程间共享，不能用它推断当前窗口账号。
  if ((window as any).__TAURI_INTERNALS__) return ''

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

function parseUrl(value: string): URL | null {
  try {
    return new URL(value, window.location.origin)
  } catch {
    return null
  }
}

function normalizeHttpBaseUrl(value: string): string {
  const raw = String(value || '').trim()
  // 对齐 old im 的开发态代理语义：`/api/*` 只是本地代理路径，不是可持久化/可切换的真实域名。
  if (!/^https?:\/\//i.test(raw)) return ''
  const parsed = parseUrl(raw)
  if (!parsed) return ''
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
  return `${parsed.protocol}//${parsed.host}`
}

function getUrlPathForLog(value: string): string {
  try {
    const parsed = new URL(value, window.location.origin)
    return parsed.pathname
  } catch {
    return ''
  }
}

function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).__TAURI_INTERNALS__
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

function normalizeHeadersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => { result[key] = value })
    return result
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [String(key), String(value)]))
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [String(key), String(value)]),
  )
}

function toUint8ArrayFromRequestBody(body: BodyInit | null | undefined): Uint8Array {
  if (!body) return new Uint8Array()
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  throw new Error('unsupported binary request body type')
}

function shouldFallbackForHttpStatus(status: number): boolean {
  // 对齐老 im：桌面端业务请求只要不是 200，就允许继续切下一个 webBiz 域名重试。
  return status !== 200
}

function isLoginApiRequest(url: string): boolean {
  const parsed = parseUrl(url)
  if (!parsed) return false
  return parsed.pathname.startsWith('/login/')
}

function shouldFallbackWebBiz(url: string): boolean {
  const requestBase = normalizeHttpBaseUrl(url)
  if (!requestBase) return false
  if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return false

  const domainApiBase = normalizeHttpBaseUrl(API_CONFIG.rawDomainUrl)
  const openChatBase = normalizeHttpBaseUrl(API_CONFIG.rawOpenChatDomain)
  if (requestBase === domainApiBase || requestBase === openChatBase) return false

  // 对齐老 im：桌面端所有走 requestProto 的业务/login 域名请求都允许触发 webBiz/login_v2 兜底，
  // 不能要求“当前 host 必须已在本地池里”，否则首域名失配时会直接跳过切域名。
  return true
}

let reportingWebBizDomainFailure = false
let refreshingWebBizDomainPool = false

async function refreshWebBizDomainPool(): Promise<boolean> {
  if (refreshingWebBizDomainPool) return false
  refreshingWebBizDomainPool = true
  try {
    const { initDomainPoolFromOss, initDomainPoolFromApi } = await import('@/utils/domainPool')
    // 先补 OSS，再补 listDomain；顺序对齐旧项目的域名引导链路。
    await initDomainPoolFromOss()
    await initDomainPoolFromApi()
    syncBaseUrlWithDomainPool({ preferPool: true })
    return true
  } catch {
    return false
  } finally {
    refreshingWebBizDomainPool = false
  }
}

async function retryWithWebBizCandidates(
  url: string,
  init: RequestInit,
  options: { failedBase: string; isLoginRequest: boolean; onResolvedBaseUrl?: (baseUrl: string) => void },
  errorForReport: unknown,
  httpStatus = 0,
): Promise<ProtoHttpResponse | null> {
  const failedBases = new Set<string>([normalizeHttpBaseUrl(options.failedBase)].filter(Boolean))
  let refreshedPool = false
  let lastResponse: ProtoHttpResponse | null = null
  let lastError: unknown = null
  let attempt = 0

  for (;;) {
    const nextBase = getNextWebBizBaseUrl(failedBases, {
      includeLoginOnlyDomains: options.isLoginRequest,
    })
    if (!nextBase) {
      if (!refreshedPool && !options.isLoginRequest) {
        refreshedPool = true
        await refreshWebBizDomainPool()
        continue
      }
      if (lastResponse) return lastResponse
      if (lastError) throw lastError
      return null
    }

    attempt += 1
    failedBases.add(nextBase)
    const retryUrl = replaceRequestBaseUrl(url, nextBase)
    try {
      const retryResponse = await sendProtoHttpRequest(retryUrl, init)
      if (shouldFallbackForHttpStatus(retryResponse.status)) {
        void markDomainError(isLoginOnlyBaseUrl(nextBase) ? 'login_v2' : 'webBiz', nextBase)
        lastResponse = retryResponse
        continue
      }

      if (!options.isLoginRequest) {
        // 只有真正切换成功后，才把当前业务 baseUrl 持久化到新域名。
        setBaseUrl(nextBase)
      }
      options.onResolvedBaseUrl?.(nextBase)
      void reportWebBizDomainFailure(options.failedBase, url, errorForReport, httpStatus)
      return retryResponse
    } catch (retryError) {
      void markDomainError(isLoginOnlyBaseUrl(nextBase) ? 'login_v2' : 'webBiz', nextBase)
      lastError = retryError
    }
  }
}

function getNextWebBizBaseUrl(
  failedBases: Set<string>,
  options: { includeLoginOnlyDomains?: boolean } = {},
): string {
  const loginDomains = options.includeLoginOnlyDomains
    ? getOrderedDomainUrls('login_v2')
    : []
  const ordered = [
    ...loginDomains,
    ...getOrderedDomainUrls('webBiz'),
    getRawBaseUrl(),
  ]
  const seen = new Set<string>()

  for (const candidate of ordered) {
    const normalized = normalizeHttpBaseUrl(candidate)
    if (!normalized || failedBases.has(normalized) || seen.has(normalized)) continue
    if (!options.includeLoginOnlyDomains && isLoginOnlyBaseUrl(normalized)) continue
    seen.add(normalized)
    return normalized
  }

  return ''
}

function replaceRequestBaseUrl(url: string, nextBase: string): string {
  const requestUrl = parseUrl(url)
  const nextUrl = parseUrl(nextBase)
  if (!requestUrl || !nextUrl) return url

  requestUrl.protocol = nextUrl.protocol
  requestUrl.host = nextUrl.host
  return requestUrl.toString()
}

async function reportWebBizDomainFailure(
  failedBase: string,
  requestUrl: string,
  error: unknown,
  httpStatus = 0,
) {
  const failedModuleCode = isLoginOnlyBaseUrl(failedBase) ? 'login_v2' : 'webBiz'
  void markDomainError(failedModuleCode, failedBase)

  if (reportingWebBizDomainFailure) return
  reportingWebBizDomainFailure = true

  try {
    const { reportErrorDomain } = await import('./imDomain')
    await reportErrorDomain({
      domainUrl: failedBase,
      errorPath: requestUrl,
      errorDesc: error instanceof Error ? error.message : String(error),
      httpStatus,
      moduleCode: failedModuleCode,
    })
  } catch {
    // 域名上报失败不能影响当前请求兜底结果。
  } finally {
    reportingWebBizDomainFailure = false
  }
}

type ProtoHttpResponse = {
  ok: boolean
  status: number
  arrayBuffer: () => Promise<ArrayBuffer>
  errorText?: string
}

type TauriBinaryProxyResponse = {
  ok: boolean
  status: number
  bodyBase64: string
  error?: string
}

async function sendProtoHttpRequest(url: string, init: RequestInit): Promise<ProtoHttpResponse> {
  // 对齐老 im 桌面语义：Tauri 没有 Electron CORS hook，桌面端统一由主进程代发避免 WebView Origin 被拦截。
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    const bodyBytes = toUint8ArrayFromRequestBody(init.body as BodyInit | null | undefined)
    const result = await invoke<TauriBinaryProxyResponse>('proxy_http_binary', {
      request: {
        url,
        method: String(init.method || 'POST').toUpperCase(),
        headers: normalizeHeadersToRecord(init.headers),
        bodyBase64: encodeBase64(bodyBytes),
      },
    })
    const responseBodyBuffer = decodeBase64ToArrayBuffer(result.bodyBase64 || '')
    return {
      ok: !!result.ok,
      status: Number(result.status || 0),
      arrayBuffer: async () => responseBodyBuffer,
      errorText: result.error || '',
    }
  }

  const response = await fetch(url, init)
  return {
    ok: response.ok,
    status: response.status,
    arrayBuffer: () => response.arrayBuffer(),
  }
}

async function fetchWithWebBizFallback(
  url: string,
  init: RequestInit,
  options: { withSessionId: boolean; onResolvedBaseUrl?: (baseUrl: string) => void; disableWebBizFallback?: boolean },
): Promise<ProtoHttpResponse> {
  // 登录前二维码接口也要切域名；withSessionId 只控制协议 session，不控制域名兜底。
  const allowFallback = !options.disableWebBizFallback && shouldFallbackWebBiz(url)
  const failedBase = normalizeHttpBaseUrl(url)
  const isLoginRequest = isLoginApiRequest(url)

  try {
    const response = await sendProtoHttpRequest(url, init)
    if (response.ok && allowFallback && failedBase) {
      options.onResolvedBaseUrl?.(failedBase)
    }
    if (!response.ok && allowFallback && shouldFallbackForHttpStatus(response.status) && failedBase) {
      void markDomainError(isLoginOnlyBaseUrl(failedBase) ? 'login_v2' : 'webBiz', failedBase)
      const retryResponse = await retryWithWebBizCandidates(url, init, {
        failedBase,
        isLoginRequest,
        onResolvedBaseUrl: options.onResolvedBaseUrl,
      }, new Error(`HTTP ${response.status}`), response.status)
      return retryResponse || response
    }
    return response
  } catch (error) {
    if (!allowFallback || !failedBase) throw error

    void markDomainError(isLoginOnlyBaseUrl(failedBase) ? 'login_v2' : 'webBiz', failedBase)
    const retryResponse = await retryWithWebBizCandidates(url, init, {
      failedBase,
      isLoginRequest,
      onResolvedBaseUrl: options.onResolvedBaseUrl,
    }, error)
    if (!retryResponse) throw error
    return retryResponse
  }
}

/**
 * 与老 im fnClientInfoGet 的平台语义对齐：
 * - sysModel 为平台名字符串（"MAC"/"WINDOWS"），不是设备指纹！服务端扫码配对靠它识别 PC 客户端
 * - 常规 protobuf clientInfo 里不带 version；header/domain JSON 场景单独补 version
 * - plat 固定 WIN=4（老 im 硬编码 4）
 */
export function getPlatformSysModel(): string {
  const ua = (navigator.userAgent || '').toLowerCase()
  if (ua.includes('mac')) return 'MAC'
  return 'WINDOWS'
}

export function getHeaderClientVersion(appVer: number): string {
  const versionName = String(import.meta.env.VITE_APP_VERSION_NAME || '').trim()
  if (versionName) return versionName
  const text = String(appVer || '').trim()
  if (text.length >= 3 && /^\d+$/.test(text)) {
    return `${text[0]}.${text[1]}.${text.slice(2)}`
  }
  return text || '1.0.0'
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
  const version = getHeaderClientVersion(appVer)
  return {
    sessionId: withSessionId ? getSessionIdFromStorage() : '',
    // 对齐老 im：签名头里的 clientInfo 走字符串 appVer，并带上 version 字段。
    appVer: String(appVer),
    version,
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
  includeMetaHeaders?: boolean
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
  const headers: Record<string, string> = {
    'X-one': aesEncryptString(oneOrigin, API_CONFIG.headAesKey),
    'X-ten': aesEncryptString(tenOrigin, API_CONFIG.headAesKey),
    'X-ten-origin': JSON.stringify(tenOrigin),
  }
  if (options?.includeMetaHeaders === false) {
    return headers
  }
  return {
    ...getApiMetaHeaders({ appVer, packageCode }),
    ...headers,
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

export function getClientInfo(withSessionId = true): proto.IClientInfo {
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
  includeMetaHeaders?: boolean
  clientInfo?: proto.IClientInfo
  onResolvedBaseUrl?: (baseUrl: string) => void
  disableWebBizFallback?: boolean
}): Promise<TResp> {
  const { url, reqType, respType, aesKey = API_CONFIG.aesKey, withSessionId = true } = opts

  const reqData = {
    clientInfo: opts.clientInfo ?? getClientInfo(withSessionId),
    ...opts.data,
  } as unknown as Partial<TReq>
  const reqMessage = reqType.create(reqData)

  const protoBytes = reqType.encode(reqMessage).finish()
  const packet = encodePacket(protoBytes, aesKey)

  const response = await fetchWithWebBizFallback(url, {
    method: 'POST',
    headers: getSignedApiHeaders({
      withSessionId,
      includeMetaHeaders: opts.includeMetaHeaders,
    }),
    body: packet.buffer as ArrayBuffer,
  }, {
    withSessionId,
    onResolvedBaseUrl: opts.onResolvedBaseUrl,
    disableWebBizFallback: opts.disableWebBizFallback,
  })

  if (!response.ok) {
    let bodyPreview = ''
    try {
      const bytes = new Uint8Array(await response.arrayBuffer())
      bodyPreview = new TextDecoder('utf-8').decode(bytes).slice(0, 300)
    } catch {
      bodyPreview = ''
    }
    const proxyError = response.errorText ? `; ${response.errorText}` : ''
    const detail = bodyPreview ? `; body=${bodyPreview}` : ''
    throw new Error(`HTTP ${response.status}; url=${url}${proxyError}${detail}`)
  }

  const respBuffer = await response.arrayBuffer()
  const decrypted = decodePacket(respBuffer, aesKey)
  const message = respType.decode(decrypted)

  return message
}

export { proto }
