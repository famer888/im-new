<script setup lang="ts">
import { computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useChatStore } from '@/stores/useChatStore'
import { ConversationType } from '@/types'
import ConfigList from './ConfigList.vue'
import MemberList from './MemberList.vue'
import FriendInfo from './FriendInfo.vue'
import GroupNoticePanel from './GroupNoticePanel.vue'

const uiStore = useUIStore()
const chatStore = useChatStore()

const conversation = computed(() => chatStore.currentConversation)
const showPanel = computed(() => uiStore.rightPanel !== 'none')
</script>

<template>
  <Transition name="slide-right">
    <div v-if="showPanel" class="right-panel">
      <FriendInfo v-if="uiStore.rightPanel === 'friend-info'" />
      <template v-else-if="uiStore.rightPanel === 'group-info'">
        <ConfigList />
        <MemberList v-if="conversation" :group-id="conversation.targetId" />
      </template>
      <GroupNoticePanel v-else-if="uiStore.rightPanel === 'group-notice'" />
      <template v-else-if="uiStore.rightPanel === 'channel-info'">
        <ConfigList />
      </template>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
.right-panel {
  width: 260px;
  border-left: 1px solid #e8e8e8;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-shrink: 0;
}

.slide-right-enter-active, .slide-right-leave-active {
  transition: all 0.25s ease;
}
.slide-right-enter-from, .slide-right-leave-to {
  width: 0;
  opacity: 0;
}
</style>
