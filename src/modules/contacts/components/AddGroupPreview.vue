<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/useUIStore'
import { useChatStore } from '@/stores/useChatStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { groupJoin } from '@/api/imBase'
import TextAvatar from '@/components/TextAvatar.vue'
import Toast from '@/components/Toast.vue'
import emptyBrandImg from '@/assets/images/common/defalut-icon.png'
import closeIcon from '@/assets/images/common/close-icon.png'

const props = withDefaults(defineProps<{
  mode?: 'page' | 'dialog'
  visible?: boolean
}>(), {
  mode: 'page',
  visible: true,
})

const emit = defineEmits<{
  close: []
}>()

const uiStore = useUIStore()
const chatStore = useChatStore()
const groupStore = useGroupStore()
const { t } = useI18n()

const joining = ref(false)
const joinedApplied = ref(false)
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')

const target = computed(() => uiStore.addGroupTarget)
const isDialog = computed(() => props.mode === 'dialog')
const joinedGroup = computed(() => {
  const id = target.value?.id
  return id ? groupStore.getGroup(id) : undefined
})
const displayName = computed(() => joinedGroup.value?.name || target.value?.name || target.value?.id || '')
const memberCount = computed(() => joinedGroup.value?.memberCount || target.value?.memberCount || 0)
const joinDisabled = computed(() => !target.value || joining.value)
const buttonText = computed(() => {
  if (joinedGroup.value) return t('发送消息')
  if (joining.value) return t('加入中...')
  return t('加入群聊')
})

watch(target, () => {
  joining.value = false
  joinedApplied.value = false
  toastVisible.value = false
  toastMessage.value = ''
  toastType.value = 'success'
})

function openGroupChat() {
  const id = target.value?.id
  if (!id) return
  const conv = chatStore.ensureConversation(1, id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
  closeDialog()
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

function closeDialog() {
  if (!isDialog.value) return
  emit('close')
}

async function handleJoinGroup() {
  const current = target.value
  if (!current || joining.value) return

  if (joinedGroup.value) {
    openGroupChat()
    return
  }

  if (joinedApplied.value) {
    showToast(t('入群审核中，您无法重复操作'), 'error')
    return
  }

  joining.value = true
  toastVisible.value = false

  try {
    const resp = await groupJoin({
      groupId: current.id,
      reqType: current.joinSource === 'link' ? 2 : 15,
      addToken: current.addToken,
      msg: '申请加入群聊',
    })
    const common = (resp as any).commonResult || {}
    const errCode = Number(common.errCode ?? 0)
    if (errCode !== 200 && errCode !== 0) {
      showToast(common.errMsg || (resp as any).errorDesc || t('加入群聊失败'), 'error')
      return
    }

    if (current.bfJoinCheck) {
      joinedApplied.value = true
      showToast(t('已提交申请入群'), 'success')
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
    showToast(t('加入群聊成功'), 'success')
    openGroupChat()
  } catch (error) {
    console.error('[AddGroupPreview] join failed:', error)
    showToast(t('加入群聊失败'), 'error')
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div
    v-if="visible"
    :class="['add-group-preview', { 'is-dialog': isDialog }]"
    @click.self="closeDialog"
  >
    <div :class="isDialog ? 'dialog-card' : 'preview-card'">
      <button v-if="isDialog" type="button" class="dialog-close" @click="closeDialog">
        <img :src="closeIcon" alt="" />
      </button>

      <div v-if="target" class="preview-inner">
        <TextAvatar
          :name="displayName"
          :src="target.avatar"
          avatar-type="group"
          :size="isDialog ? 62 : 108"
          rounded
        />
        <div class="preview-name">{{ displayName }}</div>
        <div class="preview-count">{{ t('群成员共{value}人', { value: memberCount }) }}</div>
        <button type="button" class="primary-btn" :disabled="joinDisabled" @click="handleJoinGroup">
          {{ buttonText }}
        </button>
      </div>

      <div v-else class="empty-state">
        <img :src="emptyBrandImg" alt="" class="empty-brand-icon" />
      </div>
    </div>

    <Toast
      :visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
      @update:visible="toastVisible = $event"
    />
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

.preview-card {
  width: 100%;
  height: 100%;
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

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-brand-icon {
  width: 144px;
  height: auto;
  display: block;
}

.add-group-preview.is-dialog {
  position: fixed;
  inset: 0;
  z-index: 2200;
  flex: none;
  width: 100%;
  height: 100%;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

.dialog-card {
  position: relative;
  width: min(420px, calc(100vw - 40px));
  min-height: 236px;
  box-sizing: border-box;
  border-radius: 8px;
  background: #fff;

  .preview-inner {
    padding: 26px 20px 30px;
  }

  .preview-name {
    max-width: 360px;
    margin-top: 10px;
    font-size: 16px;
    line-height: 22px;
    font-weight: 600;
    color: #333;
  }

  .preview-count {
    margin-top: 10px;
    padding: 0;
    border-radius: 0;
    background: transparent;
    color: #999;
    font-size: 12px;
    line-height: 17px;
  }

  .primary-btn {
    width: 206px;
    height: 32px;
    margin-top: 32px;
    padding: 0;
    border: 0;
    font-size: 14px;
    line-height: 32px;

    &:hover {
      opacity: 0.8;
      background: #3369fe;
    }
  }

}

.dialog-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 30px;
  height: 30px;
  border: 0;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    opacity: 0.8;
  }

  > img {
    display: block;
  }
}
</style>
