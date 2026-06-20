<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { GROUP_NOTIFICATION_TARGET_ID, useChatStore } from '@/stores/useChatStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useGroupStore, type GroupMember } from '@/stores/useGroupStore'
import { useUIStore } from '@/stores/useUIStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useI18n } from 'vue-i18n'
import { getGroupDetail, groupUpdate, disableGroup, groupExit, groupMember, groupRemoveAdmin } from '@/api/imBase'
import AppSwitch from '@/components/AppSwitch.vue'
import RadioSelectDialog from '@/components/RadioSelectDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Toast from '@/components/Toast.vue'
import TextAvatar from '@/components/TextAvatar.vue'
import GroupQRCode from './GroupQRCode.vue'
import GroupNoticeDialog from './GroupNoticeDialog.vue'
import GroupNoticeContent from './GroupNoticeContent.vue'
import InviteFriendDialog from '@/modules/groups/components/InviteFriendDialog.vue'
import RemoveMemberDialog from '@/modules/groups/components/RemoveMemberDialog.vue'
import { writeClipboardText } from '@/utils/clipboard'
import { eventBus } from '@/utils/eventBus'
import searchIcon from '@/assets/images/headNav/search-icon.png'
import searchCloseIcon from '@/assets/images/headNav/search-close-icon.png'
const chatStore = useChatStore()
const authStore = useAuthStore()
const groupStore = useGroupStore()
const uiStore = useUIStore()
const messageStore = useMessageStore()
const { t } = useI18n()

const conv = computed(() => chatStore.currentConversation)
const group = computed(() => conv.value ? groupStore.getGroup(conv.value.targetId) : undefined)

const memberType = ref<number | null>(null)
const bfJoinCheck = ref(false)
const bfResetQrcode = ref(false)
const groupAliasName = ref('')
const groupAliasDetailResolved = ref(false)
const groupAliasDetailFailed = ref(false)
const notice = ref('')
const inviteShortLink = ref('')
const clearMsgTypeList = ref<string[]>([])
const groupAliasDisplayText = computed(() => {
  const alias = groupAliasName.value.trim()
  if (alias) return `@${alias}`
  // 群详情没返回前才显示 loading；返回空别名是明确空态，不能一直停在“加载中”。
  if (groupAliasDetailFailed.value) return t('数据获取失败')
  return groupAliasDetailResolved.value ? t('暂无数据') : t('加载中')
})
const hasGroupAlias = computed(() => Boolean(groupAliasName.value.trim()))

const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const refreshingMembers = ref(false)

const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmContent = ref('')
const confirmAction = ref<(() => void) | null>(null)
const invitePromptVisible = ref(false)
const invitePromptTitle = ref('')
const invitePromptContent = ref('')
const invitePromptMembers = ref<string[]>([])
const invitePromptSubmitting = ref(false)
const pendingInviteIds = ref(new Set<string>())

function inviteMemberRefreshDebug(message: string, data?: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'warn') {
  void message
  void data
  void level
}

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

function showConfirm(title: string, content: string, action: () => void) {
  confirmTitle.value = title
  confirmContent.value = content
  confirmAction.value = action
  confirmVisible.value = true
}

function showInvitePrompt(content: string, options?: { title?: string; members?: string[] }) {
  invitePromptTitle.value = options?.title || t('邀请成功')
  invitePromptContent.value = content
  invitePromptMembers.value = options?.members || []
  invitePromptVisible.value = true
}

function closeInvitePrompt() {
  if (invitePromptSubmitting.value) return
  invitePromptVisible.value = false
  invitePromptMembers.value = []
  invitePromptContent.value = ''
  invitePromptTitle.value = ''
}

function normalizeInviteIds(ids?: Array<number | string> | string[]) {
  return (ids || []).map((id) => String(id)).filter(Boolean)
}

function mergePendingInviteIds(ids?: Array<number | string> | string[]) {
  const normalized = normalizeInviteIds(ids)
  if (!normalized.length) return
  pendingInviteIds.value = new Set([
    ...Array.from(pendingInviteIds.value),
    ...normalized,
  ])
}

function replacePendingInviteIds(ids: string[]) {
  pendingInviteIds.value = new Set(normalizeInviteIds(ids))
}

function handleConfirm() {
  confirmAction.value?.()
  confirmVisible.value = false
}

const search = ref('')
const showAllMembers = ref(false)

const qrCodeVisible = ref(false)
const inviteVisible = ref(false)
const noticeVisible = ref(false)
const removeMemberVisible = ref(false)
const managerDialogVisible = ref(false)
const removingAdminId = ref('')

const existingMemberIds = computed(() => {
  return new Set(allMembers.value.map(m => m.userId))
})

function openQrCode() {
  qrCodeVisible.value = true
}

function openInvite() {
  inviteVisible.value = true
}

function openRemoveMember() {
  removeMemberVisible.value = true
}

