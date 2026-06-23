<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppSwitch from '@/components/AppSwitch.vue'
import TextAvatar from '@/components/TextAvatar.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import RadioSelectDialog from '@/components/RadioSelectDialog.vue'
import Toast from '@/components/Toast.vue'
import { contactsRelation, updateBlackContacts, updateContacts } from '@/api/imBase'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore, isFileHelperTargetId } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useUIStore } from '@/stores/useUIStore'
import { useI18n } from 'vue-i18n'
import { proto } from '@/api/request'
import { writeClipboardText } from '@/utils/clipboard'
import { DEFAULT_READ_BURN_SECONDS, READ_BURN_TIME_OPTIONS } from '@/utils/readBurn'
import choiceIcon from '@/assets/images/setting/choice-icon.png'

const authStore = useAuthStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const messageStore = useMessageStore()
const uiStore = useUIStore()
const { t, locale } = useI18n()

/** 与 READ_BURN_TIME_OPTIONS 数值一致，文案走 i18n */
function readBurnDurationLabel(seconds: number): string {
  switch (seconds) {
    case 5: return `5${t('秒')}`
    case 10: return `10${t('秒')}`
    case 30: return `30${t('秒')}`
    case 60: return `1${t('分钟')}`
    case 3600: return `1${t('小时')}`
    case 21600: return `6${t('小时')}`
    case 43200: return `12${t('小时')}`
    case 86400: return `1${t('天')}`
    case 259200: return `3${t('天')}`
    case 604800: return `7${t('天')}`
    default: return `5${t('秒')}`
  }
}

const readBurnTimeOptions = computed(() => {
  void locale.value
  return READ_BURN_TIME_OPTIONS.map((o) => ({
    value: o.value,
    label: readBurnDurationLabel(o.value),
  }))
})

const currentReadBurnLabel = computed(() => readBurnDurationLabel(msgCancelTime.value))

const conv = computed(() => chatStore.currentConversation)
const contact = computed(() => (conv.value ? contactStore.getContact(conv.value.targetId) : undefined))
// 对齐旧 im `friend-info.vue`：右侧资料面板直接显示 chatContent.identify，不兜底 uid。
const displayId = computed(() => String(contact.value?.identify || '').trim())

const readBurn = ref(false)
const msgCancelTime = ref(DEFAULT_READ_BURN_SECONDS)
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

watch(
  () => contact.value?.id,
  (contactId) => {
    if (!contactId) return
    // The same contact can be updated from mobile while PC keeps a stale cached detail.
    // Refresh on panel entry so relation toggles such as blacklist match the server.
    void contactStore.ensureContactDetailLoaded(contactId, { force: true })
  },
  { immediate: true },
)

watch(
  () => [contact.value?.bfReadCancel, contact.value?.msgCancelTime, contact.value?.bfMyBlack],
  ([nextReadBurn, nextMsgCancelTime, nextInBlacklist]) => {
    readBurn.value = Boolean(nextReadBurn)
    msgCancelTime.value = Number(nextMsgCancelTime || DEFAULT_READ_BURN_SECONDS)
    inBlacklist.value = Boolean(nextInBlacklist)
  },
  { immediate: true },
)

async function copyId() {
  if (!displayId.value) return
  try {
    await writeClipboardText(`@${displayId.value} `)
    showToast(t('复制成功'))
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
  const targetContactId = contact.value.id
  const next = !readBurn.value
  const previous = readBurn.value
  const previousSeconds = msgCancelTime.value
  const nextSeconds = previousSeconds
  readBurn.value = next
  msgCancelTime.value = nextSeconds
  if (!next) showTimeMenu.value = false
  contactStore.patchContact(targetContactId, {
    bfReadCancel: next,
    msgCancelTime: nextSeconds,
  })
  try {
    const res = await updateContacts({
      op: proto.ContactsOperator.READ_CANCEL,
      param: {
        contactsId: Number(targetContactId),
        bfReadCancel: next,
        msgCancelTime: nextSeconds,
      },
    })
    const errCode = Number((res as any)?.commonResult?.errCode || 200)
    if (errCode !== 200) {
      throw new Error((res as any)?.commonResult?.errMsg || (res as any)?.errorDesc || t('操作失败'))
    }
  } catch (error) {
    readBurn.value = previous
    msgCancelTime.value = previousSeconds
    contactStore.patchContact(targetContactId, {
      bfReadCancel: previous,
      msgCancelTime: previousSeconds,
    })
    showToast((error as Error)?.message || t('操作失败'), 'error')
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
  } finally {
    working.value = false
    showTimeMenu.value = false
  }
}

function handleOpenTimeMenu(e: MouseEvent) {
  e.stopPropagation()
  if (!readBurn.value || working.value) return
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

const blacklistConfirmContent = computed(() => {
  void locale.value
  return inBlacklist.value
    ? t('确认移除黑名单吗')
    : t('加入黑名单后，你将不再接收到对方的任何消息')
})

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
      showToast(next ? t('加入成功') : t('移除成功'))
    } else {
      const errorDesc = (res as any)?.errorDesc
      if (errorDesc) showToast(errorDesc, 'error')
    }
  } finally {
    working.value = false
  }
}

