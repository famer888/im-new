import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getChannelDetail, getChannelList, type ChannelListItem } from '@/api/imChannel'
import {
  handleAuthSessionExpired,
  isAuthSessionExpiredError,
  isAuthSessionExpiredResponse,
} from '@/utils/authSessionExpiry'
import { logChannelContentLimitDebug, parseChannelContentLimitFromApi } from '@/utils/channelContentLimit'
import { ConversationType } from '@/types'

function isChannelExpiredOrInvalidText(text: unknown): boolean {
  const value = String(text || '').trim().toLowerCase()
  if (!value) return false
  if (value === '1000001') return true
  return value.includes('失效')
    || value.includes('过期')
    || value.includes('expired')
    || value.includes('invalid')
}

function isChannelExpiredOrInvalidResponse(resp: {
  msg?: unknown
  errMsg?: unknown
  errCode?: unknown
} | null | undefined): boolean {
  if (!resp) return false
  const msg = String(resp.msg ?? resp.errMsg ?? '').trim()
  if (isChannelExpiredOrInvalidText(msg)) return true
  const errCode = Number(resp.errCode ?? 0)
  return Number.isFinite(errCode) && errCode === 1000001
}

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
  /** 是否限制成员保存图片/文件等内容 */
  contentLimit: boolean
  updatedAt: number
}

export type ChannelDetailStatus = 'idle' | 'loading' | 'ready' | 'error'

