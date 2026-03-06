<script setup lang="ts">
import { onMounted } from 'vue'
import { useGroupStore } from '@/stores/useGroupStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'

const groupStore = useGroupStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUIStore()

onMounted(() => {
  if (authStore.uid) groupStore.loadGroups(authStore.uid)
})

function handleSelect(group: typeof groupStore.groups[0]) {
  const convId = `1_${group.id}`
  chatStore.setCurrentConversation(convId)
  uiStore.setDetailView('group-detail')
}
</script>

<template>
  <div class="group-list">
    <div
      v-for="group in groupStore.groups"
      :key="group.id"
      class="group-item"
      @click="handleSelect(group)"
    >
      <TextAvatar :name="group.name || group.id" :src="group.avatar" :size="36" />
      <div class="group-info">
        <span class="group-name">{{ group.name || group.id }}</span>
        <span class="group-count">{{ group.memberCount }} 人</span>
      </div>
    </div>
    <div v-if="groupStore.groups.length === 0" class="empty">暂无群组</div>
  </div>
</template>

<style lang="scss" scoped>
.group-list { padding: 4px 0; }

.group-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  &:hover { background: #e0e0e0; }
}

.group-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.group-name { font-size: 14px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-count { font-size: 12px; color: #999; }
.empty { text-align: center; padding: 40px; color: #ccc; font-size: 13px; }
</style>
