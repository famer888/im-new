import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { QuoteMessageInfo } from './useMessageStore'

export type SidebarTab = 'chats' | 'contacts' | 'transfer'
export type RightPanelType = 'none' | 'friend-info' | 'group-info' | 'channel-info' | 'group-members' | 'group-notice' | 'group-manage' | 'channel-notice' | 'channel-manage'
export type DetailViewType = 'none' | 'chat' | 'friend-detail' | 'group-detail' | 'channel-detail' | 'add-contact' | 'friend-examine' | 'group-invitation' | 'channel-notice-list'

export const useUIStore = defineStore('ui', () => {
  const sidebarTab = ref<SidebarTab>('chats')
  const rightPanel = ref<RightPanelType>('none')
  const detailView = ref<DetailViewType>('none')

  // Dialog visibility states
  const settingsVisible = ref(false)
  const searchVisible = ref(false)
  const addContactVisible = ref(false)
  const forwardDialogVisible = ref(false)
  const forwardMessageId = ref<string | null>(null)
  const accountDialogVisible = ref(false)
  const fileImportVisible = ref(false)
  const createGroupVisible = ref(false)
  const groupQRCodeVisible = ref(false)
  const groupQRCodeTarget = ref({ id: '', name: '' })
  const inviteFriendVisible = ref(false)
  const inviteFriendGroupId = ref('')
  const upVersionVisible = ref(false)
  const upVersionInfo = ref<{ version: string; title?: string; content?: string; url: string; flag?: number }>({
    version: '', url: '',
  })

  // Context menu
  const contextMenuVisible = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const contextMenuData = ref<Record<string, unknown>>({})

  // Quote reply
  const quoteMessage = ref<QuoteMessageInfo | null>(null)

  // Multi-select mode
  const selectionMode = ref(false)
  const selectedMessageIds = ref<Set<string>>(new Set())

  function setSidebarTab(tab: SidebarTab) {
    sidebarTab.value = tab
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
    forwardDialogVisible.value = true
  }

  function closeForwardDialog() {
    forwardDialogVisible.value = false
    forwardMessageId.value = null
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

  function openUpVersion(info: typeof upVersionInfo.value) {
    upVersionInfo.value = info
    upVersionVisible.value = true
  }
  function closeUpVersion() { upVersionVisible.value = false }

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

  function enterSelectionMode(initialMessageId?: string) {
    selectionMode.value = true
    selectedMessageIds.value = new Set(initialMessageId ? [initialMessageId] : [])
  }

  function exitSelectionMode() {
    selectionMode.value = false
    selectedMessageIds.value = new Set()
  }

  function toggleMessageSelection(messageId: string) {
    const s = new Set(selectedMessageIds.value)
    if (s.has(messageId)) {
      s.delete(messageId)
    } else {
      s.add(messageId)
    }
    selectedMessageIds.value = s
  }

  return {
    sidebarTab,
    rightPanel,
    detailView,
    settingsVisible,
    searchVisible,
    addContactVisible,
    forwardDialogVisible,
    forwardMessageId,
    accountDialogVisible,
    fileImportVisible,
    createGroupVisible,
    groupQRCodeVisible,
    groupQRCodeTarget,
    inviteFriendVisible,
    inviteFriendGroupId,
    upVersionVisible,
    upVersionInfo,
    contextMenuVisible,
    contextMenuPosition,
    contextMenuData,
    setSidebarTab,
    setRightPanel,
    setDetailView,
    openSettings,
    closeSettings,
    openForwardDialog,
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
    openUpVersion,
    closeUpVersion,
    quoteMessage,
    selectionMode,
    selectedMessageIds,
    showContextMenu,
    hideContextMenu,
    setQuoteMessage,
    clearQuoteMessage,
    enterSelectionMode,
    exitSelectionMode,
    toggleMessageSelection,
  }
})
