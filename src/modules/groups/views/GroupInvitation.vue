<script setup lang="ts">
import { onBeforeUnmount, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/useAuthStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChatStore } from '@/stores/useChatStore'
import { getGroupReqList, groupCheckJoin, groupUserCheckJoin } from '@/api/imBase'
import TextAvatar from '@/components/TextAvatar.vue'
import { eventBus } from '@/utils/eventBus'

interface GroupReqItem {
  groupReqId: number
  groupId: string
  groupName: string
  pic: string
  msg: string
  groupReqType: number
  groupReqStatus: number
  groupHostUid: string
  sendUid: string
  receiveUid: string
  targetUser?: Record<string, any> | null
  checkUser?: Record<string, any> | null
  fromUser?: Record<string, any> | null
  createTime: number
  updateTime: number
}

const authStore = useAuthStore()
const groupStore = useGroupStore()
const chatStore = useChatStore()
const { t } = useI18n()
const list = ref<GroupReqItem[]>([])

function statusLabel(status: number): string {
  const map: Record<number, string> = {
    1: t('已同意'),
    2: t('已拒绝'),
    3: t('已失效'),
  }
  return map[status] || ''
}

function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (isToday) return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getReqUserId(user: unknown): string {
  const raw = user && typeof user === 'object' ? user as Record<string, any> : null
  return String(raw?.uid ?? raw?.userId ?? '').trim()
}

function getReqUserName(user: unknown, fallbackId?: unknown): string {
  const raw = user && typeof user === 'object' ? user as Record<string, any> : null
  const relation = raw?.friendRelation && typeof raw.friendRelation === 'object'
    ? raw.friendRelation as Record<string, any>
    : null
  const names = [
    raw?.remarkName,
    relation?.remarkName,
    raw?.nickName,
    raw?.nickname,
    raw?.nick_name,
    raw?.name,
    raw?.identify,
    raw?.uid,
    raw?.userId,
    fallbackId,
  ]
  return names.map((v) => String(v ?? '').trim()).find(Boolean) || ''
}

function isSelfUser(user: unknown, fallbackId?: unknown): boolean {
  const uid = String(authStore.uid || '')
  if (!uid) return false
  const userId = getReqUserId(user) || String(fallbackId ?? '').trim()
  return userId === uid
}

function formatReqMemberName(user: unknown, fallbackId?: unknown): string {
  const name = getReqUserName(user, fallbackId)
  if (!name) return ''
  return name
}

function formatReqMessage(item: GroupReqItem): string {
  const raw = (item.msg || '').trim().replace(/\s+/g, ' ')
  if (!raw) {
    return item.groupName ? t('群通知条目摘要', { name: item.groupName }) : t('群通知')
  }
  if (/^\S*(?:群主|管理员|（群员）|（管理员）|（群主）)/.test(raw)) return raw

  const shouldPrefix =
    /^(拒绝加入|同意加入|申请加入|邀请你加入|加入)/.test(raw) ||
    (item.groupReqStatus === 2 && raw.includes('拒绝')) ||
    [1, 2, 3, 4, 14, 15].includes(item.groupReqType)
  if (!shouldPrefix) return raw

  const user = item.groupReqStatus === 2
    ? item.targetUser || item.fromUser || item.checkUser
    : item.fromUser || item.targetUser || item.checkUser
  const name = getReqUserName(user)
  if (!name || raw.includes(name)) return raw

  return `${name}${raw}`
}

function formatAcceptedGroupDigest(item: GroupReqItem): string {
  const fromName = isSelfUser(item.fromUser, item.sendUid)
    ? t('你')
    : getReqUserName(item.fromUser, item.sendUid)
  const targetName = isSelfUser(item.targetUser, item.receiveUid)
    ? t('你')
    : formatReqMemberName(item.targetUser, item.receiveUid)

  if (fromName && targetName) {
    if (targetName === t('你')) {
      return `${fromName}${t('邀请')}${targetName}${t('加入群聊')}`
    }
    return `${fromName}${t('邀请')}${targetName} ${t('加入群聊')}`
  }
  return formatReqMessage(item)
}

function parseGroupReqItems(raw: any[]): GroupReqItem[] {
  return raw
    .map((item: any) => ({
      groupReqId: Number(item.groupReqId),
      groupId: String(item.groupId ?? ''),
      groupName: item.groupName || '',
      pic: item.pic || '',
      msg: item.msg || '',
      groupReqType: item.groupReqType || 0,
      groupReqStatus: item.groupReqStatus || 0,
      groupHostUid: String(item.groupHostUid ?? ''),
      sendUid: String(item.sendUid ?? ''),
      receiveUid: String(item.receiveUid ?? ''),
      targetUser: item.targetUser || null,
      checkUser: item.checkUser || null,
      fromUser: item.fromUser || null,
      createTime: Number(item.createTime),
      updateTime: Number(item.updateTime),
    }))
    .filter((item: GroupReqItem) => !(item as any).isHide)
}

function syncSidebarPreview(items: GroupReqItem[]) {
  const latest = items[0]
  if (latest) {
    chatStore.updateGroupNotificationConv(
      formatReqMessage(latest),
      latest.updateTime || latest.createTime,
      0,
    )
  } else {
    chatStore.removeGroupNotificationConversation()
  }
}

