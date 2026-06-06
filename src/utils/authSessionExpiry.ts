import { router } from '@/router'
import { useAuthStore } from '@/stores/useAuthStore'
import { useNetworkStore } from '@/stores/useNetworkStore'
import { eventBus } from '@/utils/eventBus'

let handlingSessionExpiry = false

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

function expiredText(value: unknown): boolean {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return false
  return text.includes('登录过期')
    || text.includes('登录已过期')
    || text.includes('请重新登录')
    || text.includes('login expired')
    || text.includes('session expired')
}

export function isAuthSessionExpiredResponse(resp: unknown): boolean {
  const data = (resp || {}) as {
    code?: unknown
    msg?: unknown
    errCode?: unknown
    errMsg?: unknown
    commonResult?: { errCode?: unknown; errMsg?: unknown }
  }
  const code = Number(data.code ?? data.errCode ?? data.commonResult?.errCode ?? 0)
  return code === 100 || expiredText(data.msg) || expiredText(data.errMsg) || expiredText(data.commonResult?.errMsg)
}

export function isAuthSessionExpiredError(error: unknown): boolean {
  if (isAuthSessionExpiredResponse(error)) return true
  if (error instanceof Error) return expiredText(error.message)
  return expiredText(error)
}

export async function handleAuthSessionExpired(reason = 'auth-expired', message = '登录已过期，请重新登录') {
  if (handlingSessionExpiry) return
  handlingSessionExpiry = true

  const authStore = useAuthStore()
  const networkStore = useNetworkStore()
  networkStore.setWsStatus('disconnected')
  eventBus.emit('show-toast', { message, type: 'error' })

  try {
    if (isTauri()) {
      import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('disconnect_ws'))
        .catch((error) => {
          console.warn('[auth] disconnect ws after session expiry failed:', error)
        })
    }

    // 对齐旧 im：服务端判定登录过期时清掉失效登录态，但保留本地聊天历史。
    await authStore.logout({ keepHistoryOnLogout: true })
    if (!isTauri()) {
      await router.replace('/login')
      if (window.location.hash !== '#/login') {
        window.location.hash = '#/login'
      }
    }
  } catch (error) {
    console.warn('[auth] handle session expiry failed:', { reason, error })
  } finally {
    handlingSessionExpiry = false
  }
}
