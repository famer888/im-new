function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\\/:*?"<>|]/g, '_')
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
