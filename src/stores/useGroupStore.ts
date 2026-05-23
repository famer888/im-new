import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getGroupContactList, getGroupMemberList, groupMemberOnLineStatusList } from '@/api/imBase'

const MEMBER_ONLINE_STATUS_BATCH_SIZE = 40
const MEMBER_PREVIEW_COUNT = 8
const memberLoadRequestMap = new Map<string, Promise<GroupMember[]>>()

interface LoadMembersOptions {
  forceRemote?: boolean
  /** 通讯录详情页仅需头像预览，不拉全量成员与在线状态 */
  previewOnly?: boolean
}

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

function formatDebugError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function groupMemberRefreshDebug(message: string, data?: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'warn') {
  void message
  void data
  void level
}

export interface Group {
  id: string
  name: string | null
  avatar: string | null
  ownerId: string | null
  memberCount: number
  notice: string | null
  isMuted: boolean
  updatedAt: number
  groupAliasName?: string | null
}

export interface GroupMember {
  groupId: string
  userId: string
  nickname: string | null
  /** 头像 URL，与 proto UserBase.icon 一致 */
  avatar?: string | null
  role: number
  online?: boolean
  createTime?: number
}

export const useGroupStore = defineStore('group', () => {
  const groups = ref<Group[]>([])
  const memberMap = ref<Map<string, GroupMember[]>>(new Map())
  /** 记录成员列表是否仅为预览（8 人）或已全量加载 */
  const memberLoadDepthMap = ref<Map<string, 'preview' | 'full'>>(new Map())
  const loading = ref(false)

  function setGroupMembers(
    groupId: string,
    members: GroupMember[],
    options?: { updateMemberCount?: boolean },
  ) {
    const previousMembers = memberMap.value.get(groupId) ?? []
    const previousGroup = getGroup(groupId)
    groupMemberRefreshDebug('setGroupMembers before', {
      groupId,
      previousMemberMapCount: previousMembers.length,
      nextMemberCount: members.length,
      previousGroupMemberCount: previousGroup?.memberCount ?? null,
      nextMemberIds: members.map((member) => member.userId).slice(0, 10),
    })

    const next = new Map(memberMap.value)
    next.set(groupId, members)
    memberMap.value = next

    const group = getGroup(groupId)
    if (
      options?.updateMemberCount !== false
      && group
      && members.length !== group.memberCount
    ) {
      upsertGroup({
        ...group,
        memberCount: members.length,
      })
    }

    groupMemberRefreshDebug('setGroupMembers after', {
      groupId,
      memberMapCount: memberMap.value.get(groupId)?.length ?? 0,
      groupMemberCount: getGroup(groupId)?.memberCount ?? null,
      changed: previousMembers.length !== members.length || previousGroup?.memberCount !== getGroup(groupId)?.memberCount,
    })
  }

  function normalizeGroup(item: any): Group {
    return {
      id: String(item.id ?? item.groupId ?? item.group_id ?? ''),
      name: item.name ?? null,
      avatar: item.avatar ?? item.pic ?? null,
      ownerId: item.ownerId ?? item.owner_id ?? (item.hostId ? String(item.hostId) : null) ?? null,
      memberCount: Number(item.memberCount ?? item.member_count ?? 0),
      notice: item.notice ?? null,
      isMuted: Boolean(item.isMuted ?? item.is_muted ?? item.bfShutup ?? false),
      updatedAt: Number(item.updatedAt ?? item.updated_at ?? item.createTime ?? 0),
      groupAliasName: item.groupAliasName ?? item.group_alias_name ?? null,
    }
  }

  function upsertGroup(item: Partial<Group> & Record<string, any>) {
    const next = normalizeGroup(item)
    if (!next.id) return

    const idx = groups.value.findIndex((group) => group.id === next.id)
    if (idx >= 0) {
      groups.value[idx] = {
        ...groups.value[idx],
        ...next,
        name: next.name || groups.value[idx].name,
        avatar: next.avatar || groups.value[idx].avatar,
        memberCount: next.memberCount > 0 ? next.memberCount : groups.value[idx].memberCount,
      }
    } else {
      groups.value = [next, ...groups.value]
    }
  }

  async function loadGroups(uid: string, options?: { fallbackToApi?: boolean; forceApi?: boolean }) {
    const fallbackToApi = options?.fallbackToApi ?? true
    loading.value = true
    try {
      if (isTauri() && !options?.forceApi) {
        const localGroups = await tauriInvoke<Group[]>('get_groups', { uid })
        if (Array.isArray(localGroups) && localGroups.length > 0) {
          groups.value = localGroups.map((g: any) => normalizeGroup(g))
        } else if (fallbackToApi) {
          await loadGroupsViaApi()
        }
      } else {
        await loadGroupsViaApi()
      }
    } catch (e) {
      console.error('[GroupStore] loadGroups failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function loadGroupsViaApi() {
    try {
      const resp = await getGroupContactList()
      const list = resp.groups || []
      groups.value = list.map((g: any) => normalizeGroup(g))
    } catch (e) {
      console.error('[GroupStore] API loadGroups failed:', e)
    }
  }

  function isMemberListFullyLoaded(groupId: string, cached: GroupMember[]): boolean {
    if (memberLoadDepthMap.value.get(groupId) === 'full') return cached.length > 0
    const expected = getGroup(groupId)?.memberCount ?? 0
    return expected > 0 && cached.length >= expected
  }

  async function loadMembers(uid: string, groupId: string, options: LoadMembersOptions = {}) {
    const previewOnly = Boolean(options.previewOnly)
    const requestKey = `${groupId}:${options.forceRemote ? 'remote' : 'default'}:${previewOnly ? 'preview' : 'full'}`
    const cached = memberMap.value.get(groupId) ?? []
    const loadDepth = memberLoadDepthMap.value.get(groupId)

    if (previewOnly) {
      if (isMemberListFullyLoaded(groupId, cached)) return cached
      if (loadDepth === 'preview' && cached.length > 0) return cached
    } else if (!options.forceRemote && isMemberListFullyLoaded(groupId, cached)) {
      return cached
    }

    const existingRequest = memberLoadRequestMap.get(requestKey)
    groupMemberRefreshDebug('loadMembers called', {
      uid,
      groupId,
      forceRemote: Boolean(options.forceRemote),
      previewOnly,
      requestKey,
      hasExistingRequest: Boolean(existingRequest),
      currentMemberMapCount: cached.length,
      currentGroupMemberCount: getGroup(groupId)?.memberCount ?? null,
    })
    if (existingRequest) return existingRequest

    const request = (async () => {
      let members: GroupMember[] | null = null

      if (isTauri() && !options.forceRemote) {
        try {
          const localMembers = await tauriInvoke<any[]>('get_group_members', { uid, groupId })
          groupMemberRefreshDebug('local members loaded', {
            groupId,
            localCount: Array.isArray(localMembers) ? localMembers.length : -1,
          })
          if (Array.isArray(localMembers) && localMembers.length > 0) {
            members = localMembers.map((item: any) => normalizeMember(item, groupId))
            members = sortMembersForDisplay(members)
            if (previewOnly) {
              members = members.slice(0, MEMBER_PREVIEW_COUNT)
            }
          }
        } catch (e) {
          groupMemberRefreshDebug('local loadMembers failed', {
            groupId,
            error: formatDebugError(e),
          }, 'error')
          console.error('[GroupStore] local loadMembers failed:', e)
        }
      }

      if (!members) {
        groupMemberRefreshDebug('remote members loading', {
          groupId,
          reason: options.forceRemote ? 'forceRemote' : 'noLocalMembers',
          previewOnly,
        })
        members = await loadMembersViaApi(groupId, {
          pageSize: previewOnly ? MEMBER_PREVIEW_COUNT : 200,
          maxPages: previewOnly ? 1 : undefined,
        })
      }

      groupMemberRefreshDebug('members loaded before online merge', {
        groupId,
        count: members.length,
        memberIds: members.map((member) => member.userId).slice(0, 10),
      })
      members = mergeMembersWithExistingStatuses(groupId, members)
      if (!previewOnly) {
        members = await loadMemberOnlineStatuses(groupId, members)
      }
      groupMemberRefreshDebug('members loaded after online merge', {
        groupId,
        count: members.length,
        memberIds: members.map((member) => member.userId).slice(0, 10),
      })

      const nextDepth = previewOnly ? 'preview' : 'full'
      const nextDepthMap = new Map(memberLoadDepthMap.value)
      nextDepthMap.set(groupId, nextDepth)
      memberLoadDepthMap.value = nextDepthMap

      setGroupMembers(groupId, members, {
        updateMemberCount: !previewOnly,
      })
      return members
    })().finally(() => {
      groupMemberRefreshDebug('loadMembers finished', {
        groupId,
        requestKey,
        memberMapCount: memberMap.value.get(groupId)?.length ?? 0,
        groupMemberCount: getGroup(groupId)?.memberCount ?? null,
      })
      memberLoadRequestMap.delete(requestKey)
    })

    memberLoadRequestMap.set(requestKey, request)
    return request
  }

  async function loadMembersViaApi(
    groupId: string,
    options: { pageSize?: number; maxPages?: number } = {},
  ): Promise<GroupMember[]> {
    const allMembers: GroupMember[] = []
    const pageSize = options.pageSize ?? 200
    const maxPages = options.maxPages ?? Number.POSITIVE_INFINITY
    let pageNum = 1
    let hasMore = true

    while (hasMore && pageNum <= maxPages) {
      try {
        groupMemberRefreshDebug('remote page request', {
          groupId,
          pageNum,
          pageSize,
        })
        const resp = await getGroupMemberList({
          // 保持字符串 ID，避免大整数群 ID 被 Number 截断后查不到成员
          groupId,
          pageNum,
          pageSize,
          time: 0,
        })
        const list = resp.members || []
        groupMemberRefreshDebug('remote page response', {
          groupId,
          pageNum,
          pageCount: list.length,
          totalLoaded: allMembers.length + list.length,
          errCode: (resp as any)?.commonResult?.errCode ?? null,
          errMsg: (resp as any)?.commonResult?.errMsg ?? '',
        })
        for (const item of list as any[]) {
          allMembers.push(normalizeMember(item, groupId))
        }

        hasMore = list.length >= pageSize
        pageNum++
      } catch (e) {
        groupMemberRefreshDebug('remote page failed', {
          groupId,
          pageNum,
          error: formatDebugError(e),
        }, 'error')
        console.error('[GroupStore] API loadMembers page failed:', e)
        hasMore = false
      }
    }

    groupMemberRefreshDebug('remote members complete', {
      groupId,
      total: allMembers.length,
      memberIds: allMembers.map((member) => member.userId).slice(0, 10),
    })
    return sortMembersForDisplay(allMembers)
  }

  function normalizeMember(item: any, groupId: string): GroupMember {
    const user = item.user || {}
    const userOnlineStatus = user.userOnOrOffline || item.userOnOrOffline || {}
    return {
      groupId: String(item.groupId ?? item.group_id ?? groupId),
      userId: String(item.userId ?? item.user_id ?? user.uid ?? ''),
      nickname: item.nickname ?? user.nickName ?? null,
      avatar: item.avatar ?? item.icon ?? user.icon ?? null,
      role: Number(item.role ?? item.type ?? 0),
      online:
        typeof item.online === 'boolean'
          ? item.online
          : (typeof userOnlineStatus.online === 'boolean' ? userOnlineStatus.online : undefined),
      createTime: Number(item.createTime ?? userOnlineStatus.createTime ?? 0) || undefined,
    }
  }

  function mergeMembersWithExistingStatuses(groupId: string, members: GroupMember[]): GroupMember[] {
    const existing = memberMap.value.get(groupId) ?? []
    if (!existing.length) return sortMembersForDisplay(members)

    const existingMap = new Map(existing.map((member) => [member.userId, member]))
    return sortMembersForDisplay(
      members.map((member) => {
        const prev = existingMap.get(member.userId)
        if (!prev) return member
        return {
          ...prev,
          ...member,
          online: member.online ?? prev.online,
          createTime: member.createTime ?? prev.createTime,
        }
      }),
    )
  }

  async function loadMemberOnlineStatuses(groupId: string, members: GroupMember[]): Promise<GroupMember[]> {
    if (!members.length) return members

    const batches: string[][] = []
    for (let i = 0; i < members.length; i += MEMBER_ONLINE_STATUS_BATCH_SIZE) {
      const uids = members.slice(i, i + MEMBER_ONLINE_STATUS_BATCH_SIZE)
        .map((member) => member.userId)
        .filter(Boolean)
      if (uids.length) batches.push(uids)
    }

    if (!batches.length) return sortMembersForDisplay(members)

    const results = await Promise.allSettled(
      batches.map((uids) => groupMemberOnLineStatusList({ groupId, uids })),
    )
    const onlineMap = new Map<string, Pick<GroupMember, 'online' | 'createTime'>>()

    for (const result of results) {
      if (result.status !== 'fulfilled') {
        console.error('[GroupStore] loadMemberOnlineStatuses batch failed:', result.reason)
        continue
      }

      for (const row of result.value.userOnLineStatusList || []) {
        const uid = String(row.uid ?? '')
        if (!uid) continue
        onlineMap.set(uid, {
          online: Boolean(row.online),
          createTime: Number(row.createTime || 0) || undefined,
        })
      }
    }

    const merged = members.map((member) => {
      const onlinePatch = onlineMap.get(member.userId)
      return onlinePatch ? { ...member, ...onlinePatch } : member
    })

    return sortMembersForDisplay(merged)
  }

  function applyOnlineStatusUpdates(
    rows: Array<{ uid: string; online: boolean; createTime: number; bfShow?: boolean }>,
  ) {
    if (!rows.length || !memberMap.value.size) return

    const patchMap = new Map(
      rows
        .filter((row) => row.uid)
        .map((row) => [
          String(row.uid),
          {
            online: row.online,
            createTime: row.createTime || undefined,
          },
        ]),
    )

    if (!patchMap.size) return

    const next = new Map(memberMap.value)
    let changed = false

    for (const [groupId, members] of next.entries()) {
      let groupChanged = false
      const updatedMembers = members.map((member) => {
        const patch = patchMap.get(member.userId)
        if (!patch) return member
        if (member.online === patch.online && member.createTime === patch.createTime) return member
        groupChanged = true
        return {
          ...member,
          ...patch,
        }
      })

      if (groupChanged) {
        next.set(groupId, sortMembersForDisplay(updatedMembers))
        changed = true
      }
    }

    if (changed) {
      memberMap.value = next
    }
  }

  function sortMembersForDisplay(members: GroupMember[]): GroupMember[] {
    return [...members].sort((a, b) => {
      const roleDiff = a.role - b.role
      if (roleDiff !== 0) return roleDiff
      return Number(Boolean(b.online)) - Number(Boolean(a.online))
    })
  }

  function getGroup(id: string): Group | undefined {
    return groups.value.find((g) => g.id === id)
  }

  function getMembers(groupId: string): GroupMember[] {
    return memberMap.value.get(groupId) ?? []
  }

  function removeGroup(groupId: string) {
    const normalizedId = String(groupId || '').trim()
    if (!normalizedId) return
    groups.value = groups.value.filter((group) => group.id !== normalizedId)
    if (memberMap.value.has(normalizedId)) {
      const next = new Map(memberMap.value)
      next.delete(normalizedId)
      memberMap.value = next
    }
    if (memberLoadDepthMap.value.has(normalizedId)) {
      const nextDepth = new Map(memberLoadDepthMap.value)
      nextDepth.delete(normalizedId)
      memberLoadDepthMap.value = nextDepth
    }
  }

  return {
    groups,
    memberMap,
    loading,
    loadGroups,
    loadMembers,
    upsertGroup,
    setGroupMembers,
    getGroup,
    getMembers,
    removeGroup,
    applyOnlineStatusUpdates,
  }
})
