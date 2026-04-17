import { useNetworkStore, type WsStatus } from '@/stores/useNetworkStore'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import { useChatStore, type Conversation } from '@/stores/useChatStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUIStore } from '@/stores/useUIStore'
import { setupGlobalErrorHandler } from '@/utils/sentry'
import { ensureGroupRelKey } from '@/utils/e2ee'

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
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

  const { listen } = await import('@tauri-apps/api/event')

  listen<string>('ws:status', (event) => {
    const networkStore = useNetworkStore()
    networkStore.setWsStatus(event.payload as WsStatus)

    // WS 连接成功后，预热当前会话列表中的群 relKey，避免入站群消息解密失败。
    if (event.payload === 'connected' && !groupKeyWarmupPending) {
      const authStore = useAuthStore()
      const chatStore = useChatStore()
      const uid = String(authStore.uid || '')
      if (!uid) return
      const groupIds = chatStore.conversations
        .filter((c) => c.type === 1 && /^\d+$/.test(String(c.targetId || '')))
        .map((c) => String(c.targetId))
      if (groupIds.length === 0) return
      groupKeyWarmupPending = (async () => {
        for (const gid of groupIds) {
          try {
            await ensureGroupRelKey(uid, gid)
          } catch (err) {
            console.warn('[e2ee] warmup group relKey failed', { gid, err: String(err) })
          }
        }
      })().finally(() => {
        groupKeyWarmupPending = null
      })
    }
  })

  listen<Message[]>('msg:batch', (event) => {
    const messageStore = useMessageStore()
    const authStore = useAuthStore()
    const raw = Array.isArray(event.payload) ? event.payload : []
    const valid = raw.filter((m: any) => {
      const convId = String(m?.conversationId ?? m?.conversation_id ?? '')
      return convId.includes('_')
    })
    if (valid.length !== raw.length) {
      console.warn('[msg:batch] dropped invalid items:', raw.length - valid.length)
    }
    if (valid.length > 0) {
      messageStore.batchAppendMessages(valid as Message[])
      if (authStore.uid) {
        const incoming = valid.map((m: any) => ({
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
        import('@tauri-apps/api/core')
          .then(({ invoke }) =>
            invoke('upsert_incoming_messages', {
              uid: authStore.uid,
              messages: incoming,
            }),
          )
          .catch((err) => {
            console.warn('[msg:batch] upsert_incoming_messages failed:', err)
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
