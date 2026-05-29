import { getAllDomains, getFirstNormalDomain } from '@/utils/domainPool'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

function isDesktopLocalDevOrigin(): boolean {
  if (typeof window === 'undefined') return false
  const host = String(window.location.hostname || '').toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
}

function isWindowsRuntime(): boolean {
  if (typeof window === 'undefined') return false
  const ua = String(window.navigator?.userAgent || '').toLowerCase()
  return ua.includes('windows')
}

function shouldUseViteDevProxy(): boolean {
  // 只在 Vite 开发模式启用相对代理路径，避免打包环境误走 `/api` 导致主进程 URL 解析失败。
  return !!import.meta.env.DEV && isDesktopLocalDevOrigin()
}

function getDomainPoolFirstNormalDomain(): string {
  if (!isTauri()) return ''
  try {
    // 桌面端优先使用实时 domain 池；网页开发态仍走 Vite proxy，避免跨域。
    return String(getFirstNormalDomain('domain') || '').trim()
  } catch {
    return ''
  }
}

const RAW_BASE_URL = import.meta.env.VITE_APP_BASE_API || 'https://test-webbiz.68chat.co'
const RAW_DOMAIN_URL = import.meta.env.VITE_APP_BASE_DOMAIN || 'https://test-domain-api.68chat.co'
const RAW_OPEN_CHAT_DOMAIN = import.meta.env.VITE_APP_OPEN_CHAT_DOMAIN || 'https://test-gateway.68chat.co'
const API_BASE_URL_KEY = 'api-base-url'
const LOGIN_ONLY_BASE_HOSTS = new Set([
  'a1.uuds.xyz',
  'blo.yimengwh.xyz',
  'openchat-loginv2.evanth.xyz',
])

function normalizeBrandId(input?: string): '45' | '55' | '97' {
  const value = String(input || '').trim()
  if (value === '45' || value === '55' || value === '97') return value
  return '97'
}

export function getBrandDisplayName(input?: string): string {
  return `OCS Chat ${normalizeBrandId(input)}`
}

const BRAND_ID = normalizeBrandId(import.meta.env.VITE_APP_BRAND_ID || import.meta.env.VITE_APP_PACKNAME)
const BRAND_DISPLAY_NAME = getBrandDisplayName(BRAND_ID)
const OFFICIAL_URL = String(import.meta.env.VITE_APP_OFFICIAL_URL || `${BRAND_ID}chat.com`).trim()

/** 对齐老 im 55.1.7.0：请求签名与 clientInfo 默认 packageCode 为 5520 */
export const OPEN_CHAT_PACKAGE_CODE = 5520

