import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getChannelList, type ChannelListItem } from '@/api/imChannel'

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

  // 兼容三种来源：频道接口、Tauri 本地表、频道会话兜底字段。
  function normalizeChannel(item: any): Channel {
    const id = String(item.id ?? item.channelId ?? '')
    return {
      id,
      channelId: String(item.channelId ?? item.id ?? ''),
      name: item.name ?? item.channelName ?? id,
      channelName: item.channelName ?? item.name ?? id,
      avatar: item.avatar ?? item.icon ?? null,
      icon: item.icon ?? item.avatar ?? null,
      logoColor: item.logoColor ?? null,
      memberCount: Number(item.memberCount ?? item.member_count ?? 0),
      status: Number(item.status ?? 0),
      adminPrivacy: Number(item.adminPrivacy ?? 0),
      isDisturb: Boolean(item.isDisturb ?? item.is_disturb ?? false),
      ownerId: item.ownerId ?? item.owner_id ?? null,
      description: item.description ?? item.channelDesc ?? null,
      updatedAt: Number(item.updatedAt ?? item.updated_at ?? item.updateTime ?? item.createTime ?? 0),
    }
  }

  // 对齐老 im：频道列表要把“频道主列表”和“消息/会话里出现过的频道”合在一起，避免某一路为空时整段消失。
  function mergeChannelsById(...lists: Channel[][]): Channel[] {
    const map = new Map<string, Channel>()
    for (const list of lists) {
      for (const item of list) {
        const id = String(item.id || item.channelId || '')
        if (!id) continue
        map.set(id, { ...map.get(id), ...item, id, channelId: id })
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }

  async function loadChannelsFromConversationCache(uid: string): Promise<Channel[]> {
    if (!isTauri()) return []

    try {
      // 老 im 会把 MessageChannelList 里的频道也展示出来；这里用本地 channel 会话做同样的兜底。
      const conversations = await tauriInvoke<Array<{ type: number; targetId: string; updatedAt: number }>>(
        'get_conversations',
        { uid, limit: 200, offset: 0 },
      )
      const fallbackSeen = new Set<string>()
      const fallbackChannels: Channel[] = []

      for (const conv of conversations) {
        if (conv.type !== 2) continue
        const channelId = String(conv.targetId || '')
        if (!channelId || fallbackSeen.has(channelId)) continue
        fallbackSeen.add(channelId)
        fallbackChannels.push(normalizeChannel({
          id: channelId,
          channelId,
          name: channelId,
          channelName: channelId,
          updatedAt: conv.updatedAt,
        }))
      }

      return fallbackChannels
    } catch (e) {
      console.error('[ChannelStore] get_conversations fallback failed:', e)
      return []
    }
  }

  async function loadChannels(uid: string) {
    loading.value = true
    try {
      let localChannels: Channel[] = []

      if (isTauri()) {
        try {
          const localRows = await tauriInvoke<any[]>('get_channels', { uid })
          localChannels = Array.isArray(localRows) ? localRows.map((item) => normalizeChannel(item)) : []
          if (localChannels.length > 0) {
            channels.value = localChannels
          }
        } catch (e) {
          // 本地缓存读失败时继续走远端，避免频道列表被一次 SQLite 异常直接清空。
          console.error('[ChannelStore] local get_channels failed:', e)
        }
      }

      const conversationChannels = await loadChannelsFromConversationCache(uid)
      if (conversationChannels.length > 0) {
        channels.value = mergeChannelsById(conversationChannels, localChannels)
      }

      // 先让用户看到本地/会话里的频道，再用远端列表补齐名称、头像、禁用状态等完整信息。
      await loadChannelsViaApi(uid, {
        conversationChannels,
        localChannels,
      })
    } catch (e) {
      console.error('[ChannelStore] loadChannels failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function loadChannelsViaApi(
    uid: string,
    seed?: {
      conversationChannels?: Channel[]
      localChannels?: Channel[]
    },
  ) {
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
          const id = String(item.channelId || (item as ChannelListItem & { id?: string | number }).id || '')
          if (!id || seen.has(id)) continue
          seen.add(id)
          allChannels.push(normalizeChannel(item))
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

    const mergedChannels = mergeChannelsById(
      seed?.conversationChannels || [],
      seed?.localChannels || [],
      allChannels,
    )

    if (mergedChannels.length > 0) {
      channels.value = mergedChannels
      console.info('[ChannelStore] loaded from channel API', { count: allChannels.length })
      return
    }

    // 如果远端频道列表没返回数据，至少保住会话里已经出现过的频道，不让通讯录区域完全空白。
    const fallbackChannels = seed?.conversationChannels || (await loadChannelsFromConversationCache(uid))
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