const clearMsgTypeList = ref<string[]>([])
const deleteConfirmVisible = ref(false)

const isFileHelper = computed(() => isFileHelperTargetId(conv.value?.targetId))

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

async function handleClearSubmit(index: number) {
  if (index === -1 || !conv.value) {
    clearMsgTypeList.value = []
    return
  }
  const isRemoteDeletion = index === 1
  const conversationId = conv.value.id
  const friendConversation = { ...conv.value }
  try {
    await messageStore.clearConversationHistory(conversationId, isRemoteDeletion)
    // 清空单聊消息只清内容，不删除会话；补回并保持选中，避免摘要刷新后左侧像被移除。
    chatStore.addOrUpdateConversation({
      ...friendConversation,
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
    console.error('[FriendInfo] clear conversation failed:', error)
    showToast(t('操作失败'), 'error')
  } finally {
    clearMsgTypeList.value = []
  }
}

function openDeleteConfirm() {
  deleteConfirmVisible.value = true
}

async function confirmDeleteContact() {
  if (!contact.value || working.value) return
  working.value = true
  try {
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
    showToast(t('删除成功'))
  } catch (error) {
    showToast((error as Error)?.message || t('删除失败'), 'error')
  } finally {
    working.value = false
  }
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
        <p class="id-row">
          <span class="id-line">{{ t('ID：') }}{{ displayId }}</span>
          <button type="button" class="copy-btn" @click="copyId">{{ t('复制') }}</button>
        </p>
      </div>
    </div>

    <ul class="config-list">
      <li>
        <span>{{ t('置顶聊天') }}</span>
        <AppSwitch :model-value="conv.isPinned" @update:model-value="togglePin" />
      </li>
      <li>
        <span>{{ t('消息免打扰') }}</span>
        <AppSwitch :model-value="conv.isMuted" @update:model-value="toggleMute" />
      </li>
      <li>
        <span>{{ t('阅后即焚') }}</span>
        <AppSwitch :model-value="readBurn" :disabled="working" @update:model-value="toggleReadBurn" />
      </li>
      <li v-if="readBurn">
        <span>{{ t('消息销毁时间') }}</span>
        <div class="select" @click="handleOpenTimeMenu">
          {{ currentReadBurnLabel }}
          <img :src="choiceIcon" alt="" />
        </div>
        <div v-if="showTimeMenu" class="menuTimeList" @click.stop>
          <div
            v-for="item in readBurnTimeOptions"
            :key="item.value"
            class="menu-item"
            @click="updateReadBurnTime(item.value)"
          >
            {{ item.label }}
          </div>
        </div>
      </li>
      <li>
        <span>{{ t('加入黑名单') }}</span>
        <AppSwitch :model-value="inBlacklist" @update:model-value="handleBlacklistToggle" />
      </li>
      <li class="danger friend-left" @click="openClearDialog">{{ t('清空聊天记录') }}</li>
      <li class="danger friend-left" @click="openDeleteConfirm">{{ t('删除联系人') }}</li>
    </ul>

    <ConfirmDialog
      v-model:visible="blacklistConfirmVisible"
      variant="im"
      :content="blacklistConfirmContent"
      @confirm="confirmBlacklist"
    />

    <ConfirmDialog
      v-model:visible="deleteConfirmVisible"
      variant="im"
      :content="t('删除该联系人,会同时删除与该联系人的聊天记录')"
      :confirm-text="t('删除')"
      :cancel-text="t('取消')"
      type="danger"
      @confirm="confirmDeleteContact"
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

  /* 仅定位外层头像容器；勿对内部 img 再设 absolute+left，否则会在圆内偏移并被裁成「半张」 */
  :deep(.text-avatar) {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
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

  .id-row {
    margin: 0;
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    font-size: 12px;
    color: #333;
  }

  .id-line {
    flex: 1;
    min-width: 0;
    word-break: break-all;
  }
}

.copy-btn {
  border: none;
  background: #326aff;
  color: #fff;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1.2;
  padding: 4px 10px;
  min-height: 24px;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;

  &:hover {
    background: #2958e6;
  }

  &:focus-visible {
    outline: 2px solid rgba(50, 106, 255, 0.45);
    outline-offset: 2px;
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
