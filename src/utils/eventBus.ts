import mitt from 'mitt'

type Events = {
  'scroll:bottom': void
  'scroll:to-message': string
  'dialog:close': string
  'editor:focus': void
  'editor:insert-emoji': string
  'editor:insert-at': { uid: string; name: string }
  'editor:drop-files': File[]
  'editor:drop-file-paths': string[]
  'chat:switch': string
  'group-invitation:update': void
  'channel-notice:update': void
  /** 群直播打赏提示：Web 兜底和本地模拟共用，桌面端实际来源是 Tauri 事件。 */
  'group-live:send-gift': Record<string, unknown>
  'notification:click': { conversationId: string }
  'show-toast': { message: string; type?: 'success' | 'error' }
}

export const eventBus = mitt<Events>()
