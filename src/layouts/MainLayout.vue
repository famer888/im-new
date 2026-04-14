<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore, FILE_HELPER_TARGET_ID } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { useUIStore } from '@/stores/useUIStore'
import { useNetworkStore } from '@/stores/useNetworkStore'

import HomeTop from '@/modules/chat/components/HomeTop.vue'
import HomeSidebar from '@/modules/chat/components/HomeSidebar.vue'
import ChatWindow from '@/modules/chat/views/ChatWindow.vue'
import FriendDetail from '@/modules/contacts/components/FriendDetail.vue'
import FriendExamine from '@/modules/contacts/components/FriendExamine.vue'
import GroupDetail from '@/modules/groups/views/GroupDetail.vue'
import ChannelDetail from '@/modules/channels/views/ChannelDetail.vue'
import RightPanel from '@/modules/chat/components/panels/RightPanel.vue'

import SettingsDialog from '@/modules/settings/views/SettingsDialog.vue'
import AddContactDialog from '@/modules/contacts/components/AddContactDialog.vue'
import ForwardSelectDialog from '@/modules/chat/components/ForwardSelectDialog.vue'
import FileImport from '@/modules/auth/components/FileImport.vue'
import CreateGroupDialog from '@/modules/groups/components/CreateGroupDialog.vue'
import InviteFriendDialog from '@/modules/groups/components/InviteFriendDialog.vue'
import GroupQRCode from '@/modules/chat/components/panels/GroupQRCode.vue'
import UpVersionDialog from '@/components/UpVersionDialog.vue'

import ContextMenu from '@/components/ContextMenu.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import type { MenuItem } from '@/components/ContextMenu.vue'

import emptyBrandImg from '@/assets/images/login/dock.png'

const authStore = useAuthStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()
const settingStore = useSettingStore()
const { locale: appLocale } = useI18n()
const uiStore = useUIStore()
const networkStore = useNetworkStore()

const isInitialized = ref(false)

onMounted(async () => {
  await authStore.initSession()
  if (authStore.uid) {
    await Promise.all([
      chatStore.loadConversations(authStore.uid),
      contactStore.loadContacts(authStore.uid),
      groupStore.loadGroups(authStore.uid),
      channelStore.loadChannels(authStore.uid),
      settingStore.loadSettings(),
    ])
    appLocale.value = settingStore.settings.language

    // Bootstrap: if no real conversations exist, seed from contacts/groups
    // (mirrors old im project's behavior of building the chat list from synced data)
    const hasRealConversations = chatStore.conversations.some(
      (c) => c.targetId !== FILE_HELPER_TARGET_ID,
    )
    if (!hasRealConversations) {
      for (const contact of contactStore.contacts) {
        if (contact.id && contact.status > 0) {
          chatStore.ensureConversation(0, contact.id)
        }
      }
      for (const group of groupStore.groups) {
        if (group.id) {
          chatStore.ensureConversation(1, group.id)
        }
      }
      for (const channel of channelStore.channels) {
        if (channel.id) {
          chatStore.ensureConversation(2, channel.id)
        }
      }
    }

    try {
      if ((window as any).__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('connect_ws', { url: '', aesKey: '' })
      }
    } catch { /* WS not available in browser */ }
  }
  chatStore.ensureFileHelperConversationInMemory()
  isInitialized.value = true
})

const currentTargetId = computed(() => chatStore.currentConversation?.targetId ?? '')

/** 传输助手会话仅在侧栏「传输」选中时显示聊天窗，防止通讯录/消息下误显 */
const showChatWindow = computed(() => {
  if (uiStore.detailView !== 'chat' || !chatStore.currentConversationId) return false
  const isFileHelper =
    chatStore.currentConversation?.targetId === FILE_HELPER_TARGET_ID
  if (isFileHelper && uiStore.sidebarTab !== 'transfer') return false
  return true
})

const inviteExistingMemberIds = computed(() => {
  const members = groupStore.getMembers(uiStore.inviteFriendGroupId)
  return new Set(members.map(m => m.userId))
})

const contextMenuItems = computed((): MenuItem[] => {
  const data = uiStore.contextMenuData
  if (data.type === 'conversation') {
    return [
      { key: 'pin', label: data.isPinned ? '取消置顶' : '置顶', icon: '📌' },
      { key: 'mute', label: data.isMuted ? '取消免打扰' : '消息免打扰', icon: '🔇' },
      { key: 'archive', label: data.isArchived ? '取消归档' : '归档', icon: '📦' },
      { key: 'divider', label: '', divider: true },
      { key: 'read', label: '标记已读', icon: '✓' },
      { key: 'delete', label: '删除聊天', icon: '🗑', danger: true },
    ]
  }
  if (data.type === 'message') {
    const items: MenuItem[] = [
      { key: 'copy', label: '复制', icon: '📋' },
      { key: 'quote', label: '引用', icon: '↩' },
      { key: 'forward', label: '转发', icon: '↗' },
    ]
    if (data.isSelf) {
      items.push({ key: 'recall', label: '撤回', icon: '↺' })
    }
    items.push(
      { key: 'divider', label: '', divider: true },
      { key: 'delete', label: '删除', icon: '🗑', danger: true },
    )
    return items
  }
  return []
})

