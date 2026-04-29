<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUIStore } from '@/stores/useUIStore'
import { useChatStore } from '@/stores/useChatStore'
import { contactsRelation } from '@/api/imBase'
import TextAvatar from '@/components/TextAvatar.vue'
import emptyBrandImg from '@/assets/images/login/dock.png'
import closeIcon from '@/assets/images/common/close-icon.png'

const authStore = useAuthStore()
const uiStore = useUIStore()
const chatStore = useChatStore()

const sending = ref(false)
const sent = ref(false)
const sendFailed = ref(false)
const verifyVisible = ref(false)
const verifyMessage = ref('')

const target = computed(() => uiStore.addContactTarget)
const displayName = computed(() => target.value?.nickname || target.value?.uid || '')
const isOwn = computed(() => target.value?.uid === authStore.uid)
const addDisabled = computed(() => !target.value || sending.value || sent.value)
const buttonText = computed(() => {
  if (target.value?.isFriend) return '发送消息'
  if (sent.value) return '已发送'
  if (sending.value) return '添加中...'
  return '添加'
})

watch(target, () => {
  sending.value = false
  sent.value = false
  sendFailed.value = false
  verifyVisible.value = false
  verifyMessage.value = ''
})

watch(verifyMessage, (value) => {
  if (value.length <= 20) return
  let next = value.slice(0, 20)
  const lastCode = next.charCodeAt(next.length - 1)
  if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
    next = next.slice(0, -1)
  }
  verifyMessage.value = next
})

function defaultVerifyMessage() {
  return `我是${authStore.nickname || authStore.uid || ''}`
}

function handleAdd() {
  if (!target.value || addDisabled.value) return
  if (target.value.isFriend) {
    handleToFriendChat()
    return
  }
  verifyMessage.value = defaultVerifyMessage()
  sendFailed.value = false
  verifyVisible.value = true
}

function handleToFriendChat() {
  const uid = target.value?.uid
  if (!uid) return
  const conv = chatStore.ensureConversation(0, uid)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
}

function handleCloseVerify() {
  if (sending.value) return
  verifyVisible.value = false
  sendFailed.value = false
}

async function handleConfirmAdd() {
  const current = target.value
  if (!current || addDisabled.value) return

  const targetUid = Number(current.uid)
  if (!Number.isFinite(targetUid)) {
    sendFailed.value = true
    return
  }

  sending.value = true
  sendFailed.value = false

  try {
    const resp = await contactsRelation({
      targetUid,
      msg: verifyMessage.value.trim() || defaultVerifyMessage(),
      type: 0,
      op: 0,
      addToken: current.addToken,
    })
    const errCode = (resp as any).commonResult?.errCode
    sent.value = errCode === 200 || errCode === 0
    sendFailed.value = !sent.value
    if (sent.value) {
      verifyVisible.value = false
    }
  } catch (error) {
    console.error('[AddContactPreview] add failed:', error)
    sendFailed.value = true
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="add-contact-preview">
    <div v-if="target" class="preview-inner">
      <TextAvatar
        :name="displayName"
        :src="target.avatar"
        :size="108"
        rounded
      />
      <div class="preview-name">{{ displayName }}</div>
      <button v-if="!isOwn" type="button" class="add-btn" :disabled="addDisabled" @click="handleAdd">
        {{ buttonText }}
      </button>
      <div v-if="sendFailed" class="send-tip">添加失败，请稍后重试</div>
    </div>

    <div v-else class="empty-state">
      <img :src="emptyBrandImg" alt="" class="empty-brand-icon" />
    </div>

    <Teleport to="body">
      <div v-if="verifyVisible" class="verify-overlay">
        <div class="verify-dialog">
          <div class="verify-header">
            <span class="verify-title">添加验证</span>
            <button type="button" class="verify-close" :disabled="sending" @click="handleCloseVerify">
              <img :src="closeIcon" alt="" />
            </button>
          </div>
          <textarea
            v-model="verifyMessage"
            class="verify-textarea"
            rows="4"
            maxlength="20"
            :disabled="sending"
          />
          <button type="button" class="verify-submit" :disabled="sending" @click="handleConfirmAdd">
            {{ sending ? '发送中...' : '完成' }}
          </button>
          <div v-if="sendFailed" class="verify-error">添加失败，请稍后重试</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.add-contact-preview {
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

.add-btn {
  width: 256px;
  height: 32px;
  margin-top: 20px;
  padding: 0 28px;
  border: 1px solid #3369fe;
  border-radius: 4px;
  background-color: #3369fe;
  color: #fff;
  font-size: 12px;
  line-height: 32px;
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

.send-tip {
  margin-top: 10px;
  font-size: 12px;
  line-height: 18px;
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

.verify-overlay {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

.verify-dialog {
  width: 300px;
  border-radius: 6px;
  padding: 16px;
  box-sizing: border-box;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.verify-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #787878;
  font-size: 16px;
}

.verify-title {
  font-size: 16px;
  line-height: 22px;
  color: #787878;
}

.verify-close {
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;

  img {
    width: 100%;
    height: 100%;
    display: block;
  }

  &:disabled {
    cursor: default;
    opacity: 0.45;
  }
}

.verify-textarea {
  width: 100%;
  height: 100px;
  margin-top: 26px;
  padding: 8px;
  border: none;
  outline: none;
  resize: none;
  box-sizing: border-box;
  background: #F5F6FA;
  border-radius: 2px;
  color: #000;
  font-size: 13px;
  line-height: 20px;
  font-family: inherit;
}

.verify-submit {
  width: 100%;
  height: 32px;
  margin-top: 32px;
  padding: 0 28px;
  border: 1px solid #3369fe;
  border-radius: 4px;
  background-color: #3369fe;
  color: #fff;
  font-size: 12px;
  line-height: 32px;
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

.verify-error {
  margin-top: 8px;
  font-size: 12px;
  line-height: 16px;
  color: #f56c6c;
  text-align: center;
}
</style>
