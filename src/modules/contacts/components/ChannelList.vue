<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useChannelStore } from '@/stores/useChannelStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'
import jtIcon from '@/assets/images/headNav/jt-icon.png'

const channelStore = useChannelStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUIStore()
const expanded = ref(true)

onMounted(() => {
  if (authStore.uid) channelStore.loadChannels(authStore.uid)
})

function handleSelect(channel: typeof channelStore.channels[0]) {
  const conv = chatStore.ensureConversation(2, channel.id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setDetailView('channel-detail')
}
</script>

<template>
  <div class="channel-list">
    <h2 class="section-title" @click="expanded = !expanded">
      频道
      <img class="arrow" :src="jtIcon" :style="expanded ? {} : { transform: 'rotate(180deg)' }" alt="toggle" />
    </h2>
    <div
      v-if="expanded"
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
  </div>
</template>

<style lang="scss" scoped>
/* Old channel list styles (kept for rollback)
.channel-list { padding: 4px 0; }
*/

.channel-list { padding: 0; }

.section-title {
  position: relative;
  margin: 0;
  padding-left: 20px;
  height: 26px;
  line-height: 26px;
  font-size: 14px;
  color: #333;
  font-weight: 600;
  cursor: pointer;
}

.arrow {
  position: absolute;
  width: 12px;
  right: 16px;
  top: 7px;
  transition: 0.3s all;
}

.channel-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px; cursor: pointer;
  &:hover { background: #e0e0e0; }
}

.channel-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.channel-name { font-size: 14px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.channel-desc { font-size: 12px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
