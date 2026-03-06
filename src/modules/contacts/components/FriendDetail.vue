<script setup lang="ts">
import { computed } from 'vue'
import { useContactStore } from '@/stores/useContactStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'

const props = defineProps<{ contactId: string }>()
const contactStore = useContactStore()
const chatStore = useChatStore()
const uiStore = useUIStore()

const contact = computed(() => contactStore.getContact(props.contactId))

function startChat() {
  const convId = `0_${props.contactId}`
  chatStore.setCurrentConversation(convId)
  uiStore.setSidebarTab('chats')
  uiStore.setDetailView('chat')
}
</script>

<template>
  <div class="friend-detail" v-if="contact">
    <div class="detail-header">
      <TextAvatar :name="contact.nickname || contact.id" :src="contact.avatar" :size="64" />
      <div class="detail-name">{{ contact.remark || contact.nickname || contact.id }}</div>
      <div v-if="contact.remark" class="detail-nickname">昵称：{{ contact.nickname }}</div>
    </div>
    <div class="detail-section">
      <div class="detail-item">
        <span class="label">账号</span>
        <span class="value">{{ contact.id }}</span>
      </div>
      <div class="detail-item">
        <span class="label">备注</span>
        <span class="value">{{ contact.remark || '未设置' }}</span>
      </div>
    </div>
    <div class="detail-actions">
      <button class="btn-chat" @click="startChat">发消息</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.friend-detail { padding: 32px 24px; display: flex; flex-direction: column; align-items: center; }

.detail-header { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 24px; }
.detail-name { font-size: 18px; font-weight: 500; color: #333; }
.detail-nickname { font-size: 13px; color: #999; }

.detail-section {
  width: 100%; max-width: 300px; margin-bottom: 24px;
}

.detail-item {
  display: flex; justify-content: space-between; padding: 12px 0;
  border-bottom: 1px solid #f0f0f0; font-size: 14px;
  .label { color: #999; }
  .value { color: #333; }
}

.detail-actions { margin-top: 16px; }

.btn-chat {
  width: 200px; height: 40px; background: #3369fe; color: #fff;
  border: none; border-radius: 4px; font-size: 14px; cursor: pointer;
  &:hover { background: rgba(51, 105, 254, 0.8); }
}
</style>
