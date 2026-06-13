import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { API_CONFIG } from '@/api/config'
import { getFirstNormalDomain } from '@/utils/domainPool'

type NativeImageState = 'ready' | 'downloadError' | 'decryptError'

type ResolveNativeImageResponse = {
  state: NativeImageState
  localPath?: string | null
  mime?: string | null
  fromCache: boolean
  errorCode?: string | null
}

type ResolveNativeAvatarOptions = {
  id?: string | number | null
  type?: string | null
  src: string
  encryptKey?: string
}

const REMOTE_URL_RE = /^https?:\/\//i

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)
}

export function canUseNativeImageAvatar(src: unknown): boolean {
  const raw = String(src || '').trim()
  // 只让桌面端远程头像进入 NativeImage；Web 端继续走浏览器原生加载，避免调用不存在的 Tauri command。
  return isTauriRuntime() && REMOTE_URL_RE.test(raw) && !raw.includes('default')
}

function stripUrlQuery(url: string): string {
  const index = url.indexOf('?')
  return index >= 0 ? url.slice(0, index) : url
}

function stableHash(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) - h) + input.charCodeAt(i)
    h |= 0
  }
  return `${(h >>> 0).toString(36)}-${Math.min(input.length, 9999).toString(36)}`
}

function normalizeHttpBase(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(REMOTE_URL_RE.test(raw) ? raw : `https://${raw}`)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return ''
  }
}

function rewriteToOssDefault(originalUrl: string): string {
  const ossBase = normalizeHttpBase(getFirstNormalDomain('ossDefaultUrl') || '')
  if (!ossBase) return ''
  try {
    const original = new URL(originalUrl)
    const oss = new URL(ossBase)
    if (original.host === oss.host) return ''
    // 对齐旧 NativeImage：只替换 OSS host，保留原始 path/query，避免破坏服务端签名参数。
    original.protocol = oss.protocol
    original.host = oss.host
    return original.toString()
  } catch {
    return ''
  }
}

function buildCandidateUrls(src: string): string[] {
  // 候选顺序对齐旧 im：先试原地址，再试 ossDefaultUrl 替换 host 后的地址。
  const candidates = [src]
  const rewritten = rewriteToOssDefault(src)
  if (rewritten && rewritten !== src) candidates.push(rewritten)
  return candidates
}

export function buildNativeAvatarResourceKey(src: string): string {
  // OSS 签名会轮换；resourceKey 去掉 query 后保持稳定，避免同一头像重复下载。
  const normalized = stripUrlQuery(String(src || '').trim())
  return stableHash(normalized) || normalized
}

export async function resolveNativeAvatarSrc(options: ResolveNativeAvatarOptions): Promise<string | null> {
  const src = String(options.src || '').trim()
  if (!canUseNativeImageAvatar(src)) return null

  // 解析命令返回磁盘路径，展示层再转成 Tauri asset URL，保证 mac/Windows 路径规则由 Tauri 处理。
  const response = await invoke<ResolveNativeImageResponse>('resolve_native_image', {
    request: {
      scopeKind: 'avatar',
      scopeId: String(options.id ?? ''),
      sub: String(options.type || 'friend'),
      resourceKey: buildNativeAvatarResourceKey(src),
      url: src,
      candidateUrls: buildCandidateUrls(src),
      encryptKey: options.encryptKey ?? API_CONFIG.headAesKey,
    },
  })

  if (response.state !== 'ready' || !response.localPath) return null
  return convertFileSrc(response.localPath)
}
