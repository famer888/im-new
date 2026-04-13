import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export interface Message {
  id: string
  customMsgId: string | null
  conversationId: string
  senderId: string
  msgType: number
  content: string | null
  sendTime: number
  status: number // 0: sending, 1: sent, 2: delivered, 3: read
  readStatus: number
  version: number
  isDeleted: boolean
  extra: string | null
}

const MAX_CACHED_MESSAGES = 500
const PAGE_SIZE = 50

export const useMessageStore = defineStore('message', () => {
  const messageMap = ref<Map<string, Message[]>>(new Map())
  const loadingMap = ref<Map<string, boolean>>(new Map())
  const hasMoreMap = ref<Map<string, boolean>>(new Map())

  function normalizeMessage(raw: any): Message {
    return {
      id: String(raw.id ?? ''),
      customMsgId: raw.customMsgId ?? raw.custom_msg_id ?? null,
      conversationId: String(raw.conversationId ?? raw.conversation_id ?? ''),
      senderId: String(raw.senderId ?? raw.sender_id ?? ''),
      msgType: Number(raw.msgType ?? raw.msg_type ?? 0),
      content: raw.content ?? null,
      sendTime: Number(raw.sendTime ?? raw.send_time ?? Date.now()),
      status: Number(raw.status ?? 0),
      readStatus: Number(raw.readStatus ?? raw.read_status ?? 0),
      version: Number(raw.version ?? 0),
      isDeleted: Boolean(raw.isDeleted ?? raw.is_deleted ?? false),
      extra: raw.extra ?? null,
    }
  }

  function getMessages(conversationId: string): Message[] {
    return messageMap.value.get(conversationId) ?? []
  }

  function isLoading(conversationId: string): boolean {
    return loadingMap.value.get(conversationId) ?? false
  }

  function hasMore(conversationId: string): boolean {
    return hasMoreMap.value.get(conversationId) ?? true
  }

  async function loadMessages(uid: string, conversationId: string) {
    if (!isTauri()) return
    if (isLoading(conversationId)) return

    loadingMap.value.set(conversationId, true)
    try {
      const result = await tauriInvoke<any[]>('get_messages', {
        uid,
        conversationId,
        limit: PAGE_SIZE,
      })
      const normalized = Array.isArray(result) ? result.map(normalizeMessage) : []
      messageMap.value.set(conversationId, normalized)
      hasMoreMap.value.set(conversationId, normalized.length >= PAGE_SIZE)
    } finally {
      loadingMap.value.set(conversationId, false)
    }
  }

  async function loadOlderMessages(uid: string, conversationId: string) {
    if (!isTauri()) return
    if (isLoading(conversationId) || !hasMore(conversationId)) return

    const existing = getMessages(conversationId)
    const beforeTime = existing.length > 0 ? existing[0].sendTime : undefined

    loadingMap.value.set(conversationId, true)
    try {
      const result = await tauriInvoke<any[]>('get_messages', {
        uid,
        conversationId,
        beforeTime,
        limit: PAGE_SIZE,
      })
      const normalized = Array.isArray(result) ? result.map(normalizeMessage) : []
      if (normalized.length > 0) {
        const merged = [...normalized, ...existing]
        if (merged.length > MAX_CACHED_MESSAGES) {
          merged.splice(0, merged.length - MAX_CACHED_MESSAGES)
        }
        messageMap.value.set(conversationId, merged)
      }
      hasMoreMap.value.set(conversationId, normalized.length >= PAGE_SIZE)
    } finally {
      loadingMap.value.set(conversationId, false)
    }
  }

  async function sendMessage(
    uid: string,
    conversationId: string,
    msgType: number,
    content: string,
    extra?: Record<string, unknown>,
  ) {
    if (!isTauri()) return null as any
    const result = await tauriInvoke<any>('send_message', {
      uid,
      request: {
        conversation_id: conversationId,
        msg_type: msgType,
        content,
        extra,
      },
    })
    const normalized = normalizeMessage(result)
    appendMessage(conversationId, normalized)
    return normalized
  }

  function appendMessage(conversationId: string, message: Message) {
    const list = messageMap.value.get(conversationId) ?? []
    const existIndex = list.findIndex(
      (m) => m.id === message.id || (m.customMsgId && m.customMsgId === message.customMsgId),
    )
    if (existIndex >= 0) {
      list[existIndex] = message
    } else {
      list.push(message)
    }
    if (list.length > MAX_CACHED_MESSAGES) {
      list.splice(0, list.length - MAX_CACHED_MESSAGES)
    }
    messageMap.value.set(conversationId, list)
  }

  function batchAppendMessages(messages: Message[]) {
    const grouped = new Map<string, Message[]>()
    for (const msg of messages) {
      const list = grouped.get(msg.conversationId) ?? []
      list.push(msg)
      grouped.set(msg.conversationId, list)
    }

    for (const [convId, msgs] of grouped) {
      for (const msg of msgs) {
        appendMessage(convId, msg)
      }
    }
  }

  function updateMessageStatus(messageId: string, status: number) {
    for (const [, list] of messageMap.value) {
      const msg = list.find((m) => m.id === messageId)
      if (msg) {
        msg.status = status
        break
      }
    }
  }

  function updateMessage(messageId: string, updates: Partial<Message>) {
    for (const [, list] of messageMap.value) {
      const msg = list.find((m) => m.id === messageId)
      if (msg) {
        Object.assign(msg, updates)
        break
      }
    }
  }

  function deleteMessage(conversationId: string, messageId: string) {
    const list = messageMap.value.get(conversationId)
    if (list) {
      const index = list.findIndex((m) => m.id === messageId)
      if (index >= 0) {
        list.splice(index, 1)
      }
    }
  }

  function clearConversationMessages(conversationId: string) {
    messageMap.value.delete(conversationId)
    hasMoreMap.value.delete(conversationId)
  }

  function clearAllMessageCaches() {
    messageMap.value = new Map()
    loadingMap.value = new Map()
    hasMoreMap.value = new Map()
  }

  return {
    messageMap,
    getMessages,
    isLoading,
    hasMore,
    loadMessages,
    loadOlderMessages,
    sendMessage,
    appendMessage,
    batchAppendMessages,
    updateMessageStatus,
    updateMessage,
    deleteMessage,
    clearConversationMessages,
    clearAllMessageCaches,
  }
})
