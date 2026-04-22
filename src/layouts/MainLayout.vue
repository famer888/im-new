<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import {
  GROUP_NOTIFICATION_TARGET_ID,
  useChatStore,
  isFileHelperTargetId,
  type Conversation,
} from '@/stores/useChatStore'
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
import GroupInvitation from '@/modules/groups/views/GroupInvitation.vue'

import SettingsDialog from '@/modules/settings/views/SettingsDialog.vue'
import AddContactDialog from '@/modules/contacts/components/AddContactDialog.vue'
import ForwardSelectDialog from '@/modules/chat/components/ForwardSelectDialog.vue'
import ForwardConfirmDialog from '@/modules/chat/components/ForwardConfirmDialog.vue'
import FileImport from '@/modules/auth/components/FileImport.vue'
import CreateGroupDialog from '@/modules/groups/components/CreateGroupDialog.vue'
import InviteFriendDialog from '@/modules/groups/components/InviteFriendDialog.vue'
import GroupQRCode from '@/modules/chat/components/panels/GroupQRCode.vue'
import UpVersionDialog from '@/components/UpVersionDialog.vue'
import MemberInfoDialog from '@/components/MemberInfoDialog.vue'

import ContextMenu from '@/components/ContextMenu.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import InitLoadingScreen from '@/components/InitLoadingScreen.vue'
import type { MenuItem } from '@/components/ContextMenu.vue'
import { ConversationType, MessageType } from '@/types'
import { useMessageStore } from '@/stores/useMessageStore'
import { eventBus } from '@/utils/eventBus'
import { ensureFriendRelKey, ensureOwnKeyPair } from '@/utils/e2ee'

import { getGroupReqList } from '@/api/imBase'
import emptyBrandImg from '@/assets/images/login/dock.png'
import menuCopy from '@/assets/images/menu/menu-copy.svg'
import menuDelete from '@/assets/images/menu/menu-delete.svg'
import menuSelect from '@/assets/images/menu/menu-select.svg'
import menuReply from '@/assets/images/menu/menu-reply.svg'
import menuForward from '@/assets/images/menu/menu-forward.svg'

const authStore = useAuthStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()
const settingStore = useSettingStore()
const router = useRouter()
const { locale: appLocale, t } = useI18n()
const uiStore = useUIStore()
const networkStore = useNetworkStore()
const messageStore = useMessageStore()
const forwardConfirmVisible = ref(false)
const forwardTargetConvId = ref('')
const forwardConfirmPayload = ref<{ msgType: number; content: string; extra?: Record<string, unknown> } | null>(null)

const isInitialized = ref(false)
const initText = ref('')
const initResetConfirmVisible = ref(false)
const resettingInitData = ref(false)
const initReloadVisible = ref(false)
let initReloadTimer: number | null = null

function setInitText(text: string) {
  initText.value = text
}

function startInitReloadTimer() {
  clearInitReloadTimer()
  initReloadVisible.value = false

  // 对齐老 im 初始化页：若初始化长时间卡住，显式给用户一个“重新加载”的兜底操作。
  initReloadTimer = window.setTimeout(() => {
    if (!isInitialized.value) {
      initReloadVisible.value = true
    }
  }, 15000)
}

function clearInitReloadTimer() {
  if (initReloadTimer === null) return
  window.clearTimeout(initReloadTimer)
  initReloadTimer = null
}

function reloadInitPage() {
  window.location.reload()
}

function isConversationInCurrentRelations(conv: Conversation): boolean {
  if (isFileHelperTargetId(conv.targetId)) return true
  if (conv.targetId === GROUP_NOTIFICATION_TARGET_ID) return true
  if (conv.type === ConversationType.Friend) return Boolean(contactStore.getContact(conv.targetId))
  if (conv.type === ConversationType.Group) return Boolean(groupStore.getGroup(conv.targetId))
  if (conv.type === ConversationType.Channel) return Boolean(channelStore.getChannel(conv.targetId))
  return false
}

function pruneUnknownConversations() {
  const validConversations = chatStore.conversations.filter(isConversationInCurrentRelations)
  if (validConversations.length === chatStore.conversations.length) return

  chatStore.conversations = validConversations
  if (
    chatStore.currentConversationId
    && !validConversations.some((conv) => conv.id === chatStore.currentConversationId)
  ) {
    chatStore.currentConversationId = null
    uiStore.setDetailView('none')
    uiStore.setRightPanel('none')
  }
}

