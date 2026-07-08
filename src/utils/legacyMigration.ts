export interface LegacyMigrationResult {
  attempted: boolean
  migrated: boolean
  skipped: boolean
  reason: string
  importedCount: number
}

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

/**
 * 覆盖安装后，从旧 Electron 桌面端 Temp 缓存导入本地聊天记录。
 * 必须在加载会话/消息前 await，避免频道 API 先写入导致迁移被跳过。
 */
export async function runLegacyDesktopMigration(uid: string): Promise<LegacyMigrationResult | null> {
  const normalizedUid = String(uid || '').trim()
  if (!normalizedUid || !isTauri()) return null

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const result = await invoke<LegacyMigrationResult>('try_migrate_legacy_desktop_data', {
      uid: normalizedUid,
    })
    if (result.migrated) {
      console.info(
        `[legacy-migration] imported ${result.importedCount} messages for uid=${normalizedUid}`,
      )
    }
    return result
  } catch (error) {
    console.warn('[legacy-migration] failed', error)
    return null
  }
}

/** @deprecated 请使用 runLegacyDesktopMigration 并在数据加载前 await */
export function scheduleLegacyDesktopMigration(uid: string): void {
  void runLegacyDesktopMigration(uid)
}

export interface LegacyMigrationRetryOptions {
  /** 首次迁移未导入时的轮询间隔（毫秒）。 */
  intervalMs?: number
  /** 最长轮询时间（毫秒）。超过后停止重试。 */
  maxWaitMs?: number
  /** 真正导入到本地后回调，用于刷新会话列表/清缓存。 */
  onImported?: (result: LegacyMigrationResult) => void | Promise<void>
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 覆盖安装后旧包（Electron）只有在被踢下线/登出时才会把 Dexie 数据导出成 `abc` 缓存文件。
 * 新包登录初始化时该文件往往还不存在，所以首次迁移失败后需要有限次轮询：
 * 一旦旧包完成导出，就自动补迁移并回调刷新 UI。多次导入是幂等的（INSERT OR REPLACE）。
 */
export async function runLegacyDesktopMigrationWithRetry(
  uid: string,
  options: LegacyMigrationRetryOptions = {},
): Promise<LegacyMigrationResult | null> {
  const normalizedUid = String(uid || '').trim()
  if (!normalizedUid || !isTauri()) return null

  const intervalMs = Math.max(1000, options.intervalMs ?? 3000)
  const maxWaitMs = Math.max(intervalMs, options.maxWaitMs ?? 60000)

  const first = await runLegacyDesktopMigration(normalizedUid)
  if (first?.migrated) {
    await options.onImported?.(first)
    return first
  }

  // 已迁移且本地已有单聊/群聊数据时，Rust 端会返回 already migrated，无需继续轮询。
  if (first?.skipped && first.reason === 'already migrated') {
    return first
  }

  const deadline = Date.now() + maxWaitMs
  let last = first
  while (Date.now() < deadline) {
    await sleep(intervalMs)
    const result = await runLegacyDesktopMigration(normalizedUid)
    last = result
    if (result?.migrated) {
      await options.onImported?.(result)
      return result
    }
    if (result?.skipped && result.reason === 'already migrated') {
      return result
    }
  }
  return last
}