async function handleInvited(payload?: { message?: string; type?: 'success' | 'error'; needCheckUids?: string[] }) {
  const needCheckUids = normalizeInviteIds(payload?.needCheckUids)
  mergePendingInviteIds(needCheckUids)
  const groupId = conv.value?.targetId || ''
  inviteMemberRefreshDebug('handleInvited received', {
    groupId,
    payload,
    authUid: authStore.uid,
    memberMapCountBefore: groupId ? groupStore.getMembers(groupId).length : null,
    groupMemberCountBefore: groupId ? groupStore.getGroup(groupId)?.memberCount ?? null : null,
  })

  if (payload?.message) {
    if ((payload.type ?? 'success') === 'success' && needCheckUids.length > 0) {
      showInvitePrompt(payload.message)
    } else {
      showToast(payload.message, payload.type || 'success')
    }
  }

  // 邀请结果先反馈给用户，成员列表刷新放后台，避免弹窗被接口阻塞。
  if (conv.value?.targetId && authStore.uid) {
    groupStore.loadMembers(authStore.uid, conv.value.targetId, { forceRemote: true }).then((members) => {
      inviteMemberRefreshDebug('handleInvited remote refresh resolved', {
        groupId: conv.value?.targetId,
        returnedCount: members.length,
        memberMapCountAfter: conv.value?.targetId ? groupStore.getMembers(conv.value.targetId).length : null,
        groupMemberCountAfter: conv.value?.targetId ? groupStore.getGroup(conv.value.targetId)?.memberCount ?? null : null,
        returnedMemberIds: members.map((member) => member.userId).slice(0, 10),
      })
    }).catch((error) => {
      inviteMemberRefreshDebug('handleInvited remote refresh failed', {
        groupId: conv.value?.targetId,
        error: error instanceof Error ? error.message : String(error),
      }, 'error')
      console.error('[GroupInfoPanel] refresh members after invite failed:', error)
    })
  }
}

function getResponseCode(res: any) {
  return Number(res?.commonResult?.errCode ?? res?.errCode ?? res?.code ?? 200)
}

function getResponseErrorMessage(res: any, fallback: string) {
  return res?.commonResult?.errMsg || res?.errorDesc || res?.errMsg || res?.msg || fallback
}

function handleInviteConfirmRequest(payload: { members: string[]; message: string }) {
  showInvitePrompt(payload.message, {
    title: t('邀请成功'),
    members: payload.members,
  })
}

async function handleInvitePromptConfirm() {
  if (!invitePromptMembers.value.length) {
    closeInvitePrompt()
    return
  }
  if (!conv.value?.targetId || invitePromptSubmitting.value) return

  const members = [...invitePromptMembers.value]
  invitePromptSubmitting.value = true
  try {
    const res = await groupMember({
      op: 0,
      groupId: conv.value.targetId,
      members,
    })
    const code = getResponseCode(res)
    if (code === 200) {
      const needCheckUids = Array.isArray((res as any)?.needCheckUids)
        ? ((res as any).needCheckUids as Array<number | string>)
        : []
      mergePendingInviteIds(needCheckUids)
      invitePromptSubmitting.value = false
      closeInvitePrompt()
      showToast(t('邀请成功'))
      if (authStore.uid) {
        groupStore.loadMembers(authStore.uid, conv.value.targetId, { forceRemote: true }).catch((error) => {
          console.error('[GroupInfoPanel] refresh members after invite failed:', error)
        })
      }
      return
    }
    showToast(getResponseErrorMessage(res, t('邀请失败')), 'error')
  } catch (error) {
    console.error('[GroupInfoPanel] confirmed invite failed:', error)
    showToast(t('邀请失败'), 'error')
  } finally {
    invitePromptSubmitting.value = false
  }
}

async function handleRemoved() {
  // 移除成功后刷新成员列表
  if (conv.value?.targetId && authStore.uid) {
    await groupStore.loadMembers(authStore.uid, conv.value.targetId, { forceRemote: true })
  }
}

async function refreshMembers() {
  if (!conv.value?.targetId || !authStore.uid || refreshingMembers.value) return
  refreshingMembers.value = true
  try {
    await groupStore.loadMembers(authStore.uid, conv.value.targetId, { forceRemote: true })
  } catch (e) {
    console.error('[GroupInfoPanel] refresh members failed:', e)
    showToast(t('操作失败'), 'error')
  } finally {
    refreshingMembers.value = false
  }
}

const allMembers = computed(() => {
  if (!conv.value) return []
  return groupStore.getMembers(conv.value.targetId)
})

function resolveCurrentMemberType(members: GroupMember[] = allMembers.value): number | null {
  const uid = String(authStore.uid ?? '').trim()
  if (!uid) return null
  const currentMember = members.find((member) => member.userId === uid)
  if (!currentMember) return null
  const role = Number(currentMember.role)
  return Number.isFinite(role) && role >= 0 ? role : null
}

const effectiveMemberType = computed(() => resolveCurrentMemberType() ?? memberType.value)
const previewMembers = computed(() => allMembers.value.slice(0, 20))

const members = computed(() => {
  const all = allMembers.value
  if (!search.value.trim()) return all
  const kw = search.value.toLowerCase()
  return all.filter((m) => m.nickname?.toLowerCase().includes(kw) || m.userId.includes(kw))
})

const totalCount = computed(() => group.value?.memberCount || groupStore.getMembers(conv.value?.targetId ?? '').length)

