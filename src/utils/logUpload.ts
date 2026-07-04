import { getUploadToken, getUploadUrl } from '@/api/imBase'

interface PrepareLogUploadResult {
  success: boolean
  msg?: string
  filename?: string
  fileSize?: number
  filePath?: string
  file_size?: number
  file_path?: string
  password?: string
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
    // 对齐旧 im renderer.js：去掉 common/log 前缀，展示路径带 test- 供客服检索。
    .replace(/^(test\/)?common\/log\//, '')
  return `logs:${host}/test-${keyPath}${uidSuffix}`
}

export function formatLogUploadAddress(filepath: string): string {
  return String(filepath || '').trim()
}

export function formatLogUploadCopyText(filepath: string, label = '上传地址：'): string {
  const address = formatLogUploadAddress(filepath)
  return address ? `${label}${address}` : label
}

function formatLogUploadErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '')
  if (/HTTP\s+401/i.test(raw)) {
    return '上传配置未授权(401)：登录态失效或网关异常，请重新登录后重试'
  }
  if (/oss put failed:\s*HTTP\s+401/i.test(raw)) {
    return 'OSS 上传未授权(401)：上传凭证已失效，请重新点击上传'
  }
  if (/missing oss token/i.test(raw)) {
    return '获取 OSS 上传凭证失败，请重新登录后重试'
  }
  return raw || 'upload failed'
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

function readPreparedFilePath(prepared?: PrepareLogUploadResult) {
  return String(prepared?.filePath || prepared?.file_path || '').trim()
}

function readPreparedFileSize(prepared?: PrepareLogUploadResult) {
  return Number(prepared?.fileSize ?? prepared?.file_size ?? 0)
}

function createLogUploadProgressEvent(loginId: string) {
  const random = Math.random().toString(36).slice(2)
  return `post-log-upload:progress:${loginId}:${Date.now()}:${random}`
}

async function listenLogUploadProgress(
  eventName: string,
  onProgress: undefined | ((percent: number) => void),
  range: { start: number; span: number; max: number },
) {
  if (!onProgress || !(window as any).__TAURI_INTERNALS__) return null
  const { listen } = await import('@tauri-apps/api/event')
  return listen<{ progress?: number }>(eventName, (event) => {
    const progress = Number(event.payload?.progress || 0)
    if (!Number.isFinite(progress)) return
    // 分阶段映射后端进度：打包和上传都必须留出响应确认空间，避免提前显示 100%。
    onProgress(Math.min(range.max, Math.max(range.start, Math.round(range.start + progress * range.span))))
  })
}

export async function uploadPackagedLog(options: {
  loginId: string
  onProgress?: (percent: number) => void
}): Promise<UploadPackagedLogResult> {
  let unlistenPackageProgress: null | (() => void) = null
  let unlistenUploadProgress: null | (() => void) = null
  let preparedFilePath = ''
  try {
    const suffix = 'zip'
    options.onProgress?.(5)
    const bootstrapKeyData = await getUploadUrl({
      attachType: 4,
      attachWorkspaceType: 0,
      fileSize: 0,
      suffix,
      ossSceneType: 0,
    })
    const bootstrapFileId = String(bootstrapKeyData.fileId || '').trim()
    if (!bootstrapFileId) {
      return { success: false, msg: 'getUploadUrl failed', filepath: '' }
    }

    options.onProgress?.(20)
    const packageProgressEvent = createLogUploadProgressEvent(options.loginId)
    unlistenPackageProgress = await listenLogUploadProgress(packageProgressEvent, options.onProgress, {
      start: 20,
      span: 40,
      max: 60,
    })
    const prepared = await tauriInvoke<PrepareLogUploadResult>('prepare_log_upload_package', {
      request: {
        loginId: options.loginId,
        passwordDateKey: extractDateKeyFromUploadKey(bootstrapFileId),
        progressEvent: packageProgressEvent,
      },
    })
    preparedFilePath = readPreparedFilePath(prepared)
    const preparedFileSize = readPreparedFileSize(prepared)
    if (!prepared?.success || !preparedFilePath || !preparedFileSize) {
      return {
        success: false,
        msg: prepared?.success ? 'prepare result missing file path' : prepared?.msg || 'prepare failed',
        filepath: '',
      }
    }

    options.onProgress?.(60)
    const [uploadUrlInfo, token] = await Promise.all([
      getUploadUrl({
        attachType: 4,
        attachWorkspaceType: 0,
        fileSize: preparedFileSize,
        suffix,
        ossSceneType: 0,
      }),
      getUploadToken({ ossSceneType: 0 }),
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
    unlistenUploadProgress = await listenLogUploadProgress(progressEvent, options.onProgress, {
      start: 65,
      span: 30,
      max: 95,
    })
    // 对齐旧 im 的日志上传：不先扫动态 OSS 域名，直接用 token endpoint 上传，避免本地环境卡在域名探活阶段。
    const candidates = buildPostLogUploadCandidates(responseUrl, bucket, endpoint, objectKey)
    let uploadUrl = ''
    let lastError: unknown = null
    for (const candidate of candidates) {
      try {
        // 对齐旧 im：日志包本地 zip 直接上传到 token endpoint，避免大日志经 IPC 转 base64 卡在 20%。
        await tauriInvoke('upload_oss_plain_local_file', {
          request: {
            url: candidate,
            bucket,
            objectKey,
            accessKeyId,
            accessKeySecret,
            securityToken,
            contentType: 'application/zip',
            filePath: preparedFilePath,
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

    // 对齐旧 im：展示/复制地址以实际上传成功的 URL 为准，避免 responseUrl 与真实落点域名不一致。
    const finalUrl = toHttpsUrl(stripQuery(uploadUrl || responseUrl))
    options.onProgress?.(100)
    return {
      success: true,
      msg: 'upload success',
      filepath: buildLogTextPath(finalUrl, objectKey, options.loginId),
    }
  } catch (error) {
    return {
      success: false,
      msg: formatLogUploadErrorMessage(error),
      filepath: '',
    }
  } finally {
    unlistenPackageProgress?.()
    unlistenUploadProgress?.()
    if (preparedFilePath) {
      try {
        await tauriInvoke('cleanup_log_upload_package', {
          request: {
            filePath: preparedFilePath,
          },
        })
      } catch {
        // 清理失败不覆盖上传结果，后端会限制只能删除本次日志上传临时目录。
      }
    }
  }
}
