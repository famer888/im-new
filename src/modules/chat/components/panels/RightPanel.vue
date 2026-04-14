<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useChatStore } from '@/stores/useChatStore'
import { ConversationType } from '@/types'
import ConfigList from './ConfigList.vue'
import MemberList from './MemberList.vue'
import FriendInfo from './FriendInfo.vue'
import GroupNoticePanel from './GroupNoticePanel.vue'
import { toggleSidebarWithWindow, type SidebarOpenType } from '@/utils/sidebarResize'

const uiStore = useUIStore()
const chatStore = useChatStore()

const conversation = computed(() => chatStore.currentConversation)
const showPanel = computed(() =>
  uiStore.detailView === 'chat' && uiStore.rightPanel !== 'none',
)
const sidebarType = ref<SidebarOpenType>('none')

watch(showPanel, async (visible) => {
  sidebarType.value = await toggleSidebarWithWindow(visible)
})
</script>

<template>
  <div class="right-panel" :class="{ open: showPanel, outer: sidebarType === 'outer' }">
    <template v-if="showPanel">
      <FriendInfo v-if="uiStore.rightPanel === 'friend-info'" />
      <template v-else-if="uiStore.rightPanel === 'group-info'">
        <ConfigList />
        <MemberList v-if="conversation" :group-id="conversation.targetId" />
      </template>
      <GroupNoticePanel v-else-if="uiStore.rightPanel === 'group-notice'" />
      <template v-else-if="uiStore.rightPanel === 'channel-info'">
        <ConfigList />
      </template>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.right-panel {
  width: 0;
  border-left: none;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;

  &.open {
    width: 260px;
    border-left: 1px solid #e8e8e8;
    overflow-y: auto;
  }

  &.open.outer {
    width: 256px;
  }
}
</style>
