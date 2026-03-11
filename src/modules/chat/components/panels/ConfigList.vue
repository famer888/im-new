<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/useChatStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUIStore } from '@/stores/useUIStore'
import AppSwitch from '@/components/AppSwitch.vue'

const chatStore = useChatStore()
const authStore = useAuthStore()
const uiStore = useUIStore()
const conv = computed(() => chatStore.currentConversation)

async function togglePin() {
  if (!conv.value) return
  await chatStore.pinConversation(authStore.uid, conv.value.id, !conv.value.isPinned)
}

async function toggleMute() {
  if (!conv.value) return
  await chatStore.muteConversation(authStore.uid, conv.value.id, !conv.value.isMuted)
}

function openGroupNotice() {
  uiStore.setRightPanel('group-notice')
}
</script>

<template>
  <div class="config-list" v-if="conv">
    <div class="config-section">
      <div class="config-item">
        <span>置顶聊天</span>
        <AppSwitch :model-value="conv.isPinned" @update:model-value="togglePin" />
      </div>
      <div class="config-item">
        <span>消息免打扰</span>
        <AppSwitch :model-value="conv.isMuted" @update:model-value="toggleMute" />
      </div>
    </div>
    <div v-if="conv.type === 1" class="config-section">
      <div class="config-item clickable" @click="openGroupNotice">
        <span>群公告</span>
        <span class="arrow">›</span>
      </div>
      <div class="config-item clickable" @click="uiStore.setRightPanel('group-manage')">
        <span>群管理</span>
        <span class="arrow">›</span>
      </div>
    </div>
    <div class="config-section">
      <div class="config-item clickable">
        <span>查找聊天记录</span>
        <span class="arrow">›</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.config-list {
  padding: 8px 0;
}

.config-section {
  border-bottom: 8px solid #f5f5f5;
  padding: 4px 0;

  &:last-child { border-bottom: none; }
}

.config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 16px;
  font-size: 14px;
  color: #333;

  &.clickable {
    cursor: pointer;
    &:hover { background: #f5f5f5; }
  }
}

.arrow {
  color: #c0c4cc;
  font-size: 18px;
}
</style>
