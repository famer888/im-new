import { getOrderedDomainUrls } from '@/utils/domainPool'

export interface OssDownloadCandidateOptions {
  url: string
  channelType?: unknown
  fallbackChannelType?: number
}

const OSS_CHANNEL_MODULES: Record<number, string> = {
  0: 'ossDefaultUrl',
  1: 'ossChatUrl',
  2: 'ossLowRateUrl',
  9: 'ossEndpoint',
}

function normalizeHttpUrl(rawUrl: string): string {
  const url = String(rawUrl || '').trim()
  if (url.startsWith('//')) return `https:${url}`
  return url
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of urls) {
    const url = normalizeHttpUrl(raw)
    if (!url || seen.has(url)) continue
    seen.add(url)
    result.push(url)
  }
  return result
}

function isDirectOssUrl(url: string): boolean {
  return /\.aliyuncs\.com\//i.test(url)
}

function isNewBucketResource(url: string): boolean {
  return /\/v2\/chat\//i.test(url)
}

function resolveOssChannelType(raw: unknown, fallback = 1): number {
  if (typeof raw === 'string') {
    const value = raw.trim()
    if (/^OSS_DEFAULT$/i.test(value)) return 0
    if (/^OSS_CHAT$/i.test(value)) return 1
    if (/^OSS_LOW_RATE$/i.test(value)) return 2
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getOssModuleCode(channelType: number): string {
  return OSS_CHANNEL_MODULES[channelType] || OSS_CHANNEL_MODULES[0]
}

function normalizeDomainBase(domain: string): string {
  const raw = String(domain || '').trim()
  if (!raw) return ''
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withProtocol.replace(/\/+$/, '')
}

function getRemainingPath(url: string): string {
  const clean = normalizeHttpUrl(url).split('||')[0]
  try {
    const parsed = new URL(clean)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    const index = clean.indexOf('/chat/')
    return index >= 0 ? clean.slice(index) : ''
  }
}

function rewriteOssUrl(domain: string, originalUrl: string): string {
  const base = normalizeDomainBase(domain)
  const rest = getRemainingPath(originalUrl)
  if (!base || !rest) return ''
  return `${base}${rest.startsWith('/') ? rest : `/${rest}`}`
}

export function getOssDownloadCandidates(options: OssDownloadCandidateOptions): string[] {
  const originalUrl = normalizeHttpUrl(options.url)
  if (!/^https?:\/\//i.test(originalUrl)) return originalUrl ? [originalUrl] : []

  // 对齐旧 im：阿里云直连和新版 /v2/chat/ 资源不做域名替换，避免把新 bucket 地址改坏。
  if (isDirectOssUrl(originalUrl) || isNewBucketResource(originalUrl)) {
    return [originalUrl]
  }

  const channelType = resolveOssChannelType(options.channelType, options.fallbackChannelType ?? 1)
  const moduleCode = getOssModuleCode(channelType)
  const moduleCodes = moduleCode === 'ossDefaultUrl' ? [moduleCode] : [moduleCode, 'ossDefaultUrl']
  const domains = getOrderedDomainUrls(moduleCodes, { includeError: false })
  const rewritten = domains.map(domain => rewriteOssUrl(domain, originalUrl)).filter(Boolean)

  // 旧 im 首次会优先走正常域名；这里保留原 URL 作为第二兜底，避免历史消息携带的可用签名地址被跳过。
  return uniqueUrls([
    ...rewritten.slice(0, 1),
    originalUrl,
    ...rewritten.slice(1),
  ])
}
