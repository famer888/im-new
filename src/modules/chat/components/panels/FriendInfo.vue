<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppSwitch from '@/components/AppSwitch.vue'
import TextAvatar from '@/components/TextAvatar.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import RadioSelectDialog from '@/components/RadioSelectDialog.vue'
import Toast from '@/components/Toast.vue'
import { contactsRelation, getContactsDetail, updateBlackContacts, updateContacts } from '@/api/imBase'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore, FILE_HELPER_TARGET_ID } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useUIStore } from '@/stores/useUIStore'
import { useI18n } from 'vue-i18n'
import { proto } from '@/api/request'
import { READ_BURN_TIME_OPTIONS } from '@/utils/readBurn'
import choiceIcon from '@/assets/images/setting/choice-icon.png'

const authStore = useAuthStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const messageStore = useMessageStore()
const uiStore = useUIStore()
const { t } = useI18n()

const conv = computed(() => chatStore.currentConversation)
const contact = computed(() => (conv.value ? contactStore.getContact(conv.value.targetId) : undefined))

const readBurn = ref(false)
const msgCancelTime = ref(30)
const inBlacklist = ref(false)
const working = ref(false)
const showTimeMenu = ref(false)
const blacklistConfirmVisible = ref(false)
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

function formatReadBurnNotice(seconds: number, enabled: boolean) {
  const name = t('你')
  if (!enabled) return `${name}${t('关闭了阅后即焚')}`
  let timeText = ''
  if (seconds < 60) timeText = `${seconds}${t('秒')}`
  else if (seconds < 3600) timeText = `${seconds / 60}${t('分钟')}`
  else if (seconds < 86400) timeText = `${seconds / 3600}${t('小时')}`
  else timeText = `${seconds / 86400}${t('天')}`
  return `${name} ${t('设置了消息已读XX后销毁').replace('XX', timeText)}`
}

function appendReadBurnNotice(seconds: number, enabled: boolean) {
  if (!conv.value) return
  messageStore.appendLocalSystemNotice(conv.value.id, formatReadBurnNotice(seconds, enabled))
}

watch(contact, async (nextContact) => {
  readBurn.value = Boolean(nextContact?.bfReadCancel)
  inBlacklist.value = Boolean(nextContact?.bfMyBlack)
  if (!nextContact) return
  try {
    const resp = await getContactsDetail({ targetUid: Number(nextContact.id) })
    const detail = (resp as any).contactsDetailBase
    if (!detail) return
    const patch: Partial<typeof nextContact> = {
      bfReadCancel: Boolean(detail.bfReadCancel),
      bfMyBlack: Boolean(detail.bfMyBlack),
      msgCancelTime: Number(detail.msgCancelTime || 30),
    }
    contactStore.patchContact(nextContact.id, patch)
  } catch {
    // ignore details failures, use current in-memory state
  }
}, { immediate: true })

watch(contact, (nextContact) => {
  readBurn.value = Boolean(nextContact?.bfReadCancel)
  msgCancelTime.value = Number(nextContact?.msgCancelTime || 30)
  inBlacklist.value = Boolean(nextContact?.bfMyBlack)
})

async function copyId() {
  if (!contact.value?.id) return
  try {
    await navigator.clipboard.writeText(contact.value.id)
  } catch {
    // ignore clipboard failure
  }
}

async function togglePin() {
  if (!conv.value) return
  await chatStore.pinConversation(authStore.uid, conv.value.id, !conv.value.isPinned)
}

async function toggleMute() {
  if (!conv.value) return
  await chatStore.muteConversation(authStore.uid, conv.value.id, !conv.value.isMuted)
}

async function toggleReadBurn() {
  if (!contact.value || working.value) return
  working.value = true
  const next = !readBurn.value
  try {
    await updateContacts({
      op: proto.ContactsOperator.READ_CANCEL,
      param: {
        contactsId: Number(contact.value.id),
        bfReadCancel: next,
        msgCancelTime: msgCancelTime.value,
      },
    })
    readBurn.value = next
    contactStore.patchContact(contact.value.id, {
      bfReadCancel: next,
      msgCancelTime: msgCancelTime.value,
    })
    appendReadBurnNotice(msgCancelTime.value, next)
  } finally {
    working.value = false
  }
}

