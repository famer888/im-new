import { API_CONFIG, getBaseUrl, getDomainUrl, getOpenChatBaseUrl } from '@/api/config'
import { getAllDomains } from '@/utils/domainPool'

interface ProbeResult {
  label: string
  url: string
  ok: boolean
  status?: number
  error?: string
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls.map(url => String(url || '').trim()).filter(Boolean))]
}

async function probeUrl(label: string, url: string): Promise<ProbeResult> {
  try {
    if ((window as any).__TAURI_INTERNALS__) {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<{ ok: boolean; status: number }>('probe_url', { url })
      return { label, url, ok: result.ok, status: result.status }
    }

    const response = await fetch(url.replace(/\/$/, ''), { method: 'GET', mode: 'no-cors' })
    return { label, url, ok: Boolean(response) }
  } catch (error) {
    return { label, url, ok: false, error: (error as Error)?.message || String(error) }
  }
}

async function getWsStatusLine(): Promise<string> {
  try {
    if (!(window as any).__TAURI_INTERNALS__) return 'wsStatus: browser'
    const { invoke } = await import('@tauri-apps/api/core')
    const status = await invoke<string>('get_ws_status')
    return `wsStatus: ${status || 'unknown'}`
  } catch (error) {
    return `wsStatus: error ${(error as Error)?.message || String(error)}`
  }
}

export async function collectNetworkDiagnostics(): Promise<string> {
  const baseUrls = [
    ['baseApi', getBaseUrl()],
    ['domainApi', getDomainUrl()],
    ['openChat', getOpenChatBaseUrl()],
  ] as const
  const dynamicUrls = [
    ...getAllDomains('webBiz').slice(0, 6).map(item => ['webBiz', item.domain] as const),
    ...getAllDomains('ossEndpoint').slice(0, 6).map(item => ['ossEndpoint', item.domain] as const),
  ]
  const probes = await Promise.all(
    uniqueUrls([...baseUrls, ...dynamicUrls].map(([, url]) => url)).map((url) => {
      const found = [...baseUrls, ...dynamicUrls].find(([, itemUrl]) => itemUrl === url)
      return probeUrl(found?.[0] || 'domain', url)
    }),
  )

  const lines = [
    'OCS Chat 网络诊断',
    `time: ${new Date().toISOString()}`,
    `env: ${API_CONFIG.env}`,
    `appVersion: ${API_CONFIG.appVer}`,
    `packageCode: ${API_CONFIG.packageCode}`,
    await getWsStatusLine(),
    '',
    'domains:',
    ...probes.map((item) => {
      const status = item.status == null ? '' : ` HTTP ${item.status}`
      const error = item.error ? ` ${item.error}` : ''
      return `- [${item.ok ? 'OK' : 'FAIL'}] ${item.label} ${item.url}${status}${error}`
    }),
  ]
  // Tauri 没有 Electron netLog；这里生成可复制的运行时网络诊断摘要，用于替代老 im 的 netlog 面板快速定位。
  return lines.join('\n')
}
