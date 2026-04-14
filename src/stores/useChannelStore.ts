import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getChannelList } from '@/api/imChannel'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export interface Channel {
  id: string
  channelId: string
  name: string | null
  channelName: string | null
  avatar: string | null
  icon: string | null
  logoColor: string | null
  memberCount: number
  status: number
  adminPrivacy: number
  isDisturb: boolean
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
      if (isTauri()) {
        const localChannels = await tauriInvoke<Channel[]>('get_channels', { uid })
        if (Array.isArray(localChannels) && localChannels.length > 0) {
          channels.value = localChannels
          return
        }
      }

      await loadChannelsViaApi(uid)
    } catch (e) {
      console.error('[ChannelStore] loadChannels failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function loadChannelsViaApi(uid: string) {
    const allChannels: Channel[] = []
    let pageNum = 1
    const pageSize = 10
    let hasMore = true
    const seen = new Set<string>()

    while (hasMore) {
      try {
        const resp = await getChannelList({ pageNum, pageSize })
        if (Number(resp?.code) !== 200) {
          throw new Error(resp?.msg || 'channel list request failed')
        }
        const list = resp?.data?.rowList || []
        console.info('[ChannelStore] page loaded', {
          pageNum,
          pageSize,
          listLen: list.length,
          accumulated: allChannels.length,
        })
        for (const item of list) {
          const id = String(item.channelId || '')
          if (!id || seen.has(id)) continue
          seen.add(id)
          allChannels.push({
            id,
            channelId: id,
            name: item.channelName || id,
            channelName: item.channelName || id,
            avatar: item.icon || null,
            icon: item.icon || null,
            logoColor: item.logoColor || null,
            memberCount: Number(item.memberCount || 0),
            status: Number(item.status || 0),
            adminPrivacy: Number(item.adminPrivacy || 0),
            isDisturb: Boolean(item.isDisturb),
            ownerId: null,
            description: null,
            updatedAt: Number(item.updateTime || item.createTime || 0),
          })
        }
        if (list.length < pageSize) {
          hasMore = false
        } else {
          pageNum++
        }
      } catch (e) {
        console.error('[ChannelStore] API loadChannels failed:', e)
        hasMore = false
      }
    }

    if (allChannels.length > 0) {
      channels.value = allChannels
      console.info('[ChannelStore] loaded from channel API', { count: allChannels.length })
      return
    }

    // Last fallback: derive channel ids from channel conversations.
    const fallbackChannels: Channel[] = []
    const fallbackSeen = new Set<string>()
    let conversations: Array<{ type: number; targetId: string; updatedAt: number }> = []

    if (isTauri()) {
      try {
        conversations = await tauriInvoke<Array<{ type: number; targetId: string; updatedAt: number }>>(
          'get_conversations',
          { uid, limit: 200, offset: 0 },
        )
      } catch (e) {
        console.error('[ChannelStore] get_conversations fallback failed:', e)
      }
    }

    for (const conv of conversations) {
      if (conv.type !== 2) continue
      const channelId = String(conv.targetId || '')
      if (!channelId || fallbackSeen.has(channelId)) continue
      fallbackSeen.add(channelId)
      fallbackChannels.push({
        id: channelId,
        channelId,
        name: channelId,
        channelName: channelId,
        avatar: null,
        icon: null,
        logoColor: null,
        memberCount: 0,
        status: 0,
        adminPrivacy: 0,
        isDisturb: false,
        ownerId: null,
        description: null,
        updatedAt: Number(conv.updatedAt || 0),
      })
    }

    channels.value = fallbackChannels
    console.warn(
      '[ChannelStore] channel api empty, fallback from conversations',
    )
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
