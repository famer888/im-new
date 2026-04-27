import { aesDecrypt, aesEncrypt } from '@/utils/crypto'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export interface AccountHistoryPayload {
  uid: string
  history: Record<string, unknown>
}

async function selectExportSavePath(fileName: string): Promise<string | null> {
  if (!isTauri()) return null
  const { save } = await import('@tauri-apps/plugin-dialog')
  return save({
    defaultPath: fileName,
  })
}

export async function exportAccountHistoryFile(uid: string, key: string): Promise<{ canceled: boolean }> {
  if (!isTauri()) {
    throw new Error('not tauri env')
  }

  const selectedPath = await selectExportSavePath('97历史记录导出文件')
  if (!selectedPath) {
    return { canceled: true }
  }

  const payload = await tauriInvoke<AccountHistoryPayload>('export_account_history_data', { uid })
  const plaintext = new TextEncoder().encode(JSON.stringify(payload))
  const encrypted = aesEncrypt(key, plaintext)

  await tauriInvoke('save_base64_image', {
    filePath: selectedPath,
    base64Data: bytesToBase64(encrypted),
  })

  return { canceled: false }
}

export async function importAccountHistoryFile(file: File, key: string): Promise<{ uid: string; importedCount: number }> {
  const arrayBuffer = await file.arrayBuffer()
  const decrypted = aesDecrypt(new Uint8Array(arrayBuffer), key)
  const decodedText = new TextDecoder().decode(decrypted)
  const parsed = JSON.parse(decodedText) as Partial<AccountHistoryPayload>
  const uid = String(parsed.uid || '').trim()
  const history = parsed.history

  if (!uid || !history || typeof history !== 'object' || Array.isArray(history)) {
    throw new Error('invalid account history payload')
  }

  const importedCount = await tauriInvoke<number>('import_account_history_data', {
    uid,
    history,
  })

  return {
    uid,
    importedCount,
  }
}
