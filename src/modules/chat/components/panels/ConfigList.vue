<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/useChatStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUIStore } from '@/stores/useUIStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useI18n } from 'vue-i18n'
import { ConversationType } from '@/types'
import AppSwitch from '@/components/AppSwitch.vue'
import RadioSelectDialog from '@/components/RadioSelectDialog.vue'

const chatStore = useChatStore()
const authStore = useAuthStore()
const uiStore = useUIStore()
const messageStore = useMessageStore()
const { t } = useI18n()
const conv = computed(() => chatStore.currentConversation)

const isGroup = computed(() => conv.value?.type === ConversationType.Group)
const isChannel = computed(() => conv.value?.type === ConversationType.Channel)
const clearMsgTypeList = ref<string[]>([])

async function togglePin() {
  if (!conv.value) return
  await chatStore.pinConversation(authStore.uid, conv.value.id, !conv.value.isPinned)
}

async function toggleMute() {
  if (!conv.value) return
  await chatStore.muteConversation(authStore.uid, conv.value.id, !conv.value.isMuted)
}

function openGroupNotice() {
  uiStore.setRightPanel('group-notice')
}

function openClearDialog() {
  if (!conv.value) return
  if (isGroup.value) {
    clearMsgTypeList.value = [
      t('仅清空本地聊天记录'),
      t('清空本地和所有成员设备的聊天记录'),
    ]
  } else if (isChannel.value) {
    clearMsgTypeList.value = [
      t('仅清空本地聊天记录'),
      t('清空本地和对方设备的聊天记录'),
    ]
  } else {
    clearMsgTypeList.value = [
      t('仅清空本地聊天记录'),
      t('清空本地和对方设备的聊天记录'),
    ]
  }
}

async function handleClearSubmit(index: number) {
  if (index === -1 || !conv.value) {
    clearMsgTypeList.value = []
    return
  }
  const isRemoteDeletion = index === 1
  const conversationId = conv.value.id
  const conversationSnapshot = { ...conv.value }
  try {
    await messageStore.clearConversationHistory(conversationId, isRemoteDeletion)
    // 通用设置入口同样只清消息内容，不删除会话；补回当前项并保持原列表位置。
    chatStore.addOrUpdateConversation({
      ...conversationSnapshot,
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
    console.error('[ConfigList] clear conversation failed:', error)
  }
  clearMsgTypeList.value = []
}
</script>

<template>
  <div class="config-list" v-if="conv">
    <div class="config-section">
      <div class="config-item">
        <span>{{ t('置顶聊天') }}</span>
        <AppSwitch :model-value="conv.isPinned" @update:model-value="togglePin" />
      </div>
      <div class="config-item">
        <span>{{ t('消息免打扰') }}</span>
        <AppSwitch :model-value="conv.isMuted" @update:model-value="toggleMute" />
      </div>
    </div>
    <div v-if="conv.type === 1" class="config-section">
      <div class="config-item clickable" @click="openGroupNotice">
        <span>{{ t('群公告') }}</span>
        <span class="arrow">›</span>
      </div>
      <div class="config-item clickable" @click="uiStore.setRightPanel('group-manage')">
        <span>{{ t('群管理') }}</span>
        <span class="arrow">›</span>
      </div>
    </div>
    <div class="config-section">
      <div class="config-item clickable">
        <span>{{ t('查找聊天记录') }}</span>
        <span class="arrow">›</span>
      </div>
    </div>
    <div class="config-section clear-section">
      <div class="config-item clickable danger" @click="openClearDialog">
        <span>{{ t('清空聊天记录') }}</span>
      </div>
    </div>

    <RadioSelectDialog
      v-if="clearMsgTypeList.length > 0"
      :title="t('请选择清空类型')"
      :radio-text-list="clearMsgTypeList"
      @submit="handleClearSubmit"
    />
  </div>
</template>

<style lang="scss" scoped>
.config-list {
  padding: 8px 0;
}

.config-section {
  border-bottom: 8px solid #f5f5f5;
  padding: 4px 0;

  &:last-child { border-bottom: none; }
}

.config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 16px;
  font-size: 14px;
  color: #333;

  &.clickable {
    cursor: pointer;
    &:hover { background: #f5f5f5; }
  }

  &.danger {
    color: #f44e5a;
    justify-content: flex-start;
  }
}

.arrow {
  color: #c0c4cc;
  font-size: 18px;
}
</style>
