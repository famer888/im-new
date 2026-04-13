import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getGroupContactList, getGroupMemberList } from '@/api/imBase'

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
}

export interface GroupMember {
  groupId: string
  userId: string
  nickname: string | null
  role: number
}

export const useGroupStore = defineStore('group', () => {
  const groups = ref<Group[]>([])
  const memberMap = ref<Map<string, GroupMember[]>>(new Map())
  const loading = ref(false)

  async function loadGroups(uid: string) {
    loading.value = true
    try {
      if (isTauri()) {
        const localGroups = await tauriInvoke<Group[]>('get_groups', { uid })
        if (Array.isArray(localGroups) && localGroups.length > 0) {
          groups.value = localGroups
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
      groups.value = list.map((g: any) => ({
        id: String(g.groupId || ''),
        name: g.name || null,
        avatar: g.pic || null,
        ownerId: g.hostId ? String(g.hostId) : null,
        memberCount: Number(g.memberCount || 0),
        notice: null,
        isMuted: !!g.bfShutup,
        updatedAt: Number(g.createTime || 0),
      }))
      console.log(`[GroupStore] Loaded ${groups.value.length} groups via API`)
    } catch (e) {
      console.error('[GroupStore] API loadGroups failed:', e)
    }
  }

  async function loadMembers(uid: string, groupId: string) {
    if (isTauri()) {
      try {
        const localMembers = await tauriInvoke<GroupMember[]>('get_group_members', { uid, groupId })
        if (Array.isArray(localMembers) && localMembers.length > 0) {
          memberMap.value.set(groupId, localMembers)
          return localMembers
        }
      } catch (e) {
        console.error('[GroupStore] local loadMembers failed:', e)
      }
    }

    const members = await loadMembersViaApi(groupId)
    memberMap.value.set(groupId, members)
    return members
  }

  async function loadMembersViaApi(groupId: string): Promise<GroupMember[]> {
    const allMembers: GroupMember[] = []
    const pageSize = 200
    let pageNum = 1
    let hasMore = true
    const gid = Number(groupId)
    if (!Number.isFinite(gid) || gid <= 0) {
      return []
    }

    while (hasMore) {
      try {
        const resp = await getGroupMemberList({
          groupId: gid,
          pageNum,
          pageSize,
          time: 0,
        })
        const list = resp.members || []
        for (const item of list as any[]) {
          const user = item.user || {}
          allMembers.push({
            groupId: String(item.groupId || groupId),
            userId: String(user.uid || ''),
            nickname: user.nickName || null,
            role: Number(item.type || 0),
          })
        }

        const totalCount = Number(resp.count || 0)
        hasMore = totalCount > 0
          ? allMembers.length < totalCount
          : list.length >= pageSize
        pageNum++
      } catch (e) {
        console.error('[GroupStore] API loadMembers page failed:', e)
        hasMore = false
      }
    }

    return allMembers
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
    getGroup,
    getMembers,
  }
})
