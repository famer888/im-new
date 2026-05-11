import { useNetworkStore, type WsStatus } from '@/stores/useNetworkStore'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import { useChatStore, type Conversation } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUIStore } from '@/stores/useUIStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { useScheduleDeletionStore } from '@/stores/useScheduleDeletionStore'
import { setupGlobalErrorHandler } from '@/utils/sentry'
import { playNotificationSound } from '@/utils/notificationSound'
import { showMinimizedMessageReminder } from '@/utils/minimizedMessageReminder'
import { eventBus } from '@/utils/eventBus'
import { DEFAULT_READ_BURN_SECONDS } from '@/utils/readBurn'
import { router } from '@/router'
import { watch, type WatchStopHandle } from 'vue'
import {
  ensureChannelRelKey,
  ensureFriendRelKey,
  ensureFriendRelKeyForVersion,
  ensureGroupRelKey,
  refreshGroupRelKey,
} from '@/utils/e2ee'

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

function groupInviteDebug(message: string, data?: Record<string, unknown>) {
  const payload = data || {}
  console.warn(`[group-invite-debug][front] ${message}`, payload)
  if (!isTauri()) return
  import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('image_send_log', {
      payload: {
        level: 'warn',
        message: `[group-invite-debug][front] ${message}`,
        data: payload,
      },
    }))
    .catch(() => {})
}

const LOGOUT_CLEARED_HISTORY_FLAG_PREFIX = 'logout-cleared-history:'

function getLogoutClearedHistoryAt(uid: string): number {
  if (!uid) return 0
  const raw = localStorage.getItem(`${LOGOUT_CLEARED_HISTORY_FLAG_PREFIX}${uid}`)
  const value = Number(raw || 0)
  return Number.isFinite(value) ? value : 0
}

function normalizeReceiptTime(value: unknown): number {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return Date.now()
  return n < 10_000_000_000 ? n * 1000 : n
}

interface ReadProcessingResult {
  readMessageIds: string[]
  scheduledDeletions: Array<{
    conversationId: string
    messageId: string
    expireAt: number
  }>
}

interface GroupReadReceiptUpdate {
  conversationId: string
  messageId: string
  readStatus: number
  extra?: string | null
}

interface ForceLogoutPayload {
  cmd?: number
  reason?: string
  kickType?: number
}

interface TrayLogoutPayload {
  quit?: boolean
}

function shouldPlayIncomingMessageSound(messages: any[], currentUid: string): boolean {
  if (!currentUid) return false

  const settingStore = useSettingStore()
  if (!settingStore.settings.notificationSound) return false

  const chatStore = useChatStore()
  return messages.some((item) => {
    const convId = String(item?.conversationId ?? item?.conversation_id ?? '')
    const senderId = String(item?.senderId ?? item?.sender_id ?? '')
    if (!convId.includes('_') || !senderId || senderId === currentUid) return false
    if (Boolean(item?.isDeleted ?? item?.is_deleted ?? false)) return false

    const conv = chatStore.conversations.find((row) => row.id === convId)
    if (conv?.isMuted) return false

    return true
  })
}

function getMessageIdentity(message: any): { conversationId: string; id: string; customMsgId: string; senderId: string } {
  return {
    conversationId: String(message?.conversationId ?? message?.conversation_id ?? ''),
    id: String(message?.id ?? message?.msgId ?? message?.msg_id ?? ''),
    customMsgId: String(message?.customMsgId ?? message?.custom_msg_id ?? ''),
    senderId: String(message?.senderId ?? message?.sender_id ?? ''),
  }
}

function isCachedMessage(message: any): boolean {
  const messageStore = useMessageStore()
  const { conversationId, id, customMsgId } = getMessageIdentity(message)
  if (!conversationId.includes('_') || (!id && !customMsgId)) return false
  return messageStore.getMessages(conversationId).some((item) => (
    (!!id && String(item.id || '') === id) ||
    (!!customMsgId && String(item.customMsgId || '') === customMsgId)
  ))
}

function getNewIncomingMessages(messages: any[], currentUid: string): any[] {
  if (!currentUid) return []
  return messages.filter((message) => {
    const { conversationId, senderId } = getMessageIdentity(message)
    if (!conversationId.includes('_') || !senderId || senderId === currentUid) return false
    if (Boolean(message?.isDeleted ?? message?.is_deleted ?? false)) return false
    return !isCachedMessage(message)
  })
}

let screenshotShortcutBound = false
let screenshotStarting = false
let forceLogoutHandling = false
let trayLogoutHandling = false
let lastTrayFlashAt = 0
const tauriListenersGlobal = globalThis as typeof globalThis & {
  __OCS_TAURI_LISTENER_GENERATION__?: number
  __OCS_TAURI_LISTENER_UNLISTENS__?: Array<() => void>
  __OCS_TAURI_DOM_LISTENERS_BOUND__?: boolean
  __OCS_TRAY_UNREAD_WATCH_STOP__?: WatchStopHandle
}

type TauriEvent<T> = { payload: T }
type TauriListen = <T>(
  eventName: string,
  handler: (event: TauriEvent<T>) => void | Promise<void>,
) => Promise<() => void>

function isScreenshotShortcut(e: KeyboardEvent): boolean {
  const isA = e.key.toLowerCase() === 'a' || e.code === 'KeyA'
  if (!isA || !e.shiftKey) return false
  return e.ctrlKey
}

