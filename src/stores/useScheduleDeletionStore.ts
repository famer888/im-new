import { defineStore } from 'pinia'
import { ref } from 'vue'

interface DeletionTimer {
  messageId: string
  expireAt: number
}

export const useScheduleDeletionStore = defineStore('scheduleDeletion', () => {
  const timers = ref<Map<string, DeletionTimer>>(new Map())
  const conversationSettings = ref<Map<string, number>>(new Map())
  let cleanupInterval: ReturnType<typeof setInterval> | null = null

  function setConversationTimer(conversationId: string, seconds: number) {
    if (seconds > 0) {
      conversationSettings.value.set(conversationId, seconds)
    } else {
      conversationSettings.value.delete(conversationId)
    }
  }

  function getConversationTimer(conversationId: string): number {
    return conversationSettings.value.get(conversationId) || 0
  }

  function addMessageTimer(messageId: string, seconds: number) {
    const expireAt = Date.now() + seconds * 1000
    timers.value.set(messageId, { messageId, expireAt })
  }

  function startCleanup(onExpire: (messageId: string) => void) {
    if (cleanupInterval) return
    cleanupInterval = setInterval(() => {
      const now = Date.now()
      for (const [id, timer] of timers.value) {
        if (now >= timer.expireAt) {
          onExpire(id)
          timers.value.delete(id)
        }
      }
    }, 1000)
  }

  function stopCleanup() {
    if (cleanupInterval) {
      clearInterval(cleanupInterval)
      cleanupInterval = null
    }
  }

  return {
    timers,
    conversationSettings,
    setConversationTimer,
    getConversationTimer,
    addMessageTimer,
    startCleanup,
    stopCleanup,
  }
})
