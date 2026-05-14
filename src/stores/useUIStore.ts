import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { QuoteMessageInfo } from './useMessageStore'

export type SidebarTab = 'chats' | 'contacts' | 'transfer'
export type RightPanelType = 'none' | 'friend-info' | 'group-info' | 'channel-info' | 'group-members' | 'group-notice' | 'group-manage' | 'channel-notice' | 'channel-manage'
export type DetailViewType = 'none' | 'chat' | 'friend-detail' | 'group-detail' | 'channel-detail' | 'add-contact' | 'add-group' | 'friend-examine' | 'group-invitation' | 'channel-notice-list'

export interface ForwardDraftItem {
  msgType: number
  content: string
  extra?: Record<string, unknown>
  senderName: string
  previewSrc?: string
}

export interface AddContactTarget {
  uid: string
  nickname: string
  avatar: string
  addToken: string
  isFriend: boolean
}

export interface AddGroupTarget {
  id: string
  name: string
  avatar: string
  memberCount: number
  groupAliasName: string
  ownerId: string | null
  addToken: string
  bfJoinCheck: boolean
  joinSource?: 'alias' | 'link'
}

export interface AddChannelTarget {
  id: string
  channelId: string
  name: string
  channelName: string
  avatar: string
  icon: string
  logoColor?: string | null
  memberCount: number
  remark: string
  link: string
  linkType: number | null
  memberType: number | null
}

export interface MemberInfoProfile {
  userId: string
  nickname: string
  avatar: string
  remark?: string | null
  depict?: string | null
  addToken?: string
  isFriend?: boolean
}

