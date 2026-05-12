<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useChatStore } from '@/stores/useChatStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useUIStore } from '@/stores/useUIStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useI18n } from 'vue-i18n'
import { getGroupDetail, groupUpdate, disableGroup, groupExit, groupMember } from '@/api/imBase'
import AppSwitch from '@/components/AppSwitch.vue'
import RadioSelectDialog from '@/components/RadioSelectDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Toast from '@/components/Toast.vue'
import TextAvatar from '@/components/TextAvatar.vue'
import GroupQRCode from './GroupQRCode.vue'
import GroupNoticeDialog from './GroupNoticeDialog.vue'
import InviteFriendDialog from '@/modules/groups/components/InviteFriendDialog.vue'
import RemoveMemberDialog from '@/modules/groups/components/RemoveMemberDialog.vue'
import searchIcon from '@/assets/images/headNav/search-icon.png'
import searchCloseIcon from '@/assets/images/headNav/search-close-icon.png'
const chatStore = useChatStore()
const authStore = useAuthStore()
const groupStore = useGroupStore()
const uiStore = useUIStore()
const messageStore = useMessageStore()
const { t } = useI18n()

const conv = computed(() => chatStore.currentConversation)
const group = computed(() => conv.value ? groupStore.getGroup(conv.value.targetId) : undefined)

const memberType = ref(-1)
const bfJoinCheck = ref(false)
const bfResetQrcode = ref(false)
const groupAliasName = ref('')
const notice = ref('')
const qrUrl = ref('')
const clearMsgTypeList = ref<string[]>([])
const noticePreview = computed(() => notice.value.trim())

const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const refreshingMembers = ref(false)

const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmContent = ref('')
const confirmAction = ref<(() => void) | null>(null)

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

function showConfirm(title: string, content: string, action: () => void) {
  confirmTitle.value = title
  confirmContent.value = content
  confirmAction.value = action
  confirmVisible.value = true
}

function handleConfirm() {
  confirmAction.value?.()
  confirmVisible.value = false
}

const search = ref('')
const showAllMembers = ref(false)

const qrCodeVisible = ref(false)
const inviteVisible = ref(false)
const noticeVisible = ref(false)
const removeMemberVisible = ref(false)

const existingMemberIds = computed(() => {
  return new Set(allMembers.value.map(m => m.userId))
})

function openQrCode() {
  qrCodeVisible.value = true
}

function openInvite() {
  inviteVisible.value = true
}

function openRemoveMember() {
  removeMemberVisible.value = true
}

async function handleInvited(payload?: { message?: string; type?: 'success' | 'error' }) {
  try {
    // 邀请成功后刷新成员列表
    if (conv.value?.targetId && authStore.uid) {
      await groupStore.loadMembers(authStore.uid, conv.value.targetId)
    }
  } finally {
    if (payload?.message) {
      showToast(payload.message, payload.type ?? 'success')
    }
  }
}

async function handleRemoved() {
  // 移除成功后刷新成员列表
  if (conv.value?.targetId && authStore.uid) {
    await groupStore.loadMembers(authStore.uid, conv.value.targetId)
  }
}

async function refreshMembers() {
  if (!conv.value?.targetId || !authStore.uid || refreshingMembers.value) return
  refreshingMembers.value = true
  try {
    await groupStore.loadMembers(authStore.uid, conv.value.targetId)
  } catch (e) {
    console.error('[GroupInfoPanel] refresh members failed:', e)
    showToast(t('操作失败'), 'error')
  } finally {
    refreshingMembers.value = false
  }
}

const allMembers = computed(() => {
  if (!conv.value) return []
  return groupStore.getMembers(conv.value.targetId)
})

const previewMembers = computed(() => allMembers.value.slice(0, 20))

const members = computed(() => {
  const all = allMembers.value
  if (!search.value.trim()) return all
  const kw = search.value.toLowerCase()
  return all.filter((m) => m.nickname?.toLowerCase().includes(kw) || m.userId.includes(kw))
})

const totalCount = computed(() => group.value?.memberCount ?? groupStore.getMembers(conv.value?.targetId ?? '').length)

const isOwner = computed(() => memberType.value === 0)

