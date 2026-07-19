/**
 * Binary protobuf + AES-128-ECB API request pipeline.
 * Matches OCS protocol: [0xC1, 0x80] + uint32(len) + AES(protobuf)
 */
import { aesEncrypt, aesDecrypt, aesEncryptString } from '@/utils/crypto'
import {
  API_CONFIG,
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

function resolvePackNameForSysMac(): string {
  // 对齐旧 im getMacAddress：前缀为 VUE_APP_PACKNAME（如 55-im），不是裸 brandId。
  return String(
    import.meta.env.VITE_APP_PACKNAME || `${API_CONFIG.brandId || '55'}-im`,
  ).trim() || '55-im'
}

function generateLegacyStyleSysMac(): string {
  const packageName = resolvePackNameForSysMac()
  const hex = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0'))
  return `${packageName}-${hex.join(':')}`
}

function shouldMigrateLegacyDeviceConfig(config: { sysModel?: string; sysMac?: string } | null): boolean {
  if (!config) return true
  const sysModel = String(config.sysModel || '').trim()
  const sysMac = String(config.sysMac || '').trim()
  if (!sysModel || !sysMac) return true
  // 对齐旧 im：sysMac 应为 “packname-xx:xx:xx:xx:xx:xx” 形态；早期随机串会导致扫码登录确认态无法完成。
  if (!sysMac.includes('-') || !sysMac.includes(':')) return true
  const pack = resolvePackNameForSysMac()
  // 开发态补齐品牌后，旧的 97-xxx 缓存不能继续用于 55 扫码配对。
  return !sysMac.startsWith(`${pack}-`)
}

let cachedDeviceConfig: { sysModel: string; sysMac: string } | null = null

export async function refreshDeviceSysMacFromNative(): Promise<void> {
  if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const packName = resolvePackNameForSysMac()
    const sysMac = String(await invoke<string>('get_device_sys_mac', { packName: packName })).trim()
    if (!sysMac.includes('-') || !sysMac.includes(':')) return

    let sysModel = ''
    let extras: Record<string, unknown> = {}
    const stored = localStorage.getItem('device-config')
    if (stored) {
      try {
        const parsed = JSON.parse(stored) || {}
        sysModel = String(parsed?.sysModel || '').trim()
        extras = parsed
      } catch { /* ignore */ }
    }
    if (!sysModel) {
      sysModel = Array.from(Array(16), () =>
        Math.floor(Math.random() * 36).toString(36),
      ).join('')
    }

    cachedDeviceConfig = { sysModel, sysMac }
    localStorage.setItem('device-config', JSON.stringify({ ...extras, sysModel, sysMac }))
  } catch {
    // 读取网卡失败时继续走本地缓存/随机 sysMac。
  }
}

/** 对齐旧 im fnConfigRU：登录成功后合并 urls / uploadFileSize 等到 device-config。 */
export function mergeDeviceConfigExtras(info: Record<string, unknown>) {
  const device = getDeviceConfig()
  let stored: Record<string, unknown> = { ...device }
  try {
    const raw = localStorage.getItem('device-config')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        stored = { ...parsed }
      }
    }
  } catch { /* ignore */ }

  const next = {
    ...stored,
    ...info,
    sysModel: device.sysModel,
    sysMac: device.sysMac,
  }
  cachedDeviceConfig = { sysModel: device.sysModel, sysMac: device.sysMac }
  localStorage.setItem('device-config', JSON.stringify(next))
}

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
 * - sysModel 为平台名字符串（"MAC"/"WINDOWS"），不是设备指纹！服务端靠它区分同账号 PC 端并踢下线
 * - 常规 protobuf clientInfo 里不带 version；header/domain JSON 场景单独补 version
 * - plat 固定 WIN=4（老 im 硬编码 4）
 *
 * 注意：Tauri WebView 的 userAgent 不一定带 Macintosh，仅靠 UA 会在 Mac 上误报 WINDOWS，
 * 导致登录重构包时踢的是 Windows 旧包、Mac 旧包仍在线。优先用原生平台缓存。
 */
export function getPlatformSysModel(): string {
  const cached = String((window as any).__OCS_RUNTIME_PLATFORM__ || '')
    .trim()
    .toLowerCase()
  if (cached === 'macos' || cached === 'darwin' || cached === 'mac') return 'MAC'
  if (cached === 'windows' || cached === 'win32' || cached === 'win') return 'WINDOWS'

  const platform = String(navigator.platform || '').toLowerCase()
  const ua = String(navigator.userAgent || '').toLowerCase()
  const haystack = `${platform} ${ua}`
  if (
    haystack.includes('mac')
    || haystack.includes('darwin')
    || platform === 'macintel'
    || platform === 'macppc'
    || platform === 'mac68k'
  ) {
    return 'MAC'
  }
  return 'WINDOWS'
}

export function getHeaderClientVersion(appVer: number): string {
  const versionName = String(import.meta.env.VITE_APP_VERSION_NAME || '').trim()
  if (versionName) return versionName
  return formatAppVerAsVersionName(appVer)
}

/** 把 171 / 172 这类 appVer 还原成 1.7.1 / 1.7.2，对齐旧 ocs fnClientInfoGet。 */
export function formatAppVerAsVersionName(appVer: number | string): string {
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
  versionName?: string,
) {
  const device = getDeviceConfig()
  // OpenChat 可能仍用旧包登记的 appVer（如 171），version 必须与之对应，不能硬套当前 1.7.2。
  const version =
    versionName
    || (Number(appVer) === Number(API_CONFIG.appVer)
      ? getHeaderClientVersion(appVer)
      : formatAppVerAsVersionName(appVer))
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
  versionName?: string
  includeMetaHeaders?: boolean
}): Record<string, string> {
  const packageCode = options?.packageCode ?? API_CONFIG.packageCode
  const appVer = options?.appVer ?? API_CONFIG.appVer
  const client = getSignClientInfo(
    options?.withSessionId ?? true,
    packageCode,
    appVer,
    options?.versionName,
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
 * OpenChat（频道网关）签名，严格对齐旧 ocs `getSignHeader` / `fnClientInfoGet`：
 * - 只发 X-one / X-ten / X-ten-origin（不附带 X-App-Version 等元数据头）
 * - packageCode 按品牌（45=4520 / 55=5520 / 97=7100）
 * - appVer 使用 openChatAppVer（默认 171，与 1.7.1 密钥登记一致；不能盲目跟 1.7.2 的 172）
 * - version 对齐 ocs：`${version} ${buildTime}`，buildTime 空时仍带尾部空格（如 `"1.7.1 "`）
 */
export function getOpenChatSignedApiHeaders(options?: {
  withSessionId?: boolean
}): Record<string, string> {
  const appVer = API_CONFIG.openChatAppVer ?? 171
  return getSignedApiHeaders({
    withSessionId: options?.withSessionId,
    packageCode: API_CONFIG.openChatPackageCode,
    appVer,
    versionName: `${formatAppVerAsVersionName(appVer)} `,
    includeMetaHeaders: false,
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