export const useUIStore = defineStore('ui', () => {
  const sidebarTab = ref<SidebarTab>('chats')
  /** 消息列表「归档会话」内页（对齐旧 im archiveListShow + com/search.vue 布局） */
  const chatArchiveListShow = ref(false)
  const rightPanel = ref<RightPanelType>('none')
  const detailView = ref<DetailViewType>('none')

  // Dialog visibility states
  const settingsVisible = ref(false)
  const searchVisible = ref(false)
  const addContactVisible = ref(false)
  const forwardDialogVisible = ref(false)
  const forwardMessageId = ref<string | null>(null)
  const forwardMessagePayload = ref<{ msgType: number; content: string; extra?: Record<string, unknown> } | null>(null)
  const accountDialogVisible = ref(false)
  const fileImportVisible = ref(false)
  const createGroupVisible = ref(false)
  const groupQRCodeVisible = ref(false)
  const groupQRCodeTarget = ref({ id: '', name: '' })
  const inviteFriendVisible = ref(false)
  const inviteFriendGroupId = ref('')
  const postUploadVisible = ref(false)
  const upVersionVisible = ref(false)
  const upVersionInfo = ref<{ version: string; title?: string; content?: string; url: string; flag?: number }>({
    version: '', url: '',
  })

  const memberInfoVisible = ref(false)
  const memberInfoTarget = ref<{
    userId: string
    groupId: string
    candidateIds: string[]
    profile?: MemberInfoProfile | null
  }>({
    userId: '',
    groupId: '',
    candidateIds: [],
    profile: null,
  })
  const addContactTarget = ref<AddContactTarget | null>(null)
  const addGroupTarget = ref<AddGroupTarget | null>(null)
  const addGroupDialogVisible = ref(false)
  const addChannelTarget = ref<AddChannelTarget | null>(null)
  const addChannelDialogVisible = ref(false)

  // Context menu
  const contextMenuVisible = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const contextMenuData = ref<Record<string, unknown>>({})

  // Quote reply
  const quoteMessage = ref<QuoteMessageInfo | null>(null)
  const forwardDraftItems = ref<ForwardDraftItem[]>([])
  const forwardDraftTargetId = ref('')

  // Multi-select mode
  const selectionMode = ref(false)
  const selectedMessageIds = ref<Set<string>>(new Set())
  const selectedMessageItems = ref<Array<{ id: string; msgId: string; isSelf: boolean }>>([])

  function setSidebarTab(tab: SidebarTab) {
    sidebarTab.value = tab
    if (tab !== 'chats') {
      chatArchiveListShow.value = false
    }
  }

  function setChatArchiveListShow(show: boolean) {
    chatArchiveListShow.value = show
  }

  function setRightPanel(panel: RightPanelType) {
    rightPanel.value = panel
  }

  function setDetailView(view: DetailViewType) {
    detailView.value = view
    // 右侧聊天面板仅属于聊天窗口，切到其他详情页时强制关闭
    if (view !== 'chat' && rightPanel.value !== 'none') {
      rightPanel.value = 'none'
    }
  }

  function openSettings() { settingsVisible.value = true }
  function closeSettings() { settingsVisible.value = false }

  function openForwardDialog(messageId: string) {
    forwardMessageId.value = messageId
    forwardMessagePayload.value = null
    forwardDialogVisible.value = true
  }

  function openForwardDialogWithPayload(payload: { msgType: number; content: string; extra?: Record<string, unknown> }) {
    forwardMessageId.value = null
    forwardMessagePayload.value = payload
    forwardDialogVisible.value = true
  }

  function closeForwardDialog() {
    forwardDialogVisible.value = false
    forwardMessageId.value = null
    forwardMessagePayload.value = null
  }

  function openAccountDialog() { accountDialogVisible.value = true }
  function closeAccountDialog() { accountDialogVisible.value = false }

  function openFileImport() { fileImportVisible.value = true }
  function closeFileImport() { fileImportVisible.value = false }

  function openCreateGroup() { createGroupVisible.value = true }
  function closeCreateGroup() { createGroupVisible.value = false }

  function openGroupQRCode(id: string, name: string) {
    groupQRCodeTarget.value = { id, name }
    groupQRCodeVisible.value = true
  }
  function closeGroupQRCode() { groupQRCodeVisible.value = false }

  function openInviteFriend(groupId: string) {
    inviteFriendGroupId.value = groupId
    inviteFriendVisible.value = true
  }
  function closeInviteFriend() { inviteFriendVisible.value = false }

  function openPostUpload() { postUploadVisible.value = true }
  function closePostUpload() { postUploadVisible.value = false }

  function openUpVersion(info: typeof upVersionInfo.value) {
    upVersionInfo.value = info
    upVersionVisible.value = true
  }
  function closeUpVersion() { upVersionVisible.value = false }

  function openMemberInfo(
    userId: string,
    groupId?: string,
    candidateIds: string[] = [],
    profile?: MemberInfoProfile | null,
  ) {
    memberInfoTarget.value = { userId, groupId: groupId || '', candidateIds, profile: profile || null }
    memberInfoVisible.value = true
  }
  function closeMemberInfo() { memberInfoVisible.value = false }

  function setAddContactTarget(target: AddContactTarget | null) {
    addContactTarget.value = target
  }

  function setAddGroupTarget(target: AddGroupTarget | null) {
    addGroupTarget.value = target
  }

  function openAddGroupDialog() {
    addGroupDialogVisible.value = true
  }

  function closeAddGroupDialog() {
    addGroupDialogVisible.value = false
  }

  function setAddChannelTarget(target: AddChannelTarget | null) {
    addChannelTarget.value = target
  }

  function openAddChannelDialog() {
    addChannelDialogVisible.value = true
  }

  function closeAddChannelDialog() {
    addChannelDialogVisible.value = false
  }

  function showContextMenu(x: number, y: number, data: Record<string, unknown>) {
    contextMenuPosition.value = { x, y }
    contextMenuData.value = data
    contextMenuVisible.value = true
  }

  function hideContextMenu() {
    contextMenuVisible.value = false
  }

  function setQuoteMessage(msg: typeof quoteMessage.value) {
    quoteMessage.value = msg
  }

  function clearQuoteMessage() {
    quoteMessage.value = null
  }

  function setForwardDraft(targetId: string, items: ForwardDraftItem[]) {
    forwardDraftTargetId.value = targetId
    forwardDraftItems.value = items
  }

  function clearForwardDraft() {
    forwardDraftTargetId.value = ''
    forwardDraftItems.value = []
  }

  function enterSelectionMode(item?: { id: string; msgId: string; isSelf: boolean }) {
    selectionMode.value = true
    if (item) {
      selectedMessageIds.value = new Set([item.id])
      selectedMessageItems.value = [item]
    } else {
      selectedMessageIds.value = new Set()
      selectedMessageItems.value = []
    }
  }

  function exitSelectionMode() {
    selectionMode.value = false
    selectedMessageIds.value = new Set()
    selectedMessageItems.value = []
  }

  function toggleMessageSelection(item: { id: string; msgId: string; isSelf: boolean }) {
    const s = new Set(selectedMessageIds.value)
    if (s.has(item.id)) {
      s.delete(item.id)
      selectedMessageItems.value = selectedMessageItems.value.filter(i => i.id !== item.id)
      if (s.size === 0) {
        exitSelectionMode()
        return
      }
    } else {
      s.add(item.id)
      selectedMessageItems.value = [...selectedMessageItems.value, item]
    }
    selectedMessageIds.value = s
  }

  return {
    sidebarTab,
    chatArchiveListShow,
    rightPanel,
    detailView,
    settingsVisible,
    searchVisible,
    addContactVisible,
    forwardDialogVisible,
    forwardMessageId,
    forwardMessagePayload,
    accountDialogVisible,
    fileImportVisible,
    createGroupVisible,
    groupQRCodeVisible,
    groupQRCodeTarget,
    inviteFriendVisible,
    inviteFriendGroupId,
    postUploadVisible,
    upVersionVisible,
    upVersionInfo,
    contextMenuVisible,
    contextMenuPosition,
    contextMenuData,
    setSidebarTab,
    setChatArchiveListShow,
    setRightPanel,
    setDetailView,
    openSettings,
    closeSettings,
    openForwardDialog,
    openForwardDialogWithPayload,
    closeForwardDialog,
    openAccountDialog,
    closeAccountDialog,
    openFileImport,
    closeFileImport,
    openCreateGroup,
    closeCreateGroup,
    openGroupQRCode,
    closeGroupQRCode,
    openInviteFriend,
    closeInviteFriend,
    openPostUpload,
    closePostUpload,
    openUpVersion,
    closeUpVersion,
    memberInfoVisible,
    memberInfoTarget,
    openMemberInfo,
    closeMemberInfo,
    addContactTarget,
    setAddContactTarget,
    addGroupTarget,
    setAddGroupTarget,
    addGroupDialogVisible,
    openAddGroupDialog,
    closeAddGroupDialog,
    addChannelTarget,
    setAddChannelTarget,
    addChannelDialogVisible,
    openAddChannelDialog,
    closeAddChannelDialog,
    quoteMessage,
    forwardDraftItems,
    forwardDraftTargetId,
    selectionMode,
    selectedMessageIds,
    selectedMessageItems,
    showContextMenu,
    hideContextMenu,
    setQuoteMessage,
    clearQuoteMessage,
    setForwardDraft,
    clearForwardDraft,
    enterSelectionMode,
    exitSelectionMode,
    toggleMessageSelection,
  }
})
