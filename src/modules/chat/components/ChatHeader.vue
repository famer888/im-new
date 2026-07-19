<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  useChatStore,
  isFileHelperTargetId,
  isOfficialAccountTargetId,
  OFFICIAL_ACCOUNT_NAME,
} from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useUIStore } from '@/stores/useUIStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useSearchStore } from '@/stores/useSearchStore'
import { updateContacts } from '@/api/imBase'
import { proto } from '@/api/request'
import { API_CONFIG } from '@/api/config'
import { formatLastActiveText } from '@/utils/userOnlineStatus'
import { ConversationType } from '@/types'
import { filterSensitiveWords } from '@/utils/sensitiveWords'
import { isCurrentChannelContentSaveRestricted } from '@/utils/channelContentLimit'
import TextAvatar from '@/components/TextAvatar.vue'
import Toast from '@/components/Toast.vue'
import fileHelperIcon from '@/assets/images/message/cszs-icon.png'
import brandLogoIcon from '@/assets/images/logo/logo.png'
import official55Icon from '@/assets/images/logo/official-55.png'
import userIconV from '@/assets/images/userInfo/user-icon-v.png'
import editIcon from '@/assets/images/message/edit-icon.png'
import searchIcon from '@/assets/images/headNav/icon-search-black.png'
import menuIcon from '@/assets/images/system/icon-menu.png'

const props = defineProps<{
  conversationId: string
}>()

const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()
const uiStore = useUIStore()
const authStore = useAuthStore()
const messageStore = useMessageStore()
const searchStore = useSearchStore()
const { t, locale } = useI18n()
const officialAccountIcon = API_CONFIG.brandId === '55' ? official55Icon : brandLogoIcon

function headerMemberRefreshDebug(message: string, data?: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'warn') {
  void message
  void data
  void level
}

const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

const conversation = computed(() =>
  chatStore.conversations.find((c) => c.id === props.conversationId),
)

const isFileHelper = computed(
  () => isFileHelperTargetId(conversation.value?.targetId),
)

const isFriendChat = computed(
  () => conversation.value?.type === ConversationType.Friend && !isFileHelper.value,
)
const isGroupOrChannelChat = computed(
  () => conversation.value?.type === ConversationType.Group
    || conversation.value?.type === ConversationType.Channel,
)
const isOfficialAccountChat = computed(
  () => {
    const conv = conversation.value
    if (!conv || conv.type !== ConversationType.Friend) return false
    // 兼容不同包/不同账号数据：官方号既可能是固定 9900，也可能由服务端下发为品牌官方昵称。
    if (isOfficialAccountTargetId(conv.targetId)) return true
    const displayName = String(
      contactStore.getDisplayName(conv.targetId) || conv.senderName || '',
    ).trim()
    return displayName === OFFICIAL_ACCOUNT_NAME
  },
)

const canOpenHeaderMenu = computed(
  () => (conversation.value?.type === ConversationType.Friend
      && !isOfficialAccountChat.value)
    || conversation.value?.type === ConversationType.Group
    || conversation.value?.type === ConversationType.Channel,
)

const selectedCount = computed(() => uiStore.selectedMessageIds.size)
const allSelf = computed(() => uiStore.selectedMessageItems.every(item => item.isSelf))
const isFriendConv = computed(() => conversation.value?.type === ConversationType.Friend)
const showBatchForward = computed(() => !isCurrentChannelContentSaveRestricted())

function handleBatchForward() {
  if (!showBatchForward.value || selectedCount.value === 0) return
  const firstId = [...uiStore.selectedMessageIds][0]
  uiStore.openForwardDialog(firstId)
}

async function handleBatchDeleteLocal() {
  const convId = chatStore.currentConversationId
  if (!convId) return
  for (const id of uiStore.selectedMessageIds) {
    await messageStore.deleteMessageLocal(convId, id)
  }
  uiStore.exitSelectionMode()
}

async function handleBatchDeleteForAll() {
  const convId = chatStore.currentConversationId
  if (!convId || !authStore.uid) return
  for (const item of uiStore.selectedMessageItems) {
    messageStore.deleteMessage(convId, item.id)
    chatStore.recallMessage(authStore.uid, item.id, convId).catch((error) => {
      console.warn('[message-selection] remote delete failed:', error)
    })
  }
  uiStore.exitSelectionMode()
}

function handleCancelSelection() {
  uiStore.exitSelectionMode()
}

const editingRemark = ref(false)
const remarkDraft = ref('')
const remarkInputRef = ref<HTMLInputElement | null>(null)
const friendContact = computed(() => {
  const targetId = conversation.value?.targetId
  if (!targetId || !isFriendChat.value) return null
  return contactStore.getContact(targetId) ?? null
})