function parseOpenChatAppVer(): number | undefined {
  const raw = String(import.meta.env.VITE_APP_OPEN_CHAT_APP_VER || '').trim()
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

export const API_CONFIG = {
  rawBaseUrl: RAW_BASE_URL,
  aesKey: import.meta.env.VITE_APP_AES_KEY || '1234567890123456',
  headAesKey: import.meta.env.VITE_APP_HEAD_AES_KEY || 'f58c15f54e8f7826',
  secretName: import.meta.env.VITE_APP_SECRET_NAME || 'eb2c844e110be53a0b008a9766877aea',
  secretKey: import.meta.env.VITE_APP_SECRET_KEY || '1004969fe92844eb',
  appVer: Number(import.meta.env.VITE_APP_VERSION_CODE || 168),
  /** 频道网关单独 appVer，须与 SECRET_* 在服务端登记一致；未配置则与 appVer 相同 */
  openChatAppVer: parseOpenChatAppVer(),
  /** 对齐旧 im：默认 packageCode 为 5520，避免登录态与频道网关按不同包号签名。 */
  packageCode: Number(import.meta.env.VITE_APP_PACKAGE_CODE || OPEN_CHAT_PACKAGE_CODE),
  openChatPackageCode: OPEN_CHAT_PACKAGE_CODE,
  language: Number(import.meta.env.VITE_APP_LANGUAGE || 2),
  plat: Number(import.meta.env.VITE_APP_PLATFORM || 4),
  rawDomainUrl: RAW_DOMAIN_URL,
  rawOpenChatDomain: RAW_OPEN_CHAT_DOMAIN,
  env: import.meta.env.VITE_APP_ENV || 'test',
  brandId: BRAND_ID,
  brandDisplayName: BRAND_DISPLAY_NAME,
  officialUrl: OFFICIAL_URL,
}

function getStoredBaseUrl(): string {
  try {
    const stored = normalizeHttpBaseUrl(localStorage.getItem(API_BASE_URL_KEY) || '')
    if (isLoginOnlyBaseUrl(stored)) {
      localStorage.removeItem(API_BASE_URL_KEY)
      return ''
    }
    return stored
  } catch {
    return ''
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

export function isLoginOnlyBaseUrl(value: string): boolean {
  try {
    const host = new URL(String(value || '').trim()).host.toLowerCase()
    // openchat-loginv2 是登录域名族，不能持久化成登录后的业务 baseUrl。
    return LOGIN_ONLY_BASE_HOSTS.has(host) || host.startsWith('openchat-loginv2.')
  } catch {
    return false
  }
}

let dynamicBaseUrl = getStoredBaseUrl()

function getFirstNormalWebBizBaseUrl(): string {
  const normal = getAllDomains('webBiz')
    .find(item => item.status !== 'error' && !isLoginOnlyBaseUrl(item.domain))
    ?.domain
  if (normal) return normalizeHttpBaseUrl(normal)

  const fallback = getAllDomains('webBiz')
    .find(item => !isLoginOnlyBaseUrl(item.domain))
    ?.domain
  return normalizeHttpBaseUrl(fallback || '')
}

function isMarkedErrorWebBizBaseUrl(value: string): boolean {
  const normalized = normalizeHttpBaseUrl(value)
  if (!normalized) return false
  return getAllDomains('webBiz')
    .some(item => normalizeHttpBaseUrl(item.domain) === normalized && item.status === 'error')
}

function isUsableWebBizBaseUrl(value: string): boolean {
  const normalized = normalizeHttpBaseUrl(value)
  if (!normalized || isLoginOnlyBaseUrl(normalized)) return false
  return !isMarkedErrorWebBizBaseUrl(normalized)
}

function persistDynamicBaseUrl(value: string) {
  const normalized = normalizeHttpBaseUrl(value)
  dynamicBaseUrl = isLoginOnlyBaseUrl(normalized) ? '' : normalized
  try {
    if (dynamicBaseUrl) {
      localStorage.setItem(API_BASE_URL_KEY, dynamicBaseUrl)
    } else {
      localStorage.removeItem(API_BASE_URL_KEY)
    }
  } catch {
    // ignore storage failures
  }
}

function resolveActiveWebBizBaseUrl(options?: { preferPool?: boolean }): string {
  const current = normalizeHttpBaseUrl(dynamicBaseUrl)
  const stored = getStoredBaseUrl()
  const poolBase = getFirstNormalWebBizBaseUrl()
  const rawBase = normalizeHttpBaseUrl(RAW_BASE_URL) || RAW_BASE_URL

  // 对齐本地开发体验：test 打包包优先固定到 VITE_APP_BASE_API，避免被域名池切到异常测试域名导致行为不一致。
  if (isTauri() && API_CONFIG.env === 'test' && !options?.preferPool) {
    return rawBase
  }

  // UAT Windows 打包端先固定主域名，避免命中异常动态 webBiz 域名导致 /sys/getKeyPair 487 连锁失败。
  if (isTauri() && API_CONFIG.env === 'uat' && isWindowsRuntime() && !options?.preferPool) {
    return rawBase
  }

  if (options?.preferPool && poolBase) return poolBase
  if (isUsableWebBizBaseUrl(current)) return current
  if (isUsableWebBizBaseUrl(stored)) return stored
  if (poolBase) return poolBase
  return rawBase
}

export function syncBaseUrlWithDomainPool(options?: { preferPool?: boolean }): string {
  const resolved = resolveActiveWebBizBaseUrl(options)
  persistDynamicBaseUrl(resolved)
  return resolved
}

/**
 * In browser dev mode, use Vite proxy (/api) to avoid CORS.
 * In Tauri app, call the real URL directly (no CORS restriction).
 */
export function getBaseUrl(): string {
  // 对齐老 im：桌面开发态也要避免渲染进程跨域，统一走本地 dev proxy。
  if (shouldUseViteDevProxy()) return '/api'
  const resolved = syncBaseUrlWithDomainPool()
  return isTauri() ? resolved : '/api'
}

export function getDomainUrl(): string {
  // 开发态与 getBaseUrl 保持一致，避免 domain-api 也触发 CORS。
  if (shouldUseViteDevProxy()) return '/domain-api'
  if (!isTauri()) return '/domain-api'
  return getDomainPoolFirstNormalDomain() || RAW_DOMAIN_URL
}

export function setBaseUrl(url: string) {
  persistDynamicBaseUrl(url)
}

export function getRawBaseUrl(): string {
  return normalizeHttpBaseUrl(dynamicBaseUrl || getStoredBaseUrl() || RAW_BASE_URL) || RAW_BASE_URL
}

export function getOpenChatBaseUrl(): string {
  // 频道网关在桌面开发态也通过 Vite 代理，避免 localhost 源被网关拦截。
  if (shouldUseViteDevProxy()) return '/open-chat-api'
  return isTauri() ? RAW_OPEN_CHAT_DOMAIN : '/open-chat-api'
}
