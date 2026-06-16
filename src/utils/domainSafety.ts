function parseDomainHost(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw).host.toLowerCase()
  } catch {
    try {
      return new URL(`https://${raw}`).host.toLowerCase()
    } catch {
      return raw.toLowerCase()
    }
  }
}

function parseUrlPath(value: string): string {
  try {
    return new URL(String(value || '').trim()).pathname.toLowerCase()
  } catch {
    return ''
  }
}

export function isSuspiciousProdDomainHost(value: string): boolean {
  const host = parseDomainHost(value)
  if (!host) return true
  // 生产包只拦明显不该出现的占位/本地域名，避免坏缓存或脏域名池把请求导到无效 host。
  return host.includes('htbalabala')
    || host === 'localhost'
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host.endsWith('.local')
}

export function isProdSafeDomain(value: string): boolean {
  const host = parseDomainHost(value)
  if (!host) return false
  if (/(^|[.-])(test|stage|dev|uat|sit)[.-]/i.test(host)) return false
  return !isSuspiciousProdDomainHost(host)
}

export function isRemoteDefaultGroupIcon(value: string): boolean {
  const path = parseUrlPath(value)
  // 群默认头像本地已有稳定资源；服务端若回传远程 default_group_icon，直接走本地兜底即可。
  return path.endsWith('/config/default_group_icon.png')
}
