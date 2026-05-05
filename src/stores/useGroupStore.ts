import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getGroupContactList, getGroupMemberList, groupMemberOnLineStatusList } from '@/api/imBase'

const MEMBER_ONLINE_STATUS_BATCH_SIZE = 40
const memberLoadRequestMap = new Map<string, Promise<GroupMember[]>>()

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
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
  const loading = ref(false)

  function setGroupMembers(groupId: string, members: GroupMember[]) {
    const next = new Map(memberMap.value)
    next.set(groupId, members)
    memberMap.value = next

    const group = getGroup(groupId)
    if (group && members.length !== group.memberCount) {
      upsertGroup({
        ...group,
        memberCount: members.length,
      })
    }
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

  async function loadGroups(uid: string) {
    loading.value = true
    try {
      if (isTauri()) {
        const localGroups = await tauriInvoke<Group[]>('get_groups', { uid })
        if (Array.isArray(localGroups) && localGroups.length > 0) {
          groups.value = localGroups.map((g: any) => normalizeGroup(g))
        } else {
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
      console.log(`[GroupStore] Loaded ${groups.value.length} groups via API`)
    } catch (e) {
      console.error('[GroupStore] API loadGroups failed:', e)
    }
  }

  async function loadMembers(uid: string, groupId: string) {
    const existingRequest = memberLoadRequestMap.get(groupId)
    if (existingRequest) return existingRequest

    const request = (async () => {
      let members: GroupMember[] | null = null

      if (isTauri()) {
        try {
          const localMembers = await tauriInvoke<any[]>('get_group_members', { uid, groupId })
          if (Array.isArray(localMembers) && localMembers.length > 0) {
            members = localMembers.map((item: any) => normalizeMember(item, groupId))
          }
        } catch (e) {
          console.error('[GroupStore] local loadMembers failed:', e)
        }
      }

      if (!members) {
        members = await loadMembersViaApi(groupId)
      }

      members = mergeMembersWithExistingStatuses(groupId, members)
      members = await loadMemberOnlineStatuses(groupId, members)
      setGroupMembers(groupId, members)
      return members
    })().finally(() => {
      memberLoadRequestMap.delete(groupId)
    })

    memberLoadRequestMap.set(groupId, request)
    return request
  }

  async function loadMembersViaApi(groupId: string): Promise<GroupMember[]> {
    const allMembers: GroupMember[] = []
    const pageSize = 200
    let pageNum = 1
    let hasMore = true

    while (hasMore) {
      try {
        const resp = await getGroupMemberList({
          // 保持字符串 ID，避免大整数群 ID 被 Number 截断后查不到成员
          groupId,
          pageNum,
          pageSize,
          time: 0,
        })
        const list = resp.members || []
        for (const item of list as any[]) {
          allMembers.push(normalizeMember(item, groupId))
        }

        hasMore = list.length >= pageSize
        pageNum++
      } catch (e) {
        console.error('[GroupStore] API loadMembers page failed:', e)
        hasMore = false
      }
    }

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
    applyOnlineStatusUpdates,
  }
})
