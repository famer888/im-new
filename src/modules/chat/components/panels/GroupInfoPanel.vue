<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useChatStore } from '@/stores/useChatStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useUIStore } from '@/stores/useUIStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useI18n } from 'vue-i18n'
import { getGroupDetail, groupUpdate, disableGroup, groupExit } from '@/api/imBase'
import AppSwitch from '@/components/AppSwitch.vue'
import RadioSelectDialog from '@/components/RadioSelectDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Toast from '@/components/Toast.vue'
import TextAvatar from '@/components/TextAvatar.vue'

const chatStore = useChatStore()
const authStore = useAuthStore()
const groupStore = useGroupStore()
const uiStore = useUIStore()
const messageStore = useMessageStore()
const { t } = useI18n()

const conv = computed(() => chatStore.currentConversation)
const group = computed(() => conv.value ? groupStore.getGroup(conv.value.targetId) : undefined)

const memberType = ref(-1)
const bfTop = ref(false)
const bfDisturb = ref(false)
const bfJoinCheck = ref(false)
const groupAliasName = ref('')
const notice = ref('')
const clearMsgTypeList = ref<string[]>([])

const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')

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

const members = computed(() => {
  if (!conv.value) return []
  const all = groupStore.getMembers(conv.value.targetId)
  if (!search.value.trim()) return showAllMembers.value ? all : all.slice(0, 20)
  const kw = search.value.toLowerCase()
  return all.filter((m) => m.nickname?.toLowerCase().includes(kw) || m.userId.includes(kw))
})

const totalCount = computed(() => group.value?.memberCount ?? groupStore.getMembers(conv.value?.targetId ?? '').length)

const isOwner = computed(() => memberType.value === 0)

onMounted(async () => {
  if (!conv.value) return
  const gid = conv.value.targetId

  bfTop.value = conv.value.isPinned ?? false
  bfDisturb.value = conv.value.isMuted ?? false

  await groupStore.loadMembers(authStore.uid!, gid)

  try {
    const detail = await getGroupDetail({ groupId: gid })
    memberType.value = detail.memberType ?? 2
    const groupBase = detail.group as any
    groupAliasName.value = groupBase?.groupAliasName || detail.groupNickName || ''
    notice.value = detail.groupNotice?.notice || ''
    if (detail.bfTop !== undefined) bfTop.value = detail.bfTop
    if (detail.bfDisturb !== undefined) bfDisturb.value = detail.bfDisturb
    if (groupBase?.bfJoinCheck !== undefined) bfJoinCheck.value = groupBase.bfJoinCheck
  } catch (e) {
    console.error('[GroupInfoPanel] getGroupDetail failed:', e)
  }
})

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(t('复制成功'))
  }).catch(() => {})
}

function openGroupNotice() {
  uiStore.setRightPanel('group-notice')
}

async function togglePin() {
  if (!conv.value) return
  bfTop.value = !bfTop.value
  await chatStore.pinConversation(authStore.uid, conv.value.id, bfTop.value)
}

async function toggleMute() {
  if (!conv.value) return
  bfDisturb.value = !bfDisturb.value
  await chatStore.muteConversation(authStore.uid, conv.value.id, bfDisturb.value)
}

