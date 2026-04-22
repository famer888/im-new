import { useNetworkStore, type WsStatus } from '@/stores/useNetworkStore'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import { useChatStore, type Conversation } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUIStore } from '@/stores/useUIStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { useScheduleDeletionStore } from '@/stores/useScheduleDeletionStore'
import { setupGlobalErrorHandler } from '@/utils/sentry'
import { playNotificationSound } from '@/utils/notificationSound'
import {
  ensureFriendRelKey,
  ensureFriendRelKeyForVersion,
  ensureGroupRelKey,
  refreshGroupRelKey,
} from '@/utils/e2ee'

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

interface ReadProcessingResult {
  readMessageIds: string[]
  scheduledDeletions: Array<{
    conversationId: string
    messageId: string
    expireAt: number
  }>
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

let screenshotShortcutBound = false
let screenshotStarting = false

function isMacPlatform(): boolean {
  const text = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase()
  return text.includes('mac')
}

function isScreenshotShortcut(e: KeyboardEvent): boolean {
  const isA = e.key.toLowerCase() === 'a' || e.code === 'KeyA'
  if (!isA || !e.shiftKey) return false
  return isMacPlatform() ? e.metaKey : e.ctrlKey
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

export async function setupTauriListeners() {
  setupGlobalErrorHandler()
  let groupKeyWarmupPending: Promise<void> | null = null

  window.addEventListener('online', () => {
    const networkStore = useNetworkStore()
    networkStore.setOnline(true)
  })

  window.addEventListener('offline', () => {
    const networkStore = useNetworkStore()
    networkStore.setOnline(false)
  })

  if (!isTauri()) {
    console.warn('[tauri-events] Not running in Tauri, skipping native event listeners')
    return
  }

  setupScreenshotShortcut()

  const { listen } = await import('@tauri-apps/api/event')
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
      const friendIds = chatStore.conversations
        .filter((c) => c.type === 0 && /^\d+$/.test(String(c.targetId || '')))
        .map((c) => String(c.targetId))
      const contactFriendIds = contactStore.contacts
        .map((c) => String(c.id || ''))
        .filter((id) => /^\d+$/.test(id))
      const allFriendIds = Array.from(new Set([...friendIds, ...contactFriendIds]))
      if (groupIds.length === 0 && allFriendIds.length === 0) return
      groupKeyWarmupPending = (async () => {
        for (const gid of groupIds) {
          try {
            await ensureGroupRelKey(uid, gid)
          } catch (err) {
            console.warn('[e2ee] warmup group relKey failed', { gid, err: String(err) })
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

  listen<Message[]>('msg:batch', async (event) => {
    const messageStore = useMessageStore()
    const authStore = useAuthStore()
    const currentUid = String(authStore.uid || '')
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
    if (valid.length !== raw.length) {
      console.warn('[msg:batch] dropped invalid items:', raw.length - valid.length)
    }

    // 入站时兜底预热 relKey（防止首次收到该联系人/群的消息时 Rust 侧还没缓存 key）。
    // 1. 私聊：所有 `0_xxx` 会话；2. 群聊：仅对真正需要重试解密（decryptPending）
    //    的消息按 groupId 预热，避免对每条已正常的群消息都发 HTTP 请求。
    if (authStore.uid) {
      const uid = String(authStore.uid)
      const friendIds = Array.from(
        new Set(
          valid
            .map((m: any) => String(m?.conversationId ?? m?.conversation_id ?? ''))
            .filter((convId) => convId.startsWith('0_') && convId.includes('_'))
            .map((convId) => convId.split('_')[1] || '')
            .filter((fid) => !!fid && fid !== uid),
        ),
      )
      for (const fid of friendIds) {
        try {
          const forceRefresh = valid.some((m: any) => {
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
          valid
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
    }

    if (valid.length > 0) {
      const shouldPlaySound = shouldPlayIncomingMessageSound(valid, currentUid)
      const normalized: any[] = [...valid]
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
                  }))
                  .filter((c: any) => !!c.cipherHex)
              : []
            if (cipherHex && cipherCandidates.length === 0) {
              cipherCandidates.push({
                version: Number(extra?.version || 1),
                source: '',
                cipherHex,
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
                    })
                    m.content = plain
                    if (m.extra && typeof m.extra === 'object') {
                      m.extra.decryptPending = false
                      m.extra.cipherHex = candidate.cipherHex
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
            }
          }
        } catch {
          // ignore invoke dynamic import failure
        }
      }

      messageStore.batchAppendMessages(normalized as Message[])
      const chatStore = useChatStore()
      const activeConversationId = chatStore.currentConversationId
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

    messageStore.applySendReceipt({
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
      readStatus: 1,
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

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<ReadProcessingResult>('apply_friend_read_receipts', {
        uid,
        receipts,
      })
      const messageStore = useMessageStore()
      if (Array.isArray(result?.readMessageIds) && result.readMessageIds.length > 0) {
        messageStore.markMessagesRead(result.readMessageIds, 1)
      }
      for (const item of Array.isArray(result?.scheduledDeletions) ? result.scheduledDeletions : []) {
        scheduleDeletionStore.addMessageTimer(
          String(item.conversationId || ''),
          String(item.messageId || ''),
          Number(item.expireAt || 0),
        )
      }
    } catch (err) {
      console.warn('[read-burn] apply_friend_read_receipts failed:', err)
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
    console.log('Screenshot saved:', event.payload.filePath)
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
