<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore } from '@/stores/useChatStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useI18n } from 'vue-i18n'
import TextAvatar from '@/components/TextAvatar.vue'
import AppSwitch from '@/components/AppSwitch.vue'
import Toast from '@/components/Toast.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import GroupNoticeContent from './GroupNoticeContent.vue'
import { getGroupDetail, groupUpdate } from '@/api/imBase'

const { t: $t } = useI18n()
const chatStore = useChatStore()
const groupStore = useGroupStore()
const authStore = useAuthStore()
const messageStore = useMessageStore()

const props = defineProps<{
  visible: boolean
  groupId: string
  historyNotice?: { notice: string; editorId?: string | number; groupId?: string } | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'published', payload: { groupId: string; notice: string; noticeId: string; bfAll: boolean }): void
}>()

const conv = computed(() => chatStore.currentConversation)
const group = computed(() => props.groupId ? groupStore.getGroup(props.groupId) : undefined)

const noticeText = ref('')
const loadedLatestNotice = ref('')
const isEdit = ref(false)
const bfAll = ref(false)
const submitting = ref(false)
const loginIsHost = ref(false)
const editUser = ref<any>(null)
const memberType = ref(-1)
const publisherNameEl = ref<HTMLElement | null>(null)
const publisherNameOverflow = ref(false)

const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')

const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmContent = ref('')
const confirmAction = ref<(() => void) | null>(null)
let loadSeq = 0

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

function resetToast() {
  toastVisible.value = false
  toastMessage.value = ''
}

function showConfirm(title: string, content: string, action: () => void) {
  confirmTitle.value = title
  confirmContent.value = content
  confirmAction.value = action
  confirmVisible.value = true
}

function updatePublisherNameOverflow() {
  const el = publisherNameEl.value
  // 只有昵称真实被省略时才显示悬停提示，避免短昵称也弹出重复内容。
  publisherNameOverflow.value = Boolean(el && el.scrollWidth > el.clientWidth + 1)
}

function handleConfirm() {
  confirmAction.value?.()
  confirmVisible.value = false
}

const displayUserType = computed(() => {
  if (typeof editUser.value?.role === 'number') return editUser.value.role
  const userId = String(editUser.value?.userId ?? editUser.value?.uid ?? '').trim()
  return findMemberById(userId)?.role ?? -1
})

const displayUserId = computed(() => String(editUser.value?.userId ?? editUser.value?.uid ?? '').trim())

// 接口里的群简介编辑者常是 user.nickName/icon，群成员缓存则是 nickname/avatar，这里统一做显示兜底。
const displayUserName = computed(() => {
  const member = findMemberById(displayUserId.value)
  // 优先使用群成员列表里的实时昵称，避免 groupDetail 返回的 editUser.nickName 旧值覆盖新昵称。
  const memberName = String(member?.nickname ?? '').trim()
  if (memberName) return memberName
  const directName = String(editUser.value?.nickname ?? editUser.value?.nickName ?? '').trim()
  if (directName) return directName
  return String(displayUserId.value).trim()
})

const displayUserAvatar = computed(() => {
  const memberAvatar = String(findMemberById(displayUserId.value)?.avatar ?? '').trim()
  if (memberAvatar) return memberAvatar
  const directAvatar = String(editUser.value?.avatar ?? editUser.value?.icon ?? '').trim()
  if (directAvatar) return directAvatar
  return ''
})

const displayUserLabel = computed(() => {
  if (displayUserType.value === 0) return '群主'
  if (displayUserType.value === 1) return '管理员'
  return ''
})
// 对齐旧 im：普通群成员查看群简介时，也要显示发布人的管理身份，而不是只看当前查看者权限。
const showBadge = computed(() => displayUserType.value === 0 || displayUserType.value === 1)
const isHistoryView = computed(() => Boolean(props.historyNotice))

function findMemberById(userId: string) {
  if (!userId) return null
  return groupStore.getMembers(props.groupId).find(m => String(m.userId) === userId) ?? null
}

function applyHistoryNoticeEditor() {
  const editorId = String(props.historyNotice?.editorId || '').trim()
  const member = findMemberById(editorId)
  if (member) {
    editUser.value = member
    return
  }
  if (editorId) {
    editUser.value = { userId: editorId, nickname: editorId, role: -1 }
  }
}