/** 与 im 好友资料/在线展示一致：在线显示「在线」，否则显示最后活跃时间文案 */
const friendOnlineSubtitle = computed(() => {
  if (!isFriendChat.value || !conversation.value) return ''
  const c = friendContact.value
  if (!c || c.bfShowOnline === false) return ''
  if (c.online) return t('在线')
  if (c.onlineStatusUpdateTime) return formatLastActiveText(c.onlineStatusUpdateTime, t)
  return ''
})

const channelInfo = computed(() => {
  const targetId = conversation.value?.targetId
  if (!targetId || conversation.value?.type !== ConversationType.Channel) return null
  return channelStore.getChannel(targetId) ?? null
})

const channelSubtitle = computed(() => {
  if (conversation.value?.type !== ConversationType.Channel) return ''
  const count = Number(channelInfo.value?.memberCount ?? -1)
  return count >= 0 ? t('订阅者数量', { count }) : ''
})

const title = computed(() => {
  void locale.value
  if (!conversation.value) return ''
  if (isFileHelperTargetId(conversation.value.targetId)) return t('传输助手')
  switch (conversation.value.type) {
    case ConversationType.Friend:
      if (isOfficialAccountChat.value) return OFFICIAL_ACCOUNT_NAME
      return filterSensitiveWords(contactStore.getDisplayName(conversation.value.targetId))
    case ConversationType.Group: {
      const group = groupStore.getGroup(conversation.value.targetId)
      const name = filterSensitiveWords(group?.name ?? '')
      const count = group?.memberCount || groupStore.getMembers(conversation.value.targetId).length
      return count > 0 ? `${name} (${count}人)` : name
    }
    case ConversationType.Channel:
      return filterSensitiveWords(channelInfo.value?.channelName || channelInfo.value?.name || conversation.value.targetId)
    default:
      return ''
  }
})

const groupHeaderDebugState = computed(() => {
  void locale.value
  const current = conversation.value
  if (!current || current.type !== ConversationType.Group) return null
  const group = groupStore.getGroup(current.targetId)
  const memberMapCount = groupStore.getMembers(current.targetId).length
  const groupMemberCount = group?.memberCount ?? null
  const renderedCount = group?.memberCount || memberMapCount
  return {
    groupId: current.targetId,
    groupName: group?.name ?? '',
    groupMemberCount,
    memberMapCount,
    renderedCount,
    renderedTitle: title.value,
  }
})

watch(
  groupHeaderDebugState,
  (next, prev) => {
    if (!next) return
    if (prev && JSON.stringify(prev) === JSON.stringify(next)) return
    headerMemberRefreshDebug('group header count state', {
      previous: prev,
      next,
    })
  },
  { immediate: true },
)

const avatar = computed(() => {
  if (!conversation.value) return ''
  if (isFileHelperTargetId(conversation.value.targetId)) return fileHelperIcon
  switch (conversation.value.type) {
    case ConversationType.Friend:
      if (isOfficialAccountChat.value) {
        // 按当前品牌包展示官方号头像：55 使用老 im 头像，其它品牌使用各自 logo。
        return officialAccountIcon
      }
      return contactStore.getContact(conversation.value.targetId)?.avatar || ''
    case ConversationType.Group:
      return groupStore.getGroup(conversation.value.targetId)?.avatar || ''
    case ConversationType.Channel:
      return channelStore.channels.find((c) => c.id === conversation.value?.targetId)?.avatar || ''
    default:
      return ''
  }
})

const avatarType = computed<'friend' | 'group' | 'channel'>(() => {
  if (!conversation.value) return 'friend'
  switch (conversation.value.type) {
    case ConversationType.Group:
      return 'group'
    case ConversationType.Channel:
      return 'channel'
    default:
      return 'friend'
  }
})

const avatarId = computed(() => {
  if (conversation.value?.type !== ConversationType.Channel) return undefined
  return channelInfo.value?.channelId || channelInfo.value?.id || conversation.value.targetId
})

const avatarColor = computed(() => {
  if (conversation.value?.type !== ConversationType.Channel) return undefined
  return channelInfo.value?.logoColor || undefined
})

watch(friendContact, (contact) => {
  remarkDraft.value = contact?.remark || contact?.nickname || ''
  editingRemark.value = false
}, { immediate: true })

function startEditRemark() {
  if (!isFriendChat.value) return
  editingRemark.value = true
  remarkDraft.value = friendContact.value?.remark || friendContact.value?.nickname || title.value || ''
  nextTick(() => {
    remarkInputRef.value?.focus()
    remarkInputRef.value?.select()
  })
}

/**
 * 与 im `top.vue` `friendRemarkUpdate` → `eventFriend.fnRemarkUpdate` →
 * `UpdateContacts({ op: 4, param: { contactsId, noteName } })` 一致。
 */
