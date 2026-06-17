import { getUploadToken, getUploadUrl } from '@/api/imBase'

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
    // 展示地址必须跟服务端实际 OSS key 一致；生产包不能再硬塞旧 debug 里的 test- 前缀。
    .replace(/^common\/log\//, '')
  return `logs:${host}/${keyPath}${uidSuffix}`
}

function buildPostLogUploadCandidates(responseUrl: string, bucket: string, endpoint: string, objectKey: string) {
  const candidates = [
    resolveOssUploadUrl('', bucket, endpoint, objectKey),
    resolveOssUploadUrl(responseUrl, bucket, endpoint, objectKey),
  ].filter(Boolean)
  return [...new Set(candidates)]
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

function createLogUploadProgressEvent(loginId: string) {
  const random = Math.random().toString(36).slice(2)
  return `post-log-upload:progress:${loginId}:${Date.now()}:${random}`
}

async function listenLogUploadProgress(eventName: string, onProgress?: (percent: number) => void) {
  if (!onProgress || !(window as any).__TAURI_INTERNALS__) return null
  const { listen } = await import('@tauri-apps/api/event')
  return listen<{ progress?: number }>(eventName, (event) => {
    const progress = Number(event.payload?.progress || 0)
    if (!Number.isFinite(progress)) return
    // OSS 上传只占 65% 之后的阶段，完成响应回来前最高停在 95%，避免误显示已完成。
    onProgress(Math.min(95, Math.max(65, Math.round(65 + progress * 30))))
  })
}

export async function uploadPackagedLog(options: {
  loginId: string
  onProgress?: (percent: number) => void
}): Promise<UploadPackagedLogResult> {
  let unlistenProgress: null | (() => void) = null
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
    const progressEvent = createLogUploadProgressEvent(options.loginId)
    unlistenProgress = await listenLogUploadProgress(progressEvent, options.onProgress)
    // 对齐旧 im 的日志上传：不先扫动态 OSS 域名，直接用 token endpoint 上传，避免本地环境卡在域名探活阶段。
    const candidates = buildPostLogUploadCandidates(responseUrl, bucket, endpoint, objectKey)
    let uploadUrl = ''
    let lastError: unknown = null
    for (const candidate of candidates) {
      try {
        // 对齐旧 im：日志包直接上传到 token endpoint，responseUrl 只作为兼容兜底。
        await tauriInvoke('upload_oss_object', {
          request: {
            url: candidate,
            bucket,
            objectKey,
            accessKeyId,
            accessKeySecret,
            securityToken,
            contentType: 'application/zip',
            bodyBase64: prepared.bodyBase64,
            progressEvent,
          },
        })
        uploadUrl = candidate
        break
      } catch (error) {
        lastError = error
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
  } finally {
    unlistenProgress?.()
  }
}
