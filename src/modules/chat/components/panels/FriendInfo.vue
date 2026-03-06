<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import TextAvatar from '@/components/TextAvatar.vue'

const chatStore = useChatStore()
const contactStore = useContactStore()

const conv = computed(() => chatStore.currentConversation)
const contact = computed(() => conv.value ? contactStore.getContact(conv.value.targetId) : undefined)
</script>

<template>
  <div class="friend-info" v-if="contact">
    <div class="info-header">
      <TextAvatar :name="contact.nickname || contact.id" :src="contact.avatar" :size="56" />
      <div class="info-name">{{ contact.remark || contact.nickname || contact.id }}</div>
      <div v-if="contact.remark && contact.nickname" class="info-nickname">昵称：{{ contact.nickname }}</div>
    </div>
    <div class="info-section">
      <div class="info-item">
        <span class="label">备注</span>
        <span class="value">{{ contact.remark || '未设置' }}</span>
      </div>
      <div class="info-item">
        <span class="label">账号</span>
        <span class="value">{{ contact.id }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.friend-info {
  padding: 20px 16px;
}

.info-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

.info-name {
  font-size: 16px;
  font-weight: 500;
  color: #333;
}

.info-nickname {
  font-size: 12px;
  color: #999;
}

.info-section {
  margin-top: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  font-size: 13px;

  .label { color: #999; }
  .value { color: #333; }
}
</style>
