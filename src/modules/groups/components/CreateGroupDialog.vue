<template>
  <div v-if="visible" class="create-group-dialog">
    <div class="dialog-mask" @click="$emit('close')" />
    <div class="dialog-body">
      <div class="dialog-header">
        <span>{{ $t('创建群聊') }}</span>
        <span class="close-btn" @click="$emit('close')">✕</span>
      </div>
      <div class="dialog-content">
        <div class="form-item">
          <label>{{ $t('群名称') }}</label>
          <input v-model="groupName" :placeholder="$t('请输入群名称')" class="form-input" />
        </div>
        <div class="form-item">
          <label>{{ $t('选择成员') }}</label>
          <SearchInput v-model="searchKey" :placeholder="$t('搜索好友')" />
          <div class="friend-list">
            <div
              v-for="friend in filteredFriends"
              :key="friend.uid"
              :class="['friend-item', { selected: selectedIds.has(friend.uid) }]"
              @click="toggleSelect(friend.uid)"
            >
              <AppCheckbox :checked="selectedIds.has(friend.uid)" />
              <TextAvatar :name="friend.displayName" :size="32" />
              <span class="friend-name ellipsis">{{ friend.displayName }}</span>
            </div>
          </div>
        </div>
        <div v-if="selectedIds.size > 0" class="selected-count">
          {{ $t('已选择') }} {{ selectedIds.size }} {{ $t('人') }}
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn-cancel" @click="$emit('close')">{{ $t('取消') }}</button>
        <button class="btn-primary" :disabled="!canCreate" @click="handleCreate">
          {{ $t('创建') }}
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

const { t: $t } = useI18n()
const contactStore = useContactStore()

defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', groupId: string): void
}>()

const groupName = ref('')
const searchKey = ref('')
const selectedIds = reactive(new Set<string>())

const filteredFriends = computed(() => {
  const key = searchKey.value.toLowerCase()
  if (!key) return contactStore.contacts
  return contactStore.contacts.filter(f =>
    f.displayName.toLowerCase().includes(key) ||
    f.uid.toLowerCase().includes(key),
  )
})

const canCreate = computed(() => groupName.value.trim() && selectedIds.size >= 2)

function toggleSelect(uid: string) {
  if (selectedIds.has(uid)) selectedIds.delete(uid)
  else selectedIds.add(uid)
}

async function handleCreate() {
  if (!canCreate.value) return
  try {
    // TODO: invoke('create_group', { name: groupName.value, memberIds: [...selectedIds] })
    emit('close')
  } catch { /* empty */ }
}
</script>

<style lang="scss" scoped>
.create-group-dialog {
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
  width: 420px;
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
  padding: 20px;
  max-height: 400px;
  overflow-y: auto;
}

.form-item {
  margin-bottom: 16px;

  label {
    display: block;
    font-size: 13px;
    color: #666;
    margin-bottom: 6px;
  }
}

.form-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  &:focus { border-color: #3369fe; }
}

.friend-list {
  max-height: 220px;
  overflow-y: auto;
  margin-top: 8px;
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

  .friend-name { font-size: 14px; color: #333; }
}

.selected-count {
  font-size: 13px;
  color: #3369fe;
  margin-top: 8px;
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
