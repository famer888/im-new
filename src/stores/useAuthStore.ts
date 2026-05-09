import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getUserInfo } from '@/api/imBase'
import { setBaseUrl } from '@/api/config'

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
  init?: boolean
}

export interface WsConnectConfig {
  wsUrl: string
  aesKey: string
}

interface LogoutOptions {
  keepHistoryOnLogout?: boolean
}

const ACCOUNT_LIST_KEY = 'login-account-list'
const CURRENT_UID_KEY = 'current-uid'
const AUTO_LOGIN_KEY = 'auto-login-enabled'
const WS_CONNECT_KEY = 'ws-connect-config'

function normalizeWsUrl(input: string): string {
  const raw = (input || '').trim()
  if (!raw) return ''
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw
  if (raw.startsWith('https://')) return `wss://${raw.slice('https://'.length)}`
  if (raw.startsWith('http://')) return `ws://${raw.slice('http://'.length)}`
  return `ws://${raw}`
}

function resolveCurrentUidForLogout(
  sessionUid: string,
  accounts: AccountInfo[],
): string {
  const normalizedSessionUid = String(sessionUid || '').trim()
  if (normalizedSessionUid) return normalizedSessionUid

  const storedUid = String(localStorage.getItem(CURRENT_UID_KEY) || '').trim()
  if (storedUid) return storedUid

  const accountWithSession = accounts.find((item) => String(item.sessionId || '').trim())
  if (accountWithSession?.id) return String(accountWithSession.id)

  return String(accounts[0]?.id || '').trim()
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<SessionInfo | null>(null)
  const isLoggedIn = computed(() => !!session.value)
  const uid = computed(() => session.value?.uid ?? '')
  const nickname = computed(() => session.value?.nickname ?? '')
  const avatar = computed(() => session.value?.avatar ?? '')
  const accounts = ref<AccountInfo[]>([])
  const autoLoginEnabled = ref(true)
  const wsConnectConfig = ref<WsConnectConfig | null>(null)

  function normalizeTauriSession(
    tauriSession: SessionInfo | (SessionInfo & { session_id?: string; source_id?: string }) | null | undefined,
    fallback?: { uid?: string; sessionId?: string; nickname?: string; avatar?: string },
  ): SessionInfo {
    const ts = (tauriSession || {}) as SessionInfo & { session_id?: string; source_id?: string }
    return {
      uid: ts.uid || fallback?.uid || '',
      sessionId: ts.session_id || ts.sessionId || fallback?.sessionId || '',
      nickname: ts.nickname || fallback?.nickname || '',
      avatar: ts.avatar || fallback?.avatar || '',
      sourceId: ts.source_id || ts.sourceId,
    }
  }

  function loadAccounts() {
    try {
      const stored = localStorage.getItem(ACCOUNT_LIST_KEY)
      if (stored) accounts.value = JSON.parse(stored)
      autoLoginEnabled.value = localStorage.getItem(AUTO_LOGIN_KEY) !== 'false'
    } catch { /* empty */ }
  }

  function loadWsConnectConfig() {
    try {
      const stored = localStorage.getItem(WS_CONNECT_KEY)
      if (!stored) return
      const parsed = JSON.parse(stored) as Partial<WsConnectConfig>
      if (parsed.wsUrl && parsed.aesKey) {
        wsConnectConfig.value = {
          wsUrl: normalizeWsUrl(parsed.wsUrl),
          aesKey: String(parsed.aesKey).trim(),
        }
      }
    } catch {
      wsConnectConfig.value = null
    }
  }

  function saveWsConnectConfig(config: WsConnectConfig) {
    const normalized = {
      wsUrl: normalizeWsUrl(config.wsUrl),
      aesKey: String(config.aesKey || '').trim(),
    }
    wsConnectConfig.value = normalized
    localStorage.setItem(WS_CONNECT_KEY, JSON.stringify(normalized))
  }

  function clearWsConnectConfig() {
    wsConnectConfig.value = null
    localStorage.removeItem(WS_CONNECT_KEY)
  }

  function saveAccounts() {
    localStorage.setItem(ACCOUNT_LIST_KEY, JSON.stringify(accounts.value))
  }

  function addOrUpdateAccount(info: AccountInfo) {
    const idx = accounts.value.findIndex(a => a.id === info.id)
    if (idx >= 0) {
      const merged = { ...accounts.value[idx], ...info }
      accounts.value = [
        ...accounts.value.slice(0, idx),
        ...accounts.value.slice(idx + 1),
        merged,
      ]
    } else {
      accounts.value.push(info)
    }
    saveAccounts()
  }

  function isAccountInitialized(accountId: string): boolean {
    return accounts.value.some((item) => item.id === accountId && item.init === true)
  }

  function markAccountInitialized(accountId: string) {
    const id = String(accountId || '').trim()
    if (!id) return
    const idx = accounts.value.findIndex((item) => item.id === id)
    if (idx >= 0) {
      accounts.value[idx] = { ...accounts.value[idx], init: true }
    } else {
      accounts.value.push({
        id,
        name: session.value?.nickname || id,
        icon: session.value?.avatar,
        sessionId: session.value?.sessionId,
        sourceId: session.value?.sourceId,
        init: true,
      })
    }
    saveAccounts()
  }

  function getPreferredAccount(): AccountInfo | null {
    const lastUid = localStorage.getItem(CURRENT_UID_KEY) || ''
    if (lastUid) {
      const matched = accounts.value.find(a => a.id === lastUid && String(a.sessionId || '').trim())
      if (matched) return matched
    }
    return [...accounts.value].reverse().find(a => String(a.sessionId || '').trim()) || null
  }

  async function initSession() {
    loadAccounts()
    loadWsConnectConfig()

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
                request: {
                  uid: account.id,
                  nickname: account.name,
                  avatar: account.icon || '',
                  source_id: account.sourceId || null,
                  session_id: account.sessionId,
                },
              })
              const result = normalizeTauriSession(tauriSession, {
                uid: account.id,
                sessionId: account.sessionId,
                nickname: account.name,
                avatar: account.icon,
              })
              if (result.uid) {
                session.value = result
                localStorage.setItem(CURRENT_UID_KEY, result.uid)
              }
            } catch {
              console.warn('[auth] auto-login blocked or failed')
              return
            }
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
    sourceId?: string
    sessionId?: string
  }) {
    if (request.sessionUrl) {
      setBaseUrl(request.sessionUrl)
    }

    if (isTauri()) {
      const optimisticSession: SessionInfo = {
        uid: request.uid || '',
        sessionId: request.sessionId || '',
        nickname: request.nickname || '',
        avatar: request.avatar || '',
        sourceId: request.sourceId,
      }
      const previousUid = localStorage.getItem(CURRENT_UID_KEY)
      if (optimisticSession.uid) {
        localStorage.setItem(CURRENT_UID_KEY, optimisticSession.uid)
      }
      if (request.wsUrl.trim() && request.aesKey.trim()) {
        saveWsConnectConfig({
          wsUrl: request.wsUrl.trim(),
          aesKey: request.aesKey.trim(),
        })
      }

      let tauriSession: SessionInfo
      try {
        tauriSession = await tauriInvoke<SessionInfo>('login', {
          request: {
            uid: optimisticSession.uid,
            nickname: optimisticSession.nickname,
            avatar: optimisticSession.avatar,
            source_id: optimisticSession.sourceId || null,
            session_url: request.sessionUrl,
            ws_url: request.wsUrl,
            aes_key: request.aesKey,
            install_code: request.installCode,
            session_id: request.sessionId || '',
          },
        })
      } catch (error) {
        if (previousUid) {
          localStorage.setItem(CURRENT_UID_KEY, previousUid)
        } else {
          localStorage.removeItem(CURRENT_UID_KEY)
        }
        throw error
      }
      const result = normalizeTauriSession(tauriSession, {
        uid: optimisticSession.uid,
        sessionId: optimisticSession.sessionId,
        nickname: optimisticSession.nickname,
        avatar: optimisticSession.avatar,
      })
      if (result.uid) {
        session.value = result
        localStorage.setItem(CURRENT_UID_KEY, result.uid)
        addOrUpdateAccount({
          id: result.uid,
          name: result.nickname || result.uid,
          icon: result.avatar,
          sessionId: result.sessionId,
          sourceId: result.sourceId,
        })
      }
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
        request: {
          uid: account.id,
          nickname: account.name,
          avatar: account.icon || '',
          source_id: account.sourceId || null,
          session_id: account.sessionId,
        },
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

  async function logout(options?: LogoutOptions) {
    const currentUid = resolveCurrentUidForLogout(uid.value, accounts.value)
    const keepHistoryOnLogout = options?.keepHistoryOnLogout ?? true

    console.info('[auth] logout requested', {
      currentUid,
      keepHistoryOnLogout,
      isTauri: isTauri(),
    })

    if (isTauri()) {
      try {
        await tauriInvoke('logout', {
          uid: currentUid || null,
        })
      } catch (error) {
        console.warn('[auth] logout invoke failed:', error)
      }
    } else if (!keepHistoryOnLogout && currentUid) {
      localStorage.removeItem(`${currentUid}-conversations`)
    }

    session.value = null
    localStorage.removeItem(CURRENT_UID_KEY)
    localStorage.removeItem('browser-session')
    clearWsConnectConfig()
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

  async function refreshProfile() {
    const currentUid = Number(session.value?.uid || 0)
    if (!Number.isFinite(currentUid) || currentUid <= 0) return null

    if (session.value) {
      addOrUpdateAccount({
        id: session.value.uid,
        name: session.value.nickname || session.value.uid,
        icon: session.value.avatar,
        sessionId: session.value.sessionId,
        sourceId: session.value.sourceId,
      })
    }

    const response = await getUserInfo({ uid: currentUid })
    const commonResult = response.commonResult
    const errCode = Number(commonResult?.errCode ?? 200)
    if (errCode !== 200 && errCode !== 0) {
      throw new Error(commonResult?.errMsg || 'get user info failed')
    }

    const userInfo = response.userInfo
    if (!userInfo) return response

    updateProfile({
      nickname: userInfo.nickName || session.value?.nickname || '',
      avatar: userInfo.icon || session.value?.avatar || '',
    })
    return response
  }

  return {
    session,
    isLoggedIn,
    uid,
    nickname,
    avatar,
    accounts,
    autoLoginEnabled,
    wsConnectConfig,
    initSession,
    login,
    logout,
    switchAccount,
    addOrUpdateAccount,
    isAccountInitialized,
    markAccountInitialized,
    setAutoLogin,
    updateProfile,
    refreshProfile,
  }
})
