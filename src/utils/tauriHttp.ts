export type TauriHttpPurpose = 'domain_api' | 'oss_seed' | 'diagnostic'

export interface TauriHttpRequest {
  url: string
  method?: 'GET' | 'POST' | 'HEAD'
  headers?: Record<string, string>
  body?: string
  purpose: TauriHttpPurpose
}

export interface TauriHttpResponse {
  ok: boolean
  status: number
  body: string
  error?: string
}

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

function normalizeMethod(method?: string): 'GET' | 'POST' | 'HEAD' {
  const normalized = String(method || 'GET').trim().toUpperCase()
  if (normalized === 'POST') return 'POST'
  if (normalized === 'HEAD') return 'HEAD'
  return 'GET'
}

function resolveHttpUrl(url: string): string {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  try {
    return new URL(raw, window.location.origin).toString()
  } catch {
    return raw
  }
}

/**
 * 统一主进程代发与网页端 fetch 的返回结构，避免上层重试/上报分支各写一套错误解析。
 */
export async function requestViaTauriOrFetch(request: TauriHttpRequest): Promise<TauriHttpResponse> {
  const method = normalizeMethod(request.method)
  const url = resolveHttpUrl(request.url)

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<TauriHttpResponse>('proxy_http_text', {
        request: {
          url,
          method,
          headers: request.headers || {},
          body: request.body || null,
          purpose: request.purpose,
        },
      })
    } catch (error) {
      return {
        ok: false,
        status: 0,
        body: '',
        error: (error as Error)?.message || String(error),
      }
    }
  }

  try {
    const response = await fetch(url, {
      method,
      headers: request.headers,
      body: method === 'POST' ? request.body : undefined,
    })
    const body = method === 'HEAD' ? '' : await response.text()
    return {
      ok: response.ok,
      status: response.status,
      body,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: '',
      error: (error as Error)?.message || String(error),
    }
  }
}
