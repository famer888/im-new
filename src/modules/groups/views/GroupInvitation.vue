<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { getGroupReqList, groupCheckJoin, groupUserCheckJoin } from '@/api/imBase'
import TextAvatar from '@/components/TextAvatar.vue'

interface GroupReqItem {
  groupReqId: number
  groupId: number
  groupName: string
  pic: string
  msg: string
  groupReqType: number
  groupReqStatus: number
  groupHostUid: number
  createTime: number
  updateTime: number
}

const authStore = useAuthStore()
const list = ref<GroupReqItem[]>([])

const statusText: Record<number, string> = {
  1: '已同意',
  2: '已拒绝',
  3: '已失效',
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

async function loadList() {
  try {
    const res = await getGroupReqList({ pageNum: 1, pageSize: 100 })
    if (res?.groupReqs) {
      list.value = res.groupReqs
        .map((item: any) => ({
          groupReqId: Number(item.groupReqId),
          groupId: Number(item.groupId),
          groupName: item.groupName || '',
          pic: item.pic || '',
          msg: item.msg || '',
          groupReqType: item.groupReqType || 0,
          groupReqStatus: item.groupReqStatus || 0,
          groupHostUid: Number(item.groupHostUid),
          createTime: Number(item.createTime),
          updateTime: Number(item.updateTime),
        }))
        .filter((item: GroupReqItem) => !(item as any).isHide)
    }
  } catch (e) {
    console.error('[GroupInvitation] loadList failed:', e)
  }
}

async function handleCheck(item: GroupReqItem, flag: boolean, index: number) {
  const isAuditor =
    [2, 15].includes(item.groupReqType) ||
    item.groupHostUid === Number(authStore.uid)

  const apiFn = isAuditor ? groupCheckJoin : groupUserCheckJoin

  try {
    const res = await apiFn({ groupReqId: item.groupReqId, flag })
    if (Number((res as any)?.commonResult?.errCode) === 200) {
      list.value[index] = { ...list.value[index], groupReqStatus: flag ? 1 : 2 }
    } else {
      console.error('操作失败', (res as any)?.commonResult?.errMsg)
    }
  } catch (e) {
    console.error('[GroupInvitation] check failed:', e)
  }
}

onMounted(() => loadList())
</script>

<template>
  <div class="group-invitation">
    <h1>群通知</h1>
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
          <p class="line-notify">{{ item.msg }}</p>
        </div>
        <div
          v-if="[1, 2, 15].includes(item.groupReqType)"
          class="right-info"
        >
          <template v-if="!item.groupReqStatus">
            <button @click="handleCheck(item, false, index)">拒绝</button>
            <button class="active" @click="handleCheck(item, true, index)">通过</button>
          </template>
          <span v-else class="status-label">{{ statusText[item.groupReqStatus] || '' }}</span>
        </div>
      </li>
      <li v-if="list.length === 0" class="empty-tip">暂无群通知</li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.group-invitation {
  display: flex;
  flex-direction: column;
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
    width: 60px;
    text-align: center;
    cursor: pointer;

    &:hover { opacity: 0.8; }
    &.active { background: #3369fe; }
  }

  .status-label {
    display: block;
    line-height: 30px;
    height: 30px;
    background: #eeeff3;
    color: #999b9e;
    width: 60px;
    text-align: center;
    border-radius: 5px;
  }
}
</style>