async function updateReadBurnTime(seconds: number) {
  if (!contact.value || working.value) return
  working.value = true
  try {
    await updateContacts({
      op: proto.ContactsOperator.READ_CANCEL_TIME,
      param: {
        contactsId: Number(contact.value.id),
        msgCancelTime: seconds,
      },
    })
    msgCancelTime.value = seconds
    contactStore.patchContact(contact.value.id, { msgCancelTime: seconds })
    appendReadBurnNotice(seconds, true)
  } finally {
    working.value = false
    showTimeMenu.value = false
  }
}

function handleOpenTimeMenu(e: MouseEvent) {
  e.stopPropagation()
  if (!readBurn.value) return
  showTimeMenu.value = !showTimeMenu.value
}

function handleOutsideClick() {
  if (showTimeMenu.value) showTimeMenu.value = false
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
})

const blacklistConfirmContent = computed(() =>
  inBlacklist.value
    ? '确认移除黑名单吗'
    : '加入黑名单后，你将不再接收到对方的任何消息',
)

function handleBlacklistToggle() {
  if (!contact.value || working.value) return
  blacklistConfirmVisible.value = true
}

async function confirmBlacklist() {
  if (!contact.value || working.value) return
  const next = !inBlacklist.value
  working.value = true
  try {
    const res = await updateBlackContacts({
      targetUid: Number(contact.value.id),
      op: next ? 6 : 7,
    })
    const { errCode } = (res as any)?.commonResult || {}
    if (errCode == 200) {
      inBlacklist.value = next
      contactStore.patchContact(contact.value.id, { bfMyBlack: next })
      showToast(next ? '加入成功' : '移除成功')
    } else {
      const errorDesc = (res as any)?.errorDesc
      if (errorDesc) showToast(errorDesc, 'error')
    }
  } finally {
    working.value = false
  }
}

const clearMsgTypeList = ref<string[]>([])

const isFileHelper = computed(() => conv.value?.targetId === FILE_HELPER_TARGET_ID)

function openClearDialog() {
  if (!conv.value) return
  if (isFileHelper.value) {
    clearMsgTypeList.value = [t('仅清空本地聊天记录')]
  } else {
    clearMsgTypeList.value = [
      t('仅清空本地聊天记录'),
      t('清空本地和对方设备的聊天记录'),
    ]
  }
}

function handleClearSubmit(index: number) {
  if (index === -1 || !conv.value) {
    clearMsgTypeList.value = []
    return
  }
  const isRemoteDeletion = index === 1
  messageStore.clearConversationMessages(conv.value.id)
  chatStore.updateConversation({
    id: conv.value.id,
    lastMsgDigest: null,
    lastMsgId: null,
    unreadCount: 0,
  })
  if (isRemoteDeletion && contact.value) {
    import('@/api/request').then(({ proto: p }) => {
      const targetId = Number(contact.value!.id)
      const reqData = {
        msgId: -1,
        msgTargetId: targetId,
        clear: 1,
        clearTime: Date.now(),
      }
      console.log('[FriendInfo] remote clear request:', reqData)
    })
  }
  clearMsgTypeList.value = []
}

async function deleteContactItem() {
  if (!contact.value) return
  const targetId = contact.value.id
  await contactsRelation({
    targetUid: Number(targetId),
    msg: '',
    op: 1,
  })
  contactStore.removeContact(targetId)
  if (conv.value) {
    await chatStore.deleteConversation(authStore.uid, conv.value.id)
  }
  uiStore.setRightPanel('none')
}
</script>

