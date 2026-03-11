import { defineStore } from 'pinia'
import { ref } from 'vue'

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
    if (!isTauri()) return
    loading.value = true
    try {
      groups.value = await tauriInvoke<Group[]>('get_groups', { uid })
    } finally {
      loading.value = false
    }
  }

  async function loadMembers(uid: string, groupId: string) {
    if (!isTauri()) return []
    const members = await tauriInvoke<GroupMember[]>('get_group_members', { uid, groupId })
    memberMap.value.set(groupId, members)
    return members
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
