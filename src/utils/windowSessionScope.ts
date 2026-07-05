/** 桌面端多开时，localStorage 会在进程间共享；当前窗口 uid 必须走 sessionStorage。 */
export const CURRENT_UID_KEY = 'current-uid'
export const LAST_LOGIN_UID_HINT_KEY = 'last-login-uid'

export function isTauriDesktop(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

export function getWindowScopedCurrentUid(): string {
  if (typeof window === 'undefined') return ''
  if (isTauriDesktop()) {
    return String(sessionStorage.getItem(CURRENT_UID_KEY) || '').trim()
  }
  return String(localStorage.getItem(CURRENT_UID_KEY) || '').trim()
}

export function setWindowScopedCurrentUid(uid: string) {
  const id = String(uid || '').trim()
  if (!id || typeof window === 'undefined') return
  if (isTauriDesktop()) {
    sessionStorage.setItem(CURRENT_UID_KEY, id)
    return
  }
  localStorage.setItem(CURRENT_UID_KEY, id)
}

export function clearWindowScopedCurrentUid(uid?: string) {
  if (typeof window === 'undefined') return
  const stored = getWindowScopedCurrentUid()
  const target = String(uid || '').trim()
  if (target && stored && stored !== target) return
  if (isTauriDesktop()) {
    sessionStorage.removeItem(CURRENT_UID_KEY)
    return
  }
  localStorage.removeItem(CURRENT_UID_KEY)
}

/** 登录页展示“上次登录账号”时使用，不参与运行时鉴权。 */
export function getLastUsedUidHint(): string {
  if (typeof window === 'undefined') return ''
  return String(
    localStorage.getItem(LAST_LOGIN_UID_HINT_KEY)
    || localStorage.getItem(CURRENT_UID_KEY)
    || '',
  ).trim()
}

export function setLastUsedUidHint(uid: string) {
  const id = String(uid || '').trim()
  if (!id || typeof window === 'undefined') return
  localStorage.setItem(LAST_LOGIN_UID_HINT_KEY, id)
}
