<template>
  <div v-if="visible" class="invite-friend-dialog">
    <div class="dialog-mask" @click="$emit('close')" />
    <div class="dialog-body">
      <div class="dialog-header">
        <span>{{ $t('邀请好友入群') }}</span>
        <span class="close-btn" @click="$emit('close')">✕</span>
      </div>
      <div class="dialog-content">
        <SearchInput v-model="searchKey" :placeholder="$t('搜索好友')" />
        <div class="friend-list">
          <div
            v-for="friend in filteredFriends"
            :key="friend.id"
            :class="['friend-item', { selected: selectedIds.has(friend.id), disabled: existingMemberIds.has(friend.id) }]"
            @click="toggleSelect(friend)"
          >
            <AppCheckbox
              :modelValue="selectedIds.has(friend.id) || existingMemberIds.has(friend.id)"
              :disabled="existingMemberIds.has(friend.id)"
            />
            <TextAvatar :name="friend.nickname || friend.id" :src="friend.avatar" :size="32" />
            <span class="friend-name ellipsis">{{ friend.nickname || friend.id }}</span>
            <span v-if="existingMemberIds.has(friend.id)" class="in-group-tag">{{ $t('已在群中') }}</span>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn-cancel" @click="$emit('close')">{{ $t('取消') }}</button>
        <button class="btn-primary" :disabled="selectedIds.size === 0" @click="handleInvite">
          {{ $t('邀请') }}({{ selectedIds.size }})
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useContactStore } from '@/stores/useContactStore'
import SearchInput from '@/components/SearchInput.vue'
import TextAvatar from '@/components/TextAvatar.vue'
import AppCheckbox from '@/components/AppCheckbox.vue'
import { groupMember } from '@/api/imBase'

const { t: $t } = useI18n()
const contactStore = useContactStore()

const props = defineProps<{
  visible: boolean
  groupId: string
  existingMemberIds: Set<string>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'invited'): void
}>()

const searchKey = ref('')
const selectedIds = reactive(new Set<string>())

const filteredFriends = computed(() => {
  const key = searchKey.value.toLowerCase()
  if (!key) return contactStore.contacts
  return contactStore.contacts.filter(f =>
    (f.nickname || f.id).toLowerCase().includes(key),
  )
})

function toggleSelect(friend: { id: string }) {
  if (props.existingMemberIds.has(friend.id)) return
  if (selectedIds.has(friend.id)) selectedIds.delete(friend.id)
  else selectedIds.add(friend.id)
}

async function handleInvite() {
  if (selectedIds.size === 0) return
  try {
    const res = await groupMember({
      op: 0,
      groupId: props.groupId,
      members: Array.from(selectedIds)
    })
    const code = (res as any)?.commonResult?.errCode
    if (code === 200) {
      if ((res as any)?.needCheckUids?.length > 0) {
        // TODO: show toast about need check
      }
      emit('invited')
      emit('close')
      selectedIds.clear()
    }
  } catch (e) {
    console.error('Invite failed:', e)
  }
}
</script>

<style lang="scss" scoped>
.invite-friend-dialog {
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
  background: rgba(0, 0, 0, 0.3);
}

.dialog-body {
  position: relative;
  width: 400px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  font-size: 16px;
  font-weight: 500;
  border-bottom: 1px solid #f0f0f0;

  .close-btn { cursor: pointer; color: #999; &:hover { color: #333; } }
}

.dialog-content {
  padding: 16px 20px;
}

.friend-list {
  max-height: 300px;
  overflow-y: auto;
  margin-top: 10px;
}

.friend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;

  &:hover { background: #f5f5f5; }
  &.selected { background: #eff4ff; }
  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .friend-name { flex: 1; font-size: 14px; color: #333; }
  .in-group-tag { font-size: 11px; color: #999; }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid #f0f0f0;

  .btn-cancel {
    padding: 0 16px;
    height: 32px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    font-size: 13px;
    &:hover { background: #f5f5f5; }
  }
}
</style>
