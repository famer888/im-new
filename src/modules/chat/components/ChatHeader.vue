<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore, isFileHelperTargetId } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useUIStore } from '@/stores/useUIStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useSearchStore } from '@/stores/useSearchStore'
import { updateContacts } from '@/api/imBase'
import { proto } from '@/api/request'
import { formatLastActiveText } from '@/utils/userOnlineStatus'
import { ConversationType } from '@/types'
import TextAvatar from '@/components/TextAvatar.vue'
import Toast from '@/components/Toast.vue'
import fileHelperIcon from '@/assets/images/message/cszs-icon.png'
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

const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

const selectedCount = computed(() => uiStore.selectedMessageIds.size)
const allSelf = computed(() => uiStore.selectedMessageItems.every(item => item.isSelf))
const isFriendConv = computed(() => conversation.value?.type === ConversationType.Friend)

function handleBatchForward() {
  if (selectedCount.value === 0) return
  const firstId = [...uiStore.selectedMessageIds][0]
  uiStore.openForwardDialog(firstId)
}

function handleBatchDeleteLocal() {
  const convId = chatStore.currentConversationId
  if (!convId) return
  for (const id of uiStore.selectedMessageIds) {
    messageStore.deleteMessage(convId, id)
  }
  uiStore.exitSelectionMode()
}

async function handleBatchDeleteForAll() {
  const convId = chatStore.currentConversationId
  if (!convId || !authStore.uid) return
  for (const item of uiStore.selectedMessageItems) {
    await chatStore.recallMessage(authStore.uid, item.id)
    messageStore.deleteMessage(convId, item.id)
  }
  uiStore.exitSelectionMode()
}

function handleCancelSelection() {
  uiStore.exitSelectionMode()
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

const canOpenHeaderMenu = computed(
  () => conversation.value?.type === ConversationType.Friend
    || conversation.value?.type === ConversationType.Group
    || conversation.value?.type === ConversationType.Channel,
)

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
      return contactStore.getDisplayName(conversation.value.targetId)
    case ConversationType.Group: {
      const group = groupStore.getGroup(conversation.value.targetId)
      const name = group?.name ?? ''
      const count = group?.memberCount || groupStore.getMembers(conversation.value.targetId).length
      return count > 0 ? `${name} (${count}人)` : name
    }
    case ConversationType.Channel:
      return channelInfo.value?.channelName || channelInfo.value?.name || conversation.value.targetId
    default:
      return ''
  }
})

const avatar = computed(() => {
  if (!conversation.value) return ''
  if (isFileHelperTargetId(conversation.value.targetId)) return fileHelperIcon
  switch (conversation.value.type) {
    case ConversationType.Friend:
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
  if (!friendContact.value) return
  editingRemark.value = true
  remarkDraft.value = friendContact.value.remark || friendContact.value.nickname || ''
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
  const contact = friendContact.value
  if (!contact) return
  editingRemark.value = false
  const val = remarkDraft.value.trim()
  const prevRemark = (contact.remark || '').trim()
  if (val === prevRemark) return

  const prevStored = contact.remark
  try {
    await updateContacts({
      op: proto.ContactsOperator.REMARK,
      param: {
        contactsId: Number(contact.id),
        /** 空字符串表示删除备注（与 im `noteName: isDeleeteRemarkName ? "" : this.name` 一致） */
        noteName: val === '' ? '' : val,
      },
    })
    contactStore.patchContact(contact.id, { remark: val || null })
    showToast(t('修改成功'), 'success')
  } catch (e) {
    console.error('[ChatHeader] update remark failed', e)
    contact.remark = prevStored
    remarkDraft.value = prevStored || contact.nickname || ''
    showToast(t('操作失败'), 'error')
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
      <span @click="handleBatchForward">{{ t('操作数量', { action: t('转发'), count: selectedCount }) }}</span>
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
              <span v-else class="title">{{ title }}</span>
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
        v-if="!isFileHelper"
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
  font-weight: 700;
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
    object-fit: cover;
  }
}

.file-helper-title {
  font-size: 16px;
  font-weight: 700;
  color: #333;
  line-height: 1;
}

.title {
  font-size: 16px;
  font-weight: 700;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  font-size: 16px;
  font-weight: 700;
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
  font-weight: 700;
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
