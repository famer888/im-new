<script setup lang="ts">
import { ref } from 'vue'
import FriendList from '../components/FriendList.vue'
import GroupList from '../components/GroupList.vue'
import ChannelList from '../components/ChannelList.vue'

type Tab = 'friends' | 'groups' | 'channels'
const activeTab = ref<Tab>('friends')
</script>

<template>
  <div class="address-book">
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
  </div>
</template>

<style lang="scss" scoped>
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
</style>