onMounted(async () => {
  startInitReloadTimer()

  try {
    setInitText(t('加载中'))
    await authStore.initSession()
    if (!authStore.uid) {
      isInitialized.value = true
      clearInitReloadTimer()
      await router.replace('/login')
      return
    }

    if (authStore.uid) {
      setInitText(t('数据载入'))
      await Promise.all([
        chatStore.loadConversations(authStore.uid),
        contactStore.loadContacts(authStore.uid),
        groupStore.loadGroups(authStore.uid),
        channelStore.loadChannels(authStore.uid),
        settingStore.loadSettings(),
      ])
      setInitText(t('数据已载入'))
      appLocale.value = settingStore.settings.language
      pruneUnknownConversations()

      // Bootstrap: if no real conversations exist, seed from contacts/groups
      // (mirrors old im project's behavior of building the chat list from synced data)
      const hasRealConversations = chatStore.conversations.some(
        (c) => !isFileHelperTargetId(c.targetId) && c.targetId !== GROUP_NOTIFICATION_TARGET_ID,
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
          const uid = String(authStore.uid || '').trim()
          if (uid) {
            try {
              setInitText(t('加密检测'))

              // 对齐老 im：先保证自身私钥与联系人 relKey 已就绪，再连 WS，避免首批私聊下行解密失败。
              await ensureOwnKeyPair(uid)
              for (const contact of contactStore.contacts) {
                if (!contact.id || contact.status <= 0) continue
                try {
                  await ensureFriendRelKey(uid, contact.id)
                } catch {
                  // ignore single-contact key prewarm failure
                }
              }
            } catch {
              // key prewarm best effort; do not block WS connect forever
            }
          }
          const wsUrl = authStore.wsConnectConfig?.wsUrl?.trim() || ''
          const aesKey = authStore.wsConnectConfig?.aesKey?.trim() || ''
          const sessionId = String(authStore.session?.sessionId || '').trim()
          const installCode = ''
          if (wsUrl && aesKey) {
            await invoke('connect_ws', { url: wsUrl, aesKey, sessionId, installCode })
          } else {
            networkStore.setWsStatus('disconnected')
            console.warn('[ws] skipped connect: missing ws config')
          }
        }
      } catch (err) {
        networkStore.setWsStatus('disconnected')
        console.warn('[ws] connect failed:', err)
      }

      loadGroupNotificationPreview()
    }

    setInitText(t('完成'))
    chatStore.ensureFileHelperConversationInMemory()
    isInitialized.value = true
    clearInitReloadTimer()
  } catch (err) {
    initReloadVisible.value = true
    console.warn('[init] bootstrap failed:', err)
  }
})

onBeforeUnmount(() => {
  clearInitReloadTimer()
})

function openInitResetConfirm() {
  if (resettingInitData.value) return
  initResetConfirmVisible.value = true
}

async function confirmInitReset() {
  if (resettingInitData.value) return
  resettingInitData.value = true

  const currentUid = String(authStore.uid || localStorage.getItem('current-uid') || '').trim()
  const remainingAccounts = authStore.accounts.filter((item) => item.id !== currentUid)

  // 对齐老 im 初始化页：放弃当前账号本地数据后，移除该账号并重启到登录态。
  if ((window as any).__TAURI_INTERNALS__ && currentUid) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('repair_reset_user_local_data', { uid: currentUid })
      await invoke('disconnect_ws')
    } catch (err) {
      console.warn('[init] reset local data failed:', err)
    }
  }

  try {
    localStorage.clear()
  } catch {
    // ignore storage cleanup failure
  }
  if (remainingAccounts.length > 0) {
    localStorage.setItem('login-account-list', JSON.stringify(remainingAccounts))
  }

  chatStore.enablePersistence('')
  chatStore.currentConversationId = null
  chatStore.conversations = []
  messageStore.clearAllMessageCaches()
  contactStore.contacts = []
  contactStore.searchResults = []
  groupStore.groups = []
  groupStore.memberMap = new Map()
  channelStore.channels = []
  uiStore.setDetailView('none')
  uiStore.setRightPanel('none')
  uiStore.setSidebarTab('chats')

  authStore.accounts = remainingAccounts
  await authStore.logout()

  if ((window as any).__TAURI_INTERNALS__) {
    window.location.reload()
    return
  }

  resettingInitData.value = false
  await router.replace('/login')
}

