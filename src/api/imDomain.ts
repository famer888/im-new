/**
 * Domain distribution API — aligned with old im's:
 *   - getClientToken (protobuf) → /domain/clientToken
 *   - getDomainListApi (JSON + AES-hex) → /api/v4/listDomain
 */
import CryptoJS from 'crypto-js'
import {
  requestProto,
  proto,
  getDeviceConfig,
  getClientInfo,
  getHeaderClientVersion,
  getPlatformSysModel,
} from './request'
import { getDomainUrl, getBaseUrl, getRawBaseUrl, API_CONFIG, isLoginOnlyBaseUrl } from './config'
import { getAllDomains, getOrderedDomainUrls, markDomainError } from '@/utils/domainPool'
import { requestViaTauriOrFetch } from '@/utils/tauriHttp'

/* ------------------------------------------------------------------ */
/*  AES-128-ECB hex encrypt / decrypt  (mirrors old im's encryptHex / decryptHex)  */
/* ------------------------------------------------------------------ */

function encryptHex(plainJson: string, key: string): string {
  const keyHex = CryptoJS.enc.Utf8.parse(key)
  const encrypted = CryptoJS.AES.encrypt(plainJson, keyHex, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return base64ToHex(encrypted.toString())
}

function decryptHex(hexStr: string, key: string): string {
  const keyHex = CryptoJS.enc.Utf8.parse(key)
  const decrypted = CryptoJS.AES.decrypt(hexToBase64(hexStr), keyHex, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return decrypted.toString(CryptoJS.enc.Utf8)
}

function base64ToHex(b64: string): string {
  const bin = atob(b64)
  let hex = ''
  for (let i = 0; i < bin.length; i++) {
    const byte = bin.charCodeAt(i)
    hex += (byte >> 4).toString(16)
    hex += (byte & 0x0f).toString(16)
  }
  return hex.toLowerCase()
}

function hexToBase64(hex: string): string {
  const bytes = hex.match(/.{1,2}/g) || []
  let bin = ''
  bytes.forEach(b => {
    bin += String.fromCharCode(parseInt(b, 16))
  })
  return btoa(bin)
}

/* ------------------------------------------------------------------ */
/*  MD5 sign generation  (mirrors old im's generateSign)              */
/* ------------------------------------------------------------------ */

function generateSign(data: Record<string, unknown>, appSecret: string): string {
  let unsigned = ''
  for (const key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue
    const val = data[key]
    if (val == null || String(val) === '') continue
    unsigned += `&${key}=${val}`
  }
  if (unsigned.length) unsigned = unsigned.substring(1)
  unsigned += '&key=' + appSecret
  return CryptoJS.MD5(unsigned).toString(CryptoJS.enc.Hex).toUpperCase()
}

function sortObjectByKeys<T extends Record<string, unknown>>(data: T): T {
  return Object.keys(data)
    .sort()
    .reduce((acc, key) => {
      acc[key] = data[key]
      return acc
    }, {} as Record<string, unknown>) as T
}

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

function isDesktopLocalDevOrigin(): boolean {
  if (typeof window === 'undefined') return false
  const host = String(window.location.hostname || '').toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
}

function normalizeDeviceOsName(value: string): string {
  const text = String(value || '').trim().toLowerCase()
  if (text === 'macos' || text === 'darwin' || text.includes('mac')) return 'MAC'
  if (text.includes('win')) return 'WINDOWS'
  if (text.includes('linux')) return 'LINUX'
  return text.toUpperCase() || getPlatformSysModel()
}

function getUserAgentOsVersion(): string {
  const ua = navigator.userAgent || ''
  const mac = ua.match(/Mac OS X ([\d_]+)/i)?.[1]
  if (mac) return mac.replace(/_/g, '.')
  const win = ua.match(/Windows NT ([\d.]+)/i)?.[1]
  if (win) return win
  return ''
}

async function getDomainReportDeviceType(): Promise<string> {
  const uaVersion = getUserAgentOsVersion()
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const info = await invoke<{ os?: string; arch?: string }>('get_platform_info')
      const parts = [
        normalizeDeviceOsName(info?.os || getPlatformSysModel()),
        uaVersion,
        String(info?.arch || '').trim(),
      ].filter(Boolean)
      return parts.join('-')
    } catch {
      // 平台信息读取失败时仍避免回退成泛化的 pc，保留浏览器能判断到的系统信息。
    }
  }

  return [getPlatformSysModel(), uaVersion].filter(Boolean).join('-') || getPlatformSysModel()
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(String(value || '').trim(), window.location.origin)
  } catch {
    return null
  }
}

