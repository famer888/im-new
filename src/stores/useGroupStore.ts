import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

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
  role: number // 0: member, 1: admin, 2: owner
}

export const useGroupStore = defineStore('group', () => {
  const groups = ref<Group[]>([])
  const memberMap = ref<Map<string, GroupMember[]>>(new Map())
  const loading = ref(false)

  async function loadGroups(uid: string) {
    loading.value = true
    try {
      groups.value = await invoke<Group[]>('get_groups', { uid })
    } finally {
      loading.value = false
    }
  }

  async function loadMembers(uid: string, groupId: string) {
    const members = await invoke<GroupMember[]>('get_group_members', { uid, groupId })
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
