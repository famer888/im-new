<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  useChatStore,
  CHANNEL_NOTIFICATION_TARGET_ID,
  FILE_HELPER_TARGET_ID,
  GROUP_NOTIFICATION_TARGET_ID,
  isFileHelperTargetId,
  type Conversation,
} from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import { useSearchStore } from '@/stores/useSearchStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { ConversationType } from '@/types'
import SearchInput from '@/components/SearchInput.vue'
import TextAvatar from '@/components/TextAvatar.vue'
import ConversationList from './ConversationList.vue'
import SearchResults from './SearchResults.vue'
import ChatSpecifiedSearch from './ChatSpecifiedSearch.vue'
import backIcon from '@/assets/images/setting/back.png'
import SendHelper from './SendHelper.vue'
import AddressBook from '@/modules/contacts/views/AddressBook.vue'
import SearchAddContacts from '@/modules/contacts/components/SearchAddContacts.vue'
import AccountDialog from '@/modules/auth/components/AccountDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import messageIcon from '@/assets/images/headNav/message/message-icon.png'
import messageActiveIcon from '@/assets/images/headNav/message/message-active-icon.png'
import contactsIcon from '@/assets/images/headNav/message/contacts-icon.png'
import contactsActiveIcon from '@/assets/images/headNav/message/contacts-active-icon.png'
import transferIcon from '@/assets/images/headNav/message/cszs-icon.png'
import transferActiveIcon from '@/assets/images/headNav/message/cszs-active-icon.png'
import addBlueIcon from '@/assets/images/headNav/add_blue.png'

const uiStore = useUIStore()
const searchStore = useSearchStore()
const { t, locale } = useI18n()
const authStore = useAuthStore()
const settingStore = useSettingStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()
const router = useRouter()

