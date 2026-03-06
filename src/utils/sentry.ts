export enum ErrorType {
  Http = 1,
  WebSocket = 2,
  App = 3,
}

interface SentryTag {
  key: string
  value: string
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

export async function sendErrToSentry(
  errType: ErrorType,
  content: string | Error,
  tags: SentryTag[] = [],
) {
  const message = content instanceof Error ? content.message : String(content)
  const stack = content instanceof Error ? content.stack : undefined

  if (!isTauri()) {
    console.error('[Sentry]', message)
    return
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('report_error', {
      errType,
      message,
      stack,
      tags: tags.map(t => [t.key, t.value]),
    })
  } catch {
    console.error('[Sentry]', message)
  }
}

export function setupGlobalErrorHandler() {
  window.addEventListener('error', (event) => {
    sendErrToSentry(ErrorType.App, event.error || event.message)
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason))
    sendErrToSentry(ErrorType.App, reason)
  })
}
