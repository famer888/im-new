<template>
  <div v-if="visible" class="select-member-dialog">
    <div class="dialog-mask" @click="$emit('close')" />
    <div class="content">
      <div class="top">
        <div class="head">
          <span class="title">{{ $t('移出') }}</span>
          <img class="close" src="@/assets/images/common/close-icon.png" @click="$emit('close')" />
        </div>
        <SearchInput v-model="searchKey" :placeholder="$t('搜索')" class="search" />
      </div>
      <div class="select-all" @click="toggleSelectAll">
        <span>{{ $t('移出群成员') }}</span>
        <AppCheckbox :modelValue="allSelected" />
      </div>
      <ul class="member-list">
        <li
          v-for="item in filteredMembers"
          :key="item.userId"
          :class="['member-item', { disable: !canRemove(item) }]"
          @click="selectMember(item)"
        >
          <div class="left">
            <TextAvatar :name="item.nickname || item.userId" :src="item.avatar" :size="38" rounded class="member-avatar" />
            <span class="name">{{ item.nickname || item.userId }}</span>
          </div>
          <div class="right">
            <div v-if="item.role === 0" class="tag-item">{{ $t('群主') }}</div>
            <div v-else-if="item.role === 1" class="tag-item orange">{{ $t('管理员') }}</div>
            <AppCheckbox :modelValue="selectedIds.has(item.userId)" />
          </div>
        </li>
      </ul>

      <div class="primaryBtn" @click="handleConfirm">{{ $t('完成') }}</div>
    </div>
    
    <Toast
      :visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
      @update:visible="toastVisible = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SearchInput from '@/components/SearchInput.vue'
import TextAvatar from '@/components/TextAvatar.vue'
import AppCheckbox from '@/components/AppCheckbox.vue'
import Toast from '@/components/Toast.vue'
import { groupMember } from '@/api/imBase'
import { eventBus } from '@/utils/eventBus'
import { rememberGroupMemberDisplayName } from '@/utils/groupRemovedMemberNameCache'

const { t: $t } = useI18n()

const props = defineProps<{
  visible: boolean
  groupId: string
  members: any[]
  currentRole: number // 当前用户的角色 0: 群主, 1: 管理员, 2: 普通成员
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'removed'): void
}>()

const searchKey = ref('')
const selectedIds = ref(new Set<string>())

const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

function resetToast() {
  toastVisible.value = false
  toastMessage.value = ''
  toastType.value = 'success'
}

watch(() => props.visible, (v) => {
  // 弹窗复用同一个组件实例，打开/关闭时清掉上一次操作留下的本地提示状态。
  resetToast()
  if (v) {
    searchKey.value = ''
    selectedIds.value.clear()
  }
})

const filteredMembers = computed(() => {
  const key = searchKey.value.toLowerCase()
  if (!key) return props.members
  return props.members.filter(m =>
    (m.nickname || m.userId).toLowerCase().includes(key) ||
    m.userId.toLowerCase().includes(key)
  )
})

// 判断是否可以移除该成员
function canRemove(member: any) {
  // 不能移除群主
  if (member.role === 0) return false
  // 如果当前是管理员，不能移除其他管理员
  if (props.currentRole > 0 && member.role === 1) return false
  return true
}

const removableMembers = computed(() => {
  return filteredMembers.value.filter(m => canRemove(m))
})

const allSelected = computed(() => {
  if (removableMembers.value.length === 0) return false
  return removableMembers.value.every(m => selectedIds.value.has(m.userId))
})

function toggleSelectAll() {
  const isAll = allSelected.value
  if (isAll) {
    selectedIds.value.clear()
  } else {
    removableMembers.value.forEach(m => selectedIds.value.add(m.userId))
  }
}

function selectMember(member: any) {
  if (!canRemove(member)) return
  if (selectedIds.value.has(member.userId)) {
    selectedIds.value.delete(member.userId)
  } else {
    selectedIds.value.add(member.userId)
  }
}

async function handleConfirm() {
  if (selectedIds.value.size === 0) {
    showToast($t('请至少选择一位群成员'))
    return
  }
  
  try {
    for (const userId of selectedIds.value) {
      const member = props.members.find((item) => String(item.userId) === String(userId))
      rememberGroupMemberDisplayName(
        props.groupId,
        userId,
        String(member?.nickname || member?.profileNickname || '').trim(),
      )
    }

    const res = await groupMember({
      op: 1, // 1: 移除
      groupId: props.groupId,
      members: Array.from(selectedIds.value)
    })
    
    const code = (res as any)?.commonResult?.errCode
    if (code === 200) {
      // 成功后弹窗会立即关闭，提示交给全局 Toast，避免下次打开弹窗时复用旧提示。
      eventBus.emit('show-toast', { message: $t('移除成功'), type: 'success' })
      emit('removed')
      emit('close')
    } else {
      showToast((res as any)?.errorDesc || $t('移除失败'), 'error')
    }
  } catch (e) {
    console.error('remove member failed:', e)
    showToast($t('移除失败'), 'error')
  }
}
</script>

<style lang="scss" scoped>
.select-member-dialog {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
}

.content {
  background: #fff;
  position: relative;
  border-radius: 8px;
  width: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);

  .select-all {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 16px;
    box-sizing: border-box;
    cursor: pointer;
    user-select: none;
    
    > span {
      color: #3369FE;
      font-size: 14px;
    }
  }
}

.close {
  cursor: pointer;
  width: 14px;
  height: 14px;
  
  &:hover {
    opacity: 0.8;
  }
}

.top {
  width: 100%;
  padding: 10px;
  box-sizing: border-box;
  border-bottom: 1px solid #f2f2f2;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .title {
    font-size: 16px;
    color: #787878;
  }
}

.search {
  margin-top: 10px;
}

.member-list {
  width: 100%;
  height: 260px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.member-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  box-sizing: border-box;
  cursor: pointer;

  &:hover {
    background: #f5f5f5;
  }

  .left {
    display: flex;
    align-items: center;
    flex-shrink: 1;
    min-width: 0;
  }

  .right {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .member-avatar {
    margin-right: 10px;
  }

  .name {
    font-size: 14px;
    color: #494949;
    word-break: break-all;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
}

.disable {
  opacity: 0.5;
  pointer-events: none;
}

.primaryBtn {
  width: 206px;
  height: 32px;
  margin: 16px 0;
  background: #3369FE;
  color: #fff;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }
}

.tag-item {
  width: 38px;
  height: 20px;
  border-radius: 99px;
  font-size: 12px;
  color: #fff;
  background: #3369FE;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
  
  &.orange {
    background: #FB9203;
  }
}
</style>
