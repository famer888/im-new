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
  /** 头像 URL，与 proto UserBase.icon 一致 */
  avatar?: string | null
  role: number
}

export const useGroupStore = defineStore('group', () => {
  const groups = ref<Group[]>([])
  const memberMap = ref<Map<string, GroupMember[]>>(new Map())
  const loading = ref(false)

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
    if (isTauri()) {
      try {
        const localMembers = await tauriInvoke<any[]>('get_group_members', { uid, groupId })
        if (Array.isArray(localMembers) && localMembers.length > 0) {
          const normalizedMembers = localMembers.map((item: any) => ({
            // 兼容 tauri 侧 snake_case 与前端 camelCase
            groupId: String(item.groupId ?? item.group_id ?? groupId),
            userId: String(item.userId ?? item.user_id ?? ''),
            nickname: item.nickname ?? null,
            avatar: item.avatar ?? item.icon ?? null,
            role: Number(item.role ?? item.type ?? 0),
          }))
          memberMap.value.set(groupId, normalizedMembers)
          return normalizedMembers
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
          const user = item.user || {}
          allMembers.push({
            groupId: String(item.groupId || groupId),
            userId: String(user.uid || ''),
            nickname: user.nickName || null,
            avatar: user.icon || null,
            role: Number(item.type ?? 0),
          })
        }

        hasMore = list.length >= pageSize
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
