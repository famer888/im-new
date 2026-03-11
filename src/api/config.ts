function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

const RAW_BASE_URL = import.meta.env.VITE_APP_BASE_API || 'https://test-webbiz.68chat.co'
const RAW_DOMAIN_URL = import.meta.env.VITE_APP_BASE_DOMAIN || 'http://test-domain-api.68chat.co'

export const API_CONFIG = {
  rawBaseUrl: RAW_BASE_URL,
  aesKey: import.meta.env.VITE_APP_AES_KEY || '1234567890123456',
  headAesKey: import.meta.env.VITE_APP_HEAD_AES_KEY || 'f58c15f54e8f7826',
  secretName: import.meta.env.VITE_APP_SECRET_NAME || '158d1eaa13de7f141eaa6241fd40d5b2',
  secretKey: import.meta.env.VITE_APP_SECRET_KEY || '74ec5eb2c5f86c04',
  rawDomainUrl: RAW_DOMAIN_URL,
  env: import.meta.env.VITE_APP_ENV || 'test',
}

let dynamicBaseUrl = ''

/**
 * In browser dev mode, use Vite proxy (/api) to avoid CORS.
 * In Tauri app, call the real URL directly (no CORS restriction).
 */
export function getBaseUrl(): string {
  if (dynamicBaseUrl) {
    return isTauri() ? dynamicBaseUrl : '/api'
  }
  return isTauri() ? RAW_BASE_URL : '/api'
}

export function getDomainUrl(): string {
  return isTauri() ? RAW_DOMAIN_URL : '/domain-api'
}

export function setBaseUrl(url: string) {
  dynamicBaseUrl = url
}

export function getRawBaseUrl(): string {
  return dynamicBaseUrl || RAW_BASE_URL
}