onMounted(async () => {
  if (!conv.value) return
  const gid = conv.value.targetId

  await groupStore.loadMembers(authStore.uid!, gid)

  try {
    const detail = await getGroupDetail({ groupId: gid })
    memberType.value = detail.memberType ?? 2
    const groupBase = detail.group as any
    groupAliasName.value = groupBase?.groupAliasName || detail.groupNickName || ''
    notice.value = detail.groupNotice?.notice || ''
    qrUrl.value = detail.qrUrl || ''
    bfResetQrcode.value = Boolean(detail.bfResetQrcode)
    if (groupBase?.bfJoinCheck !== undefined) bfJoinCheck.value = groupBase.bfJoinCheck
  } catch (e) {
    console.error('[GroupInfoPanel] getGroupDetail failed:', e)
  }
})

function copyText(text: string) {
  navigator.clipboard.writeText(text.endsWith(' ') ? text : `${text} `).then(() => {
    showToast(t('复制成功'))
  }).catch(() => {})
}

function openGroupNotice() {
  noticeVisible.value = true
}

async function togglePin() {
  if (!conv.value) return
  await chatStore.pinConversation(authStore.uid, conv.value.id, !conv.value.isPinned)
}

async function toggleMute() {
  if (!conv.value) return
  await chatStore.muteConversation(authStore.uid, conv.value.id, !conv.value.isMuted)
}

async function toggleJoinCheck() {
  if (!conv.value) return
  bfJoinCheck.value = !bfJoinCheck.value
  try {
    await groupUpdate({
      op: 6,
      groupParam: { groupId: conv.value.targetId, joinCheck: bfJoinCheck.value },
    })
  } catch (e) {
    bfJoinCheck.value = !bfJoinCheck.value
    console.error('[GroupInfoPanel] toggleJoinCheck failed:', e)
  }
}

function openClearDialog() {
  clearMsgTypeList.value = [
    t('仅清空本地聊天记录'),
    t('清空本地和所有成员设备的聊天记录'),
  ]
}

async function handleClearSubmit(index: number) {
  if (index === -1 || !conv.value) {
    clearMsgTypeList.value = []
    return
  }
  try {
    await messageStore.clearConversationHistory(conv.value.id, index === 1)
    chatStore.updateConversation({
      id: conv.value.id,
      lastMsgDigest: null,
      lastMsgId: null,
      unreadCount: 0,
    })
  } catch (error) {
    console.error('[GroupInfoPanel] clear conversation failed:', error)
    showToast(t('操作失败'), 'error')
  } finally {
    clearMsgTypeList.value = []
  }
}

function handleDisbandGroup() {
  showConfirm(t('温馨提示'), t('解散群聊确认'), async () => {
    if (!conv.value) return
    try {
      const resp = await disableGroup({ groupId: conv.value.targetId })
      const code = (resp as any)?.commonResult?.errCode
      if (code === 200) {
        showToast(t('解散成功'))
        uiStore.setRightPanel('none')
        chatStore.deleteConversation(authStore.uid!, conv.value.id)
      } else {
        showToast((resp as any)?.errorDesc || t('操作失败'), 'error')
      }
    } catch (e) {
      console.error('[GroupInfoPanel] disband failed:', e)
      showToast(t('操作失败'), 'error')
    }
  })
}

function handleExitGroup() {
  showConfirm(t('退出群聊'), t('退出群聊确认'), async () => {
    if (!conv.value) return
    try {
      const resp = await groupExit({ groupId: conv.value.targetId })
      const code = (resp as any)?.commonResult?.errCode
      if (code === 200) {
        showToast(t('退出成功'))
        uiStore.setRightPanel('none')
        chatStore.deleteConversation(authStore.uid!, conv.value.id)
      } else {
        showToast((resp as any)?.errorDesc || t('操作失败'), 'error')
      }
    } catch (e) {
      console.error('[GroupInfoPanel] exit failed:', e)
      showToast(t('操作失败'), 'error')
    }
  })
}

function handleOnlineTime(member: any) {
  if (member.online) return t('在线')
  const dateNow = Date.now()
  const minute = 1000 * 60
  const hour = minute * 60
  const day = hour * 24
  const week = day * 7
  const month = day * 30
  if (!member.createTime) return t('近期不在线')
  const remainderTime = dateNow - member.createTime
  if (remainderTime < minute) return t('不久前在线')
  if (remainderTime < hour) return Math.floor(remainderTime / minute) + t('分钟前在线')
  if (remainderTime < day) return Math.floor(remainderTime / hour) + t('小时前在线')
  if (remainderTime < week) return Math.floor(remainderTime / day) + t('天前在线')
  if (remainderTime < month) return Math.floor(remainderTime / week) + t('周前在线')
  return t('近期不在线')
}
</script>

