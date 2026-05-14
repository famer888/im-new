import { getUploadToken, getUploadUrl } from '@/api/imBase'
import { getOssUploadCandidates, reportOssUploadCandidateFailure } from '@/utils/ossUploadDomains'

interface PrepareLogUploadResult {
  success: boolean
  msg?: string
  filename?: string
  fileSize?: number
  bodyBase64?: string
}

export interface UploadPackagedLogResult {
  success: boolean
  msg: string
  filepath: string
}

function stripProtocol(url = '') {
  return String(url).replace(/^https?:\/\//i, '')
}

function stripQuery(url: string) {
  const index = url.indexOf('?')
  return index >= 0 ? url.slice(0, index) : url
}

function toHttpsUrl(url = '') {
  return url.replace(/^http:/i, 'https:')
}

function normalizeOssEndpoint(endpoint: string): string {
  const raw = String(endpoint || '').trim()
  if (!raw) return ''
  return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

function resolveOssUploadUrl(responseUrl: string, bucket: string, endpoint: string, objectKey: string): string {
  const key = objectKey.replace(/^\/+/, '')
  // 对齐老 im：上传 endpoint / 服务端回传上传 URL 一律走 HTTPS，避免 HTTP 下被 CORS 预检或代理链路拦截。
  if (responseUrl) return toHttpsUrl(stripQuery(responseUrl))

  const normalizedEndpoint = normalizeOssEndpoint(endpoint)
  if (/aliyuncs\.com$/i.test(normalizedEndpoint)) {
    return `https://${bucket}.${normalizedEndpoint}/${key}`
  }

  return `https://${normalizedEndpoint}/${key}`
}

function extractDateKeyFromUploadKey(uploadKey = '') {
  const keyText = String(uploadKey || '')
  const match = keyText.match(/(\d{6}\/\d{2})/)
  if (match) return match[1]

  const rawFilename = keyText.split('/').pop() || ''
  return rawFilename.replace(/\.[^/.]+$/, '')
}

function buildLogTextPath(uploadUrl = '', uploadKey = '', loginId = '') {
  const plainUrl = stripProtocol(uploadUrl).split('?')[0]
  const slashIndex = plainUrl.indexOf('/')
  const host = slashIndex === -1 ? plainUrl : plainUrl.slice(0, slashIndex)
  const urlPath = slashIndex === -1 ? '' : plainUrl.slice(slashIndex + 1)
  const uid = String(loginId || '').trim()
  const uidSuffix = uid ? `?${uid}` : ''
  const keyPath = String(uploadKey || urlPath)
    .replace(/^\/+/, '')
    .replace(/^(test\/)?common\/log\//, '')
  return `logs:${host}/test-${keyPath}${uidSuffix}`
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export async function uploadPackagedLog(options: {
  loginId: string
  onProgress?: (percent: number) => void
}): Promise<UploadPackagedLogResult> {
  try {
    const suffix = 'zip'
    options.onProgress?.(5)
    const bootstrapKeyData = await getUploadUrl({
      attachType: 4,
      attachWorkspaceType: 0,
      fileSize: 0,
      suffix,
    })
    const bootstrapFileId = String(bootstrapKeyData.fileId || '').trim()
    if (!bootstrapFileId) {
      return { success: false, msg: 'getUploadUrl failed', filepath: '' }
    }

    options.onProgress?.(20)
    const prepared = await tauriInvoke<PrepareLogUploadResult>('prepare_log_upload_package', {
      request: {
        loginId: options.loginId,
        passwordDateKey: extractDateKeyFromUploadKey(bootstrapFileId),
      },
    })
    if (!prepared?.success || !prepared.bodyBase64 || !prepared.fileSize) {
      return {
        success: false,
        msg: prepared?.msg || 'prepare failed',
        filepath: '',
      }
    }

    options.onProgress?.(40)
    const [uploadUrlInfo, token] = await Promise.all([
      getUploadUrl({
        attachType: 4,
        attachWorkspaceType: 0,
        fileSize: prepared.fileSize,
        suffix,
      }),
      getUploadToken(),
    ])

    const objectKey = String(uploadUrlInfo.fileId || '').trim()
    const endpoint = normalizeOssEndpoint(String(token.ossEndpoint || ''))
    const bucket = String(token.ossBucket || '').trim()
    const responseUrl = String(uploadUrlInfo.url || '').trim()
    const accessKeyId = String(token.accessKeyId || '').trim()
    const accessKeySecret = String(token.accessKeySecret || '').trim()
    const securityToken = String(token.securityToken || '').trim()
    if (!objectKey || !bucket || !endpoint || !accessKeyId || !accessKeySecret || !securityToken) {
      return { success: false, msg: 'missing oss token', filepath: '' }
    }

    options.onProgress?.(65)
    const candidates = await getOssUploadCandidates({ responseUrl, bucket, endpoint, objectKey })
    let uploadUrl = ''
    let lastError: unknown = null
    for (const candidate of candidates) {
      try {
        // 对齐老 im：日志包上传也按动态 OSS endpoint 探活后的顺序尝试，失败域名上报后继续兜底。
        await tauriInvoke('upload_oss_object', {
          request: {
            url: candidate.url,
            bucket,
            objectKey,
            accessKeyId,
            accessKeySecret,
            securityToken,
            contentType: 'application/zip',
            bodyBase64: prepared.bodyBase64,
          },
        })
        uploadUrl = candidate.url
        break
      } catch (error) {
        lastError = error
        await reportOssUploadCandidateFailure(candidate, error)
      }
    }
    if (!uploadUrl) throw lastError instanceof Error ? lastError : new Error('all oss endpoints failed')

    const finalUrl = toHttpsUrl(stripQuery(responseUrl || uploadUrl))
    options.onProgress?.(100)
    return {
      success: true,
      msg: 'upload success',
      filepath: buildLogTextPath(finalUrl, objectKey, options.loginId),
    }
  } catch (error) {
    return {
      success: false,
      msg: error instanceof Error ? error.message : 'upload failed',
      filepath: '',
    }
  }
}