async function handleContextMenuSelect(key: string) {
  const data = uiStore.contextMenuData
  if (data.type === 'conversation') {
    const convId = data.conversationId as string
    switch (key) {
      case 'pin':
        await chatStore.pinConversation(authStore.uid, convId, !data.isPinned)
        break
      case 'mute':
        await chatStore.muteConversation(authStore.uid, convId, !data.isMuted)
        break
      case 'read':
        await chatStore.markAsRead(authStore.uid, convId)
        break
      case 'archive':
        await chatStore.archiveConversation(authStore.uid, convId, !data.isArchived)
        break
      case 'delete':
        await chatStore.deleteConversation(authStore.uid, convId)
        break
    }
  }
  if (data.type === 'message') {
    const msgId = data.messageId as string
    switch (key) {
      case 'copy': {
        const text = data.content as string
        try { await navigator.clipboard.writeText(text) } catch { /* fallback */ }
        break
      }
      case 'forward':
        uiStore.openForwardDialog(msgId)
        break
      case 'recall':
        await chatStore.recallMessage(authStore.uid, msgId)
        break
    }
  }
}
</script>

<template>
  <div class="main-layout">
    <LoadingOverlay :visible="!isInitialized" :text="$t('正在加载...')" />

    <HomeTop />

    <div class="main-content">
      <HomeSidebar />

      <div class="content-area">
        <template v-if="showChatWindow">
          <ChatWindow />
        </template>
        <template v-else-if="uiStore.detailView === 'friend-detail'">
          <FriendDetail :contact-id="currentTargetId" />
        </template>
        <template v-else-if="uiStore.detailView === 'group-detail'">
          <GroupDetail :group-id="currentTargetId" />
        </template>
        <template v-else-if="uiStore.detailView === 'channel-detail'">
          <ChannelDetail :channel-id="currentTargetId" />
        </template>
        <template v-else-if="uiStore.detailView === 'friend-examine'">
          <FriendExamine />
        </template>
        <template v-else>
          <div class="default-content">
            <div class="empty-state">
              <img :src="emptyBrandImg" alt="" class="empty-brand-icon" />
            </div>
          </div>
        </template>

        <RightPanel />
      </div>
    </div>

    <!-- Network status bar -->
    <Transition name="slide-down">
      <div v-if="networkStore.isReconnecting" class="network-bar reconnecting">
        {{ $t('网络连接中...') }}
      </div>
      <div v-else-if="!networkStore.isOnline" class="network-bar offline">
        {{ $t('网络已断开') }}
      </div>
    </Transition>

    <!-- Global dialogs -->
    <SettingsDialog v-model:visible="uiStore.settingsVisible" />
    <AddContactDialog v-model:visible="uiStore.addContactVisible" />
    <ForwardSelectDialog
      v-model:visible="uiStore.forwardDialogVisible"
      :message-id="uiStore.forwardMessageId"
    />
    <FileImport
      :visible="uiStore.fileImportVisible"
      @close="uiStore.closeFileImport()"
    />
    <CreateGroupDialog
      :visible="uiStore.createGroupVisible"
      @close="uiStore.closeCreateGroup()"
    />
    <InviteFriendDialog
      :visible="uiStore.inviteFriendVisible"
      :group-id="uiStore.inviteFriendGroupId"
      :existing-member-ids="inviteExistingMemberIds"
      @close="uiStore.closeInviteFriend()"
    />
    <GroupQRCode
      :visible="uiStore.groupQRCodeVisible"
      :group-id="uiStore.groupQRCodeTarget.id"
      :group-name="uiStore.groupQRCodeTarget.name"
      @close="uiStore.closeGroupQRCode()"
    />
    <UpVersionDialog
      :visible="uiStore.upVersionVisible"
      :info="uiStore.upVersionInfo"
      @close="uiStore.closeUpVersion()"
    />

    <ContextMenu
      v-model:visible="uiStore.contextMenuVisible"
      :x="uiStore.contextMenuPosition.x"
      :y="uiStore.contextMenuPosition.y"
      :items="contextMenuItems"
      @select="handleContextMenuSelect"
    />
  </div>
</template>

<style lang="scss" scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #fff;
  position: relative;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  padding-top: 32px;
}

.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.default-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-brand-icon {
  width: 160px;
  height: auto;
  display: block;
  border-radius: 8px;
}

.network-bar {
  position: absolute;
  top: 32px;
  left: 0;
  right: 0;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  z-index: 100;

  &.reconnecting { background: #f6f6f6; color: #e6a23c; }
  &.offline { background: #fddcde; color: #f44e5a; }
}

.slide-down-enter-active, .slide-down-leave-active { transition: all 0.3s; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-100%); }
</style>