<template>
  <div class="group-info-panel" v-if="conv">
    <template v-if="!showAllMembers">
      <!-- 群别名 + 二维码 (同 im group-alias-qrcode.vue) -->
      <div class="group-alias-qrcode" @click="openQrCode">
        <h3>{{ t('群别名') }}</h3>
        <div class="alias-right">
          <span class="alias-name" @click.stop="copyText('@' + groupAliasName)">
            @{{ groupAliasName }}
          </span>
          <img class="code-icon" src="@/assets/images/chat/code.png" @click.stop="openQrCode" />
          <img class="arrow" src="@/assets/images/common/right-arrow-a.png" />
        </div>
      </div>

      <!-- 群简介 (同 im group-notice/index.vue) -->
      <div class="group-notice-section" @click="openGroupNotice">
        <div class="notice-head">
          <h3>{{ t('群简介') }}</h3>
          <img class="arrow" src="@/assets/images/common/right-arrow-a.png" />
        </div>
        <p class="notice-preview" v-if="noticePreview">{{ noticePreview }}</p>
        <p class="notice-preview empty" v-else>{{ t('无简介') }}</p>
      </div>

      <!-- 配置列表 (同 im config-list.vue) -->
      <ul class="config-list">
        <li>
          <span>{{ t('置顶聊天') }}</span>
          <AppSwitch :model-value="conv.isPinned" @update:model-value="togglePin" />
        </li>
        <li>
          <span>{{ t('消息免打扰') }}</span>
          <AppSwitch :model-value="conv.isMuted" @update:model-value="toggleMute" />
        </li>
        <li v-if="isOwner">
          <span>{{ t('进群需审核') }}</span>
          <AppSwitch :model-value="bfJoinCheck" @update:model-value="toggleJoinCheck" />
        </li>
        <li class="action-btn danger" @click="openClearDialog">
          {{ t('清空聊天记录') }}
        </li>
        <li v-if="isOwner" class="action-btn danger" @click="handleDisbandGroup">
          {{ t('解散群聊') }}
        </li>
        <li v-else class="action-btn danger" @click="handleExitGroup">
          {{ t('删除并退出') }}
        </li>
      </ul>

      <!-- 管理员 (同 im index.vue 管理员 label) -->
      <ul v-if="memberType !== 2" class="manager-label">
        <li>{{ t('管理员') }}</li>
      </ul>

      <!-- 群成员 (同 im member-list.vue) -->
      <div class="member-section">
        <div class="member-head">
          <div class="member-info" @click="showAllMembers = true">
            <span class="member-title">{{ t('群成员列表标题', { count: totalCount }) }}</span>
            <img class="icon-arrow" src="@/assets/images/common/right-arrow-a.png" />
          </div>
          <img v-if="memberType === 0 || memberType === 1" class="icon-delete" src="@/assets/images/common/user-delete.png" @click="openRemoveMember" />
        </div>

        <ul class="member-list">
          <li v-for="member in previewMembers" :key="member.userId" class="member-item">
            <TextAvatar
              :name="member.nickname || member.userId"
              :src="member.avatar"
              :size="30"
              rounded
              style="cursor: pointer;"
              @click="uiStore.openMemberInfo(member.userId, conv?.targetId)"
            />
            <div class="member-detail" style="cursor: pointer;" @click="uiStore.openMemberInfo(member.userId, conv?.targetId)">
              <h2>{{ member.nickname || member.userId }}</h2>
              <p>{{ handleOnlineTime(member) }}</p>
            </div>
            <span v-if="member.role === 0" class="role-badge owner">{{ t('群主') }}</span>
            <span v-else-if="member.role === 1" class="role-badge admin">{{ t('管理员') }}</span>
          </li>
        </ul>

        <!-- 邀请好友 (同 im index.vue 邀请好友按钮) -->
        <div class="invite-friend" @click="openInvite">{{ t('邀请好友') }}</div>
      </div>
    </template>

    <template v-else>
      <div class="member-directory">
        <div class="member-directory-search">
          <img :src="searchIcon" alt="" />
          <img
            v-show="search"
            :src="searchCloseIcon"
            alt=""
            @click="search = ''"
          />
          <input v-model="search" type="text" :placeholder="t('搜索')" />
          <span :title="t('强制刷新群成员')" @click="refreshMembers">
            <img
              src="@/assets/images/refresh.png"
              alt=""
              :class="{ spinning: refreshingMembers }"
            />
            <span>{{ t('群成员列表强制刷新') }}</span>
          </span>
          <div class="member-cancel" @click="showAllMembers = false; search = ''">{{ t('取消') }}</div>
        </div>

        <ul class="member-list directory-list">
          <li v-for="member in members" :key="member.userId" class="member-item">
            <TextAvatar
              :name="member.nickname || member.userId"
              :src="member.avatar"
              :size="35"
              rounded
              style="cursor: pointer;"
              @click="uiStore.openMemberInfo(member.userId, conv?.targetId)"
            />
            <div class="member-detail" style="cursor: pointer;" @click="uiStore.openMemberInfo(member.userId, conv?.targetId)">
              <h2>{{ member.nickname || member.userId }}</h2>
              <p>{{ handleOnlineTime(member) }}</p>
            </div>
            <span v-if="member.role === 0" class="role-badge owner">{{ t('群主') }}</span>
            <span v-else-if="member.role === 1" class="role-badge admin">{{ t('管理员') }}</span>
          </li>
        </ul>

        <div class="invite-friend directory-invite" @click="openInvite">{{ t('邀请好友') }}</div>
      </div>
    </template>

    <RadioSelectDialog
      v-if="clearMsgTypeList.length > 0"
      :title="t('请选择清空类型')"
      :radio-text-list="clearMsgTypeList"
      @submit="handleClearSubmit"
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

    <Toast
      :visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
      @update:visible="toastVisible = $event"
    />

    <GroupQRCode
      :visible="qrCodeVisible"
      :group-id="conv.targetId"
      :group-name="group?.name || groupAliasName"
      :can-reset-code="memberType === 0 || bfResetQrcode"
      @close="qrCodeVisible = false"
    />

    <InviteFriendDialog
      :visible="inviteVisible"
      :group-id="conv.targetId"
      :existing-member-ids="existingMemberIds"
      @close="inviteVisible = false"
      @invited="handleInvited"
    />
    <GroupNoticeDialog
      :visible="noticeVisible"
      :group-id="conv.targetId"
      @close="noticeVisible = false"
    />
    
    <RemoveMemberDialog
      :visible="removeMemberVisible"
      :group-id="conv.targetId"
      :members="members"
      :current-role="memberType"
      @close="removeMemberVisible = false"
      @removed="handleRemoved"
    />
  </div>
