<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore, FILE_HELPER_TARGET_ID, FILE_HELPER_DISPLAY_NAME } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { ConversationType } from '@/types'
import TextAvatar from '@/components/TextAvatar.vue'
import fileHelperIcon from '@/assets/images/message/cszs-icon.png'
import userIconV from '@/assets/images/userInfo/user-icon-v.png'
import editIcon from '@/assets/images/message/edit-icon.png'

const props = defineProps<{
  conversationId: string
}>()

const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()

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
      return group?.name ?? ''
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
</script>

<template>
  <div class="chat-header">
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
      <!-- Group info, search, etc. -->
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
</style>
