import { defineStore } from 'pinia'
import { ref } from 'vue'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

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
    if (!isTauri()) return
    loading.value = true
    try {
      channels.value = await tauriInvoke<Channel[]>('get_channels', { uid })
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
