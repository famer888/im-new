import { API_CONFIG } from '@/api/config'
import { getDynamicDomainListByOriginalModule } from '@/api/imDomain'
import { getDomainsByOriginalModuleCode } from '@/utils/domainPool'

function isBenchmarkWebBizDomain(url: string): boolean {
  try {
    const host = new URL(String(url || '').trim()).host.toLowerCase()
    return host.includes('webbiz')
  } catch {
    return String(url || '').toLowerCase().includes('webbiz')
  }
}

function uniqueBenchmarkDomains(urls: string[]): string[] {
  return [...new Set(
    urls
      .map(url => String(url || '').trim())
      .filter(url => url && isBenchmarkWebBizDomain(url)),
  )]
}

function appendRawBaseUrl(urls: string[]): string[] {
  // 对齐老 im：benchmark 列表最后补当前环境 baseBuildUrl，不使用已切换的缓存 base。
  return uniqueBenchmarkDomains([
    ...urls,
    API_CONFIG.rawBaseUrl,
  ])
}

function getLocalDynamicWebBizDomains(): string[] {
  // 老 im 的 network.vue 读取的是动态 domainList；prepared/oss 只是启动兜底，不应混进 benchmark 列表。
  return getDomainsByOriginalModuleCode('webBiz')
    .filter(d => d.source === 'dynamic' && d.status !== 'error')
    .sort((a, b) => {
      const aPriority = Number.isFinite(Number(a.priority)) ? Number(a.priority) : Infinity
      const bPriority = Number.isFinite(Number(b.priority)) ? Number(b.priority) : Infinity
      return aPriority - bPriority
    })
    .map(d => d.domain)
}

export function getCachedNetworkBenchmarkDomains(): string[] {
  return appendRawBaseUrl(getLocalDynamicWebBizDomains())
}

export async function preloadNetworkBenchmarkDomains(): Promise<string[]> {
  const cached = getCachedNetworkBenchmarkDomains()
  try {
    const apiDomains = await getDynamicDomainListByOriginalModule('webBiz')
    // 登录页提前预热 listDomain，保证点开 benchmark 时已有列表可渲染。
    return appendRawBaseUrl(apiDomains.length ? apiDomains : cached)
  } catch {
    return cached
  }
}