const isOwner = computed(() => effectiveMemberType.value === 0)
const groupOwner = computed(() => allMembers.value.find((member) => Number(member.role) === 0) ?? null)
const groupManagers = computed(() => allMembers.value.filter((member) => Number(member.role) === 1))

function openManagerDialog() {
  managerDialogVisible.value = true
}

function closeManagerDialog() {
  if (removingAdminId.value) return
  managerDialogVisible.value = false
}

async function removeManager(member: GroupMember) {
  if (!conv.value || !isOwner.value || removingAdminId.value) return
  removingAdminId.value = member.userId
  try {
    const resp = await groupRemoveAdmin({
      groupId: conv.value.targetId,
      adminUid: member.userId,
    })
    const code = getResponseCode(resp)
    if (code !== 200 && code !== 0) {
      showToast(getResponseErrorMessage(resp, t('操作失败')), 'error')
      return
    }

    showToast(t('移除成功'))
    const groupId = conv.value.targetId
    const nextMembers = groupStore.getMembers(groupId).map((item) =>
      item.userId === member.userId ? { ...item, role: 2 } : item,
    )
    // 移除管理员成功后立即同步本地角色，避免弹窗和右侧成员角标继续显示旧管理员身份。
    groupStore.setGroupMembers(groupId, nextMembers, { updateMemberCount: false })
  } catch (error) {
    console.error('[GroupInfoPanel] remove manager failed:', error)
    showToast(t('操作失败'), 'error')
  } finally {
    removingAdminId.value = ''
  }
}

function applyCachedPanelState(groupId: string) {
  const cachedGroup = groupStore.getGroup(groupId)
  memberType.value = resolveCurrentMemberType(groupStore.getMembers(groupId))
  groupAliasName.value = cachedGroup?.groupAliasName || ''
  groupAliasDetailResolved.value = false
  groupAliasDetailFailed.value = false
  notice.value = cachedGroup?.notice || ''
  inviteShortLink.value = ''
  bfResetQrcode.value = false
  bfJoinCheck.value = false
}

let panelLoadToken = 0

async function loadPanelData(groupId: string) {
  const token = ++panelLoadToken
  applyCachedPanelState(groupId)

  const membersTask = authStore.uid
    ? groupStore.loadMembers(authStore.uid, groupId).then((members) => {
      if (token !== panelLoadToken || conv.value?.targetId !== groupId) return
      const localMemberType = resolveCurrentMemberType(members)
      if (localMemberType !== null) {
        memberType.value = localMemberType
      }
    })
    : Promise.resolve()

  const detailTask = getGroupDetail({ groupId }).then((detail) => {
    if (token !== panelLoadToken || conv.value?.targetId !== groupId) return

    const groupBase = detail.group as any
    const remoteMemberType = Number(detail.memberType)
    if (Number.isFinite(remoteMemberType) && remoteMemberType >= 0) {
      memberType.value = remoteMemberType
    } else if (memberType.value === null) {
      memberType.value = 2
    }

    groupAliasName.value = groupBase?.groupAliasName || detail.groupNickName || ''
    groupAliasDetailResolved.value = true
    groupAliasDetailFailed.value = false
    notice.value = detail.groupNotice?.notice || ''
    inviteShortLink.value = String(groupBase?.shortLink || (detail as any)?.shortLink || '').trim()
    bfResetQrcode.value = Boolean(detail.bfResetQrcode)
    if (groupBase?.bfJoinCheck !== undefined) {
      bfJoinCheck.value = Boolean(groupBase.bfJoinCheck)
    }

    // 把已拿到的群资料回写到 store，下一次打开右侧面板可直接首屏命中缓存。
    groupStore.upsertGroup({
      id: groupId,
      name: groupBase?.name ?? groupBase?.groupName,
      avatar: groupBase?.pic ?? groupBase?.avatar ?? groupBase?.groupAvatar,
      ownerId: groupBase?.hostId ? String(groupBase.hostId) : undefined,
      memberCount: Number(groupBase?.memberCount ?? 0),
      groupAliasName: groupAliasName.value || null,
      notice: notice.value || null,
    })
  }).catch((e) => {
    if (token !== panelLoadToken || conv.value?.targetId !== groupId) return
    if (memberType.value === null) {
      memberType.value = 2
    }
    groupAliasDetailResolved.value = true
    groupAliasDetailFailed.value = true
    console.error('[GroupInfoPanel] getGroupDetail failed:', e)
  })

  await Promise.allSettled([membersTask, detailTask])
}

watch(
  () => conv.value?.targetId ?? '',
  (groupId) => {
    panelLoadToken += 1
    search.value = ''
    showAllMembers.value = false
    if (!groupId) {
      memberType.value = null
      groupAliasName.value = ''
      groupAliasDetailResolved.value = false
      groupAliasDetailFailed.value = false
      notice.value = ''
      inviteShortLink.value = ''
      bfResetQrcode.value = false
      bfJoinCheck.value = false
      return
    }

    // 对齐旧 im：切群后先用本地缓存立即出首屏，再后台补齐远端详情。
    void loadPanelData(groupId)
  },
  { immediate: true },
)

