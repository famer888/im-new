function isTauri(): boolean {
  return Boolean((window as any).__TAURI_INTERNALS__)
}

function copyDebugPreview(value: unknown, limit = 160): string {
  const text = String(value ?? '')
  return text.length > limit ? `${text.slice(0, limit)}...(len=${text.length})` : text
}

function copyDebugLog(message: string, data: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'warn') {
  if (!import.meta.env.DEV) return
  const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.debug
  logFn(`[copy-debug] ${message}`, data)
  if (!isTauri()) return
  void import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('image_send_log', {
      payload: {
        level,
        message: `[copy-debug] ${message}`,
        data,
      },
    }))
    .catch(() => {})
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
  copyDebugLog('execCommand clipboard write start', {
    textLength: text.length,
    textHead: copyDebugPreview(text),
  }, 'info')
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
    copyDebugLog('execCommand clipboard write failed', {
      textLength: text.length,
    }, 'error')
    throw new Error('execCommand copy failed')
  }
  copyDebugLog('execCommand clipboard write success', {
    textLength: text.length,
  }, 'info')
}

export async function writeClipboardText(text: string): Promise<void> {
  const normalized = String(text ?? '')
  copyDebugLog('clipboard write request', {
    textLength: normalized.length,
    textHead: copyDebugPreview(normalized),
    textTail: normalized.length > 160 ? normalized.slice(-160) : '',
    isTauri: isTauri(),
    hasNavigatorClipboard: Boolean(navigator.clipboard?.writeText),
  }, 'info')

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      // 桌面端优先走原生剪贴板，避开 WebView 焦点/权限导致的 navigator.clipboard 失败。
      await withTimeout(invoke('write_clipboard_text', { text: normalized }), 'native clipboard text write')
      copyDebugLog('native clipboard write success', {
        textLength: normalized.length,
      }, 'info')
      return
    } catch (error) {
      copyDebugLog('native clipboard write failed, fallback to web', {
        textLength: normalized.length,
        error: error instanceof Error ? error.message : String(error),
      }, 'warn')
      console.warn('[clipboard] native text write failed, fallback to web:', error)
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await withTimeout(navigator.clipboard.writeText(normalized), 'web clipboard text write')
      copyDebugLog('web clipboard write success', {
        textLength: normalized.length,
      }, 'info')
      return
    } catch (error) {
      copyDebugLog('web clipboard write failed, fallback to execCommand', {
        textLength: normalized.length,
        error: error instanceof Error ? error.message : String(error),
      }, 'warn')
      console.warn('[clipboard] web text write failed, fallback to execCommand:', error)
    }
  }

  // 对齐旧 im：浏览器 Clipboard API 不可用时，用临时 textarea 兜底复制纯文本。
  writeTextWithExecCommand(normalized)
}
