<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'
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
const authStore = useAuthStore()
const search = ref('')
const activeIndex = ref(0)
const itemRefs = ref<HTMLElement[]>([])

const members = computed(() => {
  const list = groupStore.getMembers(props.groupId)
  if (!search.value.trim()) return list
  const kw = search.value.toLowerCase()
  return list.filter((m) => m.nickname?.toLowerCase().includes(kw) || m.userId.includes(kw))
})

const atAllItem = computed<GroupMember>(() => ({
  groupId: props.groupId,
  userId: 'all',
  nickname: '全体成员',
  role: 0,
}))

const canAtAll = computed(() => {
  const current = groupStore.getMembers(props.groupId).find(member => member.userId === authStore.uid)
  return current?.role === 0 || current?.role === 1
})

const selectableMembers = computed(() => {
  const kw = search.value.trim().toLowerCase()
  const allLabel = '全体成员'
  const includeAll = !kw || allLabel.toLowerCase().includes(kw) || 'all'.includes(kw)
  return canAtAll.value && includeAll ? [atAllItem.value, ...members.value] : members.value
})

watch(() => props.keyword, (v) => {
  search.value = v || ''
}, { immediate: true })

watch([() => props.visible, search, selectableMembers], () => {
  activeIndex.value = 0
  void scrollActiveIntoView()
})

function handleSelect(member: GroupMember) {
  emit('select', { uid: member.userId, name: member.nickname || member.userId })
  emit('update:visible', false)
}

async function scrollActiveIntoView() {
  await nextTick()
  const item = itemRefs.value[activeIndex.value]
  item?.scrollIntoView({ block: 'nearest' })
}

function handleKeyboard(key: string) {
  if (!props.visible) return
  const maxIndex = selectableMembers.value.length - 1
  if (maxIndex < 0) return

  if (key === 'ArrowUp') {
    activeIndex.value = Math.max(0, activeIndex.value - 1)
    void scrollActiveIntoView()
    return
  }

  if (key === 'ArrowDown') {
    activeIndex.value = Math.min(maxIndex, activeIndex.value + 1)
    void scrollActiveIntoView()
    return
  }

  if (key === 'Enter') {
    handleSelect(selectableMembers.value[activeIndex.value])
  }
}

defineExpose({ handleKeyboard })
</script>

<template>
  <Transition name="slide">
    <div v-if="visible && selectableMembers.length > 0" class="at-list-dialog" @click.stop>
      <ul class="at-list">
        <li
          v-for="(member, index) in selectableMembers"
          :key="member.userId"
          :ref="(el) => { if (el) itemRefs[index] = el as HTMLElement }"
          class="at-item"
          :class="{ active: index === activeIndex, 'at-all': member.userId === 'all' }"
          @click="handleSelect(member)"
        >
          <TextAvatar
            class="member-avatar"
            :name="member.userId === 'all' ? '@' : (member.nickname || member.userId)"
            :src="member.avatar"
            :avatar-type="member.userId === 'all' ? 'text' : 'friend'"
            :size="32"
          />
          <h2>
            <span class="name">{{ member.nickname || member.userId }}</span>
          </h2>
          <span v-if="member.userId !== 'all' && member.role === 0" class="role-tag owner">群主</span>
          <span v-else-if="member.role === 1" class="role-tag admin">管理员</span>
        </li>
      </ul>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
.at-list-dialog {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  transform: translateY(-1px);
  max-height: 180px;
  overflow-y: auto;
  background: #f9f9f9;
  border-top: 1px solid #eee;
  margin: 0;
  padding: 8px 0;
  z-index: 100;
  box-sizing: border-box;

  &::-webkit-scrollbar {
    width: 3px;
    height: 3px;
  }

  &::-webkit-scrollbar-thumb {
    box-shadow: inset 0 0 6px rgba(173, 172, 172, 0.3);
    background: #666;
    border-radius: 10px;
    cursor: pointer;
  }
}

.at-list {
  margin: 0;
  min-width: 60px !important;
  padding: 0;
}

.at-item {
  height: 40px;
  display: flex;
  align-items: center;
  cursor: pointer;
  position: relative;
  padding-left: 55px;
  padding-right: 70px;
  text-align: center;
  margin: 0 8px;
  content-visibility: auto;

  &:hover {
    background: #eee;
  }

  &.active {
    background: #e1eaff !important;
  }

  .member-avatar {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
  }

  > h2 {
    display: flex;
    align-items: center;
    margin: 0;
    min-width: 0;
    font-size: 14px;
    font-weight: normal;

    .name {
      max-width: 260px;
      overflow: hidden;
      display: block;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 14px;
      font-weight: bold;
      color: #000;
      margin-right: 10px;
    }
  }
}

.role-tag {
  font-size: 12px;
  color: #fff;
  padding: 2px 6px;
  border-radius: 99px;
  background: #fb9203;
  flex-shrink: 0;
  position: absolute;
  right: 10px;

  &.owner {
    background: #3369fe !important;
  }
}

.slide-enter-active, .slide-leave-active { transition: opacity 0.12s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; }
</style>