async function loadList() {
  try {
    const res = await getGroupReqList({ pageNum: 1, pageSize: 100 })
    if (res?.groupReqs) {
      list.value = parseGroupReqItems(res.groupReqs)
      syncSidebarPreview(list.value)
    }
  } catch (e) {
    console.error('[GroupInvitation] loadList failed:', e)
  }
}

async function handleCheck(item: GroupReqItem, flag: boolean, index: number) {
  const isAuditor =
    [2, 15].includes(item.groupReqType) ||
    item.groupHostUid === String(authStore.uid || '')

  const apiFn = isAuditor ? groupCheckJoin : groupUserCheckJoin

  try {
    const res = await apiFn({ groupReqId: item.groupReqId, flag })
    if (Number((res as any)?.commonResult?.errCode) === 200) {
      list.value[index] = { ...list.value[index], groupReqStatus: flag ? 1 : 2 }
      if (flag) {
        const gid = item.groupId
        if (!groupStore.groups.find((g) => g.id === gid)) {
          groupStore.groups.push({
            id: gid,
            name: item.groupName,
            avatar: item.pic || null,
            ownerId: null,
            memberCount: 0,
            notice: null,
            isMuted: false,
            updatedAt: Date.now(),
          })
        }
        const conv = chatStore.ensureConversation(1, gid)
        const now = Date.now()
        chatStore.addOrUpdateConversation({
          ...conv,
          lastMsgDigest: formatAcceptedGroupDigest(item),
          lastMsgTime: now,
          updatedAt: now,
        })
      }
      syncSidebarPreview(list.value)
    } else {
      console.error(t('操作失败'), (res as any)?.commonResult?.errMsg)
    }
  } catch (e) {
    console.error('[GroupInvitation] check failed:', e)
  }
}

onMounted(() => {
  chatStore.clearGroupNotificationUnread()
  loadList()
  eventBus.on('group-invitation:update', loadList)
})

onBeforeUnmount(() => {
  eventBus.off('group-invitation:update', loadList)
})
</script>

<template>
  <div class="group-invitation">
    <h1>{{ t('群通知') }}</h1>
    <ul class="notify-box">
      <li v-for="(item, index) in list" :key="item.groupReqId">
        <TextAvatar
          class="item-avatar"
          :name="item.groupName"
          :src="item.pic || null"
          avatar-type="group"
          :size="40"
          rounded
        />
        <div class="item-body">
          <div class="top-info">
            <h2>{{ item.groupName }}</h2>
            <span class="time"> · {{ formatTime(item.updateTime) }}</span>
          </div>
          <p class="line-notify">{{ formatReqMessage(item) }}</p>
        </div>
        <div
          v-if="[1, 2, 15].includes(item.groupReqType)"
          class="right-info"
        >
          <template v-if="!item.groupReqStatus">
            <button type="button" @click="handleCheck(item, false, index)">{{ t('拒绝') }}</button>
            <button type="button" class="active" @click="handleCheck(item, true, index)">{{ t('通过') }}</button>
          </template>
          <span v-else class="status-label">{{ statusLabel(item.groupReqStatus) }}</span>
        </div>
      </li>
      <li v-if="list.length === 0" class="empty-tip">{{ t('暂无群通知') }}</li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.group-invitation {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
  background: #fff;

  > h1 {
    margin: 0;
    display: flex;
    height: 51px;
    padding: 0 16px;
    align-items: center;
    border-bottom: 1px solid #eee;
    font-size: 16px;
    font-weight: 700;
    color: #333;
    flex-shrink: 0;
  }
}

.notify-box {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;

  > li {
    min-height: 72px;
    position: relative;
    padding: 12px 150px 12px 65px;
    display: flex;
    align-items: center;

    &::after {
      content: "";
      display: block;
      position: absolute;
      right: 0;
      bottom: 0;
      left: 65px;
      height: 1px;
      background: #ebebeb;
    }

    &.empty-tip {
      justify-content: center;
      padding: 24px;
      color: #999;
      font-size: 14px;
      &::after { display: none; }
    }
  }
}

.item-avatar {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
}

.item-body {
  flex: 1;
  min-width: 0;
}

.top-info {
  display: flex;
  align-items: center;

  > h2 {
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    color: #000;
    margin: 0;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    max-width: 70%;
    margin-right: 5px;
  }

  .time {
    font-size: 12px;
    color: #999;
  }
}

.line-notify {
  margin: 0;
  line-height: 20px;
  color: #2288f0;
  font-size: 12px;
}

.right-info {
  position: absolute;
  right: 15px;
  display: flex;
  gap: 5px;

  > button {
    border: 0;
    color: #fff;
    background: #666;
    line-height: 30px;
    padding: 0 10px;
    border-radius: 5px;
    min-width: 60px;
    width: auto;
    text-align: center;
    cursor: pointer;

    &:hover { opacity: 0.8; }
    &.active { background: #3369fe; }
  }

  .status-label {
    display: inline-block;
    line-height: 30px;
    min-height: 30px;
    padding: 0 8px;
    background: #eeeff3;
    color: #999b9e;
    min-width: 60px;
    width: auto;
    max-width: 120px;
    text-align: center;
    border-radius: 5px;
    font-size: 12px;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
