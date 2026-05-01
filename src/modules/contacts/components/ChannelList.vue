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
      :class="['channel-item', { active: chatStore.currentConversation?.type === 2 && chatStore.currentConversation?.targetId === ch.id }]"
      @click="handleSelect(ch)"
    >
      <TextAvatar
        v-if="!ch.avatar"
        class="textAvatar"
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
      <h3 class="channel-name">{{ (ch.channelName || ch.name || ch.id || '').replaceAll('🪵', '?') }}</h3>
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
  position: relative;
  padding: 0 16px 0 63px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  background-color: #fcfcfc;
  height: 59px;
  box-sizing: border-box;
  cursor: pointer;

  &:hover { background: #f9f9f9; }
  &.active { background: #efefef; }
}

.textAvatar {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
}

.channel-name {
  margin: 0;
  width: 140px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  font-size: 14px;
  color: #333;
  font-weight: normal;
  line-height: 18px;
}
</style>