function setupScreenshotShortcut() {
  if (screenshotShortcutBound || !isTauri()) return
  screenshotShortcutBound = true
  window.addEventListener('keydown', async (e) => {
    if (!isScreenshotShortcut(e)) return
    e.preventDefault()
    e.stopPropagation()
    if (e.repeat || screenshotStarting) return
    screenshotStarting = true
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('start_screenshot')
    } catch (err) {
      console.warn('[screenshot] start failed:', err)
    } finally {
      window.setTimeout(() => {
        screenshotStarting = false
      }, 600)
    }
  }, true)
}

function setupTrayUnreadSync() {
  if (!isTauri()) return

  tauriListenersGlobal.__OCS_TRAY_UNREAD_WATCH_STOP__?.()

  const chatStore = useChatStore()
  let lastSynced = -1

  tauriListenersGlobal.__OCS_TRAY_UNREAD_WATCH_STOP__ = watch(
    () => chatStore.totalUnread,
    async (value) => {
      const count = Math.max(0, Math.floor(Number(value || 0)))
      if (count === lastSynced) return
      lastSynced = count

      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('update_tray_unread_count', { count, flash: false })
      } catch (err) {
        console.warn('[tray] update unread count failed:', err)
      }
    },
    { immediate: true },
  )
}

async function flashTrayForIncomingMessage(incomingCount = 1) {
  if (!isTauri()) return

  try {
    const now = Date.now()
    if (now - lastTrayFlashAt < 1200) {
      console.info('[tray-alert] skip flash by cooldown', {
        incomingCount,
        elapsedMs: now - lastTrayFlashAt,
      })
      return
    }
    lastTrayFlashAt = now

    const chatStore = useChatStore()
    const totalUnread = Math.floor(Number(chatStore.totalUnread || 0))
    const count = Math.max(
      0,
      totalUnread,
      Math.floor(Number(incomingCount || 0)),
    )
    console.info('[tray-alert] flashTrayForIncomingMessage', {
      incomingCount,
      totalUnread,
      count,
    })
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('update_tray_unread_count', { count, flash: true })
  } catch (err) {
    console.warn('[tray] flash incoming message failed:', err)
  }
}

function resetClientStateAfterLogout() {
  const chatStore = useChatStore()
  const messageStore = useMessageStore()
  const contactStore = useContactStore()
  const groupStore = useGroupStore()
  const channelStore = useChannelStore()
  const uiStore = useUIStore()
  const networkStore = useNetworkStore()

  networkStore.setWsStatus('disconnected')
  chatStore.enablePersistence('')
  chatStore.currentConversationId = null
  chatStore.conversations = []
  messageStore.clearAllMessageCaches()
  contactStore.contacts = []
  contactStore.searchResults = []
  groupStore.groups = []
  groupStore.memberMap = new Map()
  channelStore.channels = []
  uiStore.setDetailView('none')
  uiStore.setRightPanel('none')
  uiStore.setSidebarTab('chats')
  uiStore.closeSettings()
}

