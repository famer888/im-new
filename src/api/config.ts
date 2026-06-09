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
  // 只在纯浏览器开发模式启用相对代理；Tauri 开发态也会走主进程代理，不能把 `/api` 交给 Rust。
  return !!import.meta.env.DEV && !isTauri() && isDesktopLocalDevOrigin()
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
const ENV_NAME = String(import.meta.env.VITE_APP_ENV || 'test').trim().toLowerCase() || 'test'

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
const LEGACY_API_BASE_URL_KEY = 'api-base-url'
const API_BASE_URL_KEY = `${LEGACY_API_BASE_URL_KEY}:${ENV_NAME}:${BRAND_ID}`

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
  env: ENV_NAME,
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
    if (stored) {
      if (isStoredBaseUrlCompatibleWithEnv(stored)) return stored
      localStorage.removeItem(API_BASE_URL_KEY)
      return ''
    }

    const legacyStored = normalizeHttpBaseUrl(localStorage.getItem(LEGACY_API_BASE_URL_KEY) || '')
    if (!legacyStored || isLoginOnlyBaseUrl(legacyStored)) return ''
    if (!isStoredBaseUrlCompatibleWithEnv(legacyStored)) {
      localStorage.removeItem(LEGACY_API_BASE_URL_KEY)
      return ''
    }

    // 对齐老 im 的 domains_${env} 语义：旧未分环境 key 只在确认属于当前环境时迁移，避免 test/prod 互相污染。
    localStorage.setItem(API_BASE_URL_KEY, legacyStored)
    localStorage.removeItem(LEGACY_API_BASE_URL_KEY)
    return legacyStored
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

function isStoredBaseUrlCompatibleWithEnv(value: string): boolean {
  try {
    const host = new URL(String(value || '').trim()).host.toLowerCase()
    if (ENV_NAME === 'prod' || ENV_NAME === 'production') {
      return !/(^|[.-])(test|stage|dev|uat|sit)[.-]/i.test(host)
    }
    return true
  } catch {
    return false
  }
}

// 登录域名不能作为业务 baseUrl 持久化；从当前环境 login_v2 池判断，避免 test 包写死线上 host。
export function isLoginOnlyBaseUrl(value: string): boolean {
  try {
    const host = new URL(String(value || '').trim()).host.toLowerCase()
    return host.startsWith('openchat-loginv2.')
      || getAllDomains('login_v2').some(item => {
        try {
          return new URL(String(item.domain || '').trim()).host.toLowerCase() === host
        } catch {
          return false
        }
      })
  } catch {
    return false
  }
}

let dynamicBaseUrl = getStoredBaseUrl()

function getFirstNormalWebBizBaseUrl(): string {
  const normal = getAllDomains('webBiz')
    .find(item => item.status !== 'error' && !isLoginOnlyBaseUrl(item.domain) && isStoredBaseUrlCompatibleWithEnv(item.domain))
    ?.domain
  if (normal) return normalizeHttpBaseUrl(normal)

  const fallback = getAllDomains('webBiz')
    .find(item => !isLoginOnlyBaseUrl(item.domain) && isStoredBaseUrlCompatibleWithEnv(item.domain))
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
  if (!isStoredBaseUrlCompatibleWithEnv(normalized)) return false
  return !isMarkedErrorWebBizBaseUrl(normalized)
}

function persistDynamicBaseUrl(value: string) {
  const normalized = normalizeHttpBaseUrl(value)
  dynamicBaseUrl = isLoginOnlyBaseUrl(normalized) || !isStoredBaseUrlCompatibleWithEnv(normalized) ? '' : normalized
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
  // 对齐老 im 桌面行为：Tauri 运行时使用真实域名，再由主进程代发；浏览器开发态才走 Vite proxy。
  if (shouldUseViteDevProxy()) return '/api'
  const resolved = syncBaseUrlWithDomainPool()
  return isTauri() ? resolved : '/api'
}

export function getDomainUrl(): string {
  // Domain API 同样只在浏览器开发态走相对代理，避免 Tauri 代理收到相对 URL。
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
  // 频道网关在 Tauri 中也走真实域名，浏览器开发态才使用 Vite proxy。
  if (shouldUseViteDevProxy()) return '/open-chat-api'
  return isTauri() ? RAW_OPEN_CHAT_DOMAIN : '/open-chat-api'
}
