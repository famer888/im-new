<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useGroupStore, type GroupMember } from '@/stores/useGroupStore'
import TextAvatar from '@/components/TextAvatar.vue'

const props = defineProps<{
  visible: boolean
  groupId: string
  keyword?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'select', member: { uid: string; name: string }): void
}>()

const groupStore = useGroupStore()
const search = ref('')

const members = computed(() => {
  const list = groupStore.getMembers(props.groupId)
  if (!search.value.trim()) return list
  const kw = search.value.toLowerCase()
  return list.filter((m) => m.nickname?.toLowerCase().includes(kw) || m.userId.includes(kw))
})

watch(() => props.keyword, (v) => { if (v) search.value = v })

function handleSelect(member: GroupMember) {
  emit('select', { uid: member.userId, name: member.nickname || member.userId })
  emit('update:visible', false)
}
</script>

<template>
  <Transition name="slide">
    <div v-if="visible" class="at-list-dialog" @click.stop>
      <div class="at-header">
        <input v-model="search" class="at-search" placeholder="搜索群成员" />
      </div>
      <div class="at-list">
        <div class="at-item at-all" @click="handleSelect({ groupId, userId: 'all', nickname: '所有人', role: 0 })">
          <TextAvatar name="@" :size="32" />
          <span>所有人</span>
        </div>
        <div
          v-for="member in members"
          :key="member.userId"
          class="at-item"
          @click="handleSelect(member)"
        >
          <TextAvatar :name="member.nickname || member.userId" :size="32" />
          <span>{{ member.nickname || member.userId }}</span>
          <span v-if="member.role === 2" class="role-tag owner">群主</span>
          <span v-else-if="member.role === 1" class="role-tag admin">管理员</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
.at-list-dialog {
  position: absolute;
  bottom: 100%;
  left: 16px;
  width: 240px;
  max-height: 300px;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 100;
}

.at-header {
  padding: 8px;
  border-bottom: 1px solid #ebeef5;

  .at-search {
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

.at-list {
  flex: 1;
  overflow-y: auto;
}

.at-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  color: #333;
  &:hover { background: #f2f3f5; }
}

.role-tag {
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 2px;
  margin-left: auto;
  &.owner { background: #fdf6ec; color: #e6a23c; }
  &.admin { background: rgba(51, 105, 254, 0.05); color: #3369fe; }
}

.slide-enter-active, .slide-leave-active { transition: all 0.2s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateY(8px); }
</style>
