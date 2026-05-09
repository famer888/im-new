export interface DomainItem {
  domain: string
  status: 'normal' | 'error'
  moduleCode: string
  lastCheck?: number
}

let domainCache: Map<string, DomainItem[]> = new Map()
let pollingTimer: ReturnType<typeof setInterval> | null = null

const STORAGE_KEY = 'domain-pool-cache'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as Record<string, DomainItem[]>
      domainCache = new Map(Object.entries(data))
    }
  } catch { /* ignore */ }
}

function saveToStorage() {
  try {
    const data = Object.fromEntries(domainCache.entries())
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* ignore */ }
}

// 立即从 localStorage 恢复缓存（同步，模块加载时执行）
loadFromStorage()

export async function initDomainPool() {
  if (!(window as any).__TAURI_INTERNALS__) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const list = await invoke<DomainItem[]>('get_domain_pool')
    for (const item of list) {
      if (!domainCache.has(item.moduleCode)) {
        domainCache.set(item.moduleCode, [])
      }
      domainCache.get(item.moduleCode)!.push(item)
    }
    saveToStorage()
  } catch { /* empty */ }
}

// ---------------------------------------------------------------
// OSS 引导域名：优先读取 .env 里的 VITE_APP_OSS_HOST_BIZ，
// 没有时退回阿里云 OSS 硬编码地址（与老 im 的 OSS_CONFIG_URLS 一致）
// ---------------------------------------------------------------
function getOssBizUrls(): string[] {
  const envUrl = import.meta.env.VITE_APP_OSS_HOST_BIZ as string | undefined
  if (envUrl) return [envUrl]
  // 无环境变量时退回硬编码备用地址
  return [
    'https://backup-res2.oss-cn-hongkong.aliyuncs.com/config/backup_url',
    'https://a1-res2.oss-cn-hongkong.aliyuncs.com/domainapi_url-b2.txt',
  ]
}

const DIRECT_FALLBACK_URLS = [
  'https://blo.yimengwh.xyz',
  'https://openchat-loginv2.evanth.xyz',
  'https://a1.uuds.xyz',
]

function parseDomainListFromOss(data: unknown): string[] {
  if (!data) return []
  const d = data as Record<string, unknown>
  let list: unknown[] = []
  if (Array.isArray(d.url)) list = d.url
  else if (Array.isArray(data)) list = data as unknown[]
  else if (Array.isArray(d.list)) list = d.list
  else if (Array.isArray(d.domains)) list = d.domains
  return list
    .map(item => (typeof item === 'string' ? item : (item as Record<string, string>).domainUrl))
    .filter(Boolean) as string[]
}

async function fetchOssDomains(ossUrl: string): Promise<string[]> {
  try {
    const response = await fetch(ossUrl)
    if (!response.ok) return []
    const content = await response.text()
    const data = JSON.parse(atob(content.trim()))
    return parseDomainListFromOss(data)
  } catch {
    return []
  }
}

/**
 * 从阿里云 OSS + 预埋直连域名获取引导域名列表，写入缓存。
 * 与老 im 的 getOssDomain / getPrepareDomainPool 等效。
 * 只追加不覆盖，保留已有缓存。
 */
export async function initDomainPoolFromOss(): Promise<void> {
  const collected: string[] = [...DIRECT_FALLBACK_URLS]

  await Promise.allSettled(
    getOssBizUrls().map(async (url: string) => {
      const domains = await fetchOssDomains(url)
      collected.push(...domains)
    }),
  )

  const unique = [...new Set(collected)].filter(Boolean)
  if (!unique.length) return

  const existing = domainCache.get('webBiz') || []
  const existingSet = new Set(existing.map(d => d.domain))
  const newItems: DomainItem[] = unique
    .filter(url => !existingSet.has(url))
    .map(domain => ({
      domain,
      status: 'normal' as const,
      moduleCode: 'webBiz',
      lastCheck: Date.now(),
    }))

  if (newItems.length) {
    domainCache.set('webBiz', [...existing, ...newItems])
    saveToStorage()
  }
}

/** 通过后端 API 获取域名列表并写入缓存，不依赖 Tauri */
export async function initDomainPoolFromApi(): Promise<void> {
  try {
    const { getDynamicDomainList } = await import('@/api/imDomain')
    const domains = await getDynamicDomainList('webBiz')
    if (!domains.length) return
    const items: DomainItem[] = domains.map(domain => ({
      domain,
      status: 'normal' as const,
      moduleCode: 'webBiz',
      lastCheck: Date.now(),
    }))
    domainCache.set('webBiz', items)
    saveToStorage()
  } catch { /* ignore */ }
}

export function getFirstNormalDomain(moduleCode: string): string | null {
  const list = domainCache.get(moduleCode) || []
  const normal = list.find(d => d.status === 'normal')
  return normal?.domain || list[0]?.domain || null
}

export function markDomainError(moduleCode: string, domain: string) {
  const list = domainCache.get(moduleCode)
  if (list) {
    const item = list.find(d => d.domain === domain)
    if (item) item.status = 'error'
  }
}

export function startPolling(intervalMs = 300000) {
  stopPolling()
  pollingTimer = setInterval(async () => {
    await initDomainPool()
  }, intervalMs)
}

export function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

export function getAllDomains(moduleCode: string): DomainItem[] {
  return domainCache.get(moduleCode) || []
}
