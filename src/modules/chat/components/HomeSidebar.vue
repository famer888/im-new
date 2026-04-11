<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore, FILE_HELPER_TARGET_ID } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import { useSearchStore } from '@/stores/useSearchStore'
import { useAuthStore } from '@/stores/useAuthStore'
import SearchInput from '@/components/SearchInput.vue'
import ConversationList from './ConversationList.vue'
import SearchResults from './SearchResults.vue'
import SendHelper from './SendHelper.vue'
import AddressBook from '@/modules/contacts/views/AddressBook.vue'
import SearchAddContacts from '@/modules/contacts/components/SearchAddContacts.vue'
import AccountDialog from '@/modules/auth/components/AccountDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import accountIcon from '@/assets/images/headNav/message/logo-icon.png'
import messageIcon from '@/assets/images/headNav/message/message-icon.png'
import messageActiveIcon from '@/assets/images/headNav/message/message-active-icon.png'
import contactsIcon from '@/assets/images/headNav/message/contacts-icon.png'
import contactsActiveIcon from '@/assets/images/headNav/message/contacts-active-icon.png'
import transferIcon from '@/assets/images/headNav/message/cszs-icon.png'
import transferActiveIcon from '@/assets/images/headNav/message/cszs-active-icon.png'
import addBlueIcon from '@/assets/images/headNav/add_blue.png'

const uiStore = useUIStore()
const searchStore = useSearchStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const router = useRouter()

const searchKeyword = ref('')
const addAction = ref(false)
const avatarWrapRef = ref<HTMLElement | null>(null)
const accountDialogPosition = ref({ x: 74, y: 56 })
const SETTINGS_MENU_WIDTH = 102
const SETTINGS_MENU_GAP = 4
/** 两行 + padding，与 .settings-menu-item 大致一致 */
const SETTINGS_MENU_APPROX_HEIGHT = 80
const VIEWPORT_MENU_PAD = 8

const settingsMenuVisible = ref(false)
const settingsMenuStyle = ref<Record<string, string>>({
  left: '0px',
  top: '0px',
  transform: 'translateX(-50%)',
})
const settingsWrapRef = ref<HTMLElement | null>(null)
const settingsMenuRef = ref<HTMLElement | null>(null)
const navBarRef = ref<HTMLElement | null>(null)
const logoutConfirmVisible = ref(false)
const searchPlaceholder = computed(() =>
  addAction.value && uiStore.sidebarTab === 'contacts' ? '搜索手机号/ID/群别名' : '搜索',
)

watch(() => uiStore.sidebarTab, (tab) => {
  if (tab !== 'contacts') {
    addAction.value = false
  }
  // 传输助手聊天仅在「传输」Tab 下展示；切到消息/通讯录时关闭右侧会话（与 im 一致）
  if (tab !== 'transfer') {
    const conv = chatStore.currentConversation
    if (conv?.targetId === FILE_HELPER_TARGET_ID) {
      chatStore.setCurrentConversation(null)
      if (uiStore.detailView === 'chat') {
        uiStore.setDetailView('none')
      }
    }
  }
})

function handleSearch(query: string) {
  if (uiStore.sidebarTab === 'contacts' && addAction.value) {
    return
  }
  if (authStore.uid) {
    searchStore.search(authStore.uid, query)
  }
}

function handleClearSearch() {
  searchKeyword.value = ''
  searchStore.clearResults()
}

function handleAddAction() {
  addAction.value = true
  searchKeyword.value = ''
  searchStore.clearResults()
}

function handleCancelAddAction() {
  addAction.value = false
  searchKeyword.value = ''
  searchStore.clearResults()
}

function handleAvatarClick(event: MouseEvent) {
  if (uiStore.accountDialogVisible) {
    uiStore.closeAccountDialog()
    return
  }

  accountDialogPosition.value = {
    x: event.clientX + 12,
    y: event.clientY - 8,
  }
  uiStore.openAccountDialog()
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node | null
  if (uiStore.accountDialogVisible && avatarWrapRef.value && target && !avatarWrapRef.value.contains(target)) {
    uiStore.closeAccountDialog()
  }
  if (settingsMenuVisible.value && target) {
    const inWrap = settingsWrapRef.value?.contains(target)
    const inMenu = settingsMenuRef.value?.contains(target)
    if (!inWrap && !inMenu) {
      settingsMenuVisible.value = false
    }
  }
}

function handleSettingsClick(event: MouseEvent) {
  if (settingsMenuVisible.value) {
    settingsMenuVisible.value = false
    return
  }

  const nav = navBarRef.value?.getBoundingClientRect()
  const trigger = event.currentTarget as HTMLElement
  const tr = trigger.getBoundingClientRect()
  const cx = nav ? nav.left + nav.width / 2 : tr.left + tr.width / 2
  const half = SETTINGS_MENU_WIDTH / 2
  const clampedCx = Math.min(
    Math.max(cx, VIEWPORT_MENU_PAD + half),
    window.innerWidth - VIEWPORT_MENU_PAD - half,
  )
  settingsMenuStyle.value = {
    left: `${clampedCx}px`,
    top: `${tr.top - SETTINGS_MENU_APPROX_HEIGHT - SETTINGS_MENU_GAP}px`,
    transform: 'translateX(-50%)',
  }
  settingsMenuVisible.value = true
}

