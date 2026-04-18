<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore, FILE_HELPER_TARGET_ID, FILE_HELPER_DISPLAY_NAME } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useUIStore } from '@/stores/useUIStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useSearchStore } from '@/stores/useSearchStore'
import { ConversationType } from '@/types'
import TextAvatar from '@/components/TextAvatar.vue'
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
  () => conversation.value?.targetId === FILE_HELPER_TARGET_ID,
)

const isFriendChat = computed(
  () => conversation.value?.type === ConversationType.Friend && !isFileHelper.value,
)

const editingRemark = ref(false)
const remarkDraft = ref('')
const remarkInputRef = ref<HTMLInputElement | null>(null)
const friendContact = computed(() => {
  const targetId = conversation.value?.targetId
  if (!targetId || !isFriendChat.value) return null
  return contactStore.getContact(targetId) ?? null
})

const title = computed(() => {
  if (!conversation.value) return ''
  if (conversation.value.targetId === FILE_HELPER_TARGET_ID) return FILE_HELPER_DISPLAY_NAME
  switch (conversation.value.type) {
    case ConversationType.Friend:
      return contactStore.getDisplayName(conversation.value.targetId)
    case ConversationType.Group: {
      const group = groupStore.getGroup(conversation.value.targetId)
      const name = group?.name ?? ''
      const count = group?.memberCount || groupStore.getMembers(conversation.value.targetId).length
      return count > 0 ? `${name} (${count}人)` : name
    }
    default:
      return ''
  }
})

const avatar = computed(() => {
  if (!conversation.value) return ''
  if (conversation.value.targetId === FILE_HELPER_TARGET_ID) return fileHelperIcon
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

function saveRemark() {
  if (!friendContact.value) return
  editingRemark.value = false
  const val = remarkDraft.value.trim()
  // 与旧版行为保持一致：空值表示清空备注，回退到昵称显示
  friendContact.value.remark = val || null
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
</script>

<template>
  <div class="chat-header">
    <!-- Selection mode toolbar overlay (matches im top.vue) -->
    <section v-if="uiStore.selectionMode" class="selected-toolbar">
      <span @click="handleBatchForward">转发 {{ selectedCount }}</span>
      <span @click="handleBatchDeleteLocal">删除 {{ selectedCount }}</span>
      <span v-if="allSelf" @click="handleBatchDeleteForAll">
        {{ isFriendConv ? `为双方删除 ${selectedCount}` : `为所有人删除 ${selectedCount}` }}
      </span>
      <span class="cancel" @click="handleCancelSelection">取消</span>
    </section>
    <div class="header-left">
      <!-- 与 im chat-window/top.vue 传输助手分支一致：cszs 图标 + 文案 + user-icon-v -->
      <template v-if="isFileHelper">
        <picture class="file-helper-picture">
          <img :src="fileHelperIcon" alt="" />
        </picture>
        <span class="file-helper-title">{{ FILE_HELPER_DISPLAY_NAME }}</span>
        <img class="file-helper-v" :src="userIconV" alt="" />
      </template>
      <template v-else>
        <TextAvatar
          class="header-avatar"
          :name="title || conversation?.targetId || '?'"
          :src="avatar || null"
          :avatar-type="avatarType"
          :size="25"
          rounded
        />
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
          @click="startEditRemark"
        />
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
  white-space: nowrap;
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
  line-height: 1;
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
