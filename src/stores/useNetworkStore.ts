import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export const useNetworkStore = defineStore('network', () => {
  const wsStatus = ref<WsStatus>('disconnected')
  const isOnline = ref(navigator.onLine)

  const isConnected = computed(() => wsStatus.value === 'connected')
  const isReconnecting = computed(() => wsStatus.value === 'reconnecting')

  function setWsStatus(status: WsStatus) {
    wsStatus.value = status
  }

  function setOnline(online: boolean) {
    isOnline.value = online
  }

  return {
    wsStatus,
    isOnline,
    isConnected,
    isReconnecting,
    setWsStatus,
    setOnline,
  }
})
