import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getChannelDetail, getChannelList, type ChannelListItem } from '@/api/imChannel'
import {
  handleAuthSessionExpired,
  isAuthSessionExpiredError,
  isAuthSessionExpiredResponse,
} from '@/utils/authSessionExpiry'

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
  isDisable: boolean
  adminPrivacy: number
  isDisturb: boolean
  memberType: number | null
  alias: string | null
  remark: string | null
  link: string | null
  linkType: number | null
  ownerId: string | null
  description: string | null
  updatedAt: number
}

export type ChannelDetailStatus = 'idle' | 'loading' | 'ready' | 'error'

export const useChannelStore = defineStore('channel', () => {
  const channels = ref<Channel[]>([])
  const loading = ref(false)
  const detailStatusById = ref<Record<string, ChannelDetailStatus>>({})
  let activeUid = ''
  const detailRequestById = new Map<string, Promise<Channel | null>>()

  function channelDebug(message: string, data: Record<string, unknown> = {}) {
    if (import.meta.env.VITE_CHANNEL_DEBUG !== 'true') return
    // 频道加载排查日志默认静默，只有显式打开环境开关时才输出。
    console.debug(`[ChannelStore][debug] ${message}`, {
      activeUid,
      isTauri: isTauri(),
      ...data,
    })
  }

  function removedChannelKey(uid: string): string {
    return `${uid}-removed-channel-ids`
  }

  function removedChannelMetaKey(uid: string): string {
    return `${uid}-removed-channel-meta`
  }

  function getRemovedChannelMetaMap(uid = activeUid): Record<string, Partial<Channel>> {
    if (!uid) return {}
    try {
      const raw = localStorage.getItem(removedChannelMetaKey(uid))
      const parsed = raw ? JSON.parse(raw) : {}
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  function saveRemovedChannelMetaMap(uid: string, meta: Record<string, Partial<Channel>>) {
    if (!uid) return
    try {
      localStorage.setItem(removedChannelMetaKey(uid), JSON.stringify(meta))
    } catch { /* storage unavailable */ }
  }

  function getRemovedChannelMeta(channelId: string | number, uid = activeUid): Partial<Channel> | null {
    const id = String(channelId || '').trim()
    if (!id) return null
    return getRemovedChannelMetaMap(uid)[id] || null
  }

  function rememberRemovedChannelMeta(uid: string, channelId: string, channel?: Partial<Channel> | null) {
    if (!uid || !channelId || !channel) return
    const meta = getRemovedChannelMetaMap(uid)
    meta[channelId] = {
      id: channelId,
      channelId,
      name: channel.name ?? channel.channelName ?? null,
      channelName: channel.channelName ?? channel.name ?? null,
      avatar: channel.avatar ?? channel.icon ?? null,
      icon: channel.icon ?? channel.avatar ?? null,
      logoColor: channel.logoColor ?? null,
    }
    saveRemovedChannelMetaMap(uid, meta)
  }

  function forgetRemovedChannelMeta(uid: string, channelId: string) {
    if (!uid || !channelId) return
    const meta = getRemovedChannelMetaMap(uid)
    if (!meta[channelId]) return
    delete meta[channelId]
    saveRemovedChannelMetaMap(uid, meta)
  }

  function getRemovedChannelIds(uid = activeUid): Set<string> {
    if (!uid) return new Set()
    try {
      const raw = localStorage.getItem(removedChannelKey(uid))
      const list = raw ? JSON.parse(raw) : []
      return new Set(Array.isArray(list) ? list.map((id) => String(id)) : [])
    } catch {
      return new Set()
    }
  }

  function saveRemovedChannelIds(uid: string, ids: Set<string>) {
    if (!uid) return
    try {
      localStorage.setItem(removedChannelKey(uid), JSON.stringify(Array.from(ids)))
    } catch { /* storage unavailable */ }
  }

  function markChannelRemoved(uid: string, channelId: string) {
    if (!uid || !channelId) return
    const ids = getRemovedChannelIds(uid)
    ids.add(channelId)
    saveRemovedChannelIds(uid, ids)
  }

  function unmarkChannelRemoved(uid: string, channelId: string) {
    if (!uid || !channelId) return
    const ids = getRemovedChannelIds(uid)
    if (!ids.delete(channelId)) return
    saveRemovedChannelIds(uid, ids)
    forgetRemovedChannelMeta(uid, channelId)
  }

  function isChannelRemoved(channelId: string, uid = activeUid): boolean {
    if (!channelId) return false
    return getRemovedChannelIds(uid).has(channelId)
  }

  function resetDetailRuntimeState() {
    detailStatusById.value = {}
    detailRequestById.clear()
  }

  function setChannelDetailStatus(channelId: string | number, status: ChannelDetailStatus) {
    const id = String(channelId || '').trim()
    if (!id) return
    detailStatusById.value = {
      ...detailStatusById.value,
      [id]: status,
    }
  }

  function clearChannelDetailStatus(channelId: string | number) {
    const id = String(channelId || '').trim()
    if (!id || !detailStatusById.value[id]) return
    const next = { ...detailStatusById.value }
    delete next[id]
    detailStatusById.value = next
  }

  function getChannelDetailStatus(channelId: string | number): ChannelDetailStatus {
    const id = String(channelId || '').trim()
    if (!id) return 'idle'
    return detailStatusById.value[id] || 'idle'
  }

  function isJoinedChannel(item: any): boolean {
    if (item?.memberType === undefined || item?.memberType === null || item?.memberType === '') {
      return true
    }
    return Number(item.memberType) >= 0
  }

  function isConfirmedJoinedChannel(item: Channel): boolean {
    return item.memberType !== null && Number(item.memberType) > 0
  }

  function isPublicChannel(item: any): boolean {
    const rawLinkType = item?.linkType ?? item?.link_type
    if (rawLinkType === undefined || rawLinkType === null || rawLinkType === '') return true
    const linkType = Number(rawLinkType)
    return !Number.isFinite(linkType) || linkType !== 1
  }

  function filterRemovedChannels(list: Channel[], uid = activeUid): Channel[] {
    const removed = getRemovedChannelIds(uid)
    if (removed.size === 0) return list
    return list.filter((item) => !removed.has(String(item.id || item.channelId || '')))
  }

  function toBool(value: unknown, fallback = false): boolean {
    if (value === undefined || value === null || value === '') return fallback
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    const text = String(value).trim().toLowerCase()
    if (text === '0' || text === 'false' || text === 'no') return false
    if (text === '1' || text === 'true' || text === 'yes') return true
    return Boolean(value)
  }

  function textValue(value: unknown): string {
    return value === undefined || value === null ? '' : String(value).trim()
  }

  function isValidChannelId(id: string): boolean {
    // 频道协议里的 channelId 是数字；过滤掉历史脏数据里的“频道名当 ID”，避免通讯录展示异常条目。
    return /^\d+$/.test(id)
  }

  function meaningfulChannelName(id: string, value: unknown): string | null {
    const text = textValue(value)
    if (!text || text === id) return null
    return text
  }

  function pickChannelName(id: string, candidates: unknown[]): string | null {
    for (const candidate of candidates) {
      const name = meaningfulChannelName(id, candidate)
      if (name) return name
    }
    return null
  }

  // 兼容三种来源：频道接口、Tauri 本地表、频道会话兜底字段。
  function normalizeChannel(item: any): Channel {
    const id = textValue(item.id ?? item.channelId)
    const status = Number(item.status ?? 0)
    // 兼容服务端字段差异：部分链路返回 member_type（下划线）而不是 memberType（驼峰）。
    const rawMemberType = item.memberType ?? item.member_type
    const name = pickChannelName(id, [item.name, item.channelName])
    const channelName = pickChannelName(id, [item.channelName, item.name])
    return {
      id,
      channelId: textValue(item.channelId ?? item.id),
      name,
      channelName,
      avatar: item.avatar ?? item.icon ?? null,
      icon: item.icon ?? item.avatar ?? null,
      logoColor: item.logoColor ?? null,
      memberCount: Number(item.memberCount ?? item.member_count ?? -1),
      status,
      isDisable: toBool(item.isDisable ?? item.is_disable, status === 3),
      adminPrivacy: Number(item.adminPrivacy ?? 0),
      isDisturb: toBool(item.isDisturb ?? item.is_disturb ?? false),
      memberType: rawMemberType === undefined || rawMemberType === null || rawMemberType === ''
        ? null
        : Number(rawMemberType),
      alias: item.alias ?? null,
      remark: item.remark ?? null,
      link: item.link ?? null,
      linkType: item.linkType === undefined || item.linkType === null ? null : Number(item.linkType),
      ownerId: item.ownerId ?? item.owner_id ?? null,
      description: item.description ?? item.channelDesc ?? null,
      updatedAt: Number(item.updatedAt ?? item.updated_at ?? item.updateTime ?? item.createTime ?? 0),
    }
  }

  function getChannelDisplayName(channel: Channel | null | undefined): string {
    return String(channel?.channelName || channel?.name || '').trim()
  }

  function isPlaceholderChannel(channel: Channel | null | undefined): boolean {
    const id = String(channel?.id || channel?.channelId || '').trim()
    if (!id) return false
    const displayName = getChannelDisplayName(channel)
    return !displayName || displayName === id
  }

  function mergeChannelRecord(prev: Channel | undefined, next: Channel): Channel {
    if (!prev) return next
    const id = String(next.id || next.channelId || prev.id || prev.channelId || '').trim()
    const merged: Channel = {
      ...prev,
      ...next,
      id,
      channelId: id,
      name: pickChannelName(id, [next.name, next.channelName, prev.name, prev.channelName]),
      channelName: pickChannelName(id, [next.channelName, next.name, prev.channelName, prev.name]),
      avatar: next.avatar || next.icon || prev.avatar || prev.icon || null,
      icon: next.icon || next.avatar || prev.icon || prev.avatar || null,
      logoColor: next.logoColor || prev.logoColor || null,
    }
    if (next.memberCount < 0 && prev.memberCount >= 0) {
      merged.memberCount = prev.memberCount
    }
    return merged
  }

  // 对齐老 im：频道列表要把“频道主列表”和“消息/会话里出现过的频道”合在一起，避免某一路为空时整段消失。
  function mergeChannelsById(...lists: Channel[][]): Channel[] {
    const map = new Map<string, Channel>()
    for (const list of lists) {
      for (const item of list) {
        const id = String(item.id || item.channelId || '')
        if (!id || !isValidChannelId(id)) continue
        map.set(id, mergeChannelRecord(map.get(id), { ...item, id, channelId: id }))
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
        const channelId = String(conv.targetId || '').trim()
        if (!isValidChannelId(channelId)) continue
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

  async function loadChannels(uid: string, options?: { refreshRemote?: boolean }) {
    const refreshRemote = options?.refreshRemote ?? true
    if (uid !== activeUid) {
      resetDetailRuntimeState()
    }
    activeUid = uid
    loading.value = true
    channelDebug('loadChannels start', { uid })
    try {
      let localChannels: Channel[] = []

      if (isTauri()) {
        try {
          const localRows = await tauriInvoke<any[]>('get_channels', { uid })
          localChannels = Array.isArray(localRows)
            // 历史版本可能把异常会话 ID 写进 channels 表，这里只保留合法频道 ID。
            ? filterRemovedChannels(localRows.map((item) => normalizeChannel(item)).filter((item) => isValidChannelId(item.id)), uid)
            : []
          channelDebug('local get_channels done', {
            rawCount: Array.isArray(localRows) ? localRows.length : -1,
            filteredCount: localChannels.length,
            sampleIds: localChannels.slice(0, 5).map((item) => item.id),
          })
          if (localChannels.length > 0) {
            channels.value = localChannels
          }
        } catch (e) {
          // 本地缓存读失败时继续走远端，避免频道列表被一次 SQLite 异常直接清空。
          console.error('[ChannelStore] local get_channels failed:', e)
          channelDebug('local get_channels failed', { error: String(e) })
        }
      }

      const conversationChannels = await loadChannelsFromConversationCache(uid)
      channelDebug('conversation fallback done', {
        count: conversationChannels.length,
        sampleIds: conversationChannels.slice(0, 5).map((item) => item.id),
      })
      if (conversationChannels.length > 0) {
        channels.value = filterRemovedChannels(mergeChannelsById(conversationChannels, localChannels), uid)
        if (refreshRemote) {
          await hydratePlaceholderChannels(uid)
        }
      }

      if (!refreshRemote) {
        return
      }

      // 先让用户看到本地/会话里的频道，再用远端列表补齐名称、头像、禁用状态等完整信息。
      await loadChannelsViaApi(uid, {
        conversationChannels,
        localChannels,
      })
    } catch (e) {
      console.error('[ChannelStore] loadChannels failed:', e)
      channelDebug('loadChannels failed', { error: String(e) })
    } finally {
      channelDebug('loadChannels final', {
        count: channels.value.length,
        sampleIds: channels.value.slice(0, 5).map((item) => item.id),
      })
      loading.value = false
    }
  }

  async function hydratePlaceholderChannels(uid = activeUid) {
    if (!uid) return
    const placeholders = channels.value.filter((item) => isPlaceholderChannel(item))
    if (placeholders.length === 0) return

    for (const item of placeholders) {
      const id = String(item.id || item.channelId || '').trim()
      if (!id || isChannelRemoved(id, uid)) continue
      const detail = await refreshChannelDetail(id)
      if (detail && !isPlaceholderChannel(detail)) {
        await saveChannelsToLocal(uid, channels.value)
      }
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
    let apiSucceeded = false

    while (hasMore) {
      try {
        const resp = await getChannelList({ pageNum, pageSize })
        const code = Number(resp?.code ?? 200)
        const list = resp?.data?.rowList || []
        channelDebug('API channelList page', {
          pageNum,
          code,
          msg: resp?.msg || '',
          rawCount: Array.isArray(list) ? list.length : -1,
          total: resp?.data?.total ?? null,
        })
        if (code !== 200 && code !== 0) {
          if (isAuthSessionExpiredResponse(resp)) {
            void handleAuthSessionExpired('channel-list', resp?.msg || '登录已过期，请重新登录')
          }
          throw new Error(resp?.msg || 'channel list request failed')
        }
        apiSucceeded = true
        for (const item of list) {
          const id = String(item.channelId || (item as ChannelListItem & { id?: string | number }).id || '')
          if (!id || !isValidChannelId(id) || seen.has(id) || isChannelRemoved(id, uid) || !isJoinedChannel(item)) continue
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
        if (isAuthSessionExpiredError(e)) {
          void handleAuthSessionExpired('channel-list-error', (e as Error)?.message || '登录已过期，请重新登录')
        }
        channelDebug('API channelList failed', { pageNum, error: String(e) })
        hasMore = false
      }
    }

    if (apiSucceeded) {
      const apiChannels = filterRemovedChannels(allChannels, uid)
      const apiIds = new Set(apiChannels.map((item) => String(item.id || item.channelId || '')))
      const trustedSeedChannels = [
        ...(seed?.conversationChannels || []),
        ...(seed?.localChannels || []),
      ].filter((item) => {
        const id = String(item.id || item.channelId || '')
        return apiIds.has(id) || isConfirmedJoinedChannel(item)
      })
      // 远端列表成功时以远端成员关系为准；只保留实时加入确认过的本地兜底，避免旧缓存把邀请/通知频道混进通讯录。
      const nextChannels = filterRemovedChannels(mergeChannelsById(
        trustedSeedChannels,
        apiChannels,
      ), uid)
      channelDebug('API channelList result', {
        collectedCount: allChannels.length,
        apiFilteredCount: apiChannels.length,
        mergedCount: nextChannels.length,
        trustedSeedCount: trustedSeedChannels.length,
        seedConversationCount: seed?.conversationChannels?.length || 0,
        seedLocalCount: seed?.localChannels?.length || 0,
      })
      channels.value = nextChannels
      await hydratePlaceholderChannels(uid)
      await saveChannelsToLocal(uid, channels.value)
      return
    }

    const mergedChannels = mergeChannelsById(
      seed?.conversationChannels || [],
      seed?.localChannels || [],
      allChannels,
    )

    if (mergedChannels.length > 0) {
      channels.value = mergedChannels
      await hydratePlaceholderChannels(uid)
      await saveChannelsToLocal(uid, mergedChannels)
      channelDebug('API failed, using merged fallback', { count: mergedChannels.length })
      return
    }

    // 如果远端频道列表没返回数据，至少保住会话里已经出现过的频道，不让通讯录区域完全空白。
    const fallbackChannels = seed?.conversationChannels || (await loadChannelsFromConversationCache(uid))
    channels.value = filterRemovedChannels(fallbackChannels, uid)
    await hydratePlaceholderChannels(uid)
    channelDebug('API empty, using conversation fallback', { count: channels.value.length })
    console.warn(
      '[ChannelStore] channel api empty, fallback from conversations',
    )
  }

  async function saveChannelsToLocal(uid: string, list: Channel[]) {
    if (!isTauri()) return

    try {
      await tauriInvoke('save_channels', {
        uid,
        channels: list.map((item) => ({
          id: item.id,
          name: item.channelName || item.name || item.id,
          avatar: item.avatar || item.icon || null,
          ownerId: item.ownerId,
          description: item.description,
          updatedAt: item.updatedAt,
        })),
      })
    } catch (e) {
      console.error('[ChannelStore] save_channels failed:', e)
    }
  }

  function getChannel(id: string): Channel | undefined {
    return channels.value.find((c) => c.id === id)
  }

  function patchChannel(
    channelId: string | number,
    patch: Record<string, unknown>,
    options: { allowRemoved?: boolean; uid?: string } = {},
  ) {
    const id = String(channelId || '').trim()
    if (!id || !isValidChannelId(id)) return
    if (options.uid) activeUid = options.uid
    if (isChannelRemoved(id) && !options.allowRemoved) return
    if (options.allowRemoved) unmarkChannelRemoved(activeUid, id)
    const index = channels.value.findIndex((item) => item.id === id)
    const prev = index >= 0 ? channels.value[index] : null
    // patch 常是“部分字段更新”（如仅更新 isDisturb）；先合并旧值再 normalize，避免把未传字段误置为默认值影响权限判断。
    const next = normalizeChannel({
      ...(prev || {}),
      ...patch,
      id,
      channelId: id,
    })
    if (index >= 0) {
      channels.value[index] = mergeChannelRecord(channels.value[index], next)
    } else {
      channels.value.unshift(next)
    }
    if (!detailStatusById.value[id]) {
      setChannelDetailStatus(id, 'idle')
    }
  }

  async function removeChannel(uid: string, channelId: string | number) {
    const id = String(channelId || '').trim()
    if (!id) return
    activeUid = uid || activeUid
    rememberRemovedChannelMeta(activeUid, id, getChannel(id))
    markChannelRemoved(activeUid, id)
    channels.value = channels.value.filter((item) => String(item.id || item.channelId || '') !== id)
    clearChannelDetailStatus(id)
    detailRequestById.delete(id)

    if (!isTauri() || !uid) return
    try {
      await tauriInvoke('delete_channel', { uid, channelId: id })
    } catch (e) {
      console.error('[ChannelStore] delete_channel failed:', e)
    }
  }

  async function refreshChannelDetail(channelId: string | number): Promise<Channel | null> {
    const id = String(channelId || '').trim()
    if (!id) return null

    return ensureChannelDetailReady(id, { force: true, skipLoadingState: true })
  }

  async function requestChannelDetail(id: string): Promise<Channel | null> {
    const resp = await getChannelDetail({ channelId: id })
    const code = Number(resp?.code ?? 200)
    if (code !== 200 && code !== 0) {
      if (isAuthSessionExpiredResponse(resp)) {
        void handleAuthSessionExpired('channel-detail', resp?.msg || '登录已过期，请重新登录')
      }
      throw new Error(resp?.msg || 'channel detail request failed')
    }
    if (!resp.data) return getChannel(id) || null
    const detailData = resp.data as any
    const rawMemberType = detailData.memberType ?? detailData.member_type
    const hasMemberType = rawMemberType !== undefined && rawMemberType !== null && rawMemberType !== ''
    if (hasMemberType && Number(rawMemberType) <= 0 && !isPublicChannel(detailData)) {
      // 对齐旧 im `deleteChat`：频道详情判定为非成员（未加入/已退出/被移出）时，
      // 私密频道仍同步删除会话；公开频道保留会话并在输入区展示“加入频道”。
      await removeChannel(activeUid, id)
      if (activeUid) {
        const { useChatStore } = await import('@/stores/useChatStore')
        await useChatStore().deleteConversation(activeUid, `2_${id}`).catch((e) => {
          console.warn('[ChannelStore] delete channel conversation after non-member detail failed:', e)
        })
      }
      return null
    }

    const next = normalizeChannel({
      ...getChannel(id),
      ...resp.data,
      id,
      channelId: resp.data.channelId ?? resp.data.id ?? id,
    })
    const index = channels.value.findIndex((item) => item.id === id)
    if (index >= 0) {
      channels.value[index] = next
    } else {
      channels.value.unshift(next)
    }
    return next
  }

  async function ensureChannelDetailReady(
    channelId: string | number,
    options: { force?: boolean; skipLoadingState?: boolean } = {},
  ): Promise<Channel | null> {
    const id = String(channelId || '').trim()
    if (!id) return null

    const status = getChannelDetailStatus(id)
    if (!options.force && status === 'ready') {
      return getChannel(id) || null
    }

    const pending = detailRequestById.get(id)
    if (pending) {
      // 复用同一频道的进行中请求，避免短时间重复点击触发并发详情请求。
      return pending
    }

    if (!options.skipLoadingState) {
      setChannelDetailStatus(id, 'loading')
    }
    const request = (async () => {
      try {
        const detail = await requestChannelDetail(id)
        // 无论是否仍在频道，详情请求已完成，避免输入区长期停留在 loading 状态。
        setChannelDetailStatus(id, 'ready')
        return detail
      } catch (e) {
        console.error('[ChannelStore] ensureChannelDetailReady failed:', e)
        setChannelDetailStatus(id, 'error')
        return getChannel(id) || null
      } finally {
        detailRequestById.delete(id)
      }
    })()
    detailRequestById.set(id, request)

    return request
  }

  return {
    channels,
    loading,
    detailStatusById,
    loadChannels,
    getChannel,
    getChannelDetailStatus,
    getRemovedChannelMeta,
    patchChannel,
    removeChannel,
    refreshChannelDetail,
    ensureChannelDetailReady,
    hydratePlaceholderChannels,
  }
})
