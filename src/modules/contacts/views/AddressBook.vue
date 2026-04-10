<script setup lang="ts">
import FriendList from '../components/FriendList.vue'
import GroupList from '../components/GroupList.vue'
import ChannelList from '../components/ChannelList.vue'
import { useUIStore } from '@/stores/useUIStore'
import addNewIcon from '@/assets/images/headNav/add-new-icon.png'

const uiStore = useUIStore()
</script>

<template>
  <div class="address-book">
    <!-- Old tabs UI (kept for rollback)
    <div class="book-tabs">
      <button :class="['tab', { active: activeTab === 'friends' }]" @click="activeTab = 'friends'">好友</button>
      <button :class="['tab', { active: activeTab === 'groups' }]" @click="activeTab = 'groups'">群组</button>
      <button :class="['tab', { active: activeTab === 'channels' }]" @click="activeTab = 'channels'">频道</button>
    </div>
    <div class="book-content">
      <FriendList v-if="activeTab === 'friends'" />
      <GroupList v-else-if="activeTab === 'groups'" />
      <ChannelList v-else />
    </div>
    -->

    <div class="new-friend" @click="uiStore.setDetailView('friend-examine')">
      <img class="new-friend-icon" :src="addNewIcon" alt="new-friend" />
      <span class="new-friend-title">新的好友</span>
    </div>

    <div class="book-content">
      <GroupList />
      <ChannelList />
      <FriendList />
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* Old tabs styles (kept for rollback)
.address-book { display: flex; flex-direction: column; height: 100%; }

.book-tabs {
  display: flex; padding: 8px 12px 0; gap: 4px;
  .tab {
    flex: 1; height: 30px; background: transparent; border: none; border-radius: 4px;
    font-size: 13px; color: #666; cursor: pointer;
    &.active { background: #d4d4d4; color: #333; }
    &:hover:not(.active) { background: #e0e0e0; }
  }
}

.book-content { flex: 1; overflow-y: auto; }
*/

.address-book {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.new-friend {
  display: flex;
  align-items: center;
  padding: 10px 20px 14px;
  cursor: pointer;
}

.new-friend-icon {
  width: 35px;
  height: 35px;
  flex-shrink: 0;
}

.new-friend-title {
  margin-left: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #000;
}

.book-content {
  flex: 1;
  overflow-y: auto;
}
</style>
