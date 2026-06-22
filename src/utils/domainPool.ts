import { requestViaTauriOrFetch } from '@/utils/tauriHttp'
import { isProdSafeDomain } from '@/utils/domainSafety'
import preloadedDomainSnapshot from '../../scripts/domains.json'

export interface DomainItem {
  domain: string
  status: 'normal' | 'error'
  moduleCode: string
  originalModuleCode?: string
  source?: DomainSource
  priority?: number
  lastCheck?: number
}

type DomainSource = 'dynamic' | 'prepared' | 'oss'

interface DynamicDomainDto {
  domainUrl: string
  moduleCode: string
  originalModuleCode?: string
  priority?: number
}

let domainCache: Map<string, DomainItem[]> = new Map()
let pollingTimer: ReturnType<typeof setInterval> | null = null

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

function hasRunArg(arg: string): boolean {
  try {
    const args = JSON.parse(String(import.meta.env.VITE_APP_RUN_ARGS || '[]'))
    return Array.isArray(args) && args.includes(arg)
  } catch {
    return false
  }
}

function shouldWriteDomainSnapshot(): boolean {
  // 对齐老 im：只在显式开关时写回 domains.json，避免日常运行污染仓库内快照。
  return String(import.meta.env.VITE_DOMAIN_SNAPSHOT_WRITE || '') === '1' || hasRunArg('domains')
}

// 打包态默认回灌构建前准备好的 domains.json，test/prod 由脚本先恢复对应快照。
function shouldUsePreloadedSnapshot(): boolean {
  return Boolean(import.meta.env.PROD) || isProdEnv() || String(import.meta.env.VITE_DOMAIN_SNAPSHOT_FORCE || '') === '1'
}

function getEnvName(): string {
  // 生产打包缺 env 时按 prod 隔离缓存和域名池，避免落回 default/test 缓存。
  const fallback = Boolean(import.meta.env.PROD) ? 'prod' : 'default'
  return String(import.meta.env.VITE_APP_ENV || fallback).trim().toLowerCase() || fallback
}

const ENV_NAME = getEnvName()
const IS_PROD_ENV = ENV_NAME === 'prod' || ENV_NAME === 'production'
const STORAGE_KEY = `domain-pool-cache:${ENV_NAME}`
const RAW_PREPARED_WEB_BIZ_DOMAIN = String(
  import.meta.env.VITE_APP_BASE_API || (IS_PROD_ENV ? 'https://webbiz.imono.xyz' : 'https://test-webbiz.68chat.co'),
).trim()
const RAW_PREPARED_DOMAIN_API = String(
  import.meta.env.VITE_APP_BASE_DOMAIN || (IS_PROD_ENV ? 'https://a1.lenghu.xyz' : 'https://test-domain-api.68chat.co'),
).trim()

const DIRECT_FALLBACK_DOMAINS: Record<string, string[]> = IS_PROD_ENV
  ? {
      // 生产的完整线上域名池来自 domains.json，这里只保留当前环境入口兜底。
      webBiz: [
        RAW_PREPARED_WEB_BIZ_DOMAIN,
      ],
      domain: [
        RAW_PREPARED_DOMAIN_API,
      ],
    }
  : {
      webBiz: [
        RAW_PREPARED_WEB_BIZ_DOMAIN,
      ],
      domain: [
        RAW_PREPARED_DOMAIN_API,
      ],
    }

const DOMAIN_SOURCE_RANK: Record<DomainSource, number> = {
  dynamic: 0,
  prepared: 1,
  oss: 2,
}

const MODULE_CODE_ALIAS_MAP: Record<string, string> = {
  biz: 'webBiz',
  config: 'domain',
  domainConfig: 'domain',
  // 新版聊天图片 OSS 模块必须保留原名；上传要优先走 v2 图片桶，不能再并入旧图片域名池。
}

function isProdEnv(): boolean {
  return IS_PROD_ENV
}

function shouldAcceptDomainForEnv(domain: string): boolean {
  const raw = String(domain || '').trim()
  if (!raw) return false
  if (!isProdEnv()) return true
  // 线上包不能继续消费历史缓存或远端下发里的测试域名，否则登录重试会被导到 test 服务。
  return isDomainCompatibleWithProd(raw)
}

function getDomainHost(domain: string): string {
  const raw = String(domain || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw).host.toLowerCase()
  } catch {
    try {
      return new URL(`https://${raw}`).host.toLowerCase()
    } catch {
      return raw.toLowerCase()
    }
  }
}