export const useChannelStore = defineStore('channel', () => {
  const channels = ref<Channel[]>([])
  const loading = ref(false)
  const detailStatusById = ref<Record<string, ChannelDetailStatus>>({})
  let activeUid = ''
  const detailRequestById = new Map<string, Promise<Channel | null>>()

  function channelDiag(message: string, data: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'warn') {
    // 频道列表排查用：保留 warn/error，避免生产刷屏 info。
    if (level === 'info') return
    const logger = level === 'error' ? console.error : console.warn
    logger(`[ChannelStore] ${message}`, data)
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
      contentLimit: parseChannelContentLimitFromApi(item),
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

  /**
   * 通讯录频道可见性，对齐旧 ocs `address-book/channels.vue`：
   * channelList 返回的条目直接展示，不做「必须有名称 / memberType>0」过滤。
   * 仅 memberType < 0（已退出/失效）不展示。
   */
  function isChannelVisibleInAddressBook(channel: Channel | null | undefined, uid = activeUid): boolean {
    const id = String(channel?.id || channel?.channelId || '').trim()
    if (!id || !isValidChannelId(id) || isChannelRemoved(id, uid)) return false
    // 对齐旧 ocs 通讯录：仅已退出（memberType < 0）不展示。
    const mt = Number(channel?.memberType)
    if (channel?.memberType != null && Number.isFinite(mt) && mt < 0) return false
    return true
  }

  const addressBookChannels = computed(() =>
    channels.value.filter((item) => isChannelVisibleInAddressBook(item, activeUid)),
  )

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
    const startedAt = Date.now()
    channelDiag('conversation fallback start', { uid })

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
      channelDiag('conversation fallback done', {
        uid,
        count: fallbackChannels.length,
        sampleIds: fallbackChannels.slice(0, 5).map((item) => item.id),
        durationMs: Date.now() - startedAt,
      })
      return fallbackChannels
    } catch (e) {
      console.error('[ChannelStore] get_conversations fallback failed:', e)
      channelDiag('conversation fallback failed', {
        uid,
        durationMs: Date.now() - startedAt,
        message: e instanceof Error ? e.message : String(e),
      }, 'error')
      return []
    }
  }

  async function loadChannels(uid: string, options?: { refreshRemote?: boolean }) {
    const startedAt = Date.now()
    const refreshRemote = options?.refreshRemote ?? true
    if (uid !== activeUid) {
      resetDetailRuntimeState()
    }
    activeUid = uid
    loading.value = true
    channelDiag('loadChannels start', { uid, refreshRemote })
    try {
      let localChannels: Channel[] = []

      if (isTauri()) {
        const localStartedAt = Date.now()
        try {
          const localRows = await tauriInvoke<any[]>('get_channels', { uid })
          localChannels = Array.isArray(localRows)
            // 历史版本可能把异常会话 ID 写进 channels 表，这里只保留合法频道 ID。
            ? filterRemovedChannels(localRows.map((item) => normalizeChannel(item)).filter((item) => isValidChannelId(item.id)), uid)
            : []
          if (localChannels.length > 0) {
            channels.value = localChannels
          }
          channelDiag('local get_channels done', {
            rawCount: Array.isArray(localRows) ? localRows.length : -1,
            filteredCount: localChannels.length,
            placeholderCount: localChannels.filter(isPlaceholderChannel).length,
            sampleIds: localChannels.slice(0, 5).map((item) => item.id),
            durationMs: Date.now() - localStartedAt,
          })
        } catch (e) {
          // 本地缓存读失败时继续走远端，避免频道列表被一次 SQLite 异常直接清空。
          console.error('[ChannelStore] local get_channels failed:', e)
          channelDiag('local get_channels failed', {
            durationMs: Date.now() - localStartedAt,
            message: e instanceof Error ? e.message : String(e),
          }, 'error')
        }
      }

      const conversationChannels = await loadChannelsFromConversationCache(uid)
      if (conversationChannels.length > 0) {
        channels.value = filterRemovedChannels(mergeChannelsById(conversationChannels, localChannels), uid)
        channelDiag('applied conversation fallback', {
          count: channels.value.length,
          placeholderCount: channels.value.filter(isPlaceholderChannel).length,
          refreshRemote,
        })
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
      await refreshOrphanChannelConversations(
        uid,
        new Set(channels.value.map((item) => String(item.id || item.channelId || '')).filter(Boolean)),
      )
      channels.value = channels.value.filter((item) => isChannelVisibleInAddressBook(item, uid))
    } catch (e) {
      console.error('[ChannelStore] loadChannels failed:', e)
      channelDiag('loadChannels failed', {
        durationMs: Date.now() - startedAt,
        message: e instanceof Error ? e.message : String(e),
      }, 'error')
    } finally {
      channelDiag('loadChannels final', {
        count: channels.value.length,
        addressBookCount: addressBookChannels.value.length,
        placeholderCount: channels.value.filter(isPlaceholderChannel).length,
        sampleIds: channels.value.slice(0, 5).map((item) => item.id),
        durationMs: Date.now() - startedAt,
      })
      loading.value = false
    }
  }

  async function hydratePlaceholderChannels(uid = activeUid, options?: { pruneUnresolved?: boolean }) {
    if (!uid) return
    const placeholders = channels.value.filter((item) => isPlaceholderChannel(item))
    if (placeholders.length === 0) {
      channelDiag('hydrate placeholder skipped: none', { uid })
      return
    }

    const startedAt = Date.now()
    channelDiag('hydrate placeholder start', {
      uid,
      count: placeholders.length,
      sampleIds: placeholders.slice(0, 10).map((item) => item.id),
    })
    for (const item of placeholders) {
      const id = String(item.id || item.channelId || '').trim()
      if (!id || isChannelRemoved(id, uid)) continue
      const detailStartedAt = Date.now()
      const detail = await refreshChannelDetail(id)
      channelDiag('hydrate placeholder detail settled', {
        channelId: id,
        hasDetail: !!detail,
        name: detail?.channelName || detail?.name || '',
        stillPlaceholder: isPlaceholderChannel(detail || item),
        durationMs: Date.now() - detailStartedAt,
      })
      if (detail && !isPlaceholderChannel(detail)) {
        await saveChannelsToLocal(uid, channels.value)
      }
    }
    channelDiag('hydrate placeholder done', {
      uid,
      remainingPlaceholderCount: channels.value.filter(isPlaceholderChannel).length,
      durationMs: Date.now() - startedAt,
    })
    // 远端签名/网络失败时不要清占位，否则 97 等包号不对时会把频道整表清空。
    if (options?.pruneUnresolved !== false) {
      await pruneUnresolvedPlaceholderChannels(uid)
    }
  }

  async function pruneUnresolvedPlaceholderChannels(uid = activeUid, reason = 'placeholder-unresolved') {
    if (!uid) return
    const unresolvedIds = channels.value
      .filter((item) => {
        if (!isPlaceholderChannel(item)) return false
        const id = String(item.id || item.channelId || '').trim()
        if (!id || isChannelRemoved(id, uid)) return false
        // 详情请求失败（签名错误/网络错误）时保留，避免误删。
        return getChannelDetailStatus(id) !== 'error'
      })
      .map((item) => String(item.id || item.channelId || '').trim())
      .filter(Boolean)
    if (unresolvedIds.length === 0) return
    channelDiag('prune unresolved placeholder channels', {
      uid,
      count: unresolvedIds.length,
      sampleIds: unresolvedIds.slice(0, 10),
      reason,
    })
    for (const id of unresolvedIds) {
      await purgeInvalidChannelAndConversation(id, reason)
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
    const startedAt = Date.now()
    channelDiag('API channelList start', {
      uid,
      seedConversationCount: seed?.conversationChannels?.length || 0,
      seedLocalCount: seed?.localChannels?.length || 0,
    })

    while (hasMore) {
      const pageStartedAt = Date.now()
      try {
        const resp = await getChannelList({ pageNum, pageSize })
        const code = Number(resp?.code ?? 200)
        const list = resp?.data?.rowList || []
        channelDiag('API channelList page done', {
          pageNum,
          code,
          msg: resp?.msg || '',
          rawCount: Array.isArray(list) ? list.length : -1,
          total: resp?.data?.total ?? null,
          durationMs: Date.now() - pageStartedAt,
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
        channelDiag('API channelList page failed', {
          pageNum,
          durationMs: Date.now() - pageStartedAt,
          message: e instanceof Error ? e.message : String(e),
        }, 'error')
        hasMore = false
      }
    }

    if (apiSucceeded) {
      const apiChannels = filterRemovedChannels(allChannels, uid)
      const apiIds = new Set(apiChannels.map((item) => String(item.id || item.channelId || '')))
      const seedChannels = filterRemovedChannels(mergeChannelsById(
        seed?.conversationChannels || [],
        seed?.localChannels || [],
      ), uid)
      // 对齐旧 ocs：远端列表 + 本地/会话合并展示；远端空时保留本地，避免通讯录整段空白。
      const trustedSeedChannels = seedChannels.filter((item) => {
        const id = String(item.id || item.channelId || '')
        if (!id || !isValidChannelId(id)) return false
        if (apiIds.has(id)) return true
        // API 成功但本页未带回该频道时，仍保留本地已有名称的条目；纯占位留给 hydrate 补齐。
        return !isPlaceholderChannel(item)
      })
      const nextChannels = filterRemovedChannels(mergeChannelsById(
        trustedSeedChannels,
        apiChannels,
      ), uid)
      channelDiag('API channelList result', {
        collectedCount: allChannels.length,
        apiFilteredCount: apiChannels.length,
        mergedCount: nextChannels.length,
        trustedSeedCount: trustedSeedChannels.length,
        seedConversationCount: seed?.conversationChannels?.length || 0,
        seedLocalCount: seed?.localChannels?.length || 0,
        keptSeedOnly: apiChannels.length === 0 && trustedSeedChannels.length > 0,
        placeholderCount: nextChannels.filter(isPlaceholderChannel).length,
        durationMs: Date.now() - startedAt,
      })
      if (nextChannels.length > 0) {
        channels.value = nextChannels.filter((item) => isChannelVisibleInAddressBook(item, uid))
        // 补齐名称时不要因详情失败把列表清掉（对齐 ocs 通讯录只依赖 channelList）。
        await hydratePlaceholderChannels(uid, { pruneUnresolved: false })
        channels.value = channels.value.filter((item) => isChannelVisibleInAddressBook(item, uid))
        await saveChannelsToLocal(uid, channels.value)
      } else if (trustedSeedChannels.length > 0) {
        channels.value = trustedSeedChannels.filter((item) => isChannelVisibleInAddressBook(item, uid))
        await hydratePlaceholderChannels(uid, { pruneUnresolved: false })
        channels.value = channels.value.filter((item) => isChannelVisibleInAddressBook(item, uid))
      }
      return
    }

    const mergedChannels = mergeChannelsById(
      seed?.conversationChannels || [],
      seed?.localChannels || [],
      allChannels,
    )

    if (mergedChannels.length > 0) {
      channels.value = mergedChannels
      await hydratePlaceholderChannels(uid, { pruneUnresolved: false })
      channels.value = channels.value.filter((item) => {
        const id = String(item.id || item.channelId || '').trim()
        return !!id && isValidChannelId(id) && !isChannelRemoved(id, uid)
      })
      await saveChannelsToLocal(uid, channels.value)
      channelDiag('API failed, using merged fallback', {
        count: mergedChannels.length,
        placeholderCount: mergedChannels.filter(isPlaceholderChannel).length,
        durationMs: Date.now() - startedAt,
      })
      return
    }

    // 如果远端频道列表没返回数据，至少保住会话里已经出现过的频道，不让通讯录区域完全空白。
    const fallbackChannels = seed?.conversationChannels || (await loadChannelsFromConversationCache(uid))
    channels.value = filterRemovedChannels(fallbackChannels, uid)
    await hydratePlaceholderChannels(uid, { pruneUnresolved: false })
    channels.value = channels.value.filter((item) => {
      // API 失败时仍展示会话兜底频道（哪怕暂时只有 ID），避免 97 等签名异常时整页空白。
      const id = String(item.id || item.channelId || '').trim()
      return !!id && isValidChannelId(id) && !isChannelRemoved(id, uid)
    })
    channelDiag('API empty, using conversation fallback', {
      count: channels.value.length,
      placeholderCount: channels.value.filter(isPlaceholderChannel).length,
      durationMs: Date.now() - startedAt,
      apiSucceeded,
    })
    console.warn(
      '[ChannelStore] channel api failed or empty, fallback from conversations',
      { apiSucceeded, collected: allChannels.length },
    )
  }

  async function saveChannelsToLocal(uid: string, list: Channel[]) {
    if (!isTauri()) return

    const persistable = list.filter((item) => isChannelVisibleInAddressBook(item, uid))
    const startedAt = Date.now()
    try {
      await tauriInvoke('save_channels', {
        uid,
        channels: persistable.map((item) => ({
          id: item.id,
          name: item.channelName || item.name || item.id,
          avatar: item.avatar || item.icon || null,
          ownerId: item.ownerId,
          description: item.description,
          updatedAt: item.updatedAt,
        })),
      })
      channelDiag('save channels local done', {
        uid,
        count: persistable.length,
        placeholderCount: list.filter(isPlaceholderChannel).length,
        durationMs: Date.now() - startedAt,
      })
    } catch (e) {
      console.error('[ChannelStore] save_channels failed:', e)
      channelDiag('save channels local failed', {
        uid,
        count: list.length,
        durationMs: Date.now() - startedAt,
        message: e instanceof Error ? e.message : String(e),
      }, 'error')
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

  async function purgeInvalidChannelAndConversation(channelId: string, reason: string) {
    const id = String(channelId || '').trim()
    if (!id || !activeUid) return
    channelDiag('purge invalid channel conversation', { channelId: id, reason })

    await removeChannel(activeUid, id)

    const { useChatStore } = await import('@/stores/useChatStore')
    const chatStore = useChatStore()
    const convId = `2_${id}`
    const wasCurrent = chatStore.currentConversationId === convId
    await chatStore.deleteConversation(activeUid, convId).catch((e) => {
      console.warn('[ChannelStore] delete invalid channel conversation failed:', { channelId: id, reason, e })
    })

    if (wasCurrent) {
      const { useUIStore } = await import('@/stores/useUIStore')
      const uiStore = useUIStore()
      uiStore.setRightPanel('none')
      uiStore.setDetailView('none')
    }
  }

  async function refreshOrphanChannelConversations(uid: string, activeChannelIds: Set<string>) {
    if (!uid) return
    const { useChatStore } = await import('@/stores/useChatStore')
    const chatStore = useChatStore()
    const orphanIds = Array.from(new Set(
      chatStore.conversations
        .filter((conv) => {
          if (conv.type !== ConversationType.Channel) return false
          const channelId = String(conv.targetId || '').trim()
          if (!channelId || !isValidChannelId(channelId)) return false
          if (activeChannelIds.has(channelId)) return false
          return !isChannelRemoved(channelId, uid)
        })
        .map((conv) => String(conv.targetId || '').trim()),
    ))
    if (orphanIds.length === 0) return

    channelDiag('refresh orphan channel conversations start', {
      uid,
      count: orphanIds.length,
      sampleIds: orphanIds.slice(0, 10),
    })

    for (const channelId of orphanIds) {
      // 对齐旧 im deleteChat：不在成员列表里的频道会话，以详情接口为准决定是否删除。
      await requestChannelDetail(channelId).catch(() => null)
    }
  }

  async function refreshChannelDetail(channelId: string | number): Promise<Channel | null> {
    const id = String(channelId || '').trim()
    if (!id) return null

    return ensureChannelDetailReady(id, { force: true, skipLoadingState: true })
  }

  async function requestChannelDetail(id: string): Promise<Channel | null> {
    const startedAt = Date.now()
    channelDiag('detail request start', {
      channelId: id,
      currentName: getChannelDisplayName(getChannel(id)),
      currentStatus: getChannelDetailStatus(id),
    })
    const resp = await getChannelDetail({ channelId: id })
    const code = Number(resp?.code ?? 200)
    channelDiag('detail response received', {
      channelId: id,
      code,
      msg: resp?.msg || '',
      hasData: !!resp?.data,
      name: resp?.data?.channelName || (resp?.data as any)?.name || '',
      durationMs: Date.now() - startedAt,
    })
    if (code !== 200 && code !== 0) {
      if (isAuthSessionExpiredResponse(resp)) {
        void handleAuthSessionExpired('channel-detail', resp?.msg || '登录已过期，请重新登录')
        throw new Error(resp?.msg || 'channel detail request failed')
      }
      if (isChannelExpiredOrInvalidResponse(resp)) {
        channelDiag('detail says channel invalid/expired, remove', {
          channelId: id,
          code,
          msg: resp?.msg || '',
        })
        await purgeInvalidChannelAndConversation(id, 'detail-invalid')
        return null
      }
      throw new Error(resp?.msg || 'channel detail request failed')
    }
    if (!resp.data) {
      channelDiag('detail response empty data', { channelId: id })
      return getChannel(id) || null
    }
    const detailData = resp.data as any
    const rawMemberType = detailData.memberType ?? detailData.member_type
    const hasMemberType = rawMemberType !== undefined && rawMemberType !== null && rawMemberType !== ''
    if (hasMemberType && Number(rawMemberType) < 0) {
      channelDiag('detail says channel expired, remove', {
        channelId: id,
        rawMemberType,
      })
      await purgeInvalidChannelAndConversation(id, 'detail-expired')
      return null
    }
    if (hasMemberType && Number(rawMemberType) <= 0 && !isPublicChannel(detailData)) {
      channelDiag('detail says non-member private channel, remove', {
        channelId: id,
        rawMemberType,
      })
      // 对齐旧 im `deleteChat`：频道详情判定为非成员（未加入/已退出/被移出）时，
      // 私密频道仍同步删除会话；公开频道保留会话并在输入区展示“加入频道”。
      await purgeInvalidChannelAndConversation(id, 'non-member-private')
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
    logChannelContentLimitDebug(id, 'getChannelById', detailData)
    channelDiag('detail applied', {
      channelId: id,
      name: next.channelName || next.name || '',
      stillPlaceholder: isPlaceholderChannel(next),
      durationMs: Date.now() - startedAt,
    })
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
      channelDiag('detail ready skip', { channelId: id, status })
      return getChannel(id) || null
    }

    const pending = detailRequestById.get(id)
    if (pending) {
      // 复用同一频道的进行中请求，避免短时间重复点击触发并发详情请求。
      channelDiag('detail pending reused', { channelId: id, status })
      return pending
    }

    if (!options.skipLoadingState) {
      setChannelDetailStatus(id, 'loading')
    }
    channelDiag('detail ensure start', {
      channelId: id,
      force: !!options.force,
      skipLoadingState: !!options.skipLoadingState,
      previousStatus: status,
    })
    const startedAt = Date.now()
    const request = (async () => {
      try {
        const detail = await requestChannelDetail(id)
        // 无论是否仍在频道，详情请求已完成，避免输入区长期停留在 loading 状态。
        setChannelDetailStatus(id, 'ready')
        channelDiag('detail ensure done', {
          channelId: id,
          hasDetail: !!detail,
          name: detail?.channelName || detail?.name || '',
          durationMs: Date.now() - startedAt,
        })
        return detail
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[ChannelStore] ensureChannelDetailReady failed:', e)
        if (isChannelExpiredOrInvalidText(message)) {
          await purgeInvalidChannelAndConversation(id, 'detail-error')
          setChannelDetailStatus(id, 'ready')
          return null
        }
        if (isPlaceholderChannel(getChannel(id))) {
          await purgeInvalidChannelAndConversation(id, 'detail-error-placeholder')
          setChannelDetailStatus(id, 'ready')
          return null
        }
        setChannelDetailStatus(id, 'error')
        channelDiag('detail ensure failed', {
          channelId: id,
          durationMs: Date.now() - startedAt,
          message,
        }, 'error')
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
    addressBookChannels,
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
    isChannelVisibleInAddressBook,
  }
})
