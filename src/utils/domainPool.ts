export interface DomainItem {
  domain: string
  status: 'normal' | 'error'
  moduleCode: string
  source?: DomainSource
  priority?: number
  lastCheck?: number
}

type DomainSource = 'dynamic' | 'prepared' | 'oss'

interface DynamicDomainDto {
  domainUrl: string
  moduleCode: string
  priority?: number
}

let domainCache: Map<string, DomainItem[]> = new Map()
let pollingTimer: ReturnType<typeof setInterval> | null = null

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

function getEnvName(): string {
  return String(import.meta.env.VITE_APP_ENV || 'default').trim().toLowerCase() || 'default'
}

const STORAGE_KEY = `domain-pool-cache:${getEnvName()}`
const RAW_PREPARED_WEB_BIZ_DOMAIN = String(
  import.meta.env.VITE_APP_BASE_API || 'https://test-webbiz.68chat.co',
).trim()
const RAW_PREPARED_DOMAIN_API = String(
  import.meta.env.VITE_APP_BASE_DOMAIN || 'https://test-domain-api.68chat.co',
).trim()

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
  // 对齐老 im：webBiz/domain 预埋域名保持业务/域名接口各自独立，不把 login_v2 混进业务请求池。
  webBiz: [
    RAW_PREPARED_WEB_BIZ_DOMAIN,
  ],
  login_v2: [
    'https://blo.yimengwh.xyz',
    'https://openchat-loginv2.evanth.xyz',
    'https://a1.uuds.xyz',
  ],
  domain: [
    RAW_PREPARED_DOMAIN_API,
    'https://a1.uuds.xyz',
  ],
}

const PROD_PRELOADED_DOMAIN_SET = new Set(
  Object.values(PROD_PRELOADED_DOMAIN_POOL).flat(),
)
const DOMAIN_SOURCE_RANK: Record<DomainSource, number> = {
  dynamic: 0,
  prepared: 1,
  oss: 2,
}

const MODULE_CODE_ALIAS_MAP: Record<string, string> = {
  biz: 'webBiz',
  config: 'domain',
  domainConfig: 'domain',
}

function isProdEnv(): boolean {
  const env = getEnvName()
  return env === 'prod' || env === 'production'
}

function shouldAcceptDomainForEnv(domain: string): boolean {
  // test/uat 环境不能复用生产预埋域名，避免旧缓存或动态接口污染登录前兜底顺序。
  return isProdEnv() || !PROD_PRELOADED_DOMAIN_SET.has(domain)
}

function uniqDomains(urls: string[]): string[] {
  return [...new Set(
    urls
      .map(url => String(url || '').trim())
      .filter(url => url && shouldAcceptDomainForEnv(url)),
  )]
}

function normalizeModuleCode(moduleCode: string): string {
  const normalized = String(moduleCode || '').trim()
  return MODULE_CODE_ALIAS_MAP[normalized] || normalized
}

function isPreparedSeedDomain(moduleCode: string, domain: string): boolean {
  const normalizedModuleCode = normalizeModuleCode(moduleCode)
  const prepared = [
    ...(DIRECT_FALLBACK_DOMAINS[normalizedModuleCode] || []),
    ...(PROD_PRELOADED_DOMAIN_POOL[normalizedModuleCode] || []),
  ]
  return prepared.includes(domain)
}

function normalizeDomainSource(source: unknown, moduleCode: string, domain: string): DomainSource {
  if (source === 'dynamic' || source === 'prepared' || source === 'oss') return source
  return isPreparedSeedDomain(moduleCode, domain) ? 'prepared' : 'dynamic'
}

function sortDomainItems(items: DomainItem[]): DomainItem[] {
  // 域名使用顺序与旧 im 对齐：动态域名优先，动态都不可用后再走预埋，最后才走 OSS 配置。
  return [...items].sort((a, b) => {
    const sourceDiff = DOMAIN_SOURCE_RANK[a.source || 'dynamic'] - DOMAIN_SOURCE_RANK[b.source || 'dynamic']
    if (sourceDiff !== 0) return sourceDiff

    const aPriority = Number.isFinite(Number(a.priority)) ? Number(a.priority) : Infinity
    const bPriority = Number.isFinite(Number(b.priority)) ? Number(b.priority) : Infinity
    if (aPriority !== bPriority) return aPriority - bPriority

    return 0
  })
}

function isLoginOnlyDomain(domain: string): boolean {
  try {
    const host = new URL(String(domain || '').trim()).host.toLowerCase()
    return host === 'a1.uuds.xyz'
      || host === 'blo.yimengwh.xyz'
      || host === 'openchat-loginv2.evanth.xyz'
      || host.startsWith('openchat-loginv2.')
  } catch {
    return false
  }
}

