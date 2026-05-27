import { convertFileSrc } from '@tauri-apps/api/core'

const ASSET_LOCALHOST_RE = /^https?:\/\/asset\.localhost/i
const REMOTE_URL_RE = /^https?:\/\//i
const WINDOWS_ABS_RE = /^[A-Za-z]:[\\/]/

function decodePathValue(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}

function stripWindowsDrivePrefix(pathname: string): string {
  if (/^\/[A-Za-z]:\//.test(pathname)) return pathname.slice(1)
  return pathname
}

export function isRemoteUrl(input: unknown): boolean {
  const raw = String(input || '').trim()
  if (!raw) return false
  return REMOTE_URL_RE.test(raw) && !ASSET_LOCALHOST_RE.test(raw)
}

export function isLocalLikePath(input: unknown): boolean {
  const raw = String(input || '').trim()
  if (!raw) return false
  if (/^(blob|data|tauri):/i.test(raw)) return false
  if (/^asset:/i.test(raw) || ASSET_LOCALHOST_RE.test(raw)) return true
  if (/^file:/i.test(raw)) return true
  if (WINDOWS_ABS_RE.test(raw) || raw.startsWith('/')) return true
  if (raw.startsWith('\\\\')) return true
  return false
}

export function toFsPath(input: unknown): string {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (/^asset:/i.test(raw) || ASSET_LOCALHOST_RE.test(raw)) {
    try {
      const parsed = new URL(raw)
      const pathname = stripWindowsDrivePrefix(decodePathValue(parsed.pathname))
      return pathname
    } catch {
      return raw.replace(/^asset:\/\/[^/]+\/?/i, '')
    }
  }
  if (!/^file:/i.test(raw)) return raw
  try {
    const parsed = new URL(raw)
    const pathname = stripWindowsDrivePrefix(decodePathValue(parsed.pathname))
    return pathname
  } catch {
    return raw.replace(/^file:\/\/\/?/i, '')
  }
}

export function toDisplaySrc(input: unknown): string {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (/^(https?|asset|blob|data):/i.test(raw)) return raw

  // 对齐老 im：展示路径和磁盘路径分离，展示层统一从真实路径派生可渲染地址。
  if ((window as any).__TAURI_INTERNALS__ && isLocalLikePath(raw)) {
    return convertFileSrc(toFsPath(raw))
  }

  if (/^file:/i.test(raw)) return raw

  const normalized = toFsPath(raw).replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`
  }
  if (normalized.startsWith('/')) {
    return `file://${encodeURI(normalized)}`
  }
  return raw
}

export function normalizeOpenTarget(input: unknown): string {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  if (isLocalLikePath(raw)) return toFsPath(raw)
  if (isRemoteUrl(raw)) return raw
  return ''
}
