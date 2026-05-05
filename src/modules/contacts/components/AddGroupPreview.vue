<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/useUIStore'
import { useChatStore } from '@/stores/useChatStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { groupJoin } from '@/api/imBase'
import TextAvatar from '@/components/TextAvatar.vue'
import emptyBrandImg from '@/assets/images/login/dock.png'

const uiStore = useUIStore()
const chatStore = useChatStore()
const groupStore = useGroupStore()
const { t } = useI18n()

const joining = ref(false)
const joinedApplied = ref(false)
const tipText = ref('')
const tipType = ref<'success' | 'error'>('success')

const target = computed(() => uiStore.addGroupTarget)
const joinedGroup = computed(() => {
  const id = target.value?.id
  return id ? groupStore.getGroup(id) : undefined
})
const displayName = computed(() => joinedGroup.value?.name || target.value?.name || target.value?.id || '')
const memberCount = computed(() => joinedGroup.value?.memberCount || target.value?.memberCount || 0)
const joinDisabled = computed(() => !target.value || joining.value || joinedApplied.value)
const buttonText = computed(() => {
  if (joinedGroup.value) return t('发送消息')
  if (joinedApplied.value) return t('已提交申请入群')
  if (joining.value) return t('加入中...')
  return t('加入群聊')
})

watch(target, () => {
  joining.value = false
  joinedApplied.value = false
  tipText.value = ''
  tipType.value = 'success'
})

function openGroupChat() {
  const id = target.value?.id
  if (!id) return
  const conv = chatStore.ensureConversation(1, id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
}

function showTip(message: string, type: 'success' | 'error') {
  tipText.value = message
  tipType.value = type
}

async function handleJoinGroup() {
  const current = target.value
  if (!current || joinDisabled.value) return

  if (joinedGroup.value) {
    openGroupChat()
    return
  }

  joining.value = true
  tipText.value = ''

  try {
    const resp = await groupJoin({
      groupId: current.id,
      reqType: 15,
      addToken: current.addToken,
      msg: '申请加入群聊',
    })
    const common = (resp as any).commonResult || {}
    const errCode = Number(common.errCode ?? 0)
    if (errCode !== 200 && errCode !== 0) {
      showTip(common.errMsg || (resp as any).errorDesc || t('加入群聊失败'), 'error')
      return
    }

    if (current.bfJoinCheck) {
      joinedApplied.value = true
      showTip(t('已提交申请入群'), 'success')
      return
    }

    groupStore.upsertGroup({
      id: current.id,
      name: current.name || current.id,
      avatar: current.avatar,
      memberCount: current.memberCount,
      groupAliasName: current.groupAliasName,
      ownerId: current.ownerId,
    })
    showTip(t('加入群聊成功'), 'success')
    openGroupChat()
  } catch (error) {
    console.error('[AddGroupPreview] join failed:', error)
    showTip(t('加入群聊失败'), 'error')
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div class="add-group-preview">
    <div v-if="target" class="preview-inner">
      <TextAvatar
        :name="displayName"
        :src="target.avatar"
        avatar-type="group"
        :size="108"
        rounded
      />
      <div class="preview-name">{{ displayName }}</div>
      <div class="preview-count">{{ t('群成员共{value}人', { value: memberCount }) }}</div>
      <button type="button" class="primary-btn" :disabled="joinDisabled" @click="handleJoinGroup">
        {{ buttonText }}
      </button>
      <div v-if="tipText" class="join-tip" :class="`tip-${tipType}`">{{ tipText }}</div>
    </div>

    <div v-else class="empty-state">
      <img :src="emptyBrandImg" alt="" class="empty-brand-icon" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.add-group-preview {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #fff;
}

.preview-inner {
  padding-top: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}

.preview-name {
  max-width: 360px;
  margin-top: 16px;
  font-size: 24px;
  line-height: 34px;
  color: #000;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-count {
  margin-top: 5px;
  padding: 2px 12px;
  border-radius: 999px;
  background: #f3f3f3;
  color: #999;
  font-size: 12px;
  line-height: 18px;
}

.primary-btn {
  width: 256px;
  height: 38px;
  margin-top: 28px;
  padding: 0 28px;
  border: 1px solid #3369fe;
  border-radius: 4px;
  background-color: #3369fe;
  color: #fff;
  font-size: 14px;
  line-height: 36px;
  text-align: center;
  cursor: pointer;

  &:hover {
    background-color: rgba(51, 105, 254, 0.9);
  }

  &:disabled {
    opacity: 0.65;
    cursor: default;
  }
}

.join-tip {
  max-width: 360px;
  margin-top: 12px;
  font-size: 13px;
  line-height: 20px;
  text-align: center;
}

.tip-success {
  color: #52c41a;
}

.tip-error {
  color: #f56c6c;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-brand-icon {
  width: 160px;
  height: auto;
  display: block;
  border-radius: 8px;
}
</style>
