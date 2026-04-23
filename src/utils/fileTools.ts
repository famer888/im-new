function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\\/:*?"<>|]/g, '_')
}

function isMacOS(): boolean {
  return /mac/i.test(navigator.platform || '')
}

const SAVE_OVERWRITE_GUARD = '\u2063\u2063\u2063'

export interface PngSavePathSelection {
  filePath: string
  canceled: boolean
  needsOverwriteConfirm: boolean
}

function ensurePngExtension(filePath: string): string {
  return filePath.toLowerCase().endsWith('.png') ? filePath : `${filePath}.png`
}

function addSaveOverwriteGuard(fileName: string): string {
  const normalized = ensurePngExtension(fileName)
  const lastDotIndex = normalized.lastIndexOf('.')
  if (lastDotIndex <= 0) {
    return `${normalized}${SAVE_OVERWRITE_GUARD}`
  }
  return `${normalized.slice(0, lastDotIndex)}${SAVE_OVERWRITE_GUARD}${normalized.slice(lastDotIndex)}`
}

function stripSaveOverwriteGuard(filePath: string): string {
  return filePath.split(SAVE_OVERWRITE_GUARD).join('')
}

async function fileExists(filePath: string): Promise<boolean> {
  if (!isTauri()) return false

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<boolean>('file_exists', { path: filePath })
  } catch {
    return false
  }
}

export async function userSelectSavePath(fileName: string): Promise<{ filePath: string; canceled: boolean }> {
  if (!isTauri()) {
    return { filePath: '', canceled: true }
  }
  const { save } = await import('@tauri-apps/plugin-dialog')
  const selectedPath = await save({
    defaultPath: sanitizeFileName(fileName),
    filters: [{ name: 'Image', extensions: ['png'] }],
  })
  if (!selectedPath) {
    return { filePath: '', canceled: true }
  }
  return { filePath: selectedPath, canceled: false }
}

export async function userSelectPngSavePathWithOverwrite(fileName: string): Promise<PngSavePathSelection> {
  if (!isTauri()) {
    return { filePath: '', canceled: true, needsOverwriteConfirm: false }
  }

  const { save } = await import('@tauri-apps/plugin-dialog')
  const sanitized = sanitizeFileName(fileName)
  const defaultPath = isMacOS() ? addSaveOverwriteGuard(sanitized) : sanitized
  const selectedPath = await save({
    defaultPath,
    filters: [{ name: 'Image', extensions: ['png'] }],
  })

  if (!selectedPath) {
    return { filePath: '', canceled: true, needsOverwriteConfirm: false }
  }

  const selectedWithExtension = ensurePngExtension(selectedPath)
  const hadOverwriteGuard = isMacOS() && selectedWithExtension.includes(SAVE_OVERWRITE_GUARD)
  const normalizedPath = ensurePngExtension(stripSaveOverwriteGuard(selectedWithExtension))

  return {
    filePath: normalizedPath,
    canceled: false,
    needsOverwriteConfirm: hadOverwriteGuard ? await fileExists(normalizedPath) : false,
  }
}

export async function exportBase64ImgToLocal(base64Image: string, filePath: string): Promise<Error | null> {
  try {
    if (!isTauri()) {
      return new Error('not tauri env')
    }
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('save_base64_image', {
      filePath,
      base64Data: base64Image,
    })
    return null
  } catch (error) {
    const message = typeof error === 'string'
      ? error
      : (error as { message?: string })?.message || JSON.stringify(error)
    return new Error(message || 'save_base64_image failed')
  }
}