async function loadNoticeDetail() {
  if (!props.groupId || !props.visible) return
  const seq = ++loadSeq
  try {
    const detail = await getGroupDetail({ groupId: props.groupId })
    if (seq !== loadSeq) return
    memberType.value = detail.memberType ?? 2
    loadedLatestNotice.value = detail.groupNotice?.notice ?? ''
    noticeText.value = props.historyNotice?.notice ?? loadedLatestNotice.value
    
    // 判断是否有编辑权限 (群主或管理员)
    loginIsHost.value = memberType.value === 0 || memberType.value === 1
    
    // 获取编辑者信息
    if (detail.groupNotice?.editUser?.user) {
      editUser.value = {
        ...detail.groupNotice.editUser.user,
        role: detail.groupNotice.editUser.type
      }
    } else {
      // 默认显示群主或当前用户
      const members = groupStore.getMembers(props.groupId)
      const owner = members.find(m => m.role === 0)
      if (owner) {
        editUser.value = owner
      }
    }
    if (props.historyNotice) {
      applyHistoryNoticeEditor()
    }
    isEdit.value = false
    bfAll.value = false
  } catch (e) {
    console.error('get group detail failed:', e)
  }
}

watch(
  () => [props.visible, props.groupId, props.historyNotice?.notice, props.historyNotice?.editorId],
  ([visible]) => {
    resetToast()
    if (!visible) return
    void loadNoticeDetail()
    void nextTick(updatePublisherNameOverflow)
  },
  { immediate: true },
)

watch(displayUserName, () => {
  void nextTick(updatePublisherNameOverflow)
})

function handleActivateEdit() {
  isEdit.value = true
  noticeText.value = ''
  
  // 切换为当前用户
  const members = groupStore.getMembers(props.groupId)
  const current = members.find(m => m.userId === authStore.uid)
  if (current) {
    editUser.value = current
  }
}

function handleCancel() {
  isEdit.value = false
  // 恢复打开弹窗时正在查看的简介
  noticeText.value = props.historyNotice?.notice ?? loadedLatestNotice.value ?? group.value?.notice ?? ''
}

function handleOk() {
  if (!noticeText.value || !noticeText.value.trim()) {
    showToast($t('请输入内容'))
    return
  }
  
  if (bfAll.value) {
    showConfirm(
      $t('温馨提示'),
      $t('发布该群简介会通知全部群成员，可能会对群成员造成打扰，确定发布？'),
      () => {
        handleSendNotice(true)
      }
    )
  } else {
    handleSendNotice(false)
  }
}

