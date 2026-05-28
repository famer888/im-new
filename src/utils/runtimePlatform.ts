export type RuntimePlatform = 'macos' | 'windows' | 'linux' | 'web' | 'unknown'

interface TauriPlatformInfo {
  os?: string
}

function isTauriRuntime(): boolean {
  return Boolean((window as any).__TAURI_INTERNALS__)
}

function mapPlatformName(raw: string): RuntimePlatform {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'darwin' || value === 'macos' || value.includes('mac')) return 'macos'
  if (value.includes('win')) return 'windows'
  if (value.includes('linux')) return 'linux'
  return 'unknown'
}

function detectFromNavigator(): RuntimePlatform {
  const ua = `${navigator.platform || ''} ${navigator.userAgent || ''}`
  return mapPlatformName(ua)
}

function getPlatformLabelZh(platform: RuntimePlatform): string {
  if (platform === 'macos') return 'macOS'
  if (platform === 'windows') return 'Windows'
  if (platform === 'linux') return 'Linux'
  if (platform === 'web') return '网页'
  return '未知平台'
}

export async function getRuntimePlatform(): Promise<RuntimePlatform> {
  if (!isTauriRuntime()) return 'web'

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const info = await invoke<TauriPlatformInfo>('get_platform_info')
    // 桌面端优先走 Tauri 原生平台信息，避免仅靠浏览器 UA 误判。
    const mapped = mapPlatformName(info?.os || '')
    if (mapped !== 'unknown') return mapped
  } catch {
    // 忽略失败并回退到浏览器信息，保证开发和异常场景也有结果。
  }

  return detectFromNavigator()
}

export async function logRuntimePlatform(tag = 'bootstrap'): Promise<RuntimePlatform> {
  const platform = await getRuntimePlatform()
  const mode = import.meta.env.PROD ? 'packaged' : 'dev'
  const modeZh = mode === 'packaged' ? '打包环境' : '本地开发'
  const platformZh = getPlatformLabelZh(platform)
  // 同时挂到 window，便于手动在控制台读取，避免日志过滤时看不到。
  ;(window as any).__OCS_RUNTIME_PLATFORM__ = platform
  ;(window as any).__printRuntimePlatform__ = () => logRuntimePlatform('manual')
  // 中文为主并保留英文代号，便于开发查看和问题排查。
  console.info(`[运行平台] 场景=${tag} 模式=${modeZh} 平台=${platformZh} (${platform})`)
  console.log(`[运行平台] 场景=${tag} 模式=${modeZh} 平台=${platformZh} (${platform})`)
  return platform
}
