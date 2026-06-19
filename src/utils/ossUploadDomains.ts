import { getDynamicDomainList, reportErrorDomain } from '@/api/imDomain'
import { getAllDomains, markDomainError } from '@/utils/domainPool'

export interface OssUploadCandidate {
  url: string
  domainUrl: string
  source: 'dynamic' | 'token' | 'response'
  moduleCode?: string
}

function toHttpsUrl(url = ''): string {
  return String(url || '').trim().replace(/^http:/i, 'https:')
}

function stripQuery(url: string): string {
  const index = url.indexOf('?')
  return index >= 0 ? url.slice(0, index) : url
}

function normalizeOssEndpoint(endpoint: string): string {
  const raw = String(endpoint || '').trim()
  if (!raw) return ''
  return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

function endpointToBaseUrl(endpoint: string): string {
  const normalized = normalizeOssEndpoint(endpoint)
  return normalized ? `https://${normalized}` : ''
}

function resolveUploadUrlFromEndpoint(endpoint: string, bucket: string, objectKey: string): string {
  const key = objectKey.replace(/^\/+/, '')
  const normalized = normalizeOssEndpoint(endpoint)
  if (!normalized) return ''
  if (/aliyuncs\.com$/i.test(normalized)) return `https://${bucket}.${normalized}/${key}`
  return `https://${normalized}/${key}`
}

function responseUrlToCandidate(responseUrl: string): OssUploadCandidate | null {
  const url = toHttpsUrl(stripQuery(responseUrl))
  if (!url) return null
  return { url, domainUrl: url, source: 'response' }
}

function resolveUploadModuleCode(channelType: unknown, ossSceneType?: unknown): string {
  const value = Number(channelType)
  const scene = Number(ossSceneType)
  const isChatPicScene = Number.isFinite(scene) && scene === 1
  if (value === 1) return isChatPicScene ? 'ossChatPicUrl' : 'ossChatUrl'
  if (value === 2) return isChatPicScene ? 'ossChatPicLowRateUrl' : 'ossLowRateUrl'
  // 聊天图片 v2 桶的 endpoint 也有独立域名池，不能复用旧 ossEndpoint。
  if (isChatPicScene && (value === 0 || value === 9)) return 'ossChatPicEndpoint'
  // 对齐老 im：非聊天图片的默认通道仍使用通用 ossEndpoint 动态池。
  if (value === 0 || value === 9) return 'ossEndpoint'
  return isChatPicScene ? 'ossChatPicUrl' : 'ossDefaultUrl'
}

function uniqCandidates(candidates: OssUploadCandidate[]): OssUploadCandidate[] {
  const seen = new Set<string>()
  return candidates.filter(candidate => {
    const key = candidate.url
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function probeEndpoint(endpoint: string): Promise<{ ok: boolean; status: number }> {
  if (!(window as any).__TAURI_INTERNALS__) return { ok: true, status: 0 }
  const { invoke } = await import('@tauri-apps/api/core')
  const probeUrl = endpointToBaseUrl(endpoint)
  if (!probeUrl) return { ok: false, status: 0 }
  return invoke<{ ok: boolean; status: number }>('probe_url', { url: probeUrl })
}

async function reportUploadDomainFailure(domainUrl: string, errorDesc: string, httpStatus = 0, moduleCode = 'ossEndpoint') {
  markDomainError(moduleCode, domainUrl)
  await reportErrorDomain({
    domainUrl,
    errorPath: domainUrl,
    errorDesc,
    httpStatus,
    moduleCode,
  })
}

export async function getOssUploadCandidates(options: {
  responseUrl: string
  bucket: string
  endpoint: string
  objectKey: string
  channelType?: unknown
  ossSceneType?: unknown
}): Promise<OssUploadCandidate[]> {
  const { responseUrl, bucket, endpoint, objectKey } = options
  const moduleCode = resolveUploadModuleCode(options.channelType, options.ossSceneType)
  const dynamicDomains = [
    ...getAllDomains(moduleCode).map(item => item.domain),
    ...await getDynamicDomainList(moduleCode),
  ]

  const candidates: OssUploadCandidate[] = []
  for (const domainUrl of [...new Set(dynamicDomains.map(toHttpsUrl).filter(Boolean))]) {
    try {
      // 对齐老 im：上传前先探活动态 OSS endpoint，明显不可用的域名不上送 ali-oss / Rust 上传。
      const probe = await probeEndpoint(domainUrl)
      if (!probe.ok) {
        await reportUploadDomainFailure(domainUrl, `oss 上传域名探活失败:HTTP ${probe.status}`, probe.status, moduleCode)
        continue
      }
      const uploadUrl = resolveUploadUrlFromEndpoint(domainUrl, bucket, objectKey)
      if (uploadUrl) candidates.push({ url: uploadUrl, domainUrl, source: 'dynamic', moduleCode })
    } catch (error) {
      await reportUploadDomainFailure(domainUrl, `oss 上传域名探活异常:${(error as Error)?.message || String(error)}`, 0, moduleCode)
    }
  }

  const tokenUrl = resolveUploadUrlFromEndpoint(endpoint, bucket, objectKey)
  if (tokenUrl) candidates.push({ url: tokenUrl, domainUrl: endpointToBaseUrl(endpoint), source: 'token', moduleCode })
  const responseCandidate = responseUrlToCandidate(responseUrl)
  if (responseCandidate) candidates.push(responseCandidate)
  return uniqCandidates(candidates)
}

export async function reportOssUploadCandidateFailure(candidate: OssUploadCandidate, error: unknown) {
  if (candidate.source === 'response') return
  const status = Number((error as any)?.status || (error as any)?.statusCode || 0)
  await reportUploadDomainFailure(
    candidate.domainUrl,
    `oss 上传异常:${(error as Error)?.message || String(error)}`,
    status,
    candidate.moduleCode || 'ossEndpoint',
  )
}
