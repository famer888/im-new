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
 * 覆盖安装后，尝试从旧 Electron 桌面端 Temp 缓存导入本地聊天记录。
 * 失败不阻塞登录，成功后会写入 legacy_migration.json 避免重复导入。
 */
export function scheduleLegacyDesktopMigration(uid: string): void {
  const normalizedUid = String(uid || '').trim()
  if (!normalizedUid || !isTauri()) return

  void (async () => {
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
    } catch (error) {
      console.warn('[legacy-migration] failed', error)
    }
  })()
}
