<template>
  <div v-if="visible" class="account-dialog">
    <div class="dialog-mask" @click="$emit('close')" />
    <div class="dialog-body">
      <div class="dialog-header">
        <span>{{ $t('账户管理') }}</span>
        <span class="close-btn" @click="$emit('close')">✕</span>
      </div>
      <div class="dialog-content">
        <div class="account-list">
          <div
            v-for="account in accounts"
            :key="account.id"
            :class="['account-item', { active: account.id === currentId }]"
            @click="handleSwitch(account)"
          >
            <TextAvatar :name="account.name" :size="40" />
            <div class="account-info">
              <span class="account-name ellipsis">{{ account.name }}</span>
              <span class="account-id">ID: {{ account.id }}</span>
            </div>
            <span v-if="account.id === currentId" class="current-tag">{{ $t('当前') }}</span>
          </div>
        </div>
        <div class="account-actions">
          <button class="btn-primary btn-outline" @click="handleAdd">
            {{ $t('添加账户') }}
          </button>
          <button class="btn-export" @click="handleExport">
            {{ $t('导出数据') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import TextAvatar from '@/components/TextAvatar.vue'

const { t: $t } = useI18n()

interface AccountInfo {
  id: string
  name: string
  icon?: string
  sessionId?: string
  sourceId?: string
}

defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'switch', account: AccountInfo): void
  (e: 'add'): void
}>()

const accounts = ref<AccountInfo[]>([])
const currentId = ref('')

onMounted(async () => {
  try {
    const stored = localStorage.getItem('login-account-list')
    if (stored) accounts.value = JSON.parse(stored)
    currentId.value = localStorage.getItem('current-uid') || ''
  } catch { /* empty */ }
})

function handleSwitch(account: AccountInfo) {
  if (account.id === currentId.value) return
  emit('switch', account)
}

function handleAdd() {
  emit('add')
  emit('close')
}

function handleExport() {
  // TODO: invoke('export_account_data')
}
</script>

<style lang="scss" scoped>
.account-dialog {
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
  width: 380px;
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

  .close-btn {
    cursor: pointer;
    color: #999;
    &:hover { color: #333; }
  }
}

.dialog-content {
  padding: 16px 20px;
}

.account-list {
  max-height: 300px;
  overflow-y: auto;
}

.account-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover { background: #f5f5f5; }
  &.active { background: #eff4ff; }
}

.account-info {
  flex: 1;
  min-width: 0;

  .account-name {
    display: block;
    font-size: 14px;
    color: #333;
  }

  .account-id {
    font-size: 12px;
    color: #999;
  }
}

.current-tag {
  font-size: 11px;
  color: #3369fe;
  background: rgba(51, 105, 254, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.account-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;

  button { flex: 1; }

  .btn-export {
    height: 32px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    font-size: 12px;
    &:hover { background: #f5f5f5; }
  }
}
</style>
