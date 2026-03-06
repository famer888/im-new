import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'

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

  async function initSession() {
    loadAccounts()
    try {
      const stored = await invoke<SessionInfo | null>('get_session')
      if (stored) {
        session.value = stored
        localStorage.setItem(CURRENT_UID_KEY, stored.uid)
        return
      }

      // Auto-login: try last account if enabled
      if (autoLoginEnabled.value && accounts.value.length > 0) {
        const lastUid = localStorage.getItem(CURRENT_UID_KEY)
        const account = accounts.value.find(a => a.id === lastUid) || accounts.value[0]
        if (account?.sessionId) {
          try {
            const result = await invoke<SessionInfo>('login', {
              request: { session_id: account.sessionId },
            })
            session.value = result
            localStorage.setItem(CURRENT_UID_KEY, result.uid)
          } catch { /* auto-login failed, show login page */ }
        }
      }
    } catch {
      console.error('Failed to init session')
    }
  }

  async function login(request: {
    sessionUrl: string
    wsUrl: string
    aesKey: string
    installCode: string
  }) {
    const result = await invoke<SessionInfo>('login', {
      request: {
        session_url: request.sessionUrl,
        ws_url: request.wsUrl,
        aes_key: request.aesKey,
        install_code: request.installCode,
      },
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

  async function switchAccount(account: AccountInfo) {
    if (!account.sessionId) return
    const result = await invoke<SessionInfo>('login', {
      request: { session_id: account.sessionId },
    })
    session.value = result
    localStorage.setItem(CURRENT_UID_KEY, result.uid)
  }

  async function logout() {
    await invoke('logout')
    const currentUid = uid.value
    session.value = null
    localStorage.removeItem(CURRENT_UID_KEY)
    // Clear sessionId but keep account in list
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
  }
})
