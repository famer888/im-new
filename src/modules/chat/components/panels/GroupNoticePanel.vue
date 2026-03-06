<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/useChatStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useUIStore } from '@/stores/useUIStore'

const chatStore = useChatStore()
const groupStore = useGroupStore()
const uiStore = useUIStore()

const conv = computed(() => chatStore.currentConversation)
const group = computed(() => conv.value ? groupStore.getGroup(conv.value.targetId) : undefined)

function goBack() {
  uiStore.setRightPanel('group-info')
}
</script>

<template>
  <div class="group-notice-panel">
    <div class="panel-header">
      <button class="back-btn" @click="goBack">‹</button>
      <span>群公告</span>
    </div>
    <div class="panel-body">
      <div v-if="group?.notice" class="notice-content">{{ group.notice }}</div>
      <div v-else class="notice-empty">暂无公告</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.group-notice-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 16px;
  border-bottom: 1px solid #ebeef5;
  font-size: 14px;
  font-weight: 500;

  .back-btn {
    background: none;
    border: none;
    font-size: 22px;
    color: #666;
    cursor: pointer;
    padding: 0 4px;
    &:hover { color: #333; }
  }
}

.panel-body {
  flex: 1;
  padding: 16px;
}

.notice-content {
  font-size: 14px;
  color: #333;
  line-height: 1.6;
  white-space: pre-wrap;
}

.notice-empty {
  text-align: center;
  color: #ccc;
  font-size: 13px;
  padding-top: 40px;
}
</style>
