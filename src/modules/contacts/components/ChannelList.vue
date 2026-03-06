<script setup lang="ts">
import { onMounted } from 'vue'
import { useChannelStore } from '@/stores/useChannelStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'

const channelStore = useChannelStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUIStore()

onMounted(() => {
  if (authStore.uid) channelStore.loadChannels(authStore.uid)
})

function handleSelect(channel: typeof channelStore.channels[0]) {
  const convId = `2_${channel.id}`
  chatStore.setCurrentConversation(convId)
  uiStore.setDetailView('channel-detail')
}
</script>

<template>
  <div class="channel-list">
    <div
      v-for="ch in channelStore.channels"
      :key="ch.id"
      class="channel-item"
      @click="handleSelect(ch)"
    >
      <TextAvatar :name="ch.name || ch.id" :src="ch.avatar" :size="36" />
      <div class="channel-info">
        <span class="channel-name">{{ ch.name || ch.id }}</span>
        <span v-if="ch.description" class="channel-desc">{{ ch.description }}</span>
      </div>
    </div>
    <div v-if="channelStore.channels.length === 0" class="empty">暂无频道</div>
  </div>
</template>

<style lang="scss" scoped>
.channel-list { padding: 4px 0; }

.channel-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px; cursor: pointer;
  &:hover { background: #e0e0e0; }
}

.channel-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.channel-name { font-size: 14px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.channel-desc { font-size: 12px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { text-align: center; padding: 40px; color: #ccc; font-size: 13px; }
</style>
