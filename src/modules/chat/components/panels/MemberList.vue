<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGroupStore } from '@/stores/useGroupStore'
import { useAuthStore } from '@/stores/useAuthStore'
import TextAvatar from '@/components/TextAvatar.vue'

const props = defineProps<{ groupId: string }>()
const groupStore = useGroupStore()
const authStore = useAuthStore()
const search = ref('')
const showAll = ref(false)

onMounted(async () => {
  await groupStore.loadMembers(authStore.uid, props.groupId)
})

const members = computed(() => {
  const all = groupStore.getMembers(props.groupId)
  if (!search.value.trim()) return showAll.value ? all : all.slice(0, 20)
  const kw = search.value.toLowerCase()
  return all.filter((m) => m.nickname?.toLowerCase().includes(kw) || m.userId.includes(kw))
})

const group = computed(() => groupStore.getGroup(props.groupId))
const totalCount = computed(() => group.value?.memberCount ?? groupStore.getMembers(props.groupId).length)
</script>

<template>
  <div class="member-list">
    <div class="member-header">
      <span>群成员 ({{ totalCount }})</span>
    </div>
    <div class="member-search">
      <input v-model="search" placeholder="搜索群成员" />
    </div>
    <div class="member-items">
      <div v-for="member in members" :key="member.userId" class="member-item">
        <TextAvatar
          :name="member.nickname || member.userId"
          :src="member.avatar"
          :size="32"
        />
        <span class="member-name">{{ member.nickname || member.userId }}</span>
        <span v-if="member.role === 0" class="role-tag owner">群主</span>
        <span v-else-if="member.role === 1" class="role-tag admin">管理</span>
      </div>
    </div>
    <button v-if="!showAll && totalCount > 20" class="show-all-btn" @click="showAll = true">
      查看全部成员
    </button>
  </div>
</template>

<style lang="scss" scoped>
.member-list {
  padding: 8px 0;
  border-top: 8px solid #f5f5f5;
}

.member-header {
  padding: 8px 16px;
  font-size: 13px;
  color: #999;
}

.member-search {
  padding: 0 12px 8px;
  input {
    width: 100%;
    height: 28px;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    padding: 0 8px;
    font-size: 12px;
    outline: none;
    &:focus { border-color: #3369fe; }
  }
}

.member-items {
  max-height: 300px;
  overflow-y: auto;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 16px;
  cursor: pointer;
  &:hover { background: #f5f5f5; }
}

.member-name {
  flex: 1;
  font-size: 13px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-tag {
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 2px;
  &.owner { background: #fdf6ec; color: #e6a23c; }
  &.admin { background: rgba(51, 105, 254, 0.05); color: #3369fe; }
}

.show-all-btn {
  display: block;
  width: 100%;
  padding: 8px;
  background: none;
  border: none;
  font-size: 13px;
  color: #3369fe;
  cursor: pointer;
  &:hover { background: #f5f5f5; }
}
</style>