const searchKeyword = ref('')
const searchInputRef = ref<{ focus: () => void } | null>(null)
const addAction = ref(false)
const extendNavToTitlebar = computed(() => !!(window as any).__TAURI_INTERNALS__)
const avatarWrapRef = ref<HTMLElement | null>(null)
const accountDialogPosition = ref({ x: 74, y: 56 })
const SETTINGS_MENU_WIDTH = 102
const SETTINGS_MENU_GAP = 4
/** 三行 + padding，与 .settings-menu-item 大致一致 */
const SETTINGS_MENU_APPROX_HEIGHT = 120
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
const LOGOUT_CLEARED_HISTORY_FLAG_PREFIX = 'logout-cleared-history:'
const searchPlaceholder = computed(() => {
  void locale.value
  return addAction.value && uiStore.sidebarTab === 'contacts'
    ? t('搜索手机号/ID/群别名')
    : t('搜索')
})
function isConversationInCurrentRelations(conv: Conversation): boolean {
  switch (conv.type) {
    case ConversationType.Friend:
      if (conv.targetId === CHANNEL_NOTIFICATION_TARGET_ID) return true
      return Boolean(contactStore.getContact(conv.targetId))
    case ConversationType.Group:
      if (conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return true
      return Boolean(groupStore.getGroup(conv.targetId))
    case ConversationType.Channel:
      return Boolean(channelStore.getChannel(conv.targetId))
    default:
      return false
  }
}

const visibleChatUnread = computed(() =>
  chatStore.conversations
    .filter((conv) =>
      !conv.isMuted
      && !conv.isArchived
      && !isFileHelperTargetId(conv.targetId)
      && isConversationInCurrentRelations(conv),
    )
    .reduce((sum, conv) => sum + Math.max(0, Number(conv.unreadCount || 0)), 0),
)
const visibleContactUnread = computed(() => Math.max(0, Number(contactStore.newFriendReqTotal || 0)))

/** 与 im home-left/index.vue 一致：中间列表可左右拖拽改宽 */
const NAV_BAR_WIDTH = 72
const LIST_MIN_WIDTH = 261
const LIST_WIDTH_STORAGE_KEY = 'listWidth'

function parseStoredListWidth(): number {
  const raw = localStorage.getItem(LIST_WIDTH_STORAGE_KEY)
  if (raw == null) return LIST_MIN_WIDTH
  const n = Number(raw)
  return Number.isFinite(n) && n >= LIST_MIN_WIDTH ? n : LIST_MIN_WIDTH
}

const listWidth = ref(parseStoredListWidth())
const listWidthMax = ref(LIST_MIN_WIDTH)
const isListResizeDown = ref(false)

function updateListWidthMax() {
  let extra = document.body.clientWidth - 848
  if (extra < 0) extra = 0
  listWidthMax.value = extra + LIST_MIN_WIDTH
}

function handleListResizeMouseMove(e: MouseEvent) {
  if (!isListResizeDown.value) return
  let w = e.clientX - NAV_BAR_WIDTH
  if (w < LIST_MIN_WIDTH) w = LIST_MIN_WIDTH
  if (w > listWidthMax.value) w = listWidthMax.value
  listWidth.value = w
  localStorage.setItem(LIST_WIDTH_STORAGE_KEY, String(w))
}

function handleListResizeMouseUp() {
  if (isListResizeDown.value) isListResizeDown.value = false
}

function onListResizeHandleDown(e: MouseEvent) {
  e.preventDefault()
  isListResizeDown.value = true
}

watch(
  () => searchStore.searchSpecifiedChatInfo,
  (info) => {
    if (info) {
      searchKeyword.value = ''
      searchStore.clearResults()
    }
  },
)

watch(() => uiStore.sidebarTab, (tab) => {
  // 切换侧栏目录时清空搜索：避免通讯录「添加好友」输入残留到「消息」仍走 SearchResults（应对齐图2 仅会话列表 + 空搜索框）
  addAction.value = false
  searchKeyword.value = ''
  searchStore.clearResults()
  uiStore.setAddContactTarget(null)
  uiStore.setAddGroupTarget(null)
  if (uiStore.detailView === 'add-contact' || uiStore.detailView === 'add-group') {
    uiStore.setDetailView('none')
  }
  if (searchStore.searchSpecifiedChatInfo) {
    searchStore.closeSearchSpecifiedChat()
  }
  // 传输助手聊天仅在「传输」Tab 下展示；切到消息/通讯录时关闭右侧会话（与 im 一致）
  if (tab !== 'transfer') {
    const conv = chatStore.currentConversation
    if (isFileHelperTargetId(conv?.targetId)) {
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
  if (!authStore.uid) return
  /** 与 im `search-specified-chat`：`window.$db.searchTable({ id, type, searchText })` 对应本项目的 `searchInChat` */
  if (searchStore.searchSpecifiedChatInfo) {
    const convId = searchStore.conversationIdFromSearchSpecified(searchStore.searchSpecifiedChatInfo)
    void searchStore.searchInChat(authStore.uid, convId, query)
    return
  }
  searchStore.search(authStore.uid, query)
}

function handleClearSearch() {
  searchKeyword.value = ''
  searchStore.clearResults()
  if (uiStore.sidebarTab === 'contacts' && addAction.value) {
    uiStore.setAddContactTarget(null)
    uiStore.setAddGroupTarget(null)
    if (uiStore.detailView === 'add-contact' || uiStore.detailView === 'add-group') {
      uiStore.setDetailView('none')
    }
  }
  if (searchStore.searchSpecifiedChatInfo) {
    searchStore.clearChatSearch()
  }
}

/** 与 im 搜索条一致：点击输入区域外缘仍可聚焦输入框，便于开始搜索 */
function handleSearchBarClick(e: MouseEvent) {
  const el = e.target as HTMLElement
  if (el.closest('.add-btn') || el.closest('.add-cancel') || el.closest('.icon-back') || el.closest('.archive-back'))
    return
  searchInputRef.value?.focus()
}

/** 对齐旧 im search.vue handleBack：退出归档并清空搜索框 */
function handleArchiveSearchBack() {
  uiStore.setChatArchiveListShow(false)
  searchKeyword.value = ''
  searchStore.clearResults()
}

function handleBackSpecifiedChat() {
  if (!searchStore.searchSpecifiedChatInfo) return
  searchKeyword.value = ''
  searchStore.closeSearchSpecifiedChat()
}

function handleAddAction() {
  addAction.value = true
  searchKeyword.value = ''
  searchStore.clearResults()
  uiStore.setAddContactTarget(null)
  uiStore.setAddGroupTarget(null)
  uiStore.setRightPanel('none')
  uiStore.setDetailView('none')
}

function handleCancelAddAction() {
  addAction.value = false
  searchKeyword.value = ''
  searchStore.clearResults()
  uiStore.setAddContactTarget(null)
  uiStore.setAddGroupTarget(null)
  if (uiStore.detailView === 'add-contact' || uiStore.detailView === 'add-group') {
    uiStore.setDetailView('none')
  }
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

function handleOpenPostUpload() {
  settingsMenuVisible.value = false
  uiStore.openPostUpload()
}

function handleLogout() {
  settingsMenuVisible.value = false
  logoutConfirmVisible.value = true
}

async function confirmLogout() {
  const messageStore = useMessageStore()
  const currentUid = authStore.uid
  const keepHistoryOnLogout = settingStore.settings.keepHistoryOnLogout

  // Disable persistence before clearing so the localStorage cache is preserved for next login
  chatStore.enablePersistence('')

  if (currentUid && !keepHistoryOnLogout) {
    localStorage.setItem(`${LOGOUT_CLEARED_HISTORY_FLAG_PREFIX}${currentUid}`, String(Date.now()))
  } else if (currentUid) {
    localStorage.removeItem(`${LOGOUT_CLEARED_HISTORY_FLAG_PREFIX}${currentUid}`)
  }

  if (!(window as any).__TAURI_INTERNALS__ && currentUid && !keepHistoryOnLogout) {
    await chatStore.clearAllLocalChatHistory(currentUid)
  }

  chatStore.currentConversationId = null
  chatStore.conversations = []
  messageStore.clearAllMessageCaches()
  contactStore.contacts = []
  contactStore.searchResults = []
  groupStore.groups = []
  groupStore.memberMap = new Map()
  channelStore.channels = []
  searchStore.clearResults()
  searchStore.closeSearchSpecifiedChat()

  uiStore.setDetailView('none')
  uiStore.setRightPanel('none')
  uiStore.setSidebarTab('chats')

  await authStore.logout({ keepHistoryOnLogout })
  if (!(window as any).__TAURI_INTERNALS__) {
    await router.replace('/login')
    if (window.location.hash !== '#/login') {
      window.location.hash = '#/login'
    }
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
  const uid = String(authStore.uid || '')
  contactStore.loadNewFriendReqTotal(uid)
  if (uid) {
    void contactStore.refreshNewFriendReqTotal(uid)
    void Promise.allSettled([
      contactStore.loadContacts(uid),
      groupStore.loadGroups(uid),
      channelStore.loadChannels(uid),
    ])
  }
  updateListWidthMax()
  window.addEventListener('resize', updateListWidthMax)
  document.addEventListener('mousemove', handleListResizeMouseMove)
  document.addEventListener('mouseup', handleListResizeMouseUp)
  window.addEventListener('mousedown', handleClickOutside)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateListWidthMax)
  document.removeEventListener('mousemove', handleListResizeMouseMove)
  document.removeEventListener('mouseup', handleListResizeMouseUp)
  window.removeEventListener('mousedown', handleClickOutside)
})
</script>

<template>
  <div class="home-sidebar" :class="{ 'titlebar-nav': extendNavToTitlebar }">
    <!-- OCS Nav: 72px width, vertical icons -->
    <div ref="navBarRef" class="nav-bar">
      <div ref="avatarWrapRef" class="nav-avatar-wrap">
        <div class="nav-avatar">
          <picture @click="handleAvatarClick">
            <TextAvatar
              class="account-avatar"
              :name="authStore.nickname || authStore.uid || 'User'"
              :src="authStore.avatar || null"
              :size="40"
              rounded
            />
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
          <span v-if="visibleChatUnread > 0" class="nav-badge">
            {{ visibleChatUnread > 99 ? '99+' : visibleChatUnread }}
          </span>
        </li>
        <li :class="{ active: uiStore.sidebarTab === 'contacts' }" @click="uiStore.setSidebarTab('contacts')">
          <img :src="uiStore.sidebarTab === 'contacts' ? contactsActiveIcon : contactsIcon" alt="contacts" />
          <span v-if="visibleContactUnread > 0" class="nav-badge">
            {{ visibleContactUnread > 99 ? '99+' : visibleContactUnread }}
          </span>
        </li>
        <li :class="{ active: uiStore.sidebarTab === 'transfer' }" @click="openFileHelper">
          <img :src="uiStore.sidebarTab === 'transfer' ? transferActiveIcon : transferIcon" alt="transfer" />
        </li>
      </ul>

      <div ref="settingsWrapRef" class="nav-bottom">
        <span class="setting-trigger" @click="handleSettingsClick">{{ t('设置-新项目') }}</span>
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
        <div class="settings-menu-item" @click="handleOpenSettings">{{ t('系统设置') }}</div>
        <div class="settings-menu-item" @click="handleOpenPostUpload">{{ t('上传日志') }}</div>
        <div class="settings-menu-item" @click="handleLogout">{{ t('退出登录') }}</div>
      </div>
    </Teleport>

    <!-- Chat list area：宽度可拖拽，与 im .comList 一致 -->
    <div
      class="list-area"
      :style="{ width: `${listWidth}px`, maxWidth: `${listWidthMax}px` }"
    >
      <div
        class="sidebar-search"
        :class="{
          'has-back': !!searchStore.searchSpecifiedChatInfo,
          'archive-chats-mode':
            uiStore.sidebarTab === 'chats'
            && uiStore.chatArchiveListShow
            && !searchStore.searchSpecifiedChatInfo,
        }"
        @click="handleSearchBarClick"
      >
        <!-- 归档内页：标题置顶居中 + 搜索行 + 返回在搜索框右侧（对齐 im com/search.vue） -->
        <template
          v-if="
            uiStore.sidebarTab === 'chats'
              && uiStore.chatArchiveListShow
              && !searchStore.searchSpecifiedChatInfo
          "
        >
          <div class="archive-title">{{ $t('归档会话') }}</div>
          <div class="search-line-archive">
            <SearchInput
              ref="searchInputRef"
              v-model="searchKeyword"
              :placeholder="searchPlaceholder"
              @search="handleSearch"
              @clear="handleClearSearch"
            />
            <span class="archive-back" role="button" tabindex="0" @click.stop="handleArchiveSearchBack">
              <img class="archive-back-icon" :src="backIcon" alt="" />
            </span>
          </div>
        </template>
        <template v-else>
          <img
            v-if="searchStore.searchSpecifiedChatInfo"
            class="icon-back"
            :src="backIcon"
            alt=""
            @click="handleBackSpecifiedChat"
          />
          <SearchInput
            ref="searchInputRef"
            v-model="searchKeyword"
            :placeholder="searchPlaceholder"
            @search="handleSearch"
            @clear="handleClearSearch"
          />
          <span
            v-if="uiStore.sidebarTab === 'contacts' && addAction"
            class="add-cancel"
            @click="handleCancelAddAction"
          >{{ t('搜索取消') }}</span>
          <button
            v-else-if="uiStore.sidebarTab === 'contacts'"
            class="add-btn"
            @click="handleAddAction"
            :title="$t('添加')"
          >
            <img :src="addBlueIcon" alt="add" />
          </button>
        </template>
      </div>

      <div class="sidebar-content">
        <SearchAddContacts
          v-if="uiStore.sidebarTab === 'contacts' && addAction && searchKeyword.trim()"
          :search-text="searchKeyword"
        />
        <!-- 与 im home-left/index.vue 一致：有搜索关键字时中间栏为 ComSearchs（SearchResults），空关键字时传输 Tab 才显示 SendHelper -->
        <ChatSpecifiedSearch
          v-else-if="searchStore.searchSpecifiedChatInfo"
          :search-text="searchKeyword"
        />
        <SearchResults v-else-if="searchKeyword.trim()" :keyword="searchKeyword" />
        <SendHelper v-else-if="uiStore.sidebarTab === 'transfer'" />
        <template v-else>
          <ConversationList v-if="uiStore.sidebarTab === 'chats'" />
          <AddressBook v-else-if="uiStore.sidebarTab === 'contacts'" />
        </template>
      </div>
      <i class="list-resize-handle" aria-hidden="true" @mousedown="onListResizeHandleDown" />
    </div>

    <ConfirmDialog
      v-model:visible="logoutConfirmVisible"
      variant="im"
      :content="t('退出后将无法收到新的消息，确认退出？')"
      @confirm="confirmLogout"
    />
  </div>
</template>

<style lang="scss" scoped>
.home-sidebar {
  display: flex;
  flex-shrink: 0;
  height: 100%;

  &.titlebar-nav {
    .nav-bar {
      height: calc(100% + 32px);
      margin-top: -32px;
    }
  }
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

// Chat list panel（与 im .comList 一致）
.list-area {
  position: relative;
  min-width: 261px;
  border-right: 1px solid #eee;
  background-color: rgb(252, 252, 252);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.list-resize-handle {
  position: absolute;
  right: -5px;
  top: 0;
  bottom: 0;
  width: 6px;
  z-index: 10;
  cursor: ew-resize;
}

.sidebar-search {
  display: flex;
  align-items: center;
  padding: 10px 10px 10px 16px;
  gap: 8px;

  &.archive-chats-mode {
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    padding: 7px 10px 10px 16px;
  }

  .archive-title {
    text-align: center;
    padding: 10px 0;
    font-size: 14px;
    color: #333;
    font-weight: normal;
    line-height: 1.2;
  }

  .search-line-archive {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 0;
  }

  .archive-back {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 30px;
    flex-shrink: 0;
    opacity: 0.8;
    cursor: pointer;
    user-select: none;

    &:hover {
      opacity: 1;
    }
  }

  .archive-back-icon {
    width: 14px;
    height: 12px;
    object-fit: contain;
    display: block;
  }

  &.has-back {
    padding-left: 10px;
  }

  .icon-back {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    cursor: pointer;
    display: block;

    &:hover {
      opacity: 0.8;
    }
  }
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
