import { defineStore } from 'pinia'
import { ref } from 'vue'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export interface ChatWindowInfo {
  conversationId: string
  title: string
  isOpen: boolean
}

export const useWindowStore = defineStore('window', () => {
  const chatWindows = ref<Map<string, ChatWindowInfo>>(new Map())

  async function openChatWindow(conversationId: string, title: string) {
    if (!isTauri()) return
    await tauriInvoke('open_chat_window', { conversationId, title })
    chatWindows.value.set(conversationId, { conversationId, title, isOpen: true })
  }

  async function closeChatWindow(conversationId: string) {
    if (!isTauri()) return
    await tauriInvoke('close_chat_window', { conversationId })
    chatWindows.value.delete(conversationId)
  }

  function isWindowOpen(conversationId: string): boolean {
    return chatWindows.value.get(conversationId)?.isOpen ?? false
  }

  return { chatWindows, openChatWindow, closeChatWindow, isWindowOpen }
})