async function loadGroupNotificationPreview() {
  try {
    const res = await getGroupReqList({ pageNum: 1, pageSize: 100 })
    const items = res?.groupReqs || []
    if (items.length > 0) {
      const latest = items[0]
      const pendingCount = items.filter((i: any) => !i.groupReqStatus).length
      chatStore.updateGroupNotificationConv(
        latest.msg
          || (latest.groupName
            ? t('群通知条目摘要', { name: String(latest.groupName) })
            : t('群通知')),
        Number(latest.updateTime || latest.createTime || 0),
        pendingCount,
      )
    } else {
      chatStore.removeGroupNotificationConversation()
    }
  } catch {
    /* silent */
  }
}

const currentTargetId = computed(() => chatStore.currentConversation?.targetId ?? '')

/** 传输助手会话仅在侧栏「传输」选中时显示聊天窗，防止通讯录/消息下误显 */
const showChatWindow = computed(() => {
  if (uiStore.detailView !== 'chat' || !chatStore.currentConversationId) return false
  const isFileHelper = isFileHelperTargetId(chatStore.currentConversation?.targetId)
  if (isFileHelper && uiStore.sidebarTab !== 'transfer') return false
  return true
})

const inviteExistingMemberIds = computed(() => {
  const members = groupStore.getMembers(uiStore.inviteFriendGroupId)
  return new Set(members.map(m => m.userId))
})

function messageSupportsCopy(msgType: unknown): boolean {
  const t = Number(msgType)
  return t === MessageType.Text || t === MessageType.Html2
}

const contextMenuVariant = computed(() =>
  uiStore.contextMenuData.type === 'message' ? 'im' : 'default',
)

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
    const conv = chatStore.currentConversation
    const convType = conv?.type ?? 0
    const isSelf = Boolean(data.isSelf)
    const items: MenuItem[] = []

    if (messageSupportsCopy(data.msgType)) {
      items.push({ key: 'copy', label: '复制', iconSrc: menuCopy })
    }

    if (isSelf) {
      const everyoneLabel =
        convType === 0 ? '为双方删除' : '为所有人删除'
      items.push({
        key: 'delete_everyone',
        label: everyoneLabel,
        iconSrc: menuDelete,
      })
    }

    items.push(
      { key: 'delete_local', label: '从本地删除', iconSrc: menuDelete },
      { key: 'select', label: '选中', iconSrc: menuSelect },
      { key: 'reply', label: '回复', iconSrc: menuReply },
      { key: 'forward', label: '转发', iconSrc: menuForward },
      { key: 'copy_msg_info', label: '复制消息信息', iconSrc: menuCopy },
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
    const convId = chatStore.currentConversationId
    switch (key) {
      case 'copy': {
        const text = data.content as string
        try { await navigator.clipboard.writeText(text) } catch { /* fallback */ }
        break
      }
      case 'delete_everyone':
        await chatStore.recallMessage(authStore.uid, msgId)
        if (convId) messageStore.deleteMessage(convId, msgId)
        break
      case 'delete_local':
        if (convId) messageStore.deleteMessage(convId, msgId)
        break
      case 'select':
        uiStore.enterSelectionMode({
          id: msgId,
          msgId: (data.msgId as string) || msgId,
          isSelf: Boolean(data.isSelf),
        })
        break
      case 'reply': {
        const senderName = data.isSelf
          ? '我'
          : contactStore.getDisplayName(data.senderId as string)
        uiStore.setQuoteMessage({
          id: msgId,
          senderId: data.senderId as string,
          senderName,
          msgType: data.msgType as number,
          content: data.content as string | null,
        })
        eventBus.emit('editor:focus')
        break
      }
      case 'forward':
        uiStore.openForwardDialog(msgId)
        break
      case 'copy_msg_info': {
        const info = JSON.stringify(
          {
            id: data.messageId,
            senderId: data.senderId,
            msgType: data.msgType,
            content: data.content,
          },
          null,
          2,
        )
        try { await navigator.clipboard.writeText(info) } catch { /* fallback */ }
        break
      }
    }
  }
}