<template>
  <div class="friend-info" v-if="contact && conv">
    <div class="profile">
      <TextAvatar
        :name="contact.nickname || contact.id"
        :src="contact.avatar"
        :size="45"
        rounded
      />
      <div class="profile-text">
        <h2>{{ contact.remark || contact.nickname || contact.id }}</h2>
        <p>
          ID: {{ contact.id }}
          <span class="copy-btn" @click="copyId">复制</span>
        </p>
      </div>
    </div>

    <ul class="config-list">
      <li>
        <span>置顶聊天</span>
        <AppSwitch :model-value="conv.isPinned" @update:model-value="togglePin" />
      </li>
      <li>
        <span>消息免打扰</span>
        <AppSwitch :model-value="conv.isMuted" @update:model-value="toggleMute" />
      </li>
      <li>
        <span>阅后即焚</span>
        <AppSwitch :model-value="readBurn" @update:model-value="toggleReadBurn" />
      </li>
      <li v-if="readBurn">
        <span>消息销毁时间</span>
        <div class="select" @click="handleOpenTimeMenu">
          {{ READ_BURN_TIME_OPTIONS.find((item) => item.value === msgCancelTime)?.label || '30秒' }}
          <img :src="choiceIcon" alt="" />
        </div>
        <div v-if="showTimeMenu" class="menuTimeList" @click.stop>
          <div
            v-for="item in READ_BURN_TIME_OPTIONS"
            :key="item.value"
            class="menu-item"
            @click="updateReadBurnTime(item.value)"
          >
            {{ item.label }}
          </div>
        </div>
      </li>
      <li>
        <span>加入黑名单</span>
        <AppSwitch :model-value="inBlacklist" @update:model-value="handleBlacklistToggle" />
      </li>
      <li class="danger friend-left" @click="openClearDialog">清空聊天记录</li>
      <li class="danger friend-left" @click="deleteContactItem">删除联系人</li>
    </ul>

    <ConfirmDialog
      v-model:visible="blacklistConfirmVisible"
      variant="im"
      :content="blacklistConfirmContent"
      @confirm="confirmBlacklist"
    />

    <RadioSelectDialog
      v-if="clearMsgTypeList.length > 0"
      :title="t('请选择清空类型')"
      :radio-text-list="clearMsgTypeList"
      @submit="handleClearSubmit"
    />

    <Toast
      v-model:visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
    />
  </div>
</template>

<style lang="scss" scoped>
.friend-info {
  display: flex;
  flex-direction: column;
}

.profile {
  position: relative;
  padding: 0 10px 4px 60px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-height: 55px;

  :deep(.text-avatar),
  :deep(img) {
    position: absolute;
    left: 10px;
    width: 45px;
    height: 45px;
  }
}

.profile-text {
  width: 100%;

  h2 {
    margin: 0;
    line-height: 25px;
    font-size: 16px;
    font-weight: 700;
    color: #333;
  }

  p {
    margin: 0;
    width: 100%;
    display: flex;
    align-items: center;
    font-size: 12px;
    color: #333;
  }
}

.copy-btn {
  background: #326aff;
  color: #fff;
  width: 36px;
  height: 20px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  margin-left: 10px;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }
}

.config-list {
  padding: 10px 0;
  margin: 0;
  border-top: 10px solid #f5f5f5;

  li {
    list-style: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 35px;
    padding: 0 10px;
    font-size: 14px;
    color: #333;
    position: relative;
  }
}

.select {
  display: inline-flex;
  align-items: center;
  cursor: pointer;

  img {
    width: 12px;
    margin-left: 6px;
  }
}

.menuTimeList {
  position: absolute;
  right: 10px;
  top: 100%;
  margin-top: 2px;
  background: #fff;
  border: 1px solid #e6e6e6;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  z-index: 12;

  .menu-item {
    min-width: 72px;
    height: 30px;
    line-height: 30px;
    padding: 0 10px;
    text-align: left;
    cursor: pointer;
    color: #333;

    &:hover {
      background: #f5f5f5;
    }
  }
}

.danger {
  color: #f44e5a !important;
  cursor: pointer;
}

.friend-left {
  justify-content: flex-start !important;
}
</style>
