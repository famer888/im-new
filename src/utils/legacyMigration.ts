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
