<script setup lang="ts">
import { ref, computed } from 'vue'
import { useChatStore, FILE_HELPER_TARGET_ID, FILE_HELPER_DISPLAY_NAME } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { ConversationType } from '@/types'
import TextAvatar from '@/components/TextAvatar.vue'
import SearchInput from '@/components/SearchInput.vue'

const props = defineProps<{ visible: boolean; messageId: string | null }>()
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'forward', targetId: string): void
}>()

const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const keyword = ref('')

const filteredConversations = computed(() => {
  if (!keyword.value.trim()) return chatStore.conversations
  const kw = keyword.value.toLowerCase()
  return chatStore.conversations.filter((c) => {
    const name = getName(c).toLowerCase()
    return name.includes(kw)
  })
})

function getName(conv: { type: number; targetId: string }): string {
  if (conv.targetId === FILE_HELPER_TARGET_ID) return FILE_HELPER_DISPLAY_NAME
  if (conv.type === ConversationType.Friend) return contactStore.getDisplayName(conv.targetId)
  if (conv.type === ConversationType.Group) return groupStore.getGroup(conv.targetId)?.name ?? conv.targetId
  return conv.targetId
}

function getAvatar(conv: { type: number; targetId: string }): string | null {
  if (conv.targetId === FILE_HELPER_TARGET_ID) return null
  if (conv.type === ConversationType.Friend) return contactStore.getContact(conv.targetId)?.avatar ?? null
  if (conv.type === ConversationType.Group) return groupStore.getGroup(conv.targetId)?.avatar ?? null
  return null
}

function getAvatarType(conv: { type: number; targetId: string }): 'friend' | 'group' | 'channel' {
  if (conv.type === ConversationType.Group) return 'group'
  if (conv.type === ConversationType.Channel) return 'channel'
  return 'friend'
}

function handleSelect(conv: { id: string; targetId: string }) {
  emit('forward', conv.id)
  emit('update:visible', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="emit('update:visible', false)">
        <div class="forward-dialog">
          <div class="dialog-header">
            <span>转发到</span>
            <button class="close-btn" @click="emit('update:visible', false)">×</button>
          </div>
          <div class="dialog-search">
            <SearchInput v-model="keyword" placeholder="搜索联系人或群组" />
          </div>
          <div class="dialog-list">
            <div
              v-for="conv in filteredConversations"
              :key="conv.id"
              class="forward-item"
              @click="handleSelect(conv)"
            >
              <TextAvatar
                :name="getName(conv)"
                :src="getAvatar(conv)"
                :avatar-type="getAvatarType(conv)"
                :size="36"
              />
              <span class="forward-name">{{ getName(conv) }}</span>
            </div>
            <div v-if="filteredConversations.length === 0" class="empty">无匹配结果</div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.forward-dialog {
  width: 360px;
  max-height: 500px;
  background: #fff;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  font-size: 15px;
  font-weight: 500;

  .close-btn {
    background: none;
    border: none;
    font-size: 20px;
    color: #999;
    cursor: pointer;
    &:hover { color: #333; }
  }
}

.dialog-search { padding: 0 8px 8px; }

.dialog-list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 8px;
}

.forward-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px;
  cursor: pointer;
  &:hover { background: #f2f3f5; }
}

.forward-name {
  font-size: 14px;
  color: #333;
}

.empty {
  text-align: center;
  padding: 24px;
  color: #ccc;
  font-size: 13px;
}

.modal-enter-active, .modal-leave-active { transition: all 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