async function handleSendNotice(notifyAll: boolean) {
  if (submitting.value) return
  const uid = authStore.uid
  const nextNotice = noticeText.value.trim()
  if (!uid || !props.groupId || !nextNotice) return

  submitting.value = true
  try {
    const res = await groupUpdate({
      op: 12,
      groupParam: {
        groupId: props.groupId,
        notice: nextNotice,
        bfAll: notifyAll,
      },
    })
    const noticeId = String((res as any)?.noticeId || '')

    await messageStore.sendMessage(
      String(uid),
      `1_${props.groupId}`,
      8,
      nextNotice,
      {
        groupId: props.groupId,
        noticeId,
        showNotify: notifyAll,
        bfAll: notifyAll,
        isHide: !notifyAll,
      },
    )
    
    if (group.value) {
      group.value.notice = nextNotice
    }
    
    emit('published', {
      groupId: props.groupId,
      notice: nextNotice,
      noticeId,
      bfAll: notifyAll,
    })
    showToast($t('发布成功'))
    isEdit.value = false
    emit('close')
  } catch (e) {
    console.error('set notice failed:', e)
    showToast($t('发布失败'), 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="visible" class="comGroupNoticeDialog" @click.stop="emit('close')">
    <div @click.stop>
      <picture @click.stop="emit('close')">
        <img src="@/assets/images/common/close-icon.png" />
      </picture>
      <div class="top">
        <TextAvatar
          :name="displayUserName"
          :src="displayUserAvatar"
          :size="35"
          rounded
        />
        <div class="publisher-name-wrap" :aria-label="displayUserName" @mouseenter="updatePublisherNameOverflow">
          <h2 ref="publisherNameEl">{{ displayUserName }}</h2>
          <span v-if="publisherNameOverflow" class="publisher-title-tooltip">{{ displayUserName }}</span>
        </div>
        <span
          v-if="(loginIsHost || showBadge) && displayUserLabel"
          :class="{
            groupOwner: displayUserType === 0,
            isAdmin: displayUserType === 1,
          }"
        >
          {{ $t(displayUserLabel) }}
        </span>
      </div>
      <section>
        <textarea
          v-if="loginIsHost && !isHistoryView && isEdit"
          v-model="noticeText"
          maxlength="800"
          :placeholder="$t('请输入内容')"
        />
        <GroupNoticeContent
          v-else
          class="notice-view"
          :content="noticeText"
          :group-id="props.groupId"
          height="203px"
          @navigated="emit('close')"
        />
        <span v-if="loginIsHost && !isHistoryView && isEdit">{{ 800 - noticeText.length }}</span>
      </section>
      
      <template v-if="loginIsHost && !isHistoryView">
        <div v-if="!isEdit" class="bottom">
          <span @click.stop="handleActivateEdit">{{ $t('发布新简介') }}</span>
        </div>
        <div v-if="isEdit" class="bfAll">
          {{ $t('通知所有成员') }}
          <span>{{ $t('推送告知所有的群成员，即使对方开启消息免打扰') }}</span>
          <div class="switch-wrap">
            <AppSwitch v-model="bfAll" />
          </div>
        </div>
        <div v-if="isEdit" class="bottom">
          <span @click.stop="handleOk">{{ $t('确认发布') }}</span>
          <span @click.stop="handleCancel">{{ $t('取消') }}</span>
        </div>
      </template>
    </div>
    
    <Toast
      :visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
      @update:visible="toastVisible = $event"
    />
    
    <ConfirmDialog
      :visible="confirmVisible"
      :title="confirmTitle"
      :content="confirmContent"
      variant="im"
      type="danger"
      @update:visible="confirmVisible = $event"
      @confirm="handleConfirm"
    />
  </div>
</template>

<style lang="scss" scoped>
.comGroupNoticeDialog {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.2);

  > div {
    background: #fff;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 10px 16px;
    border-radius: 8px;
    width: 438px;
    box-sizing: border-box;

    > picture {
      position: absolute;
      top: 0;
      right: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;

      &:hover {
        opacity: 0.8;
      }
      
      img {
        width: 14px;
        height: 14px;
      }
    }

    > .top {
      height: 70px;
      min-height: 70px;
      display: flex;
      align-items: center;
      flex-wrap: nowrap;

      :deep(.text-avatar) {
        margin-right: 10px;
      }

      > .publisher-name-wrap {
        display: block;
        flex: 0 1 auto;
        min-width: 0;
        position: relative;

        > h2 {
          display: block;
          margin: 0;
          padding: 0;
          line-height: 30px;
          font-size: 14px;
          font-weight: 600;
          color: #333;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      .publisher-title-tooltip {
        position: absolute;
        left: calc(100% + 8px);
        top: 50%;
        z-index: 3;
        display: block;
        width: max-content;
        max-width: 360px;
        margin: 0;
        padding: 2px 7px;
        border: 1px solid #bfbfbf;
        border-radius: 2px;
        background: #e6e6e6;
        box-shadow: 0 2px 7px rgba(0, 0, 0, 0.18);
        line-height: 16px;
        font-size: 12px;
        font-weight: 400;
        color: #333;
        word-break: break-all;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-50%);
        pointer-events: none;
      }

      > .publisher-name-wrap:hover .publisher-title-tooltip {
        opacity: 1;
        visibility: visible;
        transform: translateY(-50%);
      }

      > span {
        display: block;
        flex-shrink: 0;
        padding: 1px 10px;
        margin-left: 5px;
        background-color: #3369fe;
        border-radius: 10px;
        font-size: 12px;
        color: #fff;
        transform: scale(0.9);

        &.groupOwner {
          background-color: #3369fe;
        }

        &.isAdmin {
          background-color: #fb9203;
        }
      }
    }

    > section {
      position: relative;

      > textarea {
        padding: 15px 10px;
        box-sizing: border-box;
        width: 100%;
        height: 223px;
        background-color: rgb(245, 245, 245);
        border-radius: 8px;
        font-size: 14px;
        color: #333;
        display: block;
        border: none;
        outline: none;
        resize: none;
      }

      .notice-view {
        padding: 15px 10px;
        box-sizing: border-box;
        width: 100%;
        height: 223px;
        background-color: rgb(245, 245, 245);
        border-radius: 8px;
        overflow-y: auto;
      }

      > span {
        position: absolute;
        right: 10px;
        bottom: -18px;
        font-size: 12px;
        color: #666;
      }
    }

    > .bottom {
      margin-top: 5px;
      padding-bottom: 10px;
      display: flex;
      justify-content: flex-end;

      > span {
        display: block;
        color: #fff;
        background-color: #3369fe;
        border: 1px solid #3369fe;
        cursor: pointer;
        padding: 0 28px;
        height: 32px;
        line-height: 32px;
        font-size: 12px;
        border-radius: 4px;

        &:hover {
          opacity: 0.8;
        }

        &:nth-child(2) {
          background-color: #fff;
          border: 1px solid #eeeeee;
          color: #666666;
          margin-left: 10px;
        }
      }
    }

    > .bfAll {
      padding: 10px 0;
      font-size: 13px;
      line-height: 25px;
      color: #333;
      position: relative;

      > span {
        display: block;
        font-size: 12px;
        color: #999;
        line-height: 18px;
        max-width: 370px;
      }

      .switch-wrap {
        position: absolute;
        right: 0;
        top: 27px;
      }
    }
  }
}
</style>
