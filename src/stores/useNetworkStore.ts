import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export const useNetworkStore = defineStore('network', () => {
  const wsStatus = ref<WsStatus>('disconnected')
  const isOnline = ref(navigator.onLine)
  const reconnectingVisible = ref(false)
  let reconnectingTimer: number | null = null

  const isConnected = computed(() => wsStatus.value === 'connected')
  const isReconnecting = computed(() => wsStatus.value === 'reconnecting')

  function setWsStatus(status: WsStatus) {
    wsStatus.value = status
    if (status === 'reconnecting') {
      if (reconnectingTimer === null) {
        reconnectingTimer = window.setTimeout(() => {
          reconnectingTimer = null
          reconnectingVisible.value = wsStatus.value === 'reconnecting'
        }, 1200)
      }
      return
    }

    if (reconnectingTimer !== null) {
      window.clearTimeout(reconnectingTimer)
      reconnectingTimer = null
    }
    reconnectingVisible.value = false
  }

  function setOnline(online: boolean) {
    isOnline.value = online
  }

  return {
    wsStatus,
    isOnline,
    isConnected,
    isReconnecting,
    reconnectingVisible,
    setWsStatus,
    setOnline,
  }
})