async function saveRemark() {
  const conv = conversation.value
  if (!conv || conv.type !== ConversationType.Friend) return
  const targetId = String(conv.targetId || '').trim()
  if (!targetId) return
  const contact = friendContact.value
  editingRemark.value = false
  const val = remarkDraft.value.trim()
  const prevRemark = (contact?.remark || '').trim()
  if (val === prevRemark) return

  const prevStored = contact?.remark || null
  try {
    const res = await updateContacts({
      op: proto.ContactsOperator.REMARK,
      param: {
        contactsId: Number(targetId),
        /** 空字符串表示删除备注（与 im `noteName: isDeleeteRemarkName ? "" : this.name` 一致） */
        noteName: val === '' ? '' : val,
      },
    })
    // 与旧 im 的接口语义对齐：errCode=0/200 都算成功；失败时不能只改本地 UI。
    const errCode = Number((res as any)?.commonResult?.errCode ?? 200)
    if (errCode !== 200 && errCode !== 0) {
      throw new Error((res as any)?.commonResult?.errMsg || String(errCode))
    }
    if (contact) {
      contactStore.patchContact(contact.id, { remark: val || null })
      // 备注名也会作为群成员展示名，保持右侧群成员列表与好友资料同步。
      groupStore.patchMemberRemarkName(contact.id, val || null)
    } else {
      // 官方号等特殊会话可能尚未进入通讯录列表，这里补一条本地联系人以承接备注展示。
      await contactStore.upsertContact({
        id: targetId,
        remark: val || null,
        nickname: title.value || OFFICIAL_ACCOUNT_NAME,
        status: 1,
        updatedAt: Date.now(),
      }, { persist: false, source: 'local' })
      // upsert 后同步已加载群成员缓存，避免列表继续显示旧昵称。
      groupStore.patchMemberRemarkName(targetId, val || null)
    }
    showToast(t('修改成功'), 'success')
  } catch (e) {
    console.error('[ChatHeader] update remark failed', e)
    if (contact) {
      contact.remark = prevStored
      remarkDraft.value = prevStored || contact.nickname || ''
    } else {
      remarkDraft.value = title.value || OFFICIAL_ACCOUNT_NAME
    }
    showToast((e as Error)?.message || t('操作失败'), 'error')
  }
}

function getCurrentPanelType() {
  if (!conversation.value) return 'none' as const
  if (conversation.value.type === ConversationType.Friend && !isFileHelper.value) return 'friend-info' as const
  if (conversation.value.type === ConversationType.Group) return 'group-info' as const
  if (conversation.value.type === ConversationType.Channel) return 'channel-info' as const
  return 'none' as const
}

function toggleRightPanel() {
  const panelType = getCurrentPanelType()
  if (panelType === 'none') return
  uiStore.setRightPanel(uiStore.rightPanel === panelType ? 'none' : panelType)
}

/** 与 im `top.vue serachChat` → `searchSpecifiedChat` 事件一致 */
function handleSearch() {
  if (!conversation.value) return
  const conv = conversation.value
  const typeStr =
    conv.type === ConversationType.Friend
      ? ('friend' as const)
      : conv.type === ConversationType.Group
        ? ('group' as const)
        : ('channel' as const)
  searchStore.openSearchSpecifiedChat({
    id: conv.targetId,
    type: typeStr,
    pic: typeof avatar.value === 'string' ? avatar.value : '',
    name: title.value,
  })
}

