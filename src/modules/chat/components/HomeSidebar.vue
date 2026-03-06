<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import { useSearchStore } from '@/stores/useSearchStore'
import { useAuthStore } from '@/stores/useAuthStore'
import SearchInput from '@/components/SearchInput.vue'
import TextAvatar from '@/components/TextAvatar.vue'
import ConversationList from './ConversationList.vue'
import SearchResults from './SearchResults.vue'
import SendHelper from './SendHelper.vue'
import AddressBook from '@/modules/contacts/views/AddressBook.vue'

const uiStore = useUIStore()
const searchStore = useSearchStore()
const authStore = useAuthStore()
const chatStore = useChatStore()

const searchKeyword = ref('')

function handleSearch(query: string) {
  if (authStore.uid) {
    searchStore.search(authStore.uid, query)
  }
}

function handleClearSearch() {
  searchKeyword.value = ''
  searchStore.clearResults()
}

function openFileHelper() {
  uiStore.setSidebarTab('chats')
  // Select or create file helper conversation (id: 9901)
  const conv = chatStore.conversations.find(c => c.targetId === '9901')
  if (conv) {
    chatStore.setCurrentConversation(conv.id)
    uiStore.setDetailView('chat')
  }
}
</script>

<template>
  <div class="home-sidebar">
    <!-- OCS Nav: 72px width, vertical icons -->
    <div class="nav-bar">
      <div class="nav-avatar" @click="uiStore.openAccountDialog()">
        <TextAvatar :name="authStore.nickname || 'U'" :size="35" />
      </div>

      <ul class="nav-list">
        <li :class="{ active: uiStore.sidebarTab === 'chats' }" @click="uiStore.setSidebarTab('chats')">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
          <span v-if="chatStore.totalUnread > 0" class="nav-badge">
            {{ chatStore.totalUnread > 99 ? '99+' : chatStore.totalUnread }}
          </span>
        </li>
        <li :class="{ active: uiStore.sidebarTab === 'contacts' }" @click="uiStore.setSidebarTab('contacts')">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
        </li>
        <li @click="openFileHelper">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M14 2v6h6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
        </li>
      </ul>

      <div class="nav-bottom">
        <li @click="uiStore.openSettings()">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.2.65.77 1.09 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
        </li>
      </div>
    </div>

    <!-- Chat list area: min-width 261px -->
    <div class="list-area">
      <div class="sidebar-search">
        <SearchInput
          v-model="searchKeyword"
          :placeholder="$t('搜索')"
          @search="handleSearch"
          @clear="handleClearSearch"
        />
        <button class="add-btn" @click="uiStore.addContactVisible = true" :title="$t('添加')">
          <svg viewBox="0 0 24 24" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19" stroke="#666" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="#666" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>

      <div class="sidebar-content">
        <SearchResults v-if="searchKeyword" />
        <template v-else>
          <ConversationList v-if="uiStore.sidebarTab === 'chats'" />
          <AddressBook v-else-if="uiStore.sidebarTab === 'contacts'" />
          <SendHelper v-else-if="uiStore.sidebarTab === 'transfer'" />
        </template>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.home-sidebar {
  display: flex;
  flex-shrink: 0;
  height: 100%;
}

// OCS Nav bar: 72px wide
.nav-bar {
  width: 72px;
  padding: 56px 0 0;
  background-color: rgb(239, 240, 242);
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.nav-avatar {
  cursor: pointer;
  margin-bottom: 10px;
}

.nav-list {
  margin-top: 40px;
  padding: 0 18px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;

  li {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 35px;
    height: 35px;
    margin: 0 auto 35px;
    border-radius: 4px;
    cursor: pointer;
    color: #666;
    position: relative;

    &:hover { color: #333; }
    &.active { color: #3369fe; }
  }
}

.nav-badge {
  position: absolute;
  left: 16px;
  top: -10px;
  margin-top: 4px;
  padding: 1px 7px;
  font-size: 12px;
  background: #f44e5a;
  border-radius: 10px;
  transform: scale(0.86);
  color: #fff;
  white-space: nowrap;
  line-height: 1.4;
}

.nav-bottom {
  margin-top: auto;
  padding-bottom: 20px;

  li {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 35px;
    height: 35px;
    margin: 0 auto;
    border-radius: 4px;
    cursor: pointer;
    color: #666;
    list-style: none;

    &:hover { color: #333; }
  }
}

// Chat list panel
.list-area {
  min-width: 261px;
  border-right: 1px solid #eee;
  background-color: rgb(252, 252, 252);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-search {
  display: flex;
  align-items: center;
  padding: 10px 10px 10px 16px;
  gap: 8px;
}

.add-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;

  &:hover { background: #e8e8e8; }
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
</style>
