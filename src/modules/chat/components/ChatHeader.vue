<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/useChatStore'
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
      <span class="title">{{ title }}</span>
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

.title {
  font-size: 15px;
  font-weight: 500;
  color: #333;
}
</style>
