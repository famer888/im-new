import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export interface SessionInfo {
  uid: string
  sessionId: string
  nickname: string
  avatar: string
  sourceId?: string
}

export interface AccountInfo {
  id: string
  name: string
  icon?: string
  sessionId?: string
  sourceId?: string
}

const ACCOUNT_LIST_KEY = 'login-account-list'
const CURRENT_UID_KEY = 'current-uid'
const AUTO_LOGIN_KEY = 'auto-login-enabled'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<SessionInfo | null>(null)
  const isLoggedIn = computed(() => !!session.value)
  const uid = computed(() => session.value?.uid ?? '')
  const nickname = computed(() => session.value?.nickname ?? '')
  const avatar = computed(() => session.value?.avatar ?? '')
  const accounts = ref<AccountInfo[]>([])
  const autoLoginEnabled = ref(true)

  function normalizeTauriSession(
    tauriSession: SessionInfo | (SessionInfo & { session_id?: string }) | null | undefined,
    fallback?: { uid?: string; sessionId?: string; nickname?: string; avatar?: string },
  ): SessionInfo {
    const ts = (tauriSession || {}) as SessionInfo & { session_id?: string }
    return {
      uid: ts.uid || fallback?.uid || '',
      sessionId: ts.session_id || ts.sessionId || fallback?.sessionId || '',
      nickname: ts.nickname || fallback?.nickname || '',
      avatar: ts.avatar || fallback?.avatar || '',
      sourceId: ts.sourceId,
    }
  }

  function loadAccounts() {
    try {
      const stored = localStorage.getItem(ACCOUNT_LIST_KEY)
      if (stored) accounts.value = JSON.parse(stored)
      autoLoginEnabled.value = localStorage.getItem(AUTO_LOGIN_KEY) !== 'false'
    } catch { /* empty */ }
  }

  function saveAccounts() {
    localStorage.setItem(ACCOUNT_LIST_KEY, JSON.stringify(accounts.value))
  }

  function addOrUpdateAccount(info: AccountInfo) {
    const idx = accounts.value.findIndex(a => a.id === info.id)
    if (idx >= 0) {
      accounts.value[idx] = { ...accounts.value[idx], ...info }
    } else {
      accounts.value.push(info)
    }
    saveAccounts()
  }

  function getPreferredAccount(): AccountInfo | null {
    const lastUid = localStorage.getItem(CURRENT_UID_KEY) || ''
    if (lastUid) {
      const matched = accounts.value.find(a => a.id === lastUid)
      if (matched) return matched
    }
    return accounts.value[0] || null
  }

  async function initSession() {
    loadAccounts()

    // If session was already set (e.g. by login()), skip restore
    if (session.value) return

    if (isTauri()) {
      try {
        const stored = await tauriInvoke<SessionInfo | null>('get_session')
        if (stored) {
          const result = normalizeTauriSession(stored)
          if (result.uid) {
            session.value = result
            localStorage.setItem(CURRENT_UID_KEY, result.uid)
            return
          }
        }

        if (autoLoginEnabled.value && accounts.value.length > 0) {
          const account = getPreferredAccount()
          if (account?.sessionId) {
            try {
              const tauriSession = await tauriInvoke<SessionInfo>('login', {
                request: { session_id: account.sessionId },
              })
              const result = normalizeTauriSession(tauriSession, {
                uid: account.id,
                sessionId: account.sessionId,
                nickname: account.name,
                avatar: account.icon,
              })
              session.value = result
              localStorage.setItem(CURRENT_UID_KEY, result.uid)
            } catch { /* auto-login failed */ }
          }
        }

        // Fallback: make sure uid/session can still be restored from account cache.
        if (!session.value?.uid && accounts.value.length > 0) {
          const account = getPreferredAccount()
          if (account?.id) {
            session.value = {
              uid: account.id,
              sessionId: account.sessionId || '',
              nickname: account.name || '',
              avatar: account.icon || '',
              sourceId: account.sourceId,
            }
            localStorage.setItem(CURRENT_UID_KEY, account.id)
          }
        }
      } catch {
        console.error('Failed to init session')
      }
    } else {
      // Browser mode: restore session from localStorage
      const lastUid = localStorage.getItem(CURRENT_UID_KEY)
      if (lastUid) {
        const storedSession = localStorage.getItem('browser-session')
        if (storedSession) {
          try {
            session.value = JSON.parse(storedSession)
          } catch { /* corrupted */ }
        } else {
          const account = accounts.value.find(a => a.id === lastUid)
          if (account) {
            session.value = {
              uid: account.id,
              sessionId: account.sessionId || '',
              nickname: account.name,
              avatar: account.icon || '',
            }
          }
        }
      }
    }
  }

  async function login(request: {
    sessionUrl: string
    wsUrl: string
    aesKey: string
    installCode: string
    uid?: string
    nickname?: string
    avatar?: string
    sessionId?: string
  }) {
    if (isTauri()) {
      const tauriSession = await tauriInvoke<SessionInfo>('login', {
        request: {
          session_url: request.sessionUrl,
          ws_url: request.wsUrl,
          aes_key: request.aesKey,
          install_code: request.installCode,
        },
      })
      const result = normalizeTauriSession(tauriSession, {
        uid: request.uid,
        sessionId: request.sessionId,
        nickname: request.nickname,
        avatar: request.avatar,
      })
      session.value = result
      localStorage.setItem(CURRENT_UID_KEY, result.uid)
      addOrUpdateAccount({
        id: result.uid,
        name: result.nickname,
        icon: result.avatar,
        sessionId: result.sessionId,
        sourceId: result.sourceId,
      })
      return result
    }

    const browserSession: SessionInfo = {
      uid: request.uid || '',
      sessionId: request.sessionId || '',
      nickname: request.nickname || '',
      avatar: request.avatar || '',
    }
    session.value = browserSession
    localStorage.setItem(CURRENT_UID_KEY, browserSession.uid)
    localStorage.setItem('browser-session', JSON.stringify(browserSession))
    return browserSession
  }

  async function switchAccount(account: AccountInfo) {
    if (!account.sessionId) return

    if (isTauri()) {
      const tauriSession = await tauriInvoke<SessionInfo>('login', {
        request: { session_id: account.sessionId },
      })
      const result = normalizeTauriSession(tauriSession, {
        uid: account.id,
        sessionId: account.sessionId,
        nickname: account.name,
        avatar: account.icon,
      })
      session.value = result
      localStorage.setItem(CURRENT_UID_KEY, result.uid)
    } else {
      session.value = {
        uid: account.id,
        sessionId: account.sessionId,
        nickname: account.name,
        avatar: account.icon || '',
      }
      localStorage.setItem(CURRENT_UID_KEY, account.id)
    }
  }

  async function logout() {
    if (isTauri()) {
      try {
        await tauriInvoke('logout')
      } catch { /* ignore in browser */ }
    }
    const currentUid = uid.value
    session.value = null
    localStorage.removeItem(CURRENT_UID_KEY)
    localStorage.removeItem('browser-session')
    const idx = accounts.value.findIndex(a => a.id === currentUid)
    if (idx >= 0) {
      accounts.value[idx].sessionId = undefined
      saveAccounts()
    }
  }

  function setAutoLogin(enabled: boolean) {
    autoLoginEnabled.value = enabled
    localStorage.setItem(AUTO_LOGIN_KEY, String(enabled))
  }

  function updateProfile(payload: { nickname?: string; avatar?: string }) {
    if (!session.value) return

    session.value = {
      ...session.value,
      nickname: payload.nickname ?? session.value.nickname,
      avatar: payload.avatar ?? session.value.avatar,
    }

    const currentUid = session.value.uid
    const account = accounts.value.find(item => item.id === currentUid)
    if (account) {
      account.name = session.value.nickname
      account.icon = session.value.avatar
      saveAccounts()
    }

    if (!isTauri()) {
      localStorage.setItem('browser-session', JSON.stringify(session.value))
    }
  }

  return {
    session,
    isLoggedIn,
    uid,
    nickname,
    avatar,
    accounts,
    autoLoginEnabled,
    initSession,
    login,
    logout,
    switchAccount,
    addOrUpdateAccount,
    setAutoLogin,
    updateProfile,
  }
})
