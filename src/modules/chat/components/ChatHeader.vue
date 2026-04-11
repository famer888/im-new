<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore, FILE_HELPER_TARGET_ID, FILE_HELPER_DISPLAY_NAME } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { ConversationType } from '@/types'
import fileHelperIcon from '@/assets/images/message/cszs-icon.png'
import userIconV from '@/assets/images/userInfo/user-icon-v.png'

const props = defineProps<{
  conversationId: string
}>()

const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()

const conversation = computed(() =>
  chatStore.conversations.find((c) => c.id === props.conversationId),
)

const isFileHelper = computed(
  () => conversation.value?.targetId === FILE_HELPER_TARGET_ID,
)

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
</script>

<template>
  <div class="chat-header">
    <div class="header-left">
      <!-- 与 im chat-window/top.vue 传输助手分支一致：cszs 图标 + 文案 + user-icon-v -->
      <template v-if="isFileHelper">
        <picture class="file-helper-picture">
          <img :src="fileHelperIcon" alt="" />
        </picture>
        <span class="title title-file-helper">{{ FILE_HELPER_DISPLAY_NAME }}</span>
        <img class="file-helper-v" :src="userIconV" alt="" />
      </template>
      <template v-else>
        <span class="title">{{ title }}</span>
      </template>
    </div>
    <div class="header-right">
      <!-- Group info, search, etc. -->
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chat-header {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #e8e8e8;
  background: #f5f5f5;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
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

.title {
  font-size: 15px;
  font-weight: 500;
  color: #333;
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