function isDomainCompatibleWithProd(domain: string): boolean {
  return isProdSafeDomain(domain)
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

// 只按登录域名族归类，具体线上/test host 交给当前环境快照提供。
function isLoginOnlyDomain(domain: string): boolean {
  try {
    const host = new URL(String(domain || '').trim()).host.toLowerCase()
    return host.startsWith('openchat-loginv2.')
  } catch {
    return false
  }
}

function normalizeItem(item: DomainItem): DomainItem | null {
  const moduleCode = normalizeModuleCode(item.moduleCode)
  const domain = String(item.domain || '').trim()
  const originalModuleCode = String(item.originalModuleCode || '').trim()
  if (!moduleCode || !domain || !shouldAcceptDomainForEnv(domain)) return null
  return {
    domain,
    moduleCode,
    originalModuleCode,
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
        // 网络检测需要按后台原始模块名过滤；已有缓存缺失时用新快照/API 数据补齐。
        originalModuleCode: item.originalModuleCode || previous.originalModuleCode,
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
        || nextItem.originalModuleCode !== previous.originalModuleCode
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
      originalModuleCode: moduleCode,
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
      originalModuleCode: item.originalModuleCode,
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
}

function normalizeSnapshotModuleCode(moduleCode: string): string {
  const normalized = normalizeModuleCode(moduleCode)
  if (normalized === 'session') return 'webSession'
  if (normalized === 'friend' || normalized === 'group' || normalized === 'login') return 'webBiz'
  return normalized
}

// 打包后把构建脚本准备好的 domains.json 回灌进域名池，确保包内域名跟目标环境一致。
function applyPreloadedDomainSnapshot() {
  if (!shouldUsePreloadedSnapshot()) return
  const snapshot = preloadedDomainSnapshot as { domainDtoList?: Array<{ domainUrl?: string, moduleCode?: string, priority?: number }> }
  const domainDtoList = Array.isArray(snapshot?.domainDtoList) ? snapshot.domainDtoList : []
  if (!domainDtoList.length) return

  const now = Date.now()
  const items: DomainItem[] = []
  for (const [index, entry] of domainDtoList.entries()) {
    const domain = String(entry?.domainUrl || '').trim()
    const rawModuleCode = String(entry?.moduleCode || '')
    const moduleCode = normalizeSnapshotModuleCode(rawModuleCode)
    if (!domain || !moduleCode) continue
    const priority = Number.isFinite(Number(entry?.priority)) ? Number(entry?.priority) : index
    items.push({
      domain,
      moduleCode,
      originalModuleCode: rawModuleCode,
      status: 'normal',
      source: 'prepared',
      priority,
      lastCheck: now,
    })
    // 旧快照里 login 模块会归到 webBiz，同时也要进入 login_v2 池供扫码登录兜底。
    if (normalizeModuleCode(rawModuleCode) === 'login' || normalizeModuleCode(rawModuleCode) === 'login_v2') {
      items.push({
        domain,
        moduleCode: 'login_v2',
        originalModuleCode: rawModuleCode,
        status: 'normal',
        source: 'prepared',
        priority,
        lastCheck: now,
      })
    }
  }

  if (!items.length) return
  upsertDomainItems(items)
}

async function saveDomainListSnapshot(domainDtoList: DynamicDomainDto[]): Promise<void> {
  if (!shouldWriteDomainSnapshot()) return
  if (!isTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('save_list_domain_snapshot', {
      payload: {
        response: { domainDtoList },
      },
    })
  } catch {
    // ignore snapshot save failures to keep domain refresh flow stable
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
applyPreloadedDomainSnapshot()
saveToStorage()

export async function initDomainPool() {
  seedFallbackDomains()
  applyPreloadedDomainSnapshot()
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
    // 对齐 F05：OSS 引导文件统一走同一层调用，桌面端由主进程代发，网页端走 fetch 兜底。
    const response = await requestViaTauriOrFetch({
      url: ossUrl,
      method: 'GET',
      headers: {
        Accept: 'text/plain,application/json,*/*',
      },
      purpose: 'oss_seed',
    })
    if (!response.ok) return []
    const content = response.body
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
    await saveDomainListSnapshot(domainDtoList)

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
          originalModuleCode: entry.originalModuleCode || entry.moduleCode,
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
  let normalizedFailedBase = ''
  try {
    const parsed = new URL(String(domain || '').trim())
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      normalizedFailedBase = `${parsed.protocol}//${parsed.host}`
    }
  } catch {
    normalizedFailedBase = ''
  }
  // 失败域名可能存在尾斜杠等格式差异，这里按标准化基地址匹配，避免 487 域名漏标记。
  const item = list.find((entry) => {
    if (entry.domain === domain) return true
    if (!normalizedFailedBase) return false
    try {
      const parsed = new URL(String(entry.domain || '').trim())
      const normalizedEntryBase = `${parsed.protocol}//${parsed.host}`
      return normalizedEntryBase === normalizedFailedBase
    } catch {
      return false
    }
  })
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

export function getDomainsByOriginalModuleCode(moduleCode: string): DomainItem[] {
  const rawModuleCode = String(moduleCode || '').trim()
  if (!rawModuleCode) return []
  // 对齐老 im 的网络检测：只看后台原始 moduleCode，避免 biz/friend/group/login 被归一化后混入 webBiz。
  return Array.from(domainCache.values())
    .flat()
    .filter(item => item.originalModuleCode === rawModuleCode)
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
