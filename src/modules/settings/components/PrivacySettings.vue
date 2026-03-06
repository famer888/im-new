<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from 'vue-i18n'
import TextAvatar from '@/components/TextAvatar.vue'

const { t: $t } = useI18n()

interface BlacklistItem {
  uid: string
  name: string
  addedAt: number
}

const showBlacklist = ref(false)
const blacklist = ref<BlacklistItem[]>([])

async function loadBlacklist() {
  try {
    // TODO: blacklist.value = await invoke('get_blacklist', { uid })
  } catch { /* empty */ }
}

async function removeFromBlacklist(uid: string) {
  try {
    // TODO: await invoke('remove_from_blacklist', { uid })
    blacklist.value = blacklist.value.filter(b => b.uid !== uid)
  } catch { /* empty */ }
}

onMounted(() => {
  loadBlacklist()
})
</script>

<template>
  <div class="privacy-settings">
    <template v-if="!showBlacklist">
      <div class="setting-item" @click="showBlacklist = false">
        <div class="setting-label">
          <span class="label-title">{{ $t('添加我的方式') }}</span>
          <span class="label-desc">{{ $t('控制其他人如何添加您为好友') }}</span>
        </div>
        <span class="arrow">›</span>
      </div>
      <div class="setting-item" @click="showBlacklist = true">
        <div class="setting-label">
          <span class="label-title">{{ $t('黑名单') }}</span>
          <span class="label-desc">{{ $t('管理屏蔽的联系人') }} ({{ blacklist.length }})</span>
        </div>
        <span class="arrow">›</span>
      </div>
    </template>

    <template v-else>
      <div class="blacklist-header">
        <button class="back-btn" @click="showBlacklist = false">← {{ $t('返回') }}</button>
        <span class="header-title">{{ $t('黑名单') }}</span>
      </div>
      <div class="blacklist-list">
        <div v-for="item in blacklist" :key="item.uid" class="blacklist-item">
          <TextAvatar :name="item.name || item.uid" :size="36" />
          <span class="bl-name">{{ item.name || item.uid }}</span>
          <button class="bl-remove" @click="removeFromBlacklist(item.uid)">
            {{ $t('移除') }}
          </button>
        </div>
        <div v-if="blacklist.length === 0" class="empty-tip">
          {{ $t('暂无黑名单') }}
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.privacy-settings {
  display: flex;
  flex-direction: column;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #f5f5f5;
  cursor: pointer;
  &:hover { background: #fafafa; }
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.label-title { font-size: 14px; color: #333; }
.label-desc { font-size: 12px; color: #999; }
.arrow { color: #c0c4cc; font-size: 18px; }

.blacklist-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0 16px;

  .back-btn {
    background: none;
    border: none;
    color: #3369fe;
    cursor: pointer;
    font-size: 13px;
  }

  .header-title {
    font-size: 16px;
    font-weight: 500;
    color: #333;
  }
}

.blacklist-list {
  display: flex;
  flex-direction: column;
}

.blacklist-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #f5f5f5;

  .bl-name {
    flex: 1;
    font-size: 14px;
    color: #333;
  }

  .bl-remove {
    background: none;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 4px 12px;
    font-size: 12px;
    color: #da2e2e;
    cursor: pointer;
    &:hover { background: #fef0f0; }
  }
}

.empty-tip {
  text-align: center;
  padding: 40px 0;
  color: #ccc;
  font-size: 13px;
}
</style>
