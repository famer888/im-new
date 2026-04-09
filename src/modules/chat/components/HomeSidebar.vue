<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import { useSearchStore } from '@/stores/useSearchStore'
import { useAuthStore } from '@/stores/useAuthStore'
import SearchInput from '@/components/SearchInput.vue'
import ConversationList from './ConversationList.vue'
import SearchResults from './SearchResults.vue'
import SendHelper from './SendHelper.vue'
import AddressBook from '@/modules/contacts/views/AddressBook.vue'
import accountIcon from '@/assets/images/headNav/message/logo-icon.png'
import messageIcon from '@/assets/images/headNav/message/message-icon.png'
import messageActiveIcon from '@/assets/images/headNav/message/message-active-icon.png'
import contactsIcon from '@/assets/images/headNav/message/contacts-icon.png'
import contactsActiveIcon from '@/assets/images/headNav/message/contacts-active-icon.png'
import transferIcon from '@/assets/images/headNav/message/cszs-icon.png'
import transferActiveIcon from '@/assets/images/headNav/message/cszs-active-icon.png'

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
  uiStore.setSidebarTab('transfer')
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
        <picture>
          <img class="account-avatar" :src="accountIcon" alt="account" />
        </picture>
      </div>

      <ul class="nav-list">
        <li :class="{ active: uiStore.sidebarTab === 'chats' }" @click="uiStore.setSidebarTab('chats')">
          <img :src="uiStore.sidebarTab === 'chats' ? messageActiveIcon : messageIcon" alt="chat" />
          <span v-if="chatStore.totalUnread > 0" class="nav-badge">
            {{ chatStore.totalUnread > 99 ? '99+' : chatStore.totalUnread }}
          </span>
        </li>
        <li :class="{ active: uiStore.sidebarTab === 'contacts' }" @click="uiStore.setSidebarTab('contacts')">
          <img :src="uiStore.sidebarTab === 'contacts' ? contactsActiveIcon : contactsIcon" alt="contacts" />
        </li>
        <li :class="{ active: uiStore.sidebarTab === 'transfer' }" @click="openFileHelper">
          <img :src="uiStore.sidebarTab === 'transfer' ? transferActiveIcon : transferIcon" alt="transfer" />
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
  display: flex;
  justify-content: center;
  height: 50px;
  margin-bottom: 10px;

  > picture {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 50px;
    height: 50px;
    border: 2px solid rgb(227, 227, 227);
    box-sizing: border-box;
    border-radius: 50%;
    overflow: hidden;
    background: #fff;
    cursor: pointer;

    &:hover {
      opacity: 0.8;
    }
  }

  .account-avatar {
    display: block;
    object-fit: cover;
    width: 40px;
    height: 40px;
    border-radius: 50%;
  }
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
    position: relative;

    > img {
      display: block;
      width: 35px;
      cursor: pointer;

      &:hover { opacity: 0.85; }
    }

    &:last-child {
      > img {
        border-radius: 50%;
      }
    }
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
    list-style: none;

    &:hover { opacity: 0.85; }
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
