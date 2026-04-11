<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore, FILE_HELPER_TARGET_ID, FILE_HELPER_DISPLAY_NAME } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { ConversationType } from '@/types'

const props = defineProps<{
  conversationId: string
}>()

const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()

const conversation = computed(() =>
  chatStore.conversations.find((c) => c.id === props.conversationId),
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
      <span
        class="title"
        :class="{ 'is-file-helper': conversation?.targetId === FILE_HELPER_TARGET_ID }"
      >{{ title }}</span>
      <span
        v-if="conversation?.targetId === FILE_HELPER_TARGET_ID"
        class="title-verified"
        aria-hidden="true"
      >V</span>
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
}

.title {
  font-size: 15px;
  font-weight: 500;
  color: #333;
}

.title.is-file-helper {
  font-weight: 600;
}

.title-verified {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 6px;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  background: #3369fe;
  clip-path: polygon(
    30% 0%,
    70% 0%,
    100% 30%,
    100% 70%,
    70% 100%,
    30% 100%,
    0% 70%,
    0% 30%
  );
}
</style>
