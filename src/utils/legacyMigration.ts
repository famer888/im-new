export interface LegacyMigrationResult {
  attempted: boolean
  migrated: boolean
  skipped: boolean
  reason: string
  importedCount: number
  /** 仅 abc/temp_cache 完整导入为 true；IndexedDB 半导入为 false，需继续轮询补全。 */
  complete?: boolean
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
 * 覆盖安装后旧包（Electron）主要靠首页 30s 定时 cacheDB 写出 Temp `abc`；
 * 踢下线/登出的自动导出在旧首页基本未接通。新包安装时会先备份再卸旧包。
 * 登录后首次迁移若还未拿到可用缓存，会有限次轮询；多次导入幂等（INSERT OR REPLACE）。
 */
export async function runLegacyDesktopMigrationWithRetry(
  uid: string,
  options: LegacyMigrationRetryOptions = {},
): Promise<LegacyMigrationResult | null> {
  const normalizedUid = String(uid || '').trim()
  if (!normalizedUid || !isTauri()) return null

  const intervalMs = Math.max(1000, options.intervalMs ?? 3000)
  // IndexedDB 可能先半导入；多等一会儿以便旧包 30s 定时写出 abc 后再补全。
  const maxWaitMs = Math.max(intervalMs, options.maxWaitMs ?? 120000)

  const first = await runLegacyDesktopMigration(normalizedUid)
  if (first?.migrated) {
    await options.onImported?.(first)
    // IndexedDB 启发式可能不全，只有 abc 完整导入才结束；否则继续轮询等补全。
    if (first.complete || /temp cache/i.test(first.reason)) {
      return first
    }
  }

  // 已通过 abc 完整迁移时，Rust 端会返回 already migrated，无需继续轮询。
  // IndexedDB 半导入会返回 waiting for abc，继续轮询以便补全。
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
      if (result.complete || /temp cache/i.test(result.reason)) {
        return result
      }
      // IndexedDB 再导入后继续等 abc
      continue
    }
    if (result?.skipped && result.reason === 'already migrated') {
      return result
    }
  }
  return last
}