function copyText(text: string) {
  writeClipboardText(text.endsWith(' ') ? text : `${text} `).then(() => {
    showToast(t('复制成功'))
  }).catch(() => {})
}

function copyGroupAlias() {
  const alias = groupAliasName.value.trim()
  if (!alias) return
  copyText(`@${alias}`)
}

function openGroupNotice() {
  noticeVisible.value = true
}

function handleNoticePublished(payload: { groupId: string; notice: string }) {
  if (!conv.value || payload.groupId !== conv.value.targetId) return
  notice.value = payload.notice
  if (group.value) {
    group.value.notice = payload.notice
  }
}

async function togglePin() {
  if (!conv.value) return
  await chatStore.pinConversation(authStore.uid, conv.value.id, !conv.value.isPinned)
}

async function toggleMute() {
  if (!conv.value) return
  await chatStore.muteConversation(authStore.uid, conv.value.id, !conv.value.isMuted)
}

async function toggleJoinCheck() {
  if (!conv.value) return
  bfJoinCheck.value = !bfJoinCheck.value
  try {
    await groupUpdate({
      op: 6,
      groupParam: { groupId: conv.value.targetId, joinCheck: bfJoinCheck.value },
    })
  } catch (e) {
    bfJoinCheck.value = !bfJoinCheck.value
    console.error('[GroupInfoPanel] toggleJoinCheck failed:', e)
  }
}

function openClearDialog() {
  clearMsgTypeList.value = [
    t('仅清空本地聊天记录'),
    t('清空本地和所有成员设备的聊天记录'),
  ]
}

async function appendGroupDisbandNotification() {
  const currentConv = conv.value
  if (!currentConv || !authStore.uid) return

  const now = Date.now()
  const groupId = currentConv.targetId
  const groupName = group.value?.name || groupAliasName.value || groupId
  const groupAvatar = group.value?.avatar || null
  const conversationId = `1_${GROUP_NOTIFICATION_TARGET_ID}`
  const id = `group-disband-${groupId}-${now}`
  const content = t('该群聊已解散')
  const extra = {
    source: 'group-disband-local',
    groupId,
    groupName,
    groupAvatar,
    groupReqType: 13,
    groupReqStatus: 0,
    sendUid: String(authStore.uid),
    receiveUid: '',
    unReadNum: 0,
  }
  const message = {
    id,
    customMsgId: id,
    conversationId,
    senderId: String(authStore.uid),
    msgType: 8,
    content,
    sendTime: now,
    status: 1,
    readStatus: 0,
    version: 0,
    isDeleted: false,
    extra: JSON.stringify(extra),
  }

  messageStore.appendMessage(conversationId, message)
  chatStore.updateGroupNotificationConv(content, now, 0)
  eventBus.emit('group-invitation:update')

  if (!(window as any).__TAURI_INTERNALS__) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('upsert_incoming_messages', {
      uid: authStore.uid,
      messages: [{
        ...message,
        extra,
      }],
    })
  } catch (error) {
    console.warn('[GroupInfoPanel] persist disband notification failed:', error)
  }
}

async function handleClearSubmit(index: number) {
  if (index === -1 || !conv.value) {
    clearMsgTypeList.value = []
    return
  }
  const conversationId = conv.value.id
  const groupConversation = { ...conv.value }
  try {
    await messageStore.clearConversationHistory(conversationId, index === 1)
    // 清空群消息只清内容，不删除会话；补回并保持当前会话，避免列表过滤后右侧窗口被置空。
    chatStore.addOrUpdateConversation({
      ...groupConversation,
      lastMsgDigest: null,
      lastMsgId: null,
      unreadCount: 0,
    }, { preserveListOrder: true })
    chatStore.setCurrentConversation(conversationId)
    chatStore.updateConversation({
      id: conversationId,
      lastMsgDigest: null,
      lastMsgId: null,
      unreadCount: 0,
    })
  } catch (error) {
    console.error('[GroupInfoPanel] clear conversation failed:', error)
    showToast(t('操作失败'), 'error')
  } finally {
    clearMsgTypeList.value = []
  }
}

function handleDisbandGroup() {
  showConfirm(t('温馨提示'), t('解散群聊确认'), async () => {
    if (!conv.value) return
    try {
      const resp = await disableGroup({ groupId: conv.value.targetId })
      const code = (resp as any)?.commonResult?.errCode
      if (code === 200) {
        await appendGroupDisbandNotification()
        showToast(t('解散成功'))
        uiStore.setRightPanel('none')
        chatStore.deleteConversation(authStore.uid!, conv.value.id)
      } else {
        showToast((resp as any)?.errorDesc || t('操作失败'), 'error')
      }
    } catch (e) {
      console.error('[GroupInfoPanel] disband failed:', e)
      showToast(t('操作失败'), 'error')
    }
  })
}

function handleExitGroup() {
  showConfirm(t('退出群聊'), t('退出群聊确认'), async () => {
    if (!conv.value) return
    try {
      const resp = await groupExit({ groupId: conv.value.targetId })
      const code = (resp as any)?.commonResult?.errCode
      if (code === 200) {
        showToast(t('退出成功'))
        uiStore.setRightPanel('none')
        groupStore.removeGroup(conv.value.targetId)
        chatStore.deleteConversation(authStore.uid!, conv.value.id)
      } else {
        showToast((resp as any)?.errorDesc || t('操作失败'), 'error')
      }
    } catch (e) {
      console.error('[GroupInfoPanel] exit failed:', e)
      showToast(t('操作失败'), 'error')
    }
  })
}

