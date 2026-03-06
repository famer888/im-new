import { useNetworkStore, type WsStatus } from '@/stores/useNetworkStore'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import { useChatStore, type Conversation } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import { setupGlobalErrorHandler } from '@/utils/sentry'

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

export async function setupTauriListeners() {
  setupGlobalErrorHandler()

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
  })

  listen<Message[]>('msg:batch', (event) => {
    const messageStore = useMessageStore()
    messageStore.batchAppendMessages(event.payload)
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