function handleOpenSettings() {
  settingsMenuVisible.value = false
  uiStore.openSettings()
}

function handleLogout() {
  settingsMenuVisible.value = false
  logoutConfirmVisible.value = true
}

async function confirmLogout() {
  await authStore.logout()
  if (!(window as any).__TAURI_INTERNALS__) {
    router.push('/login')
  }
}

async function openFileHelper() {
  uiStore.setSidebarTab('transfer')
  if (authStore.uid && !chatStore.conversations.some(c => c.targetId === FILE_HELPER_TARGET_ID)) {
    await chatStore.loadConversations(authStore.uid)
  }
  const conv = chatStore.conversations.find(c => c.targetId === FILE_HELPER_TARGET_ID)
  chatStore.setCurrentConversation(conv?.id ?? `0_${FILE_HELPER_TARGET_ID}`)
  uiStore.setDetailView('chat')
}

onMounted(() => {
  window.addEventListener('mousedown', handleClickOutside)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleClickOutside)
})
</script>

<template>
  <div class="home-sidebar">
    <!-- OCS Nav: 72px width, vertical icons -->
    <div ref="navBarRef" class="nav-bar">
      <div ref="avatarWrapRef" class="nav-avatar-wrap">
        <div class="nav-avatar">
          <picture @click="handleAvatarClick">
            <img class="account-avatar" :src="accountIcon" alt="account" />
          </picture>
        </div>
        <AccountDialog
          v-if="uiStore.accountDialogVisible"
          class="account-pop"
          :style="{
            left: `${accountDialogPosition.x}px`,
            top: `${accountDialogPosition.y}px`,
          }"
          @close="uiStore.closeAccountDialog()"
        />
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

      <div ref="settingsWrapRef" class="nav-bottom">
        <span class="setting-trigger" @click="handleSettingsClick">设置</span>
      </div>
    </div>

    <!-- Teleport：避免 .main-content overflow:hidden 裁掉宽于侧栏的菜单左侧 -->
    <Teleport to="body">
      <div
        v-if="settingsMenuVisible"
        ref="settingsMenuRef"
        class="settings-menu"
        :style="settingsMenuStyle"
      >
        <div class="settings-menu-item" @click="handleOpenSettings">系统设置</div>
        <div class="settings-menu-item" @click="handleLogout">退出登录</div>
      </div>
    </Teleport>

    <!-- Chat list area: min-width 261px -->
    <div class="list-area">
      <div class="sidebar-search">
        <SearchInput
          v-model="searchKeyword"
          :placeholder="searchPlaceholder"
          @search="handleSearch"
          @clear="handleClearSearch"
        />
        <span
          v-if="uiStore.sidebarTab === 'contacts' && addAction"
          class="add-cancel"
          @click="handleCancelAddAction"
        >取消</span>
        <button
          v-else-if="uiStore.sidebarTab === 'contacts'"
          class="add-btn"
          @click="handleAddAction"
          :title="$t('添加')"
        >
          <img :src="addBlueIcon" alt="add" />
        </button>
      </div>

      <div class="sidebar-content">
        <SearchAddContacts
          v-if="uiStore.sidebarTab === 'contacts' && addAction && searchKeyword.trim()"
          :search-text="searchKeyword"
        />
        <!-- 传输 Tab 始终显示 SendHelper（含「传输助手」行）；避免搜索框残留关键字时把整个侧栏换成搜索结果 -->
        <SendHelper v-else-if="uiStore.sidebarTab === 'transfer'" />
        <SearchResults v-else-if="searchKeyword.trim()" :keyword="searchKeyword" />
        <template v-else>
          <ConversationList v-if="uiStore.sidebarTab === 'chats'" />
          <AddressBook v-else-if="uiStore.sidebarTab === 'contacts'" />
        </template>
      </div>
    </div>

    <ConfirmDialog
      v-model:visible="logoutConfirmVisible"
      variant="im"
      content="退出后将无法收到新的消息，确认退出？"
      @confirm="confirmLogout"
    />
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

.nav-avatar-wrap {
  position: static;
}

.account-pop {
  position: fixed;
  z-index: 1000;
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
  position: relative;
  width: 100%;
  align-self: stretch;
  text-align: center;
}

.setting-trigger {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  cursor: pointer;
  user-select: none;

  &:hover {
    opacity: 0.8;
  }
}

/* fixed + Teleport：水平以 72px 导航条中心为锚（与 im 一致），不被父级 overflow 裁切 */
.settings-menu {
  position: fixed;
  z-index: 9800;
  width: 102px;
  min-width: 102px;
  box-sizing: border-box;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.settings-menu-item {
  padding: 10px 5px;
  background: #1b233b;
  color: #fff;
  font-size: 14px;
  text-align: center;
  cursor: pointer;
  user-select: none;

  &:hover {
    background: rgba(0, 0, 0, 0.9);
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

  > img {
    width: 24px;
    height: 24px;
    display: block;
  }
}

.add-cancel {
  font-size: 12px;
  color: #000;
  margin-left: 10px;
  display: flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
</style>