</template>

<style lang="scss" scoped>
.group-info-panel {
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
}

/* 群别名 + 二维码 — 同 im group-alias-qrcode.vue */
.group-alias-qrcode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 10px;
  box-sizing: border-box;
  border-bottom: 10px solid #f5f5f5;
  cursor: pointer;
  height: 65px;

  > h3 {
    font-size: 14px;
    color: #000;
    margin: 0;
    flex-shrink: 0;
  }

  .alias-right {
    display: flex;
    align-items: center;

    .alias-name {
      font-size: 14px;
      color: #178aff;
      font-weight: 600;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      max-width: 130px;

      &:hover {
        opacity: 0.8;
      }
    }

    .code-icon {
      width: 22px;
      height: 22px;
      margin-left: 8px;
    }

    .arrow {
      height: 10px;
      margin-left: 4px;
    }
  }
}

/* 群简介 — 同 im group-notice/index.vue */
.group-notice-section {
  padding: 10px;
  cursor: pointer;
  max-height: 120px;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .notice-head {
    display: flex;
    align-items: center;
    justify-content: space-between;

    > h3 {
      line-height: 40px;
      margin: 0;
      font-size: 14px;
      color: #000;
      font-weight: 600;
    }

    .arrow {
      height: 10px;
    }
  }

  .notice-preview {
    margin: 0;
    font-size: 13px;
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;

    &.empty {
      color: #ccc;
    }
  }
}

/* 配置列表 — 同 im config-list.vue */
.config-list {
  padding: 10px 0;
  margin: 0;
  border-top: 10px solid #f5f5f5;
  list-style: none;

  > li {
    display: flex;
    justify-content: space-between;
    height: 35px;
    align-items: center;
    padding: 0 10px;

    > span {
      font-size: 14px;
      color: #333;
      font-weight: 600;
    }

    &.action-btn {
      display: flex;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;

      &.danger {
        color: #f44e5a;
      }
    }
  }
}

