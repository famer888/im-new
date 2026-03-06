import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

export interface Channel {
  id: string
  name: string | null
  avatar: string | null
  ownerId: string | null
  description: string | null
  updatedAt: number
}

export const useChannelStore = defineStore('channel', () => {
  const channels = ref<Channel[]>([])
  const loading = ref(false)

  async function loadChannels(uid: string) {
    loading.value = true
    try {
      channels.value = await invoke<Channel[]>('get_channels', { uid })
    } finally {
      loading.value = false
    }
  }

  function getChannel(id: string): Channel | undefined {
    return channels.value.find((c) => c.id === id)
  }

  return {
    channels,
    loading,
    loadChannels,
    getChannel,
  }
})