async function toggleJoinCheck() {
  if (!conv.value) return
  bfJoinCheck.value = !bfJoinCheck.value
  try {
    await groupUpdate({
      op: 6,
      groupParam: { groupId: Number(conv.value.targetId), joinCheck: bfJoinCheck.value },
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

function handleClearSubmit(index: number) {
  if (index === -1 || !conv.value) {
    clearMsgTypeList.value = []
    return
  }
  messageStore.clearConversationMessages(conv.value.id)
  chatStore.updateConversation({
    id: conv.value.id,
    lastMsgDigest: null,
    lastMsgId: null,
    unreadCount: 0,
  })
  clearMsgTypeList.value = []
}

function handleDisbandGroup() {
  showConfirm('温馨提示', '解散群聊后,所有群成员将失去和群友的联系,同时该群的聊天内容将全部删除', async () => {
    if (!conv.value) return
    try {
      const resp = await disableGroup({ groupId: conv.value.targetId })
      const code = (resp as any)?.commonResult?.errCode
      if (code === 200) {
        showToast('解散成功')
        uiStore.setRightPanel('none')
        chatStore.deleteConversation(authStore.uid!, conv.value.id)
      } else {
        showToast((resp as any)?.errorDesc || '操作失败', 'error')
      }
    } catch (e) {
      console.error('[GroupInfoPanel] disband failed:', e)
      showToast('操作失败', 'error')
    }
  })
}

function handleExitGroup() {
  showConfirm('退出群聊', '确认要退出群聊，且删除此群的聊天记录?', async () => {
    if (!conv.value) return
    try {
      const resp = await groupExit({ groupId: conv.value.targetId })
      const code = (resp as any)?.commonResult?.errCode
      if (code === 200) {
        showToast('退出成功')
        uiStore.setRightPanel('none')
        chatStore.deleteConversation(authStore.uid!, conv.value.id)
      } else {
        showToast((resp as any)?.errorDesc || '操作失败', 'error')
      }
    } catch (e) {
      console.error('[GroupInfoPanel] exit failed:', e)
      showToast('操作失败', 'error')
    }
  })
}

function handleOnlineTime(member: any) {
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
    <!-- 群别名 + 二维码 (同 im group-alias-qrcode.vue) -->
    <div class="group-alias-qrcode">
      <h3>群别名</h3>
      <div class="alias-right">
        <span class="alias-name" @click.stop="copyText('@' + groupAliasName)">
          @{{ groupAliasName }}
        </span>
        <img class="arrow" src="@/assets/images/common/right-arrow-a.png" />
      </div>
    </div>

    <!-- 群简介 (同 im group-notice/index.vue) -->
    <div class="group-notice-section" @click="openGroupNotice">
      <div class="notice-head">
        <h3>群简介</h3>
        <img class="arrow" src="@/assets/images/common/right-arrow-a.png" />
      </div>
      <p class="notice-preview" v-if="notice">{{ notice }}</p>
      <p class="notice-preview empty" v-else>无简介</p>
    </div>

    <!-- 配置列表 (同 im config-list.vue) -->
    <ul class="config-list">
      <li>
        <span>置顶聊天</span>
        <AppSwitch :model-value="bfTop" @update:model-value="togglePin" />
      </li>
      <li>
        <span>消息免打扰</span>
        <AppSwitch :model-value="bfDisturb" @update:model-value="toggleMute" />
      </li>
      <li v-if="isOwner">
        <span>进群需审核</span>
        <AppSwitch :model-value="bfJoinCheck" @update:model-value="toggleJoinCheck" />
      </li>
      <li class="action-btn danger" @click="openClearDialog">
        清空聊天记录
      </li>
      <li v-if="isOwner" class="action-btn danger" @click="handleDisbandGroup">
        解散群聊
      </li>
      <li v-else class="action-btn danger" @click="handleExitGroup">
        删除并退出
      </li>
    </ul>

    <!-- 管理员 (同 im index.vue 管理员 label) -->
    <ul v-if="memberType !== 2" class="manager-label">
      <li>管理员</li>
    </ul>

    <!-- 群成员 (同 im member-list.vue) -->
    <div class="member-section">
      <div class="member-head">
        <div class="member-info" @click="showAllMembers = !showAllMembers">
          <span class="member-title">群成员({{ totalCount }})</span>
          <img class="icon-arrow" src="@/assets/images/common/right-arrow-a.png" />
        </div>
      </div>

      <div v-if="showAllMembers" class="member-search">
        <input v-model="search" :placeholder="t('搜索')" />
        <span class="cancel-btn" @click="showAllMembers = false; search = ''">取消</span>
      </div>

      <!-- 邀请好友 (同 im index.vue 邀请好友按钮) -->
      <div class="invite-friend">邀请好友</div>

      <ul class="member-list">
        <li v-for="member in members" :key="member.userId" class="member-item">
          <TextAvatar
            :name="member.nickname || member.userId"
            :src="member.avatar"
            :size="30"
            rounded
          />
          <div class="member-detail">
            <h2>{{ member.nickname || member.userId }}</h2>
            <p>{{ handleOnlineTime(member) }}</p>
          </div>
          <span v-if="member.role === 0" class="role-badge owner">群主</span>
          <span v-else-if="member.role === 1" class="role-badge admin">管理员</span>
        </li>
      </ul>
    </div>

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
  </div>
</template>

<style lang="scss" scoped>
.group-info-panel {
  display: flex;
  flex-direction: column;
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
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      max-width: 130px;

      &:hover {
        opacity: 0.8;
      }
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
    }

    &.action-btn {
      display: flex;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;

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
    padding: 8px 10px;
    font-size: 14px;
    color: #178aff;
    cursor: pointer;
    text-align: center;
    border-bottom: 1px solid #f5f5f5;

    &:hover {
      background: #f5f5f5;
    }
  }
}

.member-list {
  margin: 0;
  padding: 0;
  list-style: none;
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
