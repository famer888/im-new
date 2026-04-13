<script setup lang="ts">
import { computed } from 'vue'
import { useChannelStore } from '@/stores/useChannelStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'

const props = defineProps<{ channelId: string }>()
const channelStore = useChannelStore()
const chatStore = useChatStore()
const uiStore = useUIStore()

const channel = computed(() => channelStore.getChannel(props.channelId))

function startChat() {
  const conv = chatStore.ensureConversation(2, props.channelId)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setDetailView('chat')
}
</script>

<template>
  <div class="channel-detail" v-if="channel">
    <div class="detail-header">
      <TextAvatar :name="channel.name || channel.id" :src="channel.avatar" :size="64" />
      <div class="detail-name">{{ channel.name || channel.id }}</div>
    </div>
    <div v-if="channel.description" class="detail-section">
      <div class="section-label">频道简介</div>
      <div class="section-content">{{ channel.description }}</div>
    </div>
    <div class="detail-actions">
      <button class="btn-chat" @click="startChat">进入频道</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.channel-detail { padding: 32px 24px; display: flex; flex-direction: column; align-items: center; }
.detail-header { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 20px; }
.detail-name { font-size: 18px; font-weight: 500; color: #333; }
.detail-section {
  width: 100%; max-width: 360px; margin-bottom: 16px;
  padding: 12px; background: #f5f5f5; border-radius: 4px;
}
.section-label { font-size: 12px; color: #999; margin-bottom: 6px; }
.section-content { font-size: 14px; color: #333; line-height: 1.5; }
.detail-actions { margin-top: 16px; }
.btn-chat {
  width: 200px; height: 40px; background: #3369fe; color: #fff;
  border: none; border-radius: 4px; font-size: 14px; cursor: pointer;
  &:hover { background: rgba(51, 105, 254, 0.8); }
}
</style>
