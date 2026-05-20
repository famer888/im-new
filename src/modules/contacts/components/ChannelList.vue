<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChannelStore } from '@/stores/useChannelStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'
import jtIcon from '@/assets/images/headNav/jt-icon.png'

const { t } = useI18n()
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
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
}
</script>

<template>
  <div class="channel-list">
    <h2 class="section-title" @click="expanded = !expanded">
      {{ t('频道') }}
      <img class="arrow" :src="jtIcon" :style="expanded ? {} : { transform: 'rotate(180deg)' }" alt="toggle" />
    </h2>
    <div
      v-if="expanded"
      v-for="ch in channelStore.channels"
      :key="ch.id"
      class="channel-item"
      @click="handleSelect(ch)"
    >
      <div class="channel-avatar">
        <TextAvatar
          v-if="!ch.avatar"
          :id="ch.channelId || ch.id"
          :name="ch.channelName || ch.name || ch.id"
          avatar-type="text"
          :color="ch.logoColor || undefined"
          :size="35"
          rounded
        />
        <TextAvatar
          v-else
          :id="ch.channelId || ch.id"
          :name="ch.channelName || ch.name || ch.id"
          :src="ch.avatar"
          avatar-type="channel"
          :color="ch.logoColor || undefined"
          :size="35"
          rounded
        />
      </div>
      <h3 class="channel-name">
        <span class="channel-name-text">
          {{ (ch.channelName || ch.name || ch.id || '').replaceAll('🪵', '?') }}
        </span>
      </h3>
    </div>
    <div v-if="expanded && !channelStore.loading" class="channel-no-more">
      没有更多数据了
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
  font-weight: normal;
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
  position: relative;
  padding: 0 16px 0 63px;
  display: flex;
  align-items: center;
  width: 100%;
  background-color: #fcfcfc;
  height: 59px;
  box-sizing: border-box;
  cursor: pointer;

  &:hover { background: #f9f9f9; }
}

.channel-avatar {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 35px;
  height: 35px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.channel-name {
  display: flex;
  align-items: center;
  margin: 0;
  width: 120px;
  font-size: 14px;
  color: #333;
  font-weight: normal;
  line-height: 18px;
}

.channel-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.channel-no-more {
  text-align: center;
  padding: 10px;
  color: #999;
  font-weight: normal;
}
</style>
