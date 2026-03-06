import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

export interface ChatWindowInfo {
  conversationId: string
  title: string
  isOpen: boolean
}

export const useWindowStore = defineStore('window', () => {
  const chatWindows = ref<Map<string, ChatWindowInfo>>(new Map())

  async function openChatWindow(conversationId: string, title: string) {
    await invoke('open_chat_window', { conversationId, title })
    chatWindows.value.set(conversationId, { conversationId, title, isOpen: true })
  }

  async function closeChatWindow(conversationId: string) {
    await invoke('close_chat_window', { conversationId })
    chatWindows.value.delete(conversationId)
  }

  function isWindowOpen(conversationId: string): boolean {
    return chatWindows.value.get(conversationId)?.isOpen ?? false
  }

  return { chatWindows, openChatWindow, closeChatWindow, isWindowOpen }
})
