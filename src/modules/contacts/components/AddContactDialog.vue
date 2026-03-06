<script setup lang="ts">
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAuthStore } from '@/stores/useAuthStore'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const authStore = useAuthStore()
const searchId = ref('')
const verifyMessage = ref('你好，我是...')
const step = ref<'search' | 'verify'>('search')
const foundUser = ref<{ id: string; nickname: string; avatar: string } | null>(null)

function handleSearch() {
  if (!searchId.value.trim()) return
  // TODO: search user by ID via Tauri command
  foundUser.value = { id: searchId.value, nickname: searchId.value, avatar: '' }
  step.value = 'verify'
}

async function handleAdd() {
  if (!foundUser.value) return
  await invoke('add_contact', {
    uid: authStore.uid,
    targetId: foundUser.value.id,
    message: verifyMessage.value,
  })
  emit('update:visible', false)
  step.value = 'search'
  searchId.value = ''
  foundUser.value = null
}

function handleClose() {
  emit('update:visible', false)
  step.value = 'search'
  searchId.value = ''
  foundUser.value = null
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="handleClose">
        <div class="add-dialog">
          <div class="dialog-header">
            <span>{{ step === 'search' ? '添加好友' : '发送验证' }}</span>
            <button class="close-btn" @click="handleClose">×</button>
          </div>

          <div v-if="step === 'search'" class="dialog-body">
            <div class="search-row">
              <input v-model="searchId" placeholder="输入用户ID" @keyup.enter="handleSearch" />
              <button class="search-btn" @click="handleSearch">搜索</button>
            </div>
          </div>

          <div v-else class="dialog-body">
            <div class="found-user">
              <div class="user-avatar">{{ foundUser?.nickname?.[0] ?? '?' }}</div>
              <span>{{ foundUser?.nickname }}</span>
            </div>
            <textarea v-model="verifyMessage" placeholder="验证消息" rows="3" />
            <button class="send-btn" @click="handleAdd">发送验证</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0, 0, 0, 0.4); display: flex; align-items: center; justify-content: center;
}
.add-dialog { width: 360px; background: #fff; border-radius: 8px; overflow: hidden; }
.dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; font-size: 15px; font-weight: 500;
  .close-btn { background: none; border: none; font-size: 20px; color: #999; cursor: pointer; }
}
.dialog-body { padding: 0 20px 20px; }
.search-row {
  display: flex; gap: 8px;
  input {
    flex: 1; height: 36px; border: 1px solid #dcdfe6; border-radius: 4px;
    padding: 0 12px; font-size: 14px; outline: none;
    &:focus { border-color: #3369fe; }
  }
  .search-btn {
    height: 36px; padding: 0 16px; background: #3369fe; color: #fff;
    border: none; border-radius: 4px; font-size: 13px; cursor: pointer;
  }
}
.found-user {
  display: flex; align-items: center; gap: 12px; padding: 12px 0; margin-bottom: 12px;
  .user-avatar {
    width: 40px; height: 40px; border-radius: 4px; background: #3369fe; color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 16px;
  }
  span { font-size: 15px; color: #333; }
}
textarea {
  width: 100%; border: 1px solid #dcdfe6; border-radius: 4px; padding: 8px 12px;
  font-size: 14px; resize: none; outline: none; font-family: inherit;
  &:focus { border-color: #3369fe; }
}
.send-btn {
  display: block; width: 100%; height: 36px; margin-top: 12px;
  background: #3369fe; color: #fff; border: none; border-radius: 4px; font-size: 14px; cursor: pointer;
  &:hover { background: rgba(51, 105, 254, 0.8); }
}
.modal-enter-active, .modal-leave-active { transition: all 0.2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
