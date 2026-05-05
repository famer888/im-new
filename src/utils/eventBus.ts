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
  'notification:click': { conversationId: string }
  'show-toast': { message: string; type?: 'success' | 'error' }
}

export const eventBus = mitt<Events>()