watch(
  () => conversation.value?.type === ConversationType.Channel ? conversation.value.targetId : '',
  (channelId) => {
    if (channelId) {
      void channelStore.refreshChannelDetail(channelId)
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="chat-header">
    <!-- Selection mode toolbar overlay (matches im top.vue) -->
    <section v-if="uiStore.selectionMode" class="selected-toolbar">
      <span v-if="showBatchForward" @click="handleBatchForward">{{ t('操作数量', { action: t('转发'), count: selectedCount }) }}</span>
      <span @click="handleBatchDeleteLocal">{{ t('操作数量', { action: t('删除'), count: selectedCount }) }}</span>
      <span v-if="allSelf" @click="handleBatchDeleteForAll">
        {{ t('操作数量', { action: isFriendConv ? t('为双方删除') : t('为所有人删除'), count: selectedCount }) }}
      </span>
      <span class="cancel" @click="handleCancelSelection">{{ t('取消') }}</span>
    </section>
    <div class="header-left">
      <!-- 与 im chat-window/top.vue 传输助手分支一致：cszs 图标 + 文案 + user-icon-v -->
      <template v-if="isFileHelper">
        <picture class="file-helper-picture">
          <img :src="fileHelperIcon" alt="" />
        </picture>
        <span class="file-helper-title">{{ t('传输助手') }}</span>
        <img class="file-helper-v" :src="userIconV" alt="" />
      </template>
      <template v-else>
        <div
          class="header-title-cluster"
          :class="{ clickable: canOpenHeaderMenu }"
          @click="canOpenHeaderMenu && !editingRemark && toggleRightPanel()"
        >
          <TextAvatar
            class="header-avatar"
            :id="avatarId"
            :name="title || conversation?.targetId || '?'"
            :src="avatar || null"
            :avatar-type="avatarType"
            :color="avatarColor"
            :size="25"
            rounded
          />
          <div class="header-text-block">
            <div class="title-row">
              <input
                v-if="isFriendChat && editingRemark"
                ref="remarkInputRef"
                v-model="remarkDraft"
                class="title-input"
                maxlength="50"
                @blur="saveRemark"
                @keyup.enter="saveRemark"
              />
              <span
                v-else
                class="title"
                :class="{ 'title-strong': isGroupOrChannelChat }"
              >
                {{ title }}
              </span>
              <img
                v-if="isFriendChat && !editingRemark"
                class="friend-edit-icon"
                :src="editIcon"
                alt=""
                @click.stop="startEditRemark"
              />
            </div>
            <div v-if="friendOnlineSubtitle || channelSubtitle" class="subtitle-line">
              {{ friendOnlineSubtitle || channelSubtitle }}
            </div>
          </div>
        </div>
      </template>
    </div>
    <div class="header-right">
      <img
        v-if="!isFileHelper"
        class="header-action-icon search"
        :src="searchIcon"
        alt=""
        @click="handleSearch"
      />
      <button
        v-if="!isFileHelper && canOpenHeaderMenu"
        class="more-btn"
        type="button"
        @click="toggleRightPanel"
      >
        <img :src="menuIcon" alt="" />
      </button>
    </div>

    <Toast
      v-model:visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
    />
  </div>
</template>

<style lang="scss" scoped>
.chat-header {
  height: 51px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #e8e8e8;
  background: #fff;
  flex-shrink: 0;
  font-size: 16px;
  font-weight: 400;
  position: relative;
  overflow: hidden;
}

.selected-toolbar {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 1;
  background: #fff;
  display: flex;
  align-items: center;
  padding-left: 20px;

  > span {
    display: block;
    height: 30px;
    line-height: 30px;
    min-width: 100px;
    text-align: center;
    background: #40a7e3;
    color: #fff;
    font-size: 14px;
    font-weight: bold;
    margin-right: 10px;
    border-radius: 5px;
    cursor: pointer;
    padding: 0 20px;

    &:hover {
      background: #2398db;
    }

    &.cancel {
      background: #999;

      &:hover {
        background: #bbb;
      }
    }
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: 0;
  overflow: hidden;
}

.header-title-cluster {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;

  &.clickable {
    cursor: pointer;
  }
}

.header-text-block {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.title-row {
  display: flex;
  align-items: center;
  min-width: 0;
}

.subtitle-line {
  font-size: 10px;
  color: #b4b4b4;
  font-weight: 400;
  line-height: 1;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  // margin-bottom: 20px;
}

.header-avatar {
  flex-shrink: 0;
  margin-right: 12px;
}

/* im .comTop > picture */
.file-helper-picture {
  flex-shrink: 0;
  width: 25px;
  height: 25px;
  margin-right: 12px;

  img {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    // object-fit: cover;
  }
}

.file-helper-title {
  font-size: inherit;
  font-weight: 400;
  color: #333;
  line-height: 1;
}

.title {
  font-size: inherit;
  font-weight: 400;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.title-strong {
    font-weight: 700;
    font-family: PingFangSC-Bold, sans-serif;
  }
}

.friend-edit-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  margin-left: 5px;
  cursor: pointer;
}

.title-input {
  height: 28px;
  min-width: 120px;
  max-width: 360px;
  font-size: inherit;
  font-weight: 400;
  line-height: 1;
  color: #333;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0 8px;
  outline: none;
}

/* im .comTop 传输助手：16px / Bold */
.title-file-helper {
  font-size: 16px;
  font-weight: 400;
  color: #333;
}

/* im .comTop > img（认证标） */
.file-helper-v {
  flex-shrink: 0;
  height: 15px;
  width: auto;
  display: block;
  margin-left: 5px;
}

.header-right {
  display: flex;
  align-items: center;
}

.header-action-icon {
  display: block;
  cursor: pointer;

  &.search {
    width: 20px;
    height: 20px;
    margin-right: 10px;
  }
}

.more-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;

  img {
    display: block;
    width: 100%;
    height: 100%;
  }

  &:hover {
    opacity: 0.8;
  }
}
</style>
