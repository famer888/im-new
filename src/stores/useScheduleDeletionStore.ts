import { defineStore } from 'pinia'
import { ref } from 'vue'

interface DeletionTimer {
  conversationId: string
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

  function getTimerKey(conversationId: string, messageId: string) {
    return `${conversationId}:${messageId}`
  }

  function addMessageTimer(conversationId: string, messageId: string, expireAt: number) {
    if (!conversationId || !messageId || !Number.isFinite(expireAt)) return
    const key = getTimerKey(conversationId, messageId)
    timers.value.set(key, {
      conversationId,
      messageId,
      expireAt,
    })
  }

  function removeMessageTimer(conversationId: string, messageId: string) {
    timers.value.delete(getTimerKey(conversationId, messageId))
  }

  function startCleanup(onExpire: (timer: DeletionTimer) => void) {
    if (cleanupInterval) return
    cleanupInterval = setInterval(() => {
      const now = Date.now()
      for (const [key, timer] of timers.value) {
        if (now >= timer.expireAt) {
          onExpire(timer)
          timers.value.delete(key)
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
    removeMessageTimer,
    startCleanup,
    stopCleanup,
  }
})