async function handleForward(targetConvId: string) {
  if (!authStore.uid) return

  if (uiStore.forwardMessagePayload) {
    forwardConfirmPayload.value = uiStore.forwardMessagePayload
    forwardTargetConvId.value = targetConvId
    forwardConfirmVisible.value = true
    uiStore.closeForwardDialog()
    return
  }

  const msgId = uiStore.forwardMessageId
  if (!msgId) return

  const convId = chatStore.currentConversationId
  if (!convId) return

  const messages = messageStore.getMessages(convId)
  const selectedIds = uiStore.selectedMessageIds

  const msgsToForward = selectedIds.size > 0
    ? messages.filter(m => selectedIds.has(m.id))
    : messages.filter(m => m.id === msgId)

  for (const msg of msgsToForward) {
    await messageStore.sendMessage(
      authStore.uid,
      targetConvId,
      msg.msgType,
      msg.content ?? '',
    )
  }

  uiStore.exitSelectionMode()
  uiStore.closeForwardDialog()

  chatStore.setCurrentConversation(targetConvId)
  uiStore.setDetailView('chat')
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function handleForwardConfirmSubmit(data: { text: string; files: File[] }) {
  if (!authStore.uid || !forwardTargetConvId.value) return
  const targetConvId = forwardTargetConvId.value

  // 群二维码主图先发
  if (forwardConfirmPayload.value) {
    await messageStore.sendMessage(
      authStore.uid,
      targetConvId,
      forwardConfirmPayload.value.msgType,
      forwardConfirmPayload.value.content,
      forwardConfirmPayload.value.extra,
    )
  }

  // 附加文件（与旧版文件弹窗体验保持一致）
  for (const file of data.files) {
    if (file.type.startsWith('image/')) {
      const dataUrl = await fileToDataURL(file)
      await messageStore.sendMessage(
        authStore.uid,
        targetConvId,
        MessageType.Image,
        JSON.stringify({
          name: file.name,
          url: dataUrl,
          thumbnailUrl: dataUrl,
        }),
      )
    } else {
      await messageStore.sendMessage(
        authStore.uid,
        targetConvId,
        MessageType.File,
        JSON.stringify({
          name: file.name,
          size: file.size,
          ext: file.name.split('.').pop() || '',
        }),
      )
    }
  }

  if (data.text) {
    await messageStore.sendMessage(authStore.uid, targetConvId, MessageType.Text, data.text)
  }

  forwardConfirmVisible.value = false
  forwardTargetConvId.value = ''
  forwardConfirmPayload.value = null
  uiStore.closeForwardDialog()
  chatStore.setCurrentConversation(targetConvId)
  uiStore.setDetailView('chat')
}

function handleForwardConfirmCancel() {
  forwardConfirmVisible.value = false
  forwardTargetConvId.value = ''
  forwardConfirmPayload.value = null
  uiStore.closeForwardDialog()
}

</script>

<template>
  <div class="main-layout" @contextmenu.prevent>
    <InitLoadingScreen
      :visible="!isInitialized"
      :text="initText"
      :resetting="resettingInitData"
      :offline="!networkStore.isOnline"
      :show-reload="initReloadVisible"
      @reset="openInitResetConfirm"
      @reload="reloadInitPage"
    />

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
        <template v-else-if="uiStore.detailView === 'group-invitation'">
          <GroupInvitation />
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
      @forward="handleForward"
    />
    <ForwardConfirmDialog
      :visible="forwardConfirmVisible"
      :payload="forwardConfirmPayload"
      @confirm="handleForwardConfirmSubmit"
      @cancel="handleForwardConfirmCancel"
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

    <MemberInfoDialog />

    <ContextMenu
      v-model:visible="uiStore.contextMenuVisible"
      :x="uiStore.contextMenuPosition.x"
      :y="uiStore.contextMenuPosition.y"
      :variant="contextMenuVariant"
      :items="contextMenuItems"
      @select="handleContextMenuSelect"
    />

    <ConfirmDialog
      v-model:visible="initResetConfirmVisible"
      variant="im"
      :content="$t('确认退出，并重置缓存数据？')"
      @confirm="confirmInitReset"
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
