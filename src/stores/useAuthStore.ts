import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getUserInfo } from '@/api/imBase'
import { API_CONFIG, setBaseUrl } from '@/api/config'
import { clearActiveSessionContext, setActiveSessionContext } from '@/api/sessionContext'
import { getOrCreateInstallCode } from '@/utils/installCode'
import { isProdSafeDomain } from '@/utils/domainSafety'
import { clearSensitiveWords, refreshChatSensitiveWords } from '@/utils/sensitiveWords'
import {
  CURRENT_UID_KEY,
  clearWindowScopedCurrentUid,
  getLastUsedUidHint,
  getWindowScopedCurrentUid,
  setLastUsedUidHint,
  setWindowScopedCurrentUid,
} from '@/utils/windowSessionScope'

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
  installCode?: string
}

interface LogoutOptions {
  keepHistoryOnLogout?: boolean
  preserveLoginCache?: boolean
}

interface InitSessionOptions {
  restoreSession?: boolean
  autoLogin?: boolean
  fallbackToCachedAccount?: boolean
}

/** 主窗口只恢复本进程 Rust 会话，避免多开时从共享 localStorage 误登其它账号 */
export const PROCESS_LOCAL_INIT_SESSION_OPTIONS: InitSessionOptions = {
  restoreSession: true,
  autoLogin: false,
  fallbackToCachedAccount: false,
}

const ACCOUNT_LIST_KEY = 'login-account-list'
const AUTO_LOGIN_KEY = 'auto-login-enabled'
const LEGACY_WS_CONNECT_KEY = 'ws-connect-config'
const WS_CONNECT_KEY = `${LEGACY_WS_CONNECT_KEY}:${API_CONFIG.env}:${API_CONFIG.brandId}`

function wsConnectStorageKey(uid?: string): string {
  const id = String(uid || getWindowScopedCurrentUid() || '').trim()
  if (isTauri() && id) return `${WS_CONNECT_KEY}:${id}`
  return WS_CONNECT_KEY
}

function persistCurrentUid(uid: string) {
  setWindowScopedCurrentUid(uid)
  setLastUsedUidHint(uid)
}

function clearPersistedCurrentUid(uid?: string) {
  clearWindowScopedCurrentUid(uid)
}

function normalizeWsUrl(input: string): string {
  const raw = (input || '').trim()
  if (!raw) return ''
  if (/^ws:\/\/[^/]+:443(?:\/|$)/i.test(raw)) {
    // 修复旧缓存/旧归一化写入的 ws://*:443；443 生产 webSession 需要按 TLS WebSocket 连接。
    return `wss://${raw.slice('ws://'.length)}`
  }
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw
  if (raw.startsWith('https://')) return `wss://${raw.slice('https://'.length)}`
  if (raw.startsWith('http://')) return `ws://${raw.slice('http://'.length)}`
  // 对齐旧 im 登录域名检查：生产 webSession 裸域名默认按 TLS WebSocket 连接，避免 443 被误连成明文 ws。
  return `wss://${raw}`
}

function resolveCurrentUidForLogout(
  sessionUid: string,
  accounts: AccountInfo[],
): string {
  const normalizedSessionUid = String(sessionUid || '').trim()
  if (normalizedSessionUid) return normalizedSessionUid

  const storedUid = getWindowScopedCurrentUid()
  if (storedUid) return storedUid

  if (isTauri()) return ''

  const legacyStoredUid = String(localStorage.getItem(CURRENT_UID_KEY) || '').trim()
  if (legacyStoredUid) return legacyStoredUid

  const accountWithSession = accounts.find((item) => String(item.sessionId || '').trim())
  if (accountWithSession?.id) return String(accountWithSession.id)

  return String(accounts[0]?.id || '').trim()
}

function isWsConnectConfigCompatibleWithEnv(wsUrl: string): boolean {
  const raw = String(wsUrl || '').trim()
  if (!raw) return false
  if (API_CONFIG.env === 'prod' || API_CONFIG.env === 'production') {
    try {
      const parsed = new URL(raw)
      const host = parsed.host.toLowerCase()
      // 生产环境不能复用测试 WS/IP 缓存；否则服务端回包 AES key 与当前环境不一致。
      return parsed.protocol === 'wss:'
        && !/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(host)
        && isProdSafeDomain(raw)
    } catch {
      return false
    }
  }
  return true
}

