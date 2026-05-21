export interface DomainItem {
  domain: string
  status: 'normal' | 'error'
  moduleCode: string
  lastCheck?: number
}

let domainCache: Map<string, DomainItem[]> = new Map()
let pollingTimer: ReturnType<typeof setInterval> | null = null

const STORAGE_KEY = 'domain-pool-cache'

const PROD_PRELOADED_DOMAIN_POOL: Record<string, string[]> = {
  webBiz: [
    'https://webbiz.imono.xyz',
    'https://webbiz-b.imono.xyz',
  ],
  webSession: [
    'wss://webwss.jstoyo.com',
  ],
  ossEndpoint: [
    'https://dymain.lchaizhilian.xyz',
    'https://dymain.kindem.xyz',
    'https://dymain.weifa.xyz',
  ],
  login_v2: [
    'https://openchat-loginv2.uorme.xyz',
    'https://openchat-loginv2.yanzong.top',
    'https://openchat-loginv2.sjhbf.xyz',
    'https://openchat-loginv2.jiangfj0516.top',
    'https://openchat-loginv2.tiankaixin.xyz',
    'https://openchat-loginv2.dxcsx.top',
    'https://openchat-loginv2.cssy828.top',
    'https://openchat-loginv2.ddsvr2022.xyz',
    'https://openchat-loginv2.spike0101.xyz',
  ],
}

const DIRECT_FALLBACK_DOMAINS: Record<string, string[]> = {
  // 保留 im-new 现有 webBiz 直连兜底，同时按老 im 语义补模块归属。
  webBiz: [
    'https://blo.yimengwh.xyz',
    'https://openchat-loginv2.evanth.xyz',
    'https://a1.uuds.xyz',
  ],
  login_v2: [
    'https://openchat-loginv2.evanth.xyz',
  ],
  domain: [
    'https://a1.uuds.xyz',
  ],
}

function isProdEnv(): boolean {
  const env = String(import.meta.env.VITE_APP_ENV || '').trim().toLowerCase()
  return env === 'prod' || env === 'production'
}

function uniqDomains(urls: string[]): string[] {
  return [...new Set(urls.map(url => String(url || '').trim()).filter(Boolean))]
}

function mergeDomains(moduleCode: string, urls: string[]) {
  const nextUrls = uniqDomains(urls)
  if (!nextUrls.length) return

  const existing = domainCache.get(moduleCode) || []
  const existingMap = new Map(existing.map(item => [item.domain, item]))

  for (const domain of nextUrls) {
    if (!existingMap.has(domain)) {
      existingMap.set(domain, {
        domain,
        status: 'normal',
        moduleCode,
        lastCheck: Date.now(),
      })
    }
  }

  domainCache.set(moduleCode, Array.from(existingMap.values()))
}

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
if (isProdEnv()) {
  for (const [moduleCode, urls] of Object.entries(PROD_PRELOADED_DOMAIN_POOL)) {
    mergeDomains(moduleCode, urls)
  }
  saveToStorage()
}

export async function initDomainPool() {
  if (!(window as any).__TAURI_INTERNALS__) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const list = await invoke<DomainItem[]>('get_domain_pool')
    for (const item of list) {
      mergeDomains(item.moduleCode, [item.domain])
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

function getOssDomainUrls(): string[] {
  const envUrl = import.meta.env.VITE_APP_OSS_HOST_DOMAIN as string | undefined
  if (envUrl) return [envUrl]
  return [
    'https://a1-res2.oss-cn-hongkong.aliyuncs.com/domainapi_url-b2.txt',
  ]
}

function getOssSocketUrls(): string[] {
  return [
    'https://backup-chat6kyo-res.oss-ap-northeast-1.aliyuncs.com/config/chat_url.txt',
  ]
}

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
    let content = ''
    if ((window as any).__TAURI_INTERNALS__) {
      const { invoke } = await import('@tauri-apps/api/core')
      // 对齐老 im 主进程 CORS 处理：OSS 引导域名在 Tauri 中走 Rust 拉取，避免 WebView CORS / 预检失败。
      content = await invoke<string>('fetch_url_text', { url: ossUrl })
    } else {
      const response = await fetch(ossUrl)
      if (!response.ok) return []
      content = await response.text()
    }
    const data = JSON.parse(atob(content.trim()))
    return parseDomainListFromOss(data)
  } catch {
    return []
  }
}

/**
 * 从阿里云 OSS + 预埋直连域名获取引导域名列表，写入缓存。
 * 与老 im 的 getOssDomain / getPrepareDomainPool / domains.json 预埋兜底保持一致：
 * - webBiz 走 backup_url
 * - domain 走 domainapi_url-b2.txt
 * - webSession 走 chat_url.txt
 * - 生产环境额外注入 55.1.7.0 的静态 domains.json 兜底
 */
export async function initDomainPoolFromOss(): Promise<void> {
  for (const [moduleCode, urls] of Object.entries(DIRECT_FALLBACK_DOMAINS)) {
    mergeDomains(moduleCode, urls)
  }

  const ossSeedConfigs = [
    { moduleCode: 'webBiz', urls: getOssBizUrls() },
    { moduleCode: 'domain', urls: getOssDomainUrls() },
    { moduleCode: 'webSession', urls: getOssSocketUrls() },
  ]

  await Promise.allSettled(
    ossSeedConfigs.map(async ({ moduleCode, urls }) => {
      const collected: string[] = []
      for (const url of urls) {
        const domains = await fetchOssDomains(url)
        collected.push(...domains)
      }
      mergeDomains(moduleCode, collected)
    }),
  )

  if (isProdEnv()) {
    for (const [moduleCode, urls] of Object.entries(PROD_PRELOADED_DOMAIN_POOL)) {
      mergeDomains(moduleCode, urls)
    }
  }

  saveToStorage()
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
    if (item) {
      item.status = 'error'
      saveToStorage()
    }
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