export async function setupTauriListeners() {
  setupGlobalErrorHandler()
  let groupKeyWarmupPending: Promise<void> | null = null

  if (!tauriListenersGlobal.__OCS_TAURI_DOM_LISTENERS_BOUND__) {
    tauriListenersGlobal.__OCS_TAURI_DOM_LISTENERS_BOUND__ = true

    window.addEventListener('online', () => {
      const networkStore = useNetworkStore()
      networkStore.setOnline(true)
    })

    window.addEventListener('offline', () => {
      const networkStore = useNetworkStore()
      networkStore.setOnline(false)
    })
  }

  if (!isTauri()) {
    console.warn('[tauri-events] Not running in Tauri, skipping native event listeners')
    return
  }

  setupScreenshotShortcut()
  setupTrayUnreadSync()

  for (const unlisten of tauriListenersGlobal.__OCS_TAURI_LISTENER_UNLISTENS__ ?? []) {
    try {
      unlisten()
    } catch (err) {
      console.warn('[tauri-events] unlisten stale listener failed:', err)
    }
  }
  tauriListenersGlobal.__OCS_TAURI_LISTENER_UNLISTENS__ = []
  const generation = (tauriListenersGlobal.__OCS_TAURI_LISTENER_GENERATION__ ?? 0) + 1
  tauriListenersGlobal.__OCS_TAURI_LISTENER_GENERATION__ = generation

  const { listen: rawListen } = await import('@tauri-apps/api/event') as { listen: TauriListen }
  const listen = <T>(
    eventName: string,
    handler: (event: TauriEvent<T>) => void | Promise<void>,
  ) => {
    rawListen<T>(eventName, (event) => {
      if (tauriListenersGlobal.__OCS_TAURI_LISTENER_GENERATION__ !== generation) return
      void handler(event)
    })
      .then((unlisten) => {
        if (tauriListenersGlobal.__OCS_TAURI_LISTENER_GENERATION__ !== generation) {
          unlisten()
          return
        }
        tauriListenersGlobal.__OCS_TAURI_LISTENER_UNLISTENS__?.push(unlisten)
      })
      .catch((err) => {
        console.warn('[tauri-events] listen failed:', { eventName, err })
      })
  }
  const scheduleDeletionStore = useScheduleDeletionStore()

  scheduleDeletionStore.startCleanup((timer) => {
    const messageStore = useMessageStore()
    const authStore = useAuthStore()
    messageStore.deleteMessage(timer.conversationId, timer.messageId)

    const uid = String(authStore.uid || '')
    if (!uid) return

    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('delete_message', { uid, messageId: timer.messageId }))
      .catch((err) => {
        console.warn('[read-burn] delete_message failed:', err)
      })
  })

  listen('tray:open-settings', async () => {
    const authStore = useAuthStore()
    const uiStore = useUIStore()

    if (authStore.isLoggedIn && router.currentRoute.value.path !== '/home') {
      await router.replace('/home').catch(() => {})
    }
    uiStore.openSettings()
  })

  listen<TrayLogoutPayload>('tray:logout', async (event) => {
    if (trayLogoutHandling) return
    trayLogoutHandling = true

    try {
      const authStore = useAuthStore()
      resetClientStateAfterLogout()
      await authStore.logout()
      if (!isTauri()) {
        await router.replace('/login').catch(() => {})
      }
      if (event.payload?.quit) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('exit_app')
      }
    } finally {
      trayLogoutHandling = false
    }
  })

  listen<string>('ws:status', (event) => {
    const networkStore = useNetworkStore()
    networkStore.setWsStatus(event.payload as WsStatus)

    // WS 连接成功后，预热当前会话列表中的群 relKey，避免入站群消息解密失败。
    if (event.payload === 'connected' && !groupKeyWarmupPending) {
      const authStore = useAuthStore()
      const chatStore = useChatStore()
      const contactStore = useContactStore()
      const uid = String(authStore.uid || '')
      if (!uid) return
      const groupIds = chatStore.conversations
        .filter((c) => c.type === 1 && /^\d+$/.test(String(c.targetId || '')))
        .map((c) => String(c.targetId))
      const channelIds = chatStore.conversations
        .filter((c) => c.type === 2 && /^\d+$/.test(String(c.targetId || '')))
        .map((c) => String(c.targetId))
      const friendIds = chatStore.conversations
        .filter((c) => c.type === 0 && /^\d+$/.test(String(c.targetId || '')))
        .map((c) => String(c.targetId))
      const contactFriendIds = contactStore.contacts
        .map((c) => String(c.id || ''))
        .filter((id) => /^\d+$/.test(id))
      const allFriendIds = Array.from(new Set([...friendIds, ...contactFriendIds]))
      if (groupIds.length === 0 && channelIds.length === 0 && allFriendIds.length === 0) return
      groupKeyWarmupPending = (async () => {
        for (const gid of groupIds) {
          try {
            await ensureGroupRelKey(uid, gid)
          } catch (err) {
            console.warn('[e2ee] warmup group relKey failed', { gid, err: String(err) })
          }
        }
        for (const cid of channelIds) {
          try {
            await ensureChannelRelKey(uid, cid)
            console.info('[channel] warmup channel relKey OK', { cid })
          } catch (err) {
            console.warn('[channel] warmup channel relKey failed', { cid, err: String(err) })
          }
        }
        for (const fid of allFriendIds) {
          try {
            await ensureFriendRelKey(uid, fid)
          } catch (err) {
            console.warn('[e2ee] warmup friend relKey failed', { fid, err: String(err) })
          }
        }
      })().finally(() => {
        groupKeyWarmupPending = null
      })
    }
  })

  listen<{ conversationId?: string }>('notification:click', async (event) => {
    const conversationId = String(event.payload?.conversationId || '')
    if (!conversationId) return

    try {
      const { Window } = await import('@tauri-apps/api/window')
      const mainWindow = await Window.getByLabel('main')
      if (mainWindow) {
        await mainWindow.show().catch(() => {})
        await mainWindow.unminimize().catch(() => {})
        await mainWindow.setFocus().catch(() => {})
      }
    } catch (error) {
      console.warn('[notification] focus main window failed:', error)
    }

    const chatStore = useChatStore()
    chatStore.setCurrentConversation(conversationId)
    if (router.currentRoute.value.path !== '/home') {
      await router.replace('/home').catch(() => {})
    }
  })

  /** 与 im 20601 `PushUserOnOrOffLineMessageResp` 一致：实时刷新好友在线状态 */
  listen<
    Array<{ uid: string; online: boolean; createTime: number; bfShow?: boolean }>
  >('user:online-status', (event) => {
    const contactStore = useContactStore()
    const groupStore = useGroupStore()
    const raw = Array.isArray(event.payload) ? event.payload : []
    contactStore.applyOnlineStatusUpdates(raw)
    groupStore.applyOnlineStatusUpdates(raw)
  })

  listen<{ total: number }>('friend:req-num', (event) => {
    const authStore = useAuthStore()
    const contactStore = useContactStore()
    contactStore.setNewFriendReqTotal(Number(event.payload?.total || 0), String(authStore.uid || ''))
  })

  listen<ForceLogoutPayload>('auth:force-logout', async (event) => {
    if (forceLogoutHandling) return
    forceLogoutHandling = true

    const authStore = useAuthStore()
    const networkStore = useNetworkStore()

    console.warn('[auth] force logout received', event.payload)
    networkStore.setWsStatus('disconnected')

    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('disconnect_ws'))
      .catch((err) => {
        console.warn('[auth] disconnect ws after force logout failed:', err)
      })

    resetClientStateAfterLogout()

    try {
      await authStore.logout({ keepHistoryOnLogout: true })
      if (!isTauri()) {
        await router.replace('/login')
        if (window.location.hash !== '#/login') {
          window.location.hash = '#/login'
        }
      }
    } finally {
      forceLogoutHandling = false
    }
  })

  listen<Message[]>('msg:batch', async (event) => {
    const messageStore = useMessageStore()
    const authStore = useAuthStore()
    const currentUid = String(authStore.uid || '')
    const logoutClearedHistoryAt = getLogoutClearedHistoryAt(currentUid)
    const raw = (Array.isArray(event.payload) ? event.payload : []).map((item: any) => {
      const m = { ...item }
      let extra = m?.extra
      if (typeof extra === 'string') {
        try {
          extra = JSON.parse(extra)
        } catch {
          extra = {}
        }
      }
      if (!extra || typeof extra !== 'object') extra = {}
      m.extra = extra

      const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
      const senderId = String(m?.senderId ?? m?.sender_id ?? '')
      const receiveUid = String(extra?.receiveUid ?? m?.receiveUid ?? m?.receive_uid ?? '')
      if (
        currentUid &&
        convId.startsWith('0_') &&
        senderId === currentUid &&
        receiveUid &&
        receiveUid !== currentUid
      ) {
        const fixedConvId = `0_${receiveUid}`
        m.conversationId = fixedConvId
        m.conversation_id = fixedConvId
        m.extra = {
          ...extra,
          receiveUid,
          originalConversationId: convId,
        }
      }
      return m
    })
    const valid = raw.filter((m: any) => {
      const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
      return convId.includes('_')
    })
    const filtered = logoutClearedHistoryAt > 0
      ? valid.filter((m: any) => {
          const sendTime = Number(m?.sendTime ?? m?.send_time ?? 0)
          return !(sendTime > 0 && sendTime <= logoutClearedHistoryAt)
        })
      : valid
    if (valid.length !== raw.length) {
      console.warn('[msg:batch] dropped invalid items:', raw.length - valid.length)
    }
    if (filtered.length !== valid.length) {
      console.info('[msg:batch] dropped replayed messages after logout-clear', {
        currentUid,
        dropped: valid.length - filtered.length,
        logoutClearedHistoryAt,
      })
    }
    if (filtered.length === 0) return
    if (filtered.some((m: any) => String(m?.conversationId ?? m?.conversation_id ?? '').startsWith('2_'))) {
      console.info('[channel] msg:batch received channel messages', filtered
        .filter((m: any) => String(m?.conversationId ?? m?.conversation_id ?? '').startsWith('2_'))
        .map((m: any) => ({
          id: String(m?.id ?? m?.msgId ?? m?.msg_id ?? ''),
          conversationId: String(m?.conversationId ?? m?.conversation_id ?? ''),
          senderId: String(m?.senderId ?? m?.sender_id ?? ''),
          msgType: Number(m?.msgType ?? m?.msg_type ?? 0),
          decryptPending: Boolean(m?.extra?.decryptPending),
          content: String(m?.content ?? '').slice(0, 80),
        })))
    }

    // 入站时兜底预热 relKey（防止首次收到该联系人/群的消息时 Rust 侧还没缓存 key）。
    // 1. 私聊：所有 `0_xxx` 会话；2. 群聊：仅对真正需要重试解密（decryptPending）
    //    的消息按 groupId 预热，避免对每条已正常的群消息都发 HTTP 请求。
    if (authStore.uid) {
      const uid = String(authStore.uid)
      const friendIds = Array.from(
        new Set(
          filtered
            .map((m: any) => String(m?.conversationId ?? m?.conversation_id ?? ''))
            .filter((convId) => convId.startsWith('0_') && convId.includes('_'))
            .map((convId) => convId.split('_')[1] || '')
            .filter((fid) => !!fid && fid !== uid),
        ),
      )
      for (const fid of friendIds) {
        try {
          const forceRefresh = filtered.some((m: any) => {
            const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
            return convId === `0_${fid}` && Boolean(m?.extra?.decryptPending)
          })
          await ensureFriendRelKey(uid, fid, forceRefresh)
        } catch (err) {
          console.warn('[e2ee] ensureFriendRelKey on msg:batch failed', { fid, err: String(err) })
        }
      }

      const pendingGroupIds = Array.from(
        new Set(
          filtered
            .filter((m: any) => Boolean(m?.extra?.decryptPending))
            .map((m: any) => {
              const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
              return String(m?.extra?.groupId || convId.split('_')[1] || '')
            })
            .filter((gid) => !!gid),
        ),
      )
      for (const gid of pendingGroupIds) {
        try {
          await ensureGroupRelKey(uid, gid)
        } catch (err) {
          console.warn('[e2ee] ensureGroupRelKey on msg:batch failed', { gid, err: String(err) })
        }
      }

      const pendingChannelIds = Array.from(
        new Set(
          filtered
            .filter((m: any) => Boolean(m?.extra?.decryptPending))
            .map((m: any) => {
              const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
              return String(m?.extra?.channelId || convId.split('_')[1] || '')
            })
            .filter((cid) => !!cid),
        ),
      )
      for (const cid of pendingChannelIds) {
        try {
          await ensureChannelRelKey(uid, cid)
          console.info('[channel] ensureChannelRelKey on msg:batch OK', { cid })
        } catch (err) {
          console.warn('[channel] ensureChannelRelKey on msg:batch failed', { cid, err: String(err) })
        }
      }
    }

    if (filtered.length > 0) {
      const shouldPlaySound = shouldPlayIncomingMessageSound(filtered, currentUid)
      const normalized: any[] = [...filtered]
      if (authStore.uid) {
        const uid = String(authStore.uid)
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          for (const m of normalized) {
            const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
            const extra = m?.extra || {}
            const decryptPending = Boolean(extra?.decryptPending)
            const cipherHex = String(extra?.cipherHex || '')
            const cipherCandidates = Array.isArray(extra?.cipherCandidates)
              ? extra.cipherCandidates
                  .map((c: any) => ({
                    version: Number(c?.version || extra?.version || 1),
                    source: String(c?.source || ''),
                    cipherHex: String(c?.cipherHex || ''),
                    attachmentKey: String(c?.attachmentKey || c?.attachment_key || ''),
                  }))
                  .filter((c: any) => !!c.cipherHex)
              : []
            if (cipherHex && cipherCandidates.length === 0) {
              cipherCandidates.push({
                version: Number(extra?.version || 1),
                source: '',
                cipherHex,
                attachmentKey: String(extra?.attachmentKey || extra?.attachment_key || ''),
              })
            }
            if (!decryptPending || cipherCandidates.length === 0 || !convId.includes('_')) continue

            const msgType = Number(m?.msgType ?? m?.msg_type ?? 0)
            const msgId = String(m?.id ?? m?.msgId ?? m?.msg_id ?? '')

            if (convId.startsWith('0_')) {
              const senderId = String(m?.senderId ?? m?.sender_id ?? '')
              const peerId = String(convId.split('_')[1] || '')
              if (!senderId) continue
              let privateDecrypted = false
              let lastErr: unknown = null
              try {
                for (const candidate of cipherCandidates) {
                  try {
                    try {
                      await ensureFriendRelKeyForVersion(
                        uid,
                        senderId,
                        Number(candidate.version || 0),
                        String(candidate.source || ''),
                      )
                    } catch (keyErr) {
                      console.warn('[e2ee] ensureFriendRelKeyForVersion failed', {
                        msgId,
                        senderId,
                        version: candidate.version,
                        source: candidate.source,
                        err: String(keyErr),
                      })
                    }
                    const plain = await invoke<string>('decrypt_private_incoming', {
                      senderId,
                      peerId,
                      version: Number(candidate.version || 1),
                      ciphertextHex: String(candidate.cipherHex || ''),
                      msgType,
                    })
                    m.content = plain
                    if (m.extra && typeof m.extra === 'object') {
                      m.extra.decryptPending = false
                      m.extra.cipherHex = candidate.cipherHex
                      if (candidate.attachmentKey && !m.extra.fileKey) {
                        m.extra.fileKey = candidate.attachmentKey
                      }
                    }
                    privateDecrypted = true
                    console.log('[e2ee] retry decrypt_private OK', {
                      msgId,
                      peerId,
                      msgType,
                      version: candidate.version,
                    })
                    break
                  } catch (err) {
                    lastErr = err
                  }
                }
                if (privateDecrypted) continue
                throw lastErr || new Error('decrypt_private failed for all candidates')
              } catch (err) {
                console.warn('[e2ee] retry decrypt_private FAILED', {
                  msgId,
                  peerId,
                  msgType,
                  candidates: cipherCandidates.map((c: any) => ({
                    version: c.version,
                    source: c.source,
                    cipherLen: String(c.cipherHex || '').length,
                  })),
                  err: String(err),
                })
              }
            } else if (convId.startsWith('1_')) {
              const groupId = String(extra?.groupId || convId.split('_')[1] || '')
              if (!groupId) continue
              // 第一次重试：用当前 Rust 侧已有/刚 warmup 拿到的 relKey 解密。
              try {
                const plain = await invoke<string>('decrypt_group_incoming', {
                  groupId,
                  ciphertextHex: cipherHex,
                  msgType,
                })
                m.content = plain
                if (m.extra && typeof m.extra === 'object') {
                  m.extra.decryptPending = false
                }
                console.log('[e2ee] retry decrypt_group OK', { msgId, groupId, msgType })
                continue
              } catch (err) {
                console.warn('[e2ee] retry decrypt_group FAILED (1st pass)', {
                  msgId,
                  groupId,
                  msgType,
                  cipherLen: cipherHex.length,
                  err: String(err),
                })
              }
              // 第二次重试：强制刷新 relKey（key 可能已轮换），再解一次。
              try {
                await refreshGroupRelKey(uid, groupId)
                const plain = await invoke<string>('decrypt_group_incoming', {
                  groupId,
                  ciphertextHex: cipherHex,
                  msgType,
                })
                m.content = plain
                if (m.extra && typeof m.extra === 'object') {
                  m.extra.decryptPending = false
                }
                console.log('[e2ee] retry decrypt_group OK after refresh', {
                  msgId,
                  groupId,
                  msgType,
                })
              } catch (err) {
                console.warn('[e2ee] retry decrypt_group FAILED (2nd pass, after refresh)', {
                  msgId,
                  groupId,
                  msgType,
                  cipherLen: cipherHex.length,
                  err: String(err),
                })
                // 保留占位文案 + decryptPending=true，下一轮 batch/重启后仍可再试。
              }
            } else if (convId.startsWith('2_')) {
              const channelId = String(extra?.channelId || convId.split('_')[1] || '')
              if (!channelId) continue
              try {
                const plain = await invoke<string>('decrypt_channel_incoming', {
                  channelId,
                  ciphertextHex: cipherHex,
                  msgType,
                })
                m.content = plain
                if (m.extra && typeof m.extra === 'object') {
                  m.extra.decryptPending = false
                }
                console.info('[channel] retry decrypt_channel OK', { msgId, channelId, msgType })
              } catch (err) {
                console.warn('[channel] retry decrypt_channel FAILED', {
                  msgId,
                  channelId,
                  msgType,
                  cipherLen: cipherHex.length,
                  err: String(err),
                })
              }
            }
          }
        } catch {
          // ignore invoke dynamic import failure
        }
      }

      const chatStore = useChatStore()
      const groupStore = useGroupStore()
      const groupEventMessages = normalized.filter((m: any) => {
        const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
        const extra = m?.extra && typeof m.extra === 'object' ? m.extra : {}
        const source = String(extra?.source || '')
        return convId.startsWith('1_') && source.includes('group-event')
      })
      if (groupEventMessages.length > 0) {
        groupInviteDebug('msg:batch received group event messages', {
          count: groupEventMessages.length,
          items: groupEventMessages.map((m: any) => ({
            id: String(m?.id ?? m?.msgId ?? m?.msg_id ?? ''),
            conversationId: String(m?.conversationId ?? m?.conversation_id ?? ''),
            senderId: String(m?.senderId ?? m?.sender_id ?? ''),
            msgType: Number(m?.msgType ?? m?.msg_type ?? 0),
            content: String(m?.content ?? '').slice(0, 120),
            extra: m?.extra ?? null,
          })),
          conversationCountBefore: chatStore.conversations.length,
          groupCountBefore: groupStore.groups.length,
        })
      }
      for (const m of normalized) {
        const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
        const extra = m?.extra && typeof m.extra === 'object' ? m.extra : {}
        const source = String(extra?.source || '')
        if (!convId.startsWith('1_') || !source.includes('group-event')) continue

        const groupId = String(extra?.groupId || convId.split('_')[1] || '')
        if (!groupId) continue

        groupInviteDebug('upsert group before append message', {
          conversationId: convId,
          groupId,
          groupName: String(extra?.groupName || ''),
          existedBefore: Boolean(groupStore.getGroup(groupId)),
          memberCount: Number(extra?.memberCount || 0),
        })
        groupStore.upsertGroup({
          id: groupId,
          groupId,
          name: String(extra?.groupName || groupStore.getGroup(groupId)?.name || groupId),
          avatar: extra?.groupAvatar || null,
          memberCount: Number(extra?.memberCount || groupStore.getGroup(groupId)?.memberCount || 0),
          isMuted: Boolean(extra?.groupMuted || false),
          updatedAt: Number(m?.sendTime ?? m?.send_time ?? Date.now()),
        })

        if (Array.isArray(extra?.members) && extra.members.length > 0) {
          groupStore.setGroupMembers(groupId, extra.members.map((item: any) => ({
            groupId,
            userId: String(item?.userId || ''),
            nickname: item?.nickname || null,
            avatar: item?.avatar || null,
            role: Number(item?.role || 0),
          })).filter((item: any) => item.userId))
          groupInviteDebug('set group members before append message', {
            groupId,
            count: extra.members.length,
          })
        }
      }
      const contactStore = useContactStore()
      for (const m of normalized) {
        const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
        const extra = m?.extra && typeof m.extra === 'object' ? m.extra : {}
        if (!convId.startsWith('0_') || String(extra?.source || '') !== 'friend-record') continue
        const friendId = String(extra?.friendId || convId.split('_')[1] || '')
        if (!friendId) continue
        const patch: Record<string, unknown> = {}
        if (Object.prototype.hasOwnProperty.call(extra, 'bfReadCancel')) {
          patch.bfReadCancel = Boolean(extra.bfReadCancel)
        }
        if (Object.prototype.hasOwnProperty.call(extra, 'msgCancelTime')) {
          patch.msgCancelTime = Number(extra.msgCancelTime || DEFAULT_READ_BURN_SECONDS)
        }
        if (typeof extra.nickname === 'string' && extra.nickname) patch.nickname = extra.nickname
        if (typeof extra.avatar === 'string') patch.avatar = extra.avatar || null
        if (typeof extra.identify === 'string' && extra.identify) patch.identify = extra.identify
        if (typeof extra.remark === 'string') patch.remark = extra.remark || null
        if (Object.keys(patch).length > 0) {
          contactStore.patchContact(friendId, patch as any, {
            source: 'remote',
            markDetailLoaded: true,
          })
        }
      }
      const newIncomingMessages = getNewIncomingMessages(normalized, currentUid)
      console.info('[tray-alert] incoming batch evaluated', {
        batchSize: normalized.length,
        currentUid,
        newIncomingCount: newIncomingMessages.length,
        newIncomingMessages: newIncomingMessages.slice(0, 5).map((m: any) => {
          const identity = getMessageIdentity(m)
          return {
            ...identity,
            msgType: Number(m?.msgType ?? m?.msg_type ?? 0),
            sendTime: Number(m?.sendTime ?? m?.send_time ?? 0),
          }
        }),
      })
      messageStore.batchAppendMessages(normalized as Message[])
      if (groupEventMessages.length > 0) {
        groupInviteDebug('after batchAppendMessages', {
          conversationCountAfter: chatStore.conversations.length,
          groupCountAfter: groupStore.groups.length,
          conversations: groupEventMessages.map((m: any) => {
            const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
            const conv = chatStore.conversations.find((item) => item.id === convId)
            return {
              conversationId: convId,
              exists: Boolean(conv),
              targetId: conv?.targetId || null,
              lastMsgDigest: conv?.lastMsgDigest || null,
              lastMsgTime: conv?.lastMsgTime || null,
            }
          }),
        })
      }
      const activeConversationId = chatStore.currentConversationId
      const hasIncomingMessageForTray = newIncomingMessages.length > 0
      const hasIncomingForActiveConversation = Boolean(
        currentUid
        && activeConversationId
        && normalized.some((m: any) => {
          const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
          const senderId = String(m?.senderId ?? m?.sender_id ?? '')
          return convId === activeConversationId && senderId && senderId !== currentUid
        }),
      )
      if (shouldPlaySound) {
        void playNotificationSound()
      }
      void showMinimizedMessageReminder(newIncomingMessages as Message[], currentUid)
      if (hasIncomingMessageForTray) {
        void flashTrayForIncomingMessage(newIncomingMessages.length)
      }
      if (authStore.uid) {
        const incoming = normalized.map((m: any) => ({
          id: String(m?.id ?? m?.msgId ?? m?.msg_id ?? ''),
          customMsgId: m?.customMsgId ?? m?.custom_msg_id ?? null,
          conversationId: String(m?.conversationId ?? m?.conversation_id ?? ''),
          senderId: String(m?.senderId ?? m?.sender_id ?? ''),
          msgType: Number(m?.msgType ?? m?.msg_type ?? 0),
          content: m?.content ?? null,
          sendTime: Number(m?.sendTime ?? m?.send_time ?? Date.now()),
          status: Number(m?.status ?? 1),
          readStatus: Number(m?.readStatus ?? m?.read_status ?? 0),
          version: Number(m?.version ?? 0),
          isDeleted: Boolean(m?.isDeleted ?? m?.is_deleted ?? false),
          extra: m?.extra ?? null,
        }))
        try {
          // 先落库，再 auto markAsRead；Rust 才能基于刚收到的消息注册阅后即焚定时器。
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('upsert_incoming_messages', {
            uid: authStore.uid,
            messages: incoming,
          })
        } catch (err) {
          console.warn('[msg:batch] upsert_incoming_messages failed:', err)
        }
      }
      if (hasIncomingForActiveConversation && activeConversationId && chatStore.currentConversationId === activeConversationId) {
        void chatStore.markAsRead(currentUid, activeConversationId).catch((err: unknown) => {
          console.warn('[read-burn] auto markAsRead failed:', err)
        })
      }
    }
  })

  listen<Message>('msg:local-sent', (event) => {
    const messageStore = useMessageStore()
    const authStore = useAuthStore()
    const currentUid = String(authStore.uid || '')
    const payload: any = event.payload || {}
    const senderId = String(payload?.senderId ?? payload?.sender_id ?? '')
    const conversationId = String(payload?.conversationId ?? payload?.conversation_id ?? '')
    if (!conversationId.includes('_')) return
    if (currentUid && senderId && senderId !== currentUid) return
    messageStore.batchAppendMessages([payload] as Message[])
  })

  /**
   * 群消息 20201 回执（SendGroupMessageResp）。
   * 由 Rust `ws/batcher.rs::emit_group_msg_sent` 派发。
   * - 更新内存里的消息状态（sending → sent，并替换为服务器 msgId）
   * - 触发 Tauri `mark_message_sent` 把结果落到本地 SQLite
   */
  listen<{
    flag: number
    msgId: number
    groupId: number
    sentOverTime: number
    conversationId: string
  }>('msg:sent', async (event) => {
    const payload = event.payload || ({} as any)
    const messageStore = useMessageStore()
    const authStore = useAuthStore()
    if (String(payload.conversationId || '').startsWith('2_')) {
      console.info('[channel] msg:sent receipt received', {
        conversationId: payload.conversationId,
        flag: payload.flag,
        msgId: payload.msgId,
        sentOverTime: payload.sentOverTime,
      })
    }

    const receiptApplied = messageStore.applySendReceipt({
      conversationId: payload.conversationId,
      flag: payload.flag,
      serverMsgId: payload.msgId,
      sentOverTime: payload.sentOverTime,
    })

    if (!authStore.uid) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('mark_message_sent', {
        uid: authStore.uid,
        request: {
          conversationId: payload.conversationId,
          customMsgId: String(payload.flag),
          serverMsgId: Number(payload.msgId),
          sentOverTime: Number(payload.sentOverTime) || null,
        },
      })
      if (!receiptApplied && String(payload.conversationId || '').startsWith('1_')) {
        await messageStore.loadMessages(authStore.uid, payload.conversationId, true)
      }
    } catch (err) {
      console.warn('[msg:sent] mark_message_sent failed:', err)
    }
  })

  listen<{
    flag: number
    targetId: number
    messageProtocolId: number
    errCode: number
    errMsg: string
    conversationId: string
  }>('msg:send-failed', (event) => {
    const payload = event.payload || ({} as any)
    const messageStore = useMessageStore()
    messageStore.applySendFailed({
      flag: payload.flag,
      conversationId: payload.conversationId,
      reason: payload.errMsg || `errCode=${payload.errCode || 0}`,
    })
  })

  listen<Conversation>('conv:update', (event) => {
    const chatStore = useChatStore()
    const authStore = useAuthStore()
    const currentUid = String(authStore.uid || '')
    const logoutClearedHistoryAt = getLogoutClearedHistoryAt(currentUid)
    const payload: any = event.payload || {}
    const lastMsgTime = Number(payload?.lastMsgTime ?? payload?.last_msg_time ?? 0)
    if (logoutClearedHistoryAt > 0 && lastMsgTime > 0 && lastMsgTime <= logoutClearedHistoryAt) {
      console.info('[conv:update] dropped replayed conversation after logout-clear', {
        currentUid,
        conversationId: String(payload?.id ?? ''),
        lastMsgTime,
        logoutClearedHistoryAt,
      })
      return
    }
    chatStore.addOrUpdateConversation(event.payload)
  })

  listen<{ messageId: string }>('msg:recall', (event) => {
    const messageStore = useMessageStore()
    messageStore.updateMessage(event.payload.messageId, {
      content: '[消息已撤回]',
      status: -2,
    })
  })

  listen<{ messageId: string; readBy: string }>('msg:read', (event) => {
    const messageStore = useMessageStore()
    messageStore.updateMessage(event.payload.messageId, {
      readStatus: 2,
    })
  })

  listen<Array<{
    msgId: number
    sendUid: number
    targetId: number
    status: number
    readTime: number
    snapchatTime: number
  }>>('msg:read-receipt', async (event) => {
    const authStore = useAuthStore()
    const uid = String(authStore.uid || '')
    if (!uid) return

    const receipts = Array.isArray(event.payload) ? event.payload : []
    if (receipts.length === 0) return
    const messageStore = useMessageStore()
    const viewedSelfMessageIds = receipts
      .filter((item) =>
        Number(item?.status || 0) === 1
        && Number(item?.targetId || 0) === Number(uid || 0)
        && Number(item?.msgId || 0) > 0,
      )
      .map((item) => String(item.msgId))
    if (viewedSelfMessageIds.length > 0) {
      messageStore.markMessagesRead(viewedSelfMessageIds, 2)
    }
    const receiptScheduledKeys = new Set<string>()
    for (const item of receipts) {
      if (
        Number(item?.status || 0) !== 1
        || Number(item?.targetId || 0) !== Number(uid || 0)
        || Number(item?.msgId || 0) <= 0
      ) continue
      const conversationId = `0_${String(item.sendUid || '')}`
      const messageId = String(item.msgId)
      if (!conversationId.includes('_') || !messageId) continue
      const readTime = normalizeReceiptTime(item.readTime)
      const messages = messageStore.getMessages(conversationId)
      const exact = messages.find((m) => String(m.id) === messageId || String(m.customMsgId || '') === messageId)
      const boundaryTime = exact?.sendTime || readTime
      const fallbackDelay = Number(item?.snapchatTime || 0) > 0
        ? Number(item.snapchatTime) * 1000
        : 0
      const candidates = exact
        ? [exact]
        : messages.filter((m) =>
            String(m.senderId) === uid
            && Number(m.deleteSeconds || 0) > 0
            && Number(m.sendTime || 0) <= boundaryTime,
          )
      for (const message of candidates) {
        const deleteDelay = Number(message.deleteSeconds || fallbackDelay || 0)
        if (!Number.isFinite(deleteDelay) || deleteDelay <= 0) continue
        const expireAt = readTime + deleteDelay
        const ids = new Set([
          String(message.id || ''),
          String(message.customMsgId || ''),
          messageId,
        ].filter(Boolean))
        for (const id of ids) {
          scheduleDeletionStore.addMessageTimer(conversationId, id, expireAt)
          receiptScheduledKeys.add(`${conversationId}:${id}`)
        }
      }
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<ReadProcessingResult>('apply_friend_read_receipts', {
        uid,
        receipts,
      })
      if (Array.isArray(result?.readMessageIds) && result.readMessageIds.length > 0) {
        messageStore.markMessagesRead(result.readMessageIds, 2)
      }
      for (const item of Array.isArray(result?.scheduledDeletions) ? result.scheduledDeletions : []) {
        const conversationId = String(item.conversationId || '')
        const messageId = String(item.messageId || '')
        if (receiptScheduledKeys.has(`${conversationId}:${messageId}`)) continue
        scheduleDeletionStore.addMessageTimer(
          conversationId,
          messageId,
          Number(item.expireAt || 0),
        )
      }
    } catch (err) {
      console.warn('[read-burn] apply_friend_read_receipts failed:', err)
    }
  })

  listen<Array<{
    msgId: number
    groupId: number
    sendUid: number
    status: number
    readTime: number
  }>>('msg:group-read-receipt', async (event) => {
    const authStore = useAuthStore()
    const uid = String(authStore.uid || '')
    if (!uid) return

    const receipts = Array.isArray(event.payload) ? event.payload : []
    if (receipts.length === 0) return

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const updates = await invoke<GroupReadReceiptUpdate[]>('apply_group_read_receipts', {
        uid,
        receipts,
      })
      const messageStore = useMessageStore()
      messageStore.applyGroupReadReceiptPatches(Array.isArray(updates) ? updates : [])
    } catch (err) {
      console.warn('[group-read] apply_group_read_receipts failed:', err)
    }
  })

  listen<{ version: string; title?: string; content?: string; url: string; flag?: number }>(
    'app:version-update',
    (event) => {
      const uiStore = useUIStore()
      uiStore.openUpVersion(event.payload)
    },
  )

  listen<{ filePath: string }>('screenshots-ok', (event) => {
    const filePath = String(event.payload?.filePath || '')
    if (!filePath) return
    eventBus.emit('editor:drop-file-paths', [filePath])
  })

  listen<string>('deep-link', (event) => {
    handleDeepLink(event.payload)
  })

  // Init NTP + domain pool only in Tauri
  try {
    const { initNtpTime } = await import('@/utils/ntp')
    const { initDomainPool, startPolling: startDomainPolling } = await import('@/utils/domainPool')
    initNtpTime()
    initDomainPool()
    startDomainPolling(300000)
  } catch (e) {
    console.warn('[tauri-events] NTP/domain init skipped:', e)
  }
}

function handleDeepLink(url: string) {
  try {
    const parsed = new URL(url)
    const action = parsed.hostname
    const params = Object.fromEntries(parsed.searchParams)

    switch (action) {
      case 'join':
        if (params.group) {
          // Navigate to group join
        }
        break
      case 'chat':
        if (params.id) {
          const chatStore = useChatStore()
          chatStore.setCurrentConversation(params.id)
        }
        break
      case 'channel':
        if (params.id) {
          // Navigate to channel
        }
        break
    }
  } catch (e) {
    console.error('Invalid deep link:', url, e)
  }
}
