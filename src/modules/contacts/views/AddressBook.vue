<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import FriendList from '../components/FriendList.vue'
import GroupList from '../components/GroupList.vue'
import ChannelList from '../components/ChannelList.vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useContactStore } from '@/stores/useContactStore'
import addNewIcon from '@/assets/images/headNav/add-new-icon.png'

const { t } = useI18n()
const uiStore = useUIStore()
const authStore = useAuthStore()
const contactStore = useContactStore()

function openFriendExamine() {
  contactStore.setNewFriendReqTotal(0, String(authStore.uid || ''))
  uiStore.setDetailView('friend-examine')
}

onMounted(() => {
  const uid = String(authStore.uid || '')
  if (uid) void contactStore.refreshNewFriendReqTotal(uid)
})
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

    <div class="new-friend" @click="openFriendExamine">
      <img class="new-friend-icon" :src="addNewIcon" alt="new-friend" />
      <span class="new-friend-title">{{ t('新的好友') }}</span>
      <span v-if="contactStore.newFriendReqTotal > 0" class="new-friend-badge">
        {{ contactStore.newFriendReqTotal > 99 ? '99+' : contactStore.newFriendReqTotal }}
      </span>
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
  position: relative;
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

.new-friend-badge {
  position: absolute;
  left: 42px;
  top: 6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 8px;
  background: #ff4d4f;
  color: #fff;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  transform: translateX(-50%);
}

.book-content {
  flex: 1;
  overflow-y: auto;
}
</style>