function authDiag(message: string, data?: Record<string, unknown>) {
  void message
  void data
}

function safeUrlHost(value: string): string {
  try {
    return new URL(String(value || '').trim()).host
  } catch {
    return ''
  }
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

  function setSession(next: SessionInfo | null) {
    session.value = next
    if (next?.uid && next.sessionId) {
      setActiveSessionContext({
        uid: next.uid,
        sessionId: next.sessionId,
      })
      // 登录态建立后再拉敏感词，确保请求头里的 sessionId 已经就绪。
      refreshChatSensitiveWords('session-ready').catch(() => {})
    } else if (!next) {
      clearActiveSessionContext()
      clearSensitiveWords()
    }
  }

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

  function loadWsConnectConfig(uid?: string) {
    try {
      const storageKeys = [
        wsConnectStorageKey(uid),
        WS_CONNECT_KEY,
        LEGACY_WS_CONNECT_KEY,
      ]
      for (const storageKey of [...new Set(storageKeys)]) {
        const stored = localStorage.getItem(storageKey)
        if (!stored) continue
        const parsed = JSON.parse(stored) as Partial<WsConnectConfig>
        if (parsed.wsUrl && parsed.aesKey && isWsConnectConfigCompatibleWithEnv(normalizeWsUrl(parsed.wsUrl))) {
          wsConnectConfig.value = {
            wsUrl: normalizeWsUrl(parsed.wsUrl),
            aesKey: String(parsed.aesKey).trim(),
            installCode: String(parsed.installCode || '').trim() || getOrCreateInstallCode(),
          }
          authDiag('loaded ws config', {
            storageKey,
            wsHost: safeUrlHost(wsConnectConfig.value.wsUrl),
            hasAesKey: !!wsConnectConfig.value.aesKey,
          })
          return
        }
        localStorage.removeItem(storageKey)
        authDiag('removed incompatible ws config', {
          storageKey,
          env: API_CONFIG.env,
          wsUrl: parsed.wsUrl || '',
        })
      }
    } catch {
      wsConnectConfig.value = null
      authDiag('failed to parse ws config')
    }
  }

  function saveWsConnectConfig(config: WsConnectConfig, uid?: string) {
    const normalized = {
      wsUrl: normalizeWsUrl(config.wsUrl),
      aesKey: String(config.aesKey || '').trim(),
      installCode: String(config.installCode || '').trim() || getOrCreateInstallCode(),
    }
    if (!isWsConnectConfigCompatibleWithEnv(normalized.wsUrl)) {
      clearWsConnectConfig(uid)
      authDiag('ignored incompatible ws config on save', {
        env: API_CONFIG.env,
        wsHost: safeUrlHost(normalized.wsUrl),
      })
      return
    }
    wsConnectConfig.value = normalized
    const storageKey = wsConnectStorageKey(uid)
    localStorage.setItem(storageKey, JSON.stringify(normalized))
    authDiag('saved ws config', {
      storageKey,
      wsHost: safeUrlHost(normalized.wsUrl),
      hasAesKey: !!normalized.aesKey,
    })
  }

  function clearWsConnectConfig(uid?: string) {
    wsConnectConfig.value = null
    localStorage.removeItem(wsConnectStorageKey(uid))
    if (!uid) {
      localStorage.removeItem(WS_CONNECT_KEY)
      localStorage.removeItem(LEGACY_WS_CONNECT_KEY)
    }
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
    const lastUid = isTauri()
      ? (getWindowScopedCurrentUid() || getLastUsedUidHint())
      : (localStorage.getItem(CURRENT_UID_KEY) || '')
    if (lastUid) {
      const matched = accounts.value.find(a => a.id === lastUid && String(a.sessionId || '').trim())
      if (matched) return matched
    }
    return [...accounts.value].reverse().find(a => String(a.sessionId || '').trim()) || null
  }

  async function initSession(options: InitSessionOptions = {}) {
    const {
      restoreSession = true,
      autoLogin = true,
      fallbackToCachedAccount = true,
    } = options

    loadAccounts()
    if (!isTauri()) {
      loadWsConnectConfig()
    }
    authDiag('init session start', {
      isTauri: isTauri(),
      restoreSession,
      autoLogin,
      fallbackToCachedAccount,
      accountCount: accounts.value.length,
    })

    // If session was already set (e.g. by login()), skip restore
    if (session.value) return

    if (isTauri()) {
      try {
        if (restoreSession) {
          const stored = await tauriInvoke<SessionInfo | null>('get_session')
          if (stored) {
            const result = normalizeTauriSession(stored)
            if (result.uid) {
              setSession(result)
              persistCurrentUid(result.uid)
              loadWsConnectConfig(result.uid)
              authDiag('restored tauri session', {
                uid: result.uid,
                hasSessionId: !!result.sessionId,
                hasWsConfig: !!wsConnectConfig.value,
              })
              return
            }
          }
        }

        if (autoLogin && autoLoginEnabled.value && accounts.value.length > 0) {
          const hasForeignActiveLogin = await tauriInvoke<boolean>('has_foreign_active_login').catch(() => false)
          if (hasForeignActiveLogin) {
            authDiag('skip shared account auto login: other desktop window already active')
          } else {
          const account = getPreferredAccount()
          if (account?.sessionId) {
            try {
              loadWsConnectConfig(account.id)
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
                setSession(result)
                persistCurrentUid(result.uid)
                authDiag('auto login restored from account', {
                  uid: result.uid,
                  hasSessionId: !!result.sessionId,
                  hasWsConfig: !!wsConnectConfig.value,
                })
              }
            } catch {
              console.warn('[auth] auto-login blocked or failed')
              authDiag('auto login failed')
              return
            }
          }
          }
        }

        // Fallback: make sure uid/session can still be restored from account cache.
        if (fallbackToCachedAccount && !(session.value as SessionInfo | null)?.uid && accounts.value.length > 0) {
          const account = getPreferredAccount()
          if (account?.id) {
            setSession({
              uid: account.id,
              sessionId: account.sessionId || '',
              nickname: account.name || '',
              avatar: account.icon || '',
              sourceId: account.sourceId,
            })
            persistCurrentUid(account.id)
            loadWsConnectConfig(account.id)
            authDiag('fallback restored from cached account', {
              uid: account.id,
              hasSessionId: !!account.sessionId,
              hasWsConfig: !!wsConnectConfig.value,
            })
          }
        }
      } catch {
        console.error('Failed to init session')
        authDiag('init session failed')
      }
    } else {
      // Browser mode: restore session from localStorage
      const lastUid = localStorage.getItem(CURRENT_UID_KEY)
      if (lastUid) {
        const storedSession = localStorage.getItem('browser-session')
        if (storedSession) {
          try {
            setSession(JSON.parse(storedSession))
          } catch { /* corrupted */ }
        } else {
          const account = accounts.value.find(a => a.id === lastUid)
          if (account) {
            setSession({
              uid: account.id,
              sessionId: account.sessionId || '',
              nickname: account.name,
              avatar: account.icon || '',
            })
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
    authDiag('login start', {
      uid: request.uid || '',
      sessionHost: safeUrlHost(request.sessionUrl),
      wsHost: safeUrlHost(normalizeWsUrl(request.wsUrl)),
      hasSessionId: !!request.sessionId,
      hasAesKey: !!request.aesKey,
    })
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
      const previousUid = getWindowScopedCurrentUid()
      const optimisticAccountIndex = optimisticSession.uid
        ? accounts.value.findIndex(a => a.id === optimisticSession.uid)
        : -1
      const previousOptimisticAccount = optimisticAccountIndex >= 0
        ? { ...accounts.value[optimisticAccountIndex] }
        : null
      const wroteOptimisticAccount = Boolean(optimisticSession.uid)
      const installCode = String(request.installCode || '').trim() || getOrCreateInstallCode()
      if (optimisticSession.uid) {
        persistCurrentUid(optimisticSession.uid)
        addOrUpdateAccount({
          id: optimisticSession.uid,
          name: optimisticSession.nickname || optimisticSession.uid,
          icon: optimisticSession.avatar,
          sessionId: optimisticSession.sessionId,
          sourceId: optimisticSession.sourceId,
        })
      }
      if (request.wsUrl.trim() && request.aesKey.trim()) {
        saveWsConnectConfig({
          wsUrl: request.wsUrl.trim(),
          aesKey: request.aesKey.trim(),
          installCode,
        }, optimisticSession.uid)
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
            install_code: installCode,
            session_id: request.sessionId || '',
          },
        })
      } catch (error) {
        authDiag('tauri login invoke failed', {
          uid: optimisticSession.uid,
          message: error instanceof Error ? error.message : String(error),
        })
        if (previousUid) {
          persistCurrentUid(previousUid)
        } else {
          clearPersistedCurrentUid()
        }
        if (wroteOptimisticAccount) {
          if (previousOptimisticAccount && optimisticAccountIndex >= 0) {
            accounts.value[optimisticAccountIndex] = previousOptimisticAccount
          } else {
            accounts.value = accounts.value.filter(a => a.id !== optimisticSession.uid)
          }
          saveAccounts()
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
        setSession(result)
        persistCurrentUid(result.uid)
        addOrUpdateAccount({
          id: result.uid,
          name: result.nickname || result.uid,
          icon: result.avatar,
          sessionId: result.sessionId,
          sourceId: result.sourceId,
        })
        authDiag('login done', {
          uid: result.uid,
          hasSessionId: !!result.sessionId,
          hasWsConfig: !!wsConnectConfig.value,
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
    setSession(browserSession)
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
          install_code: getOrCreateInstallCode(),
        },
      })
      const result = normalizeTauriSession(tauriSession, {
        uid: account.id,
        sessionId: account.sessionId,
        nickname: account.name,
        avatar: account.icon,
      })
      setSession(result)
      persistCurrentUid(result.uid)
    } else {
      setSession({
        uid: account.id,
        sessionId: account.sessionId,
        nickname: account.name,
        avatar: account.icon || '',
      })
      persistCurrentUid(account.id)
    }
  }

  async function logout(options?: LogoutOptions) {
    const currentUid = resolveCurrentUidForLogout(uid.value, accounts.value)
    const keepHistoryOnLogout = options?.keepHistoryOnLogout ?? true
    const preserveLoginCache = options?.preserveLoginCache ?? false

    const previousSession = session.value
    const previousCurrentUid = getWindowScopedCurrentUid()
    const previousBrowserSession = localStorage.getItem('browser-session')
    const previousWsConfig = wsConnectConfig.value
    const accountIndex = accounts.value.findIndex(a => a.id === currentUid)
    const previousAccount = accountIndex >= 0 ? { ...accounts.value[accountIndex] } : null
    authDiag('logout start', {
      uid: currentUid,
      keepHistoryOnLogout,
      preserveLoginCache,
      hasSession: !!previousSession,
      hasWsConfig: !!previousWsConfig,
    })

    setSession(null)
    clearActiveSessionContext(currentUid)
    if (!preserveLoginCache) {
      clearPersistedCurrentUid(currentUid)
      localStorage.removeItem('browser-session')
      clearWsConnectConfig(currentUid)
    }
    if (!preserveLoginCache && accountIndex >= 0) {
      accounts.value[accountIndex] = {
        ...accounts.value[accountIndex],
        sessionId: undefined,
      }
      saveAccounts()
    }

    if (isTauri()) {
      try {
        await tauriInvoke('logout', {
          uid: currentUid || null,
        })
      } catch (error) {
        setSession(previousSession)
        if (previousCurrentUid) {
          persistCurrentUid(previousCurrentUid)
        }
        if (previousBrowserSession) {
          localStorage.setItem('browser-session', previousBrowserSession)
        }
        if (previousWsConfig) {
          saveWsConnectConfig(previousWsConfig, previousSession?.uid)
        }
        if (previousAccount && accountIndex >= 0) {
          accounts.value[accountIndex] = previousAccount
          saveAccounts()
        }
        console.warn('[auth] logout invoke failed:', error)
        authDiag('logout invoke failed', {
          uid: currentUid,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    } else if (!keepHistoryOnLogout && currentUid) {
      localStorage.removeItem(`${currentUid}-conversations`)
    }
  }

  function setAutoLogin(enabled: boolean) {
    autoLoginEnabled.value = enabled
    localStorage.setItem(AUTO_LOGIN_KEY, String(enabled))
  }

  function updateProfile(payload: { nickname?: string; avatar?: string }) {
    if (!session.value) return

    const updatedSession = {
      ...session.value,
      nickname: payload.nickname ?? session.value.nickname,
      avatar: payload.avatar ?? session.value.avatar,
    }
    setSession(updatedSession)

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
