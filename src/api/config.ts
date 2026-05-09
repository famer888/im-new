function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

const RAW_BASE_URL = import.meta.env.VITE_APP_BASE_API || 'https://test-webbiz.68chat.co'
const RAW_DOMAIN_URL = import.meta.env.VITE_APP_BASE_DOMAIN || 'https://test-domain-api.68chat.co'
const RAW_OPEN_CHAT_DOMAIN = import.meta.env.VITE_APP_OPEN_CHAT_DOMAIN || 'https://test-gateway.68chat.co'
const API_BASE_URL_KEY = 'api-base-url'

function normalizeBrandId(input?: string): '45' | '55' | '97' {
  const value = String(input || '').trim()
  if (value === '45' || value === '55' || value === '97') return value
  return '97'
}

const BRAND_ID = normalizeBrandId(import.meta.env.VITE_APP_BRAND_ID || import.meta.env.VITE_APP_PACKNAME)
const OFFICIAL_URL = String(import.meta.env.VITE_APP_OFFICIAL_URL || `${BRAND_ID}chat.com`).trim()

export const API_CONFIG = {
  rawBaseUrl: RAW_BASE_URL,
  aesKey: import.meta.env.VITE_APP_AES_KEY || '1234567890123456',
  headAesKey: import.meta.env.VITE_APP_HEAD_AES_KEY || 'f58c15f54e8f7826',
  secretName: import.meta.env.VITE_APP_SECRET_NAME || '158d1eaa13de7f141eaa6241fd40d5b2',
  secretKey: import.meta.env.VITE_APP_SECRET_KEY || '74ec5eb2c5f86c04',
  appVer: Number(import.meta.env.VITE_APP_VERSION_CODE || 167),
  packageCode: Number(import.meta.env.VITE_APP_PACKAGE_CODE || 7100),
  language: Number(import.meta.env.VITE_APP_LANGUAGE || 2),
  plat: Number(import.meta.env.VITE_APP_PLATFORM || 4),
  rawDomainUrl: RAW_DOMAIN_URL,
  rawOpenChatDomain: RAW_OPEN_CHAT_DOMAIN,
  env: import.meta.env.VITE_APP_ENV || 'test',
  brandId: BRAND_ID,
  officialUrl: OFFICIAL_URL,
}

function getStoredBaseUrl(): string {
  try {
    return localStorage.getItem(API_BASE_URL_KEY) || ''
  } catch {
    return ''
  }
}

let dynamicBaseUrl = getStoredBaseUrl()

/**
 * In browser dev mode, use Vite proxy (/api) to avoid CORS.
 * In Tauri app, call the real URL directly (no CORS restriction).
 */
export function getBaseUrl(): string {
  if (dynamicBaseUrl) {
    return isTauri() ? dynamicBaseUrl : '/api'
  }
  const stored = getStoredBaseUrl()
  if (stored) {
    dynamicBaseUrl = stored
    return isTauri() ? stored : '/api'
  }
  return isTauri() ? RAW_BASE_URL : '/api'
}

export function getDomainUrl(): string {
  return isTauri() ? RAW_DOMAIN_URL : '/domain-api'
}

export function setBaseUrl(url: string) {
  dynamicBaseUrl = String(url || '').trim()
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

export function getRawBaseUrl(): string {
  return dynamicBaseUrl || RAW_BASE_URL
}

export function getOpenChatBaseUrl(): string {
  return isTauri() ? RAW_OPEN_CHAT_DOMAIN : '/open-chat-api'
}