function normalizeItem(item: DomainItem): DomainItem | null {
  const moduleCode = normalizeModuleCode(item.moduleCode)
  const domain = String(item.domain || '').trim()
  if (!moduleCode || !domain || !shouldAcceptDomainForEnv(domain)) return null
  return {
    domain,
    moduleCode,
    status: item.status === 'error' ? 'error' : 'normal',
    source: normalizeDomainSource(item.source, moduleCode, domain),
    priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : undefined,
    lastCheck: Number(item.lastCheck || 0) || Date.now(),
  }
}

function upsertDomainItems(items: DomainItem[]): boolean {
  let changed = false

  for (const rawItem of items) {
    const item = normalizeItem(rawItem)
    if (!item) continue

    const existing = domainCache.get(item.moduleCode) || []
    const existingMap = new Map(existing.map(entry => [entry.domain, entry]))
    const previous = existingMap.get(item.domain)

    if (!previous) {
      existingMap.set(item.domain, item)
      changed = true
    } else {
      const itemHasHigherPrioritySource =
        DOMAIN_SOURCE_RANK[item.source || 'dynamic'] < DOMAIN_SOURCE_RANK[previous.source || 'dynamic']
      const nextPriority = itemHasHigherPrioritySource
        ? item.priority
        : Number.isFinite(Number(item.priority))
          ? Number(item.priority)
          : previous.priority
      const nextItem: DomainItem = {
        ...previous,
        // 探测失败后的 error 状态要保留到人工/重启恢复，避免后台补池把失败域名马上洗回 normal。
        status: previous.status === 'error' ? 'error' : item.status,
        source: itemHasHigherPrioritySource ? item.source : previous.source,
        priority: nextPriority,
        lastCheck: Math.max(Number(previous.lastCheck || 0), Number(item.lastCheck || 0) || Date.now()),
      }
      if (
        nextItem.status !== previous.status
        || nextItem.source !== previous.source
        || nextItem.priority !== previous.priority
        || nextItem.lastCheck !== previous.lastCheck
        || nextItem.moduleCode !== previous.moduleCode
      ) {
        existingMap.set(item.domain, nextItem)
        changed = true
      }
    }

    domainCache.set(item.moduleCode, sortDomainItems(Array.from(existingMap.values())))
  }

  return changed
}

function mergeDomains(moduleCode: string, urls: string[], source: DomainSource): boolean {
  const normalizedModuleCode = normalizeModuleCode(moduleCode)
  const nextUrls = uniqDomains(urls)
  if (!normalizedModuleCode || !nextUrls.length) return false

  return upsertDomainItems(
    nextUrls.map((domain, index) => ({
      domain,
      status: 'normal',
      moduleCode: normalizedModuleCode,
      source,
      priority: index,
      lastCheck: Date.now(),
    })),
  )
}

function serializeDomainCache(): DomainItem[] {
  return Array.from(domainCache.values())
    .flat()
    .map(item => ({
      domain: item.domain,
      status: item.status,
      moduleCode: normalizeModuleCode(item.moduleCode),
      source: item.source,
      priority: item.priority,
      lastCheck: Number(item.lastCheck || 0) || Date.now(),
    }))
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as Record<string, DomainItem[]>
    domainCache = new Map(
      Object.entries(data).map(([moduleCode, list]) => [
        normalizeModuleCode(moduleCode),
        list
          .map(normalizeItem)
          .filter(Boolean) as DomainItem[],
      ]),
    )
  } catch {
    // ignore broken local cache
  }
}

function saveToStorage() {
  try {
    const data = Object.fromEntries(domainCache.entries())
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // ignore storage failures
  }
}

async function syncDomainPoolToTauri(): Promise<void> {
  if (!isTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('update_domain_pool', { domains: serializeDomainCache() })
  } catch {
    // ignore desktop sync failures and keep frontend cache authoritative
  }
}

async function persistDomainPool(): Promise<void> {
  saveToStorage()
  await syncDomainPoolToTauri()
}

async function syncActiveWebBizBaseUrl(options?: { preferPool?: boolean }): Promise<void> {
  if (!isTauri()) return
  try {
    const { syncBaseUrlWithDomainPool } = await import('@/api/config')
    syncBaseUrlWithDomainPool(options)
  } catch {
    // ignore baseUrl sync failures and keep pool cache available
  }
}

function seedFallbackDomains() {
  for (const [moduleCode, urls] of Object.entries(DIRECT_FALLBACK_DOMAINS)) {
    mergeDomains(moduleCode, urls, 'prepared')
  }
  if (!isProdEnv()) return
  for (const [moduleCode, urls] of Object.entries(PROD_PRELOADED_DOMAIN_POOL)) {
    mergeDomains(moduleCode, urls, 'prepared')
  }
}