function normalizeHttpBaseUrl(value: string): string {
  if (!String(value || '').trim()) return ''
  const parsed = parseUrl(value)
  if (!parsed) return ''
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
  return `${parsed.protocol}//${parsed.host}`
}

function isObjectStorageBaseUrl(value: string): boolean {
  try {
    const host = new URL(value).host.toLowerCase()
    return host === 'storage.googleapis.com' || host.includes('.oss-') || host.includes('.oss.')
  } catch {
    return false
  }
}

function normalizeDomainModuleCode(moduleCode: string): string {
  const normalized = String(moduleCode || '').trim()
  if (normalized === 'biz') return 'webBiz'
  if (normalized === 'config' || normalized === 'domainConfig') return 'domain'
  return normalized
}

function getDomainApiCandidates(): string[] {
  // 对齐老 im 桌面开发体验：本地调试时统一走 Vite 代理，避免 WebView 对真实域名请求触发 CORS 报错。
  if (isDesktopLocalDevOrigin()) return ['/domain-api']
  if (!isTauri()) return [getDomainUrl()]
  const normal = getOrderedDomainUrls('domain', { includeError: false })
  const error = getAllDomains('domain')
    .filter(item => item.status === 'error')
    .map(item => item.domain)
  return [
    ...new Set([
      ...normal,
      API_CONFIG.rawDomainUrl,
      ...error,
    ]
      .map(normalizeHttpBaseUrl)
      // OSS 只用于读取引导文件，不能当 domain API 去拼 /api/v4/listDomain。
      .filter(base => base && !isObjectStorageBaseUrl(base))),
  ]
}

function getClientTokenCandidates(preferredBase?: string): string[] {
  // 本地开发态下 clientToken 也固定走 /api 代理，避免轮询备用域名时刷屏 CORS 错误。
  if (isDesktopLocalDevOrigin()) return [getBaseUrl()]
  if (!isTauri()) return [preferredBase || getBaseUrl()]

  const preferred = normalizeHttpBaseUrl(preferredBase || '')
  const normalBizDomains = getAllDomains('webBiz')
    .filter(item => item.status !== 'error')
    .map(item => item.domain)
    .filter(domain => !isLoginOnlyBaseUrl(domain))
  const errorBizDomains = getAllDomains('webBiz')
    .filter(item => item.status === 'error')
    .map(item => item.domain)
    .filter(domain => !isLoginOnlyBaseUrl(domain))
  const normalLoginDomains = getAllDomains('login_v2')
    .filter(item => item.status !== 'error')
    .map(item => item.domain)
  const errorLoginDomains = getAllDomains('login_v2')
    .filter(item => item.status === 'error')
    .map(item => item.domain)

  return [
    ...new Set([
      preferred,
      normalizeHttpBaseUrl(getRawBaseUrl()),
      // 对齐老 im：business 域名已失效时，允许先借登录备用域名拿 clientToken/listDomain，
      // 再把真正的 webBiz 域名池补齐，避免桌面端永远卡在首个业务域名。
      ...normalBizDomains.map(normalizeHttpBaseUrl),
      ...normalLoginDomains.map(normalizeHttpBaseUrl),
      ...errorBizDomains.map(normalizeHttpBaseUrl),
      ...errorLoginDomains.map(normalizeHttpBaseUrl),
    ].filter(Boolean)),
  ]
}

/* ------------------------------------------------------------------ */
/*  Client token cache                                                 */
/* ------------------------------------------------------------------ */

interface ClientTokenData {
  accessToken: string
  secretKey: string
  mchId: number
  expirationMillis: number
}

let tokenCache: ClientTokenData | null = null

function buildDomainTokenClientInfo(): proto.IClientInfo {
  const device = getDeviceConfig()
  return {
    ...getClientInfo(true),
    sysMac: device.sysMac,
    sysModel: 'PC',
  }
}

function buildDomainJsonClientReq() {
  return {
    sessionId: buildDomainTokenClientInfo().sessionId || '',
    appVer: String(API_CONFIG.appVer),
    version: getHeaderClientVersion(API_CONFIG.appVer),
    packageCode: API_CONFIG.packageCode,
    language: API_CONFIG.language,
    plat: API_CONFIG.plat,
    sysModel: getPlatformSysModel(),
  }
}

