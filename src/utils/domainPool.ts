export interface DomainItem {
  domain: string
  status: 'normal' | 'error'
  moduleCode: string
  lastCheck?: number
}

let domainCache: Map<string, DomainItem[]> = new Map()
let pollingTimer: ReturnType<typeof setInterval> | null = null

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
  } catch { /* empty */ }
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