function extractDomainSeedModules(domain: string, moduleCode: string): string[] {
  const modules = new Set<string>()
  const normalizedModuleCode = normalizeModuleCode(moduleCode)
  if (normalizedModuleCode) modules.add(normalizedModuleCode)
  if (normalizedModuleCode === 'webBiz' && isLoginOnlyDomain(domain)) {
    modules.add('login_v2')
  }
  return Array.from(modules)
}

// 立即从 localStorage 恢复缓存（同步，模块加载时执行）
loadFromStorage()
seedFallbackDomains()
saveToStorage()

export async function initDomainPool() {
  seedFallbackDomains()
  if (!isTauri()) {
    await persistDomainPool()
    return
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const list = await invoke<DomainItem[]>('get_domain_pool')
    upsertDomainItems(list)
  } catch {
    // ignore desktop cache restore failures
  }

  await persistDomainPool()
  await syncActiveWebBizBaseUrl()
}

// ---------------------------------------------------------------
// OSS 引导域名：优先读取 .env 里的 VITE_APP_OSS_HOST_BIZ，
// 没有时退回阿里云 OSS 硬编码地址（与老 im 的 OSS_CONFIG_URLS 一致）
// ---------------------------------------------------------------
function getOssBizUrls(): string[] {
  const envUrl = import.meta.env.VITE_APP_OSS_HOST_BIZ as string | undefined
  if (envUrl) return [envUrl]
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
    if (isTauri()) {
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
 */
export async function initDomainPoolFromOss(): Promise<void> {
  seedFallbackDomains()

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
      mergeDomains(moduleCode, collected, 'oss')
      if (moduleCode === 'webBiz') {
        mergeDomains('login_v2', collected.filter(isLoginOnlyDomain), 'oss')
      }
    }),
  )

  await persistDomainPool()
  await syncActiveWebBizBaseUrl()
}

function sortDomainDtoList(domainDtoList: DynamicDomainDto[]): DynamicDomainDto[] {
  return [...domainDtoList].sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity))
}

/** 通过后端 API 获取完整域名列表并写入缓存，不依赖 Tauri */
export async function initDomainPoolFromApi(): Promise<void> {
  try {
    const { getDynamicDomainSnapshot } = await import('@/api/imDomain')
    const domainDtoList = sortDomainDtoList(await getDynamicDomainSnapshot(''))
    if (!domainDtoList.length) return

    const items: DomainItem[] = []
    const now = Date.now()
    for (const [index, entry] of domainDtoList.entries()) {
      const domain = String(entry.domainUrl || '').trim()
      if (!domain) continue
      const moduleCodes = extractDomainSeedModules(domain, entry.moduleCode)
      for (const moduleCode of moduleCodes) {
        items.push({
          domain,
          status: 'normal',
          moduleCode,
          source: 'dynamic',
          priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : index,
          lastCheck: now,
        })
      }
    }
    if (!items.length) return

    upsertDomainItems(items)
    await persistDomainPool()
    // listDomain 拿到真实业务池后，优先把当前 webBiz 切到池内首个正常域名。
    await syncActiveWebBizBaseUrl({ preferPool: true })
  } catch {
    // ignore dynamic refresh failures
  }
}

export function getFirstNormalDomain(moduleCode: string): string | null {
  const list = domainCache.get(normalizeModuleCode(moduleCode)) || []
  const normal = list.find(d => d.status === 'normal')
  return normal?.domain || list[0]?.domain || null
}

export async function markDomainError(moduleCode: string, domain: string) {
  const normalizedModuleCode = normalizeModuleCode(moduleCode)
  const list = domainCache.get(normalizedModuleCode)
  if (!list) return
  const item = list.find(entry => entry.domain === domain)
  if (!item) return
  item.status = 'error'
  item.lastCheck = Date.now()
  await persistDomainPool()
}

export function startPolling(intervalMs = 300000) {
  stopPolling()
  pollingTimer = setInterval(async () => {
    await initDomainPool()
    await initDomainPoolFromOss()
    await initDomainPoolFromApi()
  }, intervalMs)
}

export function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

export function getAllDomains(moduleCode: string): DomainItem[] {
  return [...(domainCache.get(normalizeModuleCode(moduleCode)) || [])]
}

export function getOrderedDomainUrls(
  moduleCodes: string | string[],
  options: { includeError?: boolean } = {},
): string[] {
  const normalizedModuleCodes = (Array.isArray(moduleCodes) ? moduleCodes : [moduleCodes])
    .map(normalizeModuleCode)
    .filter(Boolean)
  const normal: string[] = []
  const error: string[] = []

  for (const moduleCode of normalizedModuleCodes) {
    const list = domainCache.get(moduleCode) || []
    for (const item of list) {
      if (item.status === 'error') {
        error.push(item.domain)
      } else {
        normal.push(item.domain)
      }
    }
  }

  return uniqDomains([
    ...normal,
    ...(options.includeError === false ? [] : error),
  ])
}