async function fetchClientToken(domainBase?: string): Promise<ClientTokenData> {
  let lastError: unknown = new Error('clientToken accessToken empty')

  for (const base of getClientTokenCandidates(domainBase)) {
    try {
      const res = await requestProto({
        url: `${base}/domain/clientToken`,
        reqType: proto.ClientTokenReq,
        respType: proto.ClientTokenResp,
        withSessionId: true,
        includeMetaHeaders: false,
        clientInfo: buildDomainTokenClientInfo(),
      })
      const data: ClientTokenData = {
        accessToken: res.accessToken || '',
        secretKey: res.secretKey || '',
        mchId: Number(res.mchId) || 0,
        expirationMillis: Number(res.expirationMillis) || 0,
      }
      if (!data.accessToken) {
        throw new Error('clientToken accessToken empty')
      }
      tokenCache = data
      return data
    } catch (error) {
      lastError = error
      if (isTauri()) {
        void markDomainError(isLoginOnlyBaseUrl(base) ? 'login_v2' : 'webBiz', base)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function getClientTokenData(): Promise<ClientTokenData> {
  if (tokenCache && tokenCache.expirationMillis > Date.now()) {
    return tokenCache
  }
  return fetchClientToken()
}

/* ------------------------------------------------------------------ */
/*  Domain list API  (JSON + AES-hex, mirrors old im's postAxios)      */
/* ------------------------------------------------------------------ */

export interface DomainDto {
  domainUrl: string
  moduleCode: string
  priority?: number
}

async function requestDomainApiJson(
  path: string,
  payload: { secretKey: string; datas: Record<string, unknown>; headers: Record<string, string> },
): Promise<any> {
  const body = {
    clientReq: buildDomainJsonClientReq(),
    data: encryptHex(JSON.stringify(payload.datas), payload.secretKey),
  }
  let lastError: unknown = new Error(`domain api ${path} failed`)

  for (const domainApiBase of getDomainApiCandidates()) {
    try {
      const resp = await requestViaTauriOrFetch({
        url: `${domainApiBase}${path}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accessToken: payload.headers.accessToken,
        },
        body: JSON.stringify(body),
        // 对齐 F05：domain API 在桌面端统一走主进程代发，避免 WebView CORS/预检差异。
        purpose: 'domain_api',
      })
      if (!resp.ok) {
        throw new Error(resp.error || `HTTP ${resp.status}`)
      }
      let json: any
      try {
        json = JSON.parse(resp.body || '{}')
      } catch {
        throw new Error('domain api invalid json response')
      }
      if (json?.code !== 200) {
        throw new Error(json?.msg || json?.message || `domain api ${path} code ${json?.code ?? 'unknown'}`)
      }
      return json
    } catch (error) {
      lastError = error
      if (isTauri()) {
        void markDomainError('domain', domainApiBase)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function callDomainListApi(
  payload: { secretKey: string; datas: Record<string, unknown>; headers: Record<string, string> },
): Promise<{ domainDtoList?: DomainDto[] }> {
  const json = await requestDomainApiJson('/api/v4/listDomain', payload)
  if (payload.secretKey && json.data) {
    const decrypted = decryptHex(json.data, payload.secretKey)
    return JSON.parse(decrypted)
  }
  return json.data || {}
}

async function callDomainReportApi(
  payload: { secretKey: string; datas: Record<string, unknown>; headers: Record<string, string> },
): Promise<void> {
  await requestDomainApiJson('/api/v4/report', payload)
}

/* ------------------------------------------------------------------ */
/*  Public: getDynamicDomainList                                       */
/* ------------------------------------------------------------------ */

export async function getDynamicDomainSnapshot(moduleCode = ''): Promise<DomainDto[]> {
  try {
    const { mchId, secretKey, accessToken } = await getClientTokenData()

    const reqTime = String(Date.now())
    const listDomainReq: Record<string, unknown> = {
      mchId,
      reqTime,
      sign: '',
      moduleCode,
      deviceIp: '',
      deviceNo: '',
    }
    listDomainReq.sign = generateSign(listDomainReq, secretKey)

    const res = await callDomainListApi({
      secretKey,
      datas: listDomainReq,
      headers: { accessToken },
    })

    return [...new Set(
      (res?.domainDtoList || [])
        .map(item => ({
          ...item,
          moduleCode: normalizeDomainModuleCode(item.moduleCode),
          domainUrl: String(item.domainUrl || '').trim(),
        }))
        .filter(item => item.domainUrl)
        .sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity))
        .map(item => JSON.stringify(item)),
    )].map(item => JSON.parse(item) as DomainDto)
  } catch (err) {
    console.error('[imDomain] getDynamicDomainSnapshot failed:', err)
    return []
  }
}

export async function getDynamicDomainList(moduleCode = 'webBiz'): Promise<string[]> {
  const normalizedModuleCode = normalizeDomainModuleCode(moduleCode)
  const domainDtoList = await getDynamicDomainSnapshot(moduleCode)
  return [
    ...new Set(
      domainDtoList
        .filter(item => !normalizedModuleCode || item.moduleCode === normalizedModuleCode)
        .map(item => item.domainUrl),
    ),
  ]
}

export async function getListDomainDiagnostic(moduleCode = ''): Promise<{
  success: boolean
  source: string
  message: string
  total: number | null
  webSessionCount: number | null
  domainDtoList?: DomainDto[]
}> {
  try {
    const { mchId, secretKey, accessToken } = await getClientTokenData()
    const reqTime = String(Date.now())
    const listDomainReq: Record<string, unknown> = {
      mchId,
      reqTime,
      sign: '',
      moduleCode,
      deviceIp: '',
      deviceNo: '',
    }
    listDomainReq.sign = generateSign(listDomainReq, secretKey)
    const res = await callDomainListApi({
      secretKey,
      datas: listDomainReq,
      headers: { accessToken },
    })
    const domainDtoList = Array.isArray(res?.domainDtoList) ? res.domainDtoList : []
    // 对齐老 im 诊断：网络诊断里展示的 listDomain 打点来自真实 POST /api/v4/listDomain 请求。
    return {
      success: true,
      source: 'imDomain.getDomainListApi',
      message: 'ok',
      total: domainDtoList.length,
      webSessionCount: domainDtoList.filter(item => item.moduleCode === 'webSession').length,
      domainDtoList,
    }
  } catch (err) {
    return {
      success: false,
      source: 'imDomain.getDomainListApi',
      message: err instanceof Error ? err.message : String(err),
      total: null,
      webSessionCount: null,
    }
  }
}

/**
 * Collect all available domain URLs for a module.
 * 1. Dynamic API domains
 * 2. Fallback to raw base URL
 */
export async function collectAllDomainUrls(moduleCode = 'webBiz'): Promise<string[]> {
  const urls: string[] = []

  const cachedDomains = getAllDomains(moduleCode).map(item => item.domain).filter(Boolean)
  urls.push(...cachedDomains)

  const dynamicDomains = await getDynamicDomainList(moduleCode)
  urls.push(...dynamicDomains)

  // 只对 webBiz 保留 baseUrl 兜底；webSession/ossEndpoint 回退到 webbiz 会导致协议错位。
  if (moduleCode === 'webBiz') {
    const base = getRawBaseUrl()
    if (base && !urls.includes(base)) {
      urls.push(base)
    }
  }

  return [...new Set(urls)]
}

export async function reportErrorDomain(options: {
  domainUrl: string
  errorPath?: string
  errorDesc?: string
  httpStatus?: number
  moduleCode?: string
}): Promise<void> {
  const domainUrl = String(options.domainUrl || '').trim()
  if (!domainUrl) return
  const httpStatus = Number(options.httpStatus || 0)
  if ([429, 403, 502, 504].includes(httpStatus)) return

  try {
    const { mchId, secretKey, accessToken } = await getClientTokenData()
    const reqTime = Date.now()
    const deviceType = await getDomainReportDeviceType()
    let reportReq: Record<string, unknown> = {
      deviceIp: '',
      deviceNo: '',
      deviceType,
      domainSource: 0,
      domainUrl,
      errorDesc: String(options.errorDesc || ''),
      errorType: 0,
      errorPath: String(options.errorPath || domainUrl),
      httpStatus,
      mchId,
      moduleCode: options.moduleCode || 'ossEndpoint',
      reqTime,
      responseType: 0,
      sign: '',
    }
    reportReq = sortObjectByKeys(reportReq)
    reportReq.sign = generateSign(reportReq, secretKey)
    // 对齐老 im：上传探活/上传失败的动态 OSS 域名上报到 domain/report，让服务端域名池轮换剔除。
    await callDomainReportApi({
      secretKey,
      datas: reportReq,
      headers: { accessToken },
    })
  } catch (err) {
    console.warn('[imDomain] reportErrorDomain failed:', err)
  }
}