function handleOnlineTime(member: any) {
  if (member.online) return t('在线')
  const dateNow = Date.now()
  const minute = 1000 * 60
  const hour = minute * 60
  const day = hour * 24
  const week = day * 7
  const month = day * 30
  if (!member.createTime) return t('近期不在线')
  const remainderTime = dateNow - member.createTime
  if (remainderTime < minute) return t('不久前在线')
  if (remainderTime < hour) return Math.floor(remainderTime / minute) + t('分钟前在线')
  if (remainderTime < day) return Math.floor(remainderTime / hour) + t('小时前在线')
  if (remainderTime < week) return Math.floor(remainderTime / day) + t('天前在线')
  if (remainderTime < month) return Math.floor(remainderTime / week) + t('周前在线')
  return t('近期不在线')
}
</script>

<template>
  <div class="group-info-panel" v-if="conv">
    <template v-if="!showAllMembers">
      <div class="group-info-scroll">
        <!-- 群别名 + 二维码 (同 im group-alias-qrcode.vue) -->
        <div class="group-alias-qrcode" @click="openQrCode">
          <h3>{{ t('群别名') }}</h3>
          <div class="alias-right">
            <span class="alias-name" :class="{ 'is-loading': !hasGroupAlias }" @click.stop="copyGroupAlias">
              {{ groupAliasDisplayText }}
            </span>
            <img class="code-icon" src="@/assets/images/chat/code.png" @click.stop="openQrCode" />
            <img class="arrow" src="@/assets/images/common/right-arrow-a.png" />
          </div>
        </div>

        <!-- 群简介 (同 im group-notice/index.vue) -->
        <div class="group-notice-section" @click="openGroupNotice">
          <div class="notice-head">
            <h3>{{ t('群简介') }}</h3>
            <img class="arrow" src="@/assets/images/common/right-arrow-a.png" />
          </div>
          <GroupNoticeContent
            class="notice-preview"
            :content="notice"
            :group-id="conv.targetId"
            compact
          />
        </div>

        <!-- 配置列表 (同 im config-list.vue) -->
        <ul class="config-list">
          <li>
            <span>{{ t('置顶聊天') }}</span>
            <AppSwitch :model-value="conv.isPinned" @update:model-value="togglePin" />
          </li>
          <li>
            <span>{{ t('消息免打扰') }}</span>
            <AppSwitch :model-value="conv.isMuted" @update:model-value="toggleMute" />
          </li>
          <li v-if="isOwner">
            <span>{{ t('进群需审核') }}</span>
            <AppSwitch :model-value="bfJoinCheck" @update:model-value="toggleJoinCheck" />
          </li>
          <li class="action-btn danger" @click="openClearDialog">
            {{ t('清空聊天记录') }}
          </li>
          <li v-if="isOwner" class="action-btn danger" @click="handleDisbandGroup">
            {{ t('解散群聊') }}
          </li>
          <li v-else-if="effectiveMemberType !== null" class="action-btn danger" @click="handleExitGroup">
            {{ t('删除并退出') }}
          </li>
        </ul>

        <!-- 管理员 (同 im index.vue 管理员 label) -->
        <ul v-if="effectiveMemberType !== null && effectiveMemberType !== 2" class="manager-label">
          <li @click="openManagerDialog">
            <span>{{ t('管理员') }}</span>
            <img class="icon-arrow" src="@/assets/images/common/right-arrow-a.png" alt="" />
          </li>
        </ul>

        <!-- 群成员 (同 im member-list.vue) -->
        <div class="member-section">
          <div class="member-head">
            <div class="member-info" @click="showAllMembers = true">
              <span class="member-title">{{ t('群成员列表标题', { count: totalCount }) }}</span>
              <img class="icon-arrow" src="@/assets/images/common/right-arrow-a.png" />
            </div>
            <img v-if="effectiveMemberType === 0 || effectiveMemberType === 1" class="icon-delete" src="@/assets/images/common/user-delete.png" @click="openRemoveMember" />
          </div>

          <ul class="member-list">
            <li v-for="member in previewMembers" :key="member.userId" class="member-item">
              <TextAvatar
                :name="member.nickname || member.userId"
                :src="member.avatar"
                :size="30"
                rounded
                style="cursor: pointer;"
                @click="uiStore.openMemberInfo(member.userId, conv?.targetId)"
              />
              <div class="member-detail" style="cursor: pointer;" @click="uiStore.openMemberInfo(member.userId, conv?.targetId)">
                <h2>{{ member.nickname || member.userId }}</h2>
                <p>{{ handleOnlineTime(member) }}</p>
              </div>
              <span v-if="member.role === 0" class="role-badge owner">{{ t('群主') }}</span>
              <span v-else-if="member.role === 1" class="role-badge admin">{{ t('管理员') }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- 邀请好友 (同 im index.vue 邀请好友按钮) -->
      <div class="group-info-footer">
        <div class="invite-friend" @click="openInvite">{{ t('邀请好友') }}</div>
      </div>
    </template>

    <template v-else>
      <div class="member-directory">
        <div class="member-directory-search">
          <img :src="searchIcon" alt="" />
          <img
            v-show="search"
            :src="searchCloseIcon"
            alt=""
            @click="search = ''"
          />
          <input v-model="search" type="text" :placeholder="t('搜索')" />
          <span @click="refreshMembers">
            <img
              src="@/assets/images/refresh.png"
              alt=""
              :class="{ spinning: refreshingMembers }"
            />
            <span>{{ t('群成员列表强制刷新') }}</span>
          </span>
          <div class="member-cancel" @click="showAllMembers = false; search = ''">{{ t('取消') }}</div>
        </div>

        <ul class="member-list directory-list">
          <li v-for="member in members" :key="member.userId" class="member-item">
            <TextAvatar
              :name="member.nickname || member.userId"
              :src="member.avatar"
              :size="35"
              rounded
              style="cursor: pointer;"
              @click="uiStore.openMemberInfo(member.userId, conv?.targetId)"
            />
            <div class="member-detail" style="cursor: pointer;" @click="uiStore.openMemberInfo(member.userId, conv?.targetId)">
              <h2>{{ member.nickname || member.userId }}</h2>
              <p>{{ handleOnlineTime(member) }}</p>
            </div>
            <span v-if="member.role === 0" class="role-badge owner">{{ t('群主') }}</span>
            <span v-else-if="member.role === 1" class="role-badge admin">{{ t('管理员') }}</span>
          </li>
        </ul>

        <div class="invite-friend directory-invite" @click="openInvite">{{ t('邀请好友') }}</div>
      </div>
    </template>

    <RadioSelectDialog
      v-if="clearMsgTypeList.length > 0"
      :title="t('请选择清空类型')"
      :radio-text-list="clearMsgTypeList"
      @submit="handleClearSubmit"
    />

    <ConfirmDialog
      :visible="confirmVisible"
      :title="confirmTitle"
      :content="confirmContent"
      variant="im"
      type="danger"
      @update:visible="confirmVisible = $event"
      @confirm="handleConfirm"
    />

    <Teleport to="body">
      <Transition name="invite-prompt-fade">
        <div v-if="invitePromptVisible" class="invite-prompt-mask" @click.self="closeInvitePrompt">
          <div class="invite-prompt-dialog">
            <button class="invite-prompt-close" type="button" :aria-label="t('关闭')" @click="closeInvitePrompt">×</button>
            <h3>{{ invitePromptTitle }}</h3>
            <p>{{ invitePromptContent }}</p>
            <div class="invite-prompt-actions">
              <button
                class="invite-prompt-cancel"
                type="button"
                :disabled="invitePromptSubmitting"
                @click="closeInvitePrompt"
              >
                {{ t('取消') }}
              </button>
              <button
                :class="['invite-prompt-confirm', { disabled: invitePromptSubmitting }]"
                type="button"
                :disabled="invitePromptSubmitting"
                @click="handleInvitePromptConfirm"
              >
                {{ invitePromptSubmitting ? t('邀请中...') : t('确定') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Toast
      :visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
      @update:visible="toastVisible = $event"
    />

    <GroupQRCode
      :visible="qrCodeVisible"
      :group-id="conv.targetId"
      :group-name="group?.name || groupAliasName"
      :can-reset-code="effectiveMemberType === 0 || bfResetQrcode"
      @close="qrCodeVisible = false"
    />

    <InviteFriendDialog
      :visible="inviteVisible"
      :group-id="conv.targetId"
      :existing-member-ids="existingMemberIds"
      :qrcode-url="inviteShortLink"
      :confirm-before-invite="bfJoinCheck"
      :pending-audit-ids="pendingInviteIds"
      @close="inviteVisible = false"
      @invited="handleInvited"
      @confirm-invite="handleInviteConfirmRequest"
      @pending-audit-loaded="replacePendingInviteIds"
    />
    <GroupNoticeDialog
      :visible="noticeVisible"
      :group-id="conv.targetId"
      @close="noticeVisible = false"
      @published="handleNoticePublished"
    />
    
    <RemoveMemberDialog
      :visible="removeMemberVisible"
      :group-id="conv.targetId"
      :members="members"
      :current-role="effectiveMemberType ?? -1"
      @close="removeMemberVisible = false"
      @removed="handleRemoved"
    />

    <!-- 对齐旧 im：管理员标题点击后展示群主和管理员列表，群主可移除管理员。 -->
    <Teleport to="body">
      <div v-if="managerDialogVisible" class="groupManageDialog" @click="closeManagerDialog">
        <div @click.stop>
          <picture @click="closeManagerDialog">
            <img src="@/assets/images/common/close-icon.png" alt="" />
          </picture>
          <div class="title">{{ t('群主') }}</div>
          <div class="member-list manager-dialog-list">
            <div v-if="groupOwner" class="member-item">
              <TextAvatar
                class="member-avatar"
                :name="groupOwner.nickname || groupOwner.userId"
                :src="groupOwner.avatar || null"
                :size="30"
                rounded
              />
              <div class="member-detail">
                <h2>{{ groupOwner.nickname || groupOwner.userId }}</h2>
                <p>{{ handleOnlineTime(groupOwner) }}</p>
              </div>
            </div>
          </div>
          <div class="title">{{ t('管理员') }}（{{ groupManagers.length }}/20）</div>
          <div class="member-list manager-dialog-list">
            <div
              v-for="member in groupManagers"
              :key="member.userId"
              class="member-item"
              :class="{ 'has-remove-btn': isOwner }"
            >
              <TextAvatar
                class="member-avatar"
                :name="member.nickname || member.userId"
                :src="member.avatar || null"
                :size="30"
                rounded
              />
              <div class="member-detail">
                <h2>{{ member.nickname || member.userId }}</h2>
                <p>{{ handleOnlineTime(member) }}</p>
              </div>
              <span
                v-if="isOwner"
                class="remove-manage cursor"
                @click.stop="removeManager(member)"
              >
                {{ removingAdminId === member.userId ? `${t('加载中')}...` : t('移除') }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.group-info-panel {
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: hidden;
}

.group-info-scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.group-info-footer {
  flex-shrink: 0;
  background: #fff;

  .invite-friend {
    width: 100%;
    height: 42px;
    color: #178aff;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    cursor: pointer;
    font-size: 14px;
    font-weight: normal;
  }
}

.invite-prompt-mask {
  position: fixed;
  inset: 0;
  z-index: 11000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

.invite-prompt-dialog {
  position: relative;
  width: 300px;
  padding: 20px 16px 10px;
  box-sizing: border-box;
  border-radius: 8px;
  background: #fff;

  > h3 {
    margin: 0 24px 8px;
    color: #000;
    font-size: 16px;
    line-height: 22px;
    font-weight: 600;
    text-align: center;
  }

  > p {
    margin: 0;
    color: #999;
    font-size: 14px;
    line-height: 20px;
    text-align: center;
    word-break: break-word;
  }
}

.invite-prompt-close {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 0;
  border: none;
  background: transparent;
  color: #999;
  font-size: 18px;
  line-height: 18px;
  cursor: pointer;
}

.invite-prompt-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;

  > button {
    flex: 1;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 14px;
    line-height: 32px;
    cursor: pointer;
  }
}

.invite-prompt-cancel {
  background: #9197ad;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.invite-prompt-confirm {
  background: #178aff;

  &.disabled,
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.invite-prompt-fade-enter-active,
.invite-prompt-fade-leave-active {
  transition: opacity 0.2s ease;
}

.invite-prompt-fade-enter-from,
.invite-prompt-fade-leave-to {
  opacity: 0;
}

/* 群别名 + 二维码 — 同 im group-alias-qrcode.vue */
.group-alias-qrcode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 10px;
  box-sizing: border-box;
  border-bottom: 10px solid #f5f5f5;
  cursor: pointer;
  height: 65px;
  flex-shrink: 0;

  > h3 {
    font-size: 14px;
    color: #000;
    margin: 0;
    font-weight: 400;
    flex-shrink: 0;
  }

  .alias-right {
    display: flex;
    align-items: center;

    .alias-name {
      font-size: 14px;
      color: #178aff;
      font-weight: normal;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      max-width: 130px;

      &:hover {
        opacity: 0.8;
      }

      &.is-loading {
        color: #999;
        cursor: default;
      }
    }

    .code-icon {
      width: 22px;
      height: 22px;
      margin-left: 8px;
    }

    .arrow {
      height: 10px;
      margin-left: 4px;
    }
  }
}

/* 群简介 — 同 im group-notice/index.vue */
.group-notice-section {
  padding: 10px;
  cursor: pointer;
  max-height: 120px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;

  .notice-head {
    display: flex;
    align-items: center;
    justify-content: space-between;

    > h3 {
      line-height: 40px;
      margin: 0;
      font-size: 14px;
      color: #000;
      font-weight: normal;
    }

    .arrow {
      height: 10px;
    }
  }

  .notice-preview {
    max-height: 40px;
    min-height: 20px;
  }
}

/* 配置列表 — 同 im config-list.vue */
.config-list {
  padding: 10px 0;
  margin: 0;
  border-top: 10px solid #f5f5f5;
  list-style: none;
  flex-shrink: 0;

  > li {
    display: flex;
    justify-content: space-between;
    height: 35px;
    align-items: center;
    padding: 0 10px;

    > span {
      font-size: 14px;
      color: #333;
      font-weight: normal;
    }

    &.action-btn {
      display: flex;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      font-weight: normal;

      &.danger {
        color: #f44e5a;
      }
    }
  }
}

/* 管理员 — 同 im index.vue */
.manager-label {
  padding: 0;
  margin: 0;
  list-style: none;
  border-top: 10px solid #f5f5f5;
  flex-shrink: 0;

  > li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    font-size: 14px;
    color: #333;
    font-weight: normal;
    cursor: pointer;

    .icon-arrow {
      height: 10px;
    }

    &:hover {
      background: #f5f5f5;
    }
  }
}

.groupManageDialog {
  position: fixed;
  inset: 0;
  z-index: 11000;
  background: rgba(0, 0, 0, 0.2);

  > div {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 400px;
    max-width: calc(100vw - 32px);
    padding: 10px 16px;
    box-sizing: border-box;
    border-radius: 8px;
    background: #fff;
    transform: translate(-50%, -50%);

    > picture {
      position: absolute;
      top: 0;
      right: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;

      &:hover {
        opacity: 0.8;
      }
    }

    .title {
      padding: 10px;
      box-sizing: border-box;
      color: #333;
      background: #fff;
      font-size: 14px;
      font-weight: normal;
    }
  }
}

.manager-dialog-list {
  width: 100%;
  max-height: 350px;
  margin-top: 10px;
  padding-bottom: 10px;
  overflow-y: auto;
  background: #fff;

  .member-item {
    position: relative;
    height: 40px;
    padding: 5px 10px;
    box-sizing: border-box;
    cursor: default;

    &:hover {
      background: transparent;
    }

    &.has-remove-btn {
      padding-right: 54px;
    }

    .member-avatar {
      flex-shrink: 0;
    }

    .remove-manage {
      position: absolute;
      right: 10px;
      top: 50%;
      color: #333;
      font-size: 14px;
      transform: translateY(-50%);

      &:hover {
        color: #3369fe;
      }
    }
  }
}

/* 群成员 — 同 im member-list.vue */
.member-section {
  padding-top: 10px;
  border-top: 10px solid #f5f5f5;
  flex-shrink: 0;

  .member-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px 10px;

    .member-info {
      display: flex;
      align-items: center;
      cursor: pointer;

      .member-title {
        font-size: 14px;
        color: #178aff;
        font-weight: normal;
      }

      .icon-arrow {
        height: 10px;
        margin-left: 4px;
      }
    }
  }

  .member-search {
    display: flex;
    align-items: center;
    padding: 0 10px 10px;
    gap: 8px;

    input {
      flex: 1;
      height: 28px;
      background: #f4f6f9;
      border-radius: 4px;
      border: none;
      padding: 0 8px;
      font-size: 12px;
      outline: none;
    }

    .cancel-btn {
      font-size: 12px;
      color: #333;
      cursor: pointer;
      flex-shrink: 0;
    }
  }
}

.member-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.member-directory {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #fff;
  padding-top: 10px;
  box-sizing: border-box;
}

.member-directory-search {
  height: 30px;
  position: relative;
  background: #f4f6f9;
  border-radius: 4px;
  margin: 0 30px 10px 30px;
  flex-shrink: 0;

  .member-cancel {
    position: absolute;
    right: -25px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    cursor: pointer;
  }

  > img {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);

    &:nth-child(1) {
      left: 5px;
      width: 15px;
    }

    &:nth-child(2) {
      right: 10px;
      cursor: pointer;
    }
  }

  > input {
    padding: 0 12px 0 24px;
    box-sizing: border-box;
    border-radius: 4px;
    width: 100%;
    height: 100%;
    border: none;
    outline: none;
    background: none;
    color: rgb(106, 106, 106);

    &::placeholder {
      color: rgb(106, 106, 106);
      opacity: 1;
    }
  }

  > span {
    position: absolute;
    height: 20px;
    width: 20px;
    top: 5px;
    left: -25px;
    cursor: pointer;

    &:hover {
      > img {
        opacity: 0.8;
      }

      > span {
        display: block;
      }
    }

    > img {
      display: block;
      width: 100%;
      height: 100%;

      &.spinning {
        animation: member-refresh-spin 1s linear infinite;
      }
    }

    > span {
      display: none;
      position: absolute;
      top: 35px;
      left: -6px;
      width: max-content;
      min-width: max-content;
      line-height: 26px;
      padding: 0 8px;
      box-sizing: border-box;
      background: #3daee9;
      color: #fff;
      border: 1px solid #fff;
      border-radius: 5px;
      white-space: nowrap;
      font-size: 12px;
      font-weight: normal;
      z-index: 9;

      &::before,
      &::after {
        position: absolute;
        top: -10px;
        left: 10px;
        display: block;
        font-size: 0;
        line-height: 0;
        border-color: transparent transparent #3daee9;
        border-style: solid;
        border-width: 5px;
        content: "";
      }
    }
  }
}

.directory-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.directory-invite {
  width: 100%;
  height: 42px;
  color: #178aff;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: normal;
  flex-shrink: 0;

}

@keyframes member-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.member-item {
  height: 50px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 8px;
  cursor: pointer;

  &:hover {
    background: #f0f0f0;
  }

  .member-detail {
    flex: 1;
    min-width: 0;

    > h2 {
      line-height: 25px;
      font-size: 14px;
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: normal;
    }

    > p {
      font-size: 12px;
      color: #b9babe;
      line-height: 15px;
      margin: 0;
    }
  }

  .role-badge {
    font-size: 12px;
    color: #fff;
    padding: 2px 6px;
    border-radius: 99px;
    flex-shrink: 0;

    &.owner {
      background: #3369fe;
    }

    &.admin {
      background: #fb9203;
    }
  }
}
</style>