/* 管理员 — 同 im index.vue */
.manager-label {
  padding: 0;
  margin: 0;
  list-style: none;
  border-top: 10px solid #f5f5f5;

  > li {
    padding: 8px 10px;
    font-size: 14px;
    color: #333;
    font-weight: 500;
  }
}

/* 群成员 — 同 im member-list.vue */
.member-section {
  padding-top: 10px;
  border-top: 10px solid #f5f5f5;

  .member-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px 10px;

    .member-info {
      display: flex;
      align-items: center;
      cursor: pointer;

      .member-title {
        font-size: 14px;
        color: #178aff;
        font-weight: 600;
      }

      .icon-arrow {
        height: 10px;
        margin-left: 4px;
      }
    }
  }

  .member-search {
    display: flex;
    align-items: center;
    padding: 0 10px 10px;
    gap: 8px;

    input {
      flex: 1;
      height: 28px;
      background: #f4f6f9;
      border-radius: 4px;
      border: none;
      padding: 0 8px;
      font-size: 12px;
      outline: none;
    }

    .cancel-btn {
      font-size: 12px;
      color: #333;
      cursor: pointer;
      flex-shrink: 0;
    }
  }

  .invite-friend {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 40px;
    color: #178aff;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9;
    background: #fff;
    cursor: pointer;
    font-size: 14px;
    font-weight: 900;

  }
}

.member-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.member-directory {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  padding-top: 10px;
  box-sizing: border-box;
}

.member-directory-search {
  height: 30px;
  position: relative;
  background: #f4f6f9;
  border-radius: 4px;
  margin: 0 30px 10px 30px;
  flex-shrink: 0;

  .member-cancel {
    position: absolute;
    right: -28px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    cursor: pointer;
  }

  > img {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);

    &:nth-child(1) {
      left: 5px;
      width: 15px;
    }

    &:nth-child(2) {
      right: 10px;
      cursor: pointer;
    }
  }

  > input {
    padding: 0 12px 0 24px;
    box-sizing: border-box;
    border-radius: 4px;
    width: 100%;
    height: 100%;
    border: none;
    outline: none;
    background: none;
    color: rgb(106, 106, 106);

    &::placeholder {
      color: rgb(106, 106, 106);
      opacity: 1;
    }
  }

  > span {
    position: absolute;
    height: 20px;
    width: 20px;
    top: 5px;
    left: -25px;
    cursor: pointer;

    &:hover {
      > img {
        opacity: 0.8;
      }

      > span {
        display: block;
      }
    }

    > img {
      display: block;
      width: 100%;
      height: 100%;

      &.spinning {
        animation: member-refresh-spin 1s linear infinite;
      }
    }

    > span {
      display: none;
      position: absolute;
      top: 35px;
      right: -105px;
      line-height: 26px;
      padding: 0 8px;
      background: #3daee9;
      color: #fff;
      border: 1px solid #fff;
      border-radius: 5px;
      white-space: nowrap;
      font-size: 12px;
      font-weight: normal;
      z-index: 9;

      &::before,
      &::after {
        position: absolute;
        top: -10px;
        right: 105px;
        display: block;
        font-size: 0;
        line-height: 0;
        border-color: transparent transparent #3daee9;
        border-style: solid;
        border-width: 5px;
        content: "";
      }
    }
  }
}

.directory-list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 46px;
}

.directory-invite {
  width: 100%;
  height: 42px;
  color: #178aff;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;

}

@keyframes member-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.member-item {
  height: 50px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 8px;
  cursor: pointer;

  &:hover {
    background: #f0f0f0;
  }

  .member-detail {
    flex: 1;
    min-width: 0;

    > h2 {
      line-height: 25px;
      font-size: 14px;
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: normal;
    }

    > p {
      font-size: 12px;
      color: #b9babe;
      line-height: 15px;
      margin: 0;
    }
  }

  .role-badge {
    font-size: 12px;
    color: #fff;
    padding: 2px 6px;
    border-radius: 99px;
    flex-shrink: 0;

    &.owner {
      background: #3369fe;
    }

    &.admin {
      background: #fb9203;
    }
  }
}
</style>
