function isTauri(): boolean {
  return Boolean((window as any).__TAURI_INTERNALS__)
}

function withTimeout<T>(task: Promise<T>, label: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out`))
    }, timeoutMs)

    task.then((result) => {
      window.clearTimeout(timer)
      resolve(result)
    }).catch((error) => {
      window.clearTimeout(timer)
      reject(error)
    })
  })
}

function writeTextWithExecCommand(text: string): void {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-999999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) {
    throw new Error('execCommand copy failed')
  }
}

export async function writeClipboardText(text: string): Promise<void> {
  const normalized = String(text ?? '')

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      // 桌面端优先走原生剪贴板，避开 WebView 焦点/权限导致的 navigator.clipboard 失败。
      await withTimeout(invoke('write_clipboard_text', { text: normalized }), 'native clipboard text write')
      return
    } catch (error) {
      console.warn('[clipboard] native text write failed, fallback to web:', error)
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await withTimeout(navigator.clipboard.writeText(normalized), 'web clipboard text write')
      return
    } catch (error) {
      console.warn('[clipboard] web text write failed, fallback to execCommand:', error)
    }
  }

  // 对齐旧 im：浏览器 Clipboard API 不可用时，用临时 textarea 兜底复制纯文本。
  writeTextWithExecCommand(normalized)
}
