<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import TextAvatar from '@/components/TextAvatar.vue'
import FriendVerifyDetail from './FriendVerifyDetail.vue'
import type { VerifyRecord } from './FriendVerifyDetail.vue'
import { getContactsApplyList } from '@/api/imBase'
import { useAuthStore } from '@/stores/useAuthStore'
import { useContactStore } from '@/stores/useContactStore'
import noDataIcon from '@/assets/images/common/search-no-data.png'

interface FriendRequest {
  id: string
  uid: string
  nickname: string
  avatar: string | null
  message: string
  status: 'pending' | 'accepted' | 'rejected'
  bfMyBlack: boolean
  type: number
  identify?: string
  gender?: number
  depict?: string
}

const authStore = useAuthStore()
const contactStore = useContactStore()

const requests = ref<FriendRequest[]>([])
const showDetail = ref(false)
const selectedRecord = ref<VerifyRecord | null>(null)
const loadState = ref<0 | 1 | 2 | 3>(1) // 0: 成功，1: 加载中，2: 加载失败，3: 空数据

const pendingRequests = computed(() => requests.value.filter((req) => req.status === 'pending'))
const recentRequests = computed(() => requests.value.filter((req) => req.status !== 'pending'))

onMounted(() => {
  contactStore.setNewFriendReqTotal(0, String(authStore.uid || ''))
  loadApplyList()
})

async function loadApplyList() {
  loadState.value = 1
  try {
    const resp = await getContactsApplyList({ version: 0 })
    const errCode = Number((resp as any)?.commonResult?.errCode ?? 200)
    if (errCode !== 200 && errCode !== 0) {
      loadState.value = 2
      return
    }

    const all: FriendRequest[] = []
    const unRecordList = (resp as any).unRecordList || []
    const recordList = (resp as any).recordList || []

    for (const item of unRecordList) {
      const u = item.userInfo || {}
      all.push({
        id: String(u.uid || ''),
        uid: String(u.uid || ''),
        nickname: u.nickName || '',
        avatar: u.icon || null,
        message: item.msg || '',
        status: 'pending',
        bfMyBlack: Boolean(item.bfMyBlack),
        type: Number(item.type || 0),
        identify: u.identify || '',
        gender: Number(u.gender || 0),
        depict: u.depict || '',
      })
    }
    for (const item of recordList) {
      const u = item.userInfo || {}
      all.push({
        id: String(u.uid || ''),
        uid: String(u.uid || ''),
        nickname: u.nickName || '',
        avatar: u.icon || null,
        message: item.msg || '',
        status: 'accepted',
        bfMyBlack: Boolean(item.bfMyBlack),
        type: Number(item.type || 0),
        identify: u.identify || '',
        gender: Number(u.gender || 0),
        depict: u.depict || '',
      })
    }
    requests.value = all
    loadState.value = all.length > 0 ? 0 : 3
  } catch (e) {
    loadState.value = 2
    console.error('[FriendExamine] loadApplyList failed:', e)
  }
}

function openVerifyDetail(req: FriendRequest) {
  selectedRecord.value = {
    userInfo: {
      uid: Number(req.uid),
      nickName: req.nickname,
      icon: req.avatar || '',
      identify: req.identify,
      gender: req.gender,
      depict: req.depict,
    },
    msg: req.message,
    type: req.type,
    bfMyBlack: req.bfMyBlack,
  }
  showDetail.value = true
}

function handleDetailBack() {
  showDetail.value = false
  selectedRecord.value = null
}

/** 与 im new-friend-examine-list verifyClose 一致：关闭后刷新申请列表并同步通讯录 */
async function handleDetailClose() {
  showDetail.value = false
  selectedRecord.value = null
  await loadApplyList()
  if (authStore.uid) {
    await contactStore.loadContacts(authStore.uid)
  }
}
</script>

<template>
  <div class="friend-examine">
    <FriendVerifyDetail
      v-if="showDetail && selectedRecord"
      :info="selectedRecord"
      @back="handleDetailBack"
      @close="handleDetailClose"
    />

    <template v-else>
      <div class="examine-header">
        <span class="title">新的朋友</span>
      </div>

      <div v-if="loadState === 1" class="loading">loading..</div>
      <div v-else-if="loadState === 2" class="loading">数据获取失败</div>
      <div v-else-if="loadState === 3" class="loading">
        <img class="icon-no-data" :src="noDataIcon" alt="" />
        <div>无数据</div>
      </div>

      <div v-else class="examine-content">
        <div class="section-title">待处理</div>
        <div class="section-card">
          <template v-if="pendingRequests.length > 0">
            <div v-for="req in pendingRequests" :key="req.id" class="examine-item">
              <TextAvatar :name="req.nickname || req.uid" :src="req.avatar" :size="34" />
              <div class="examine-info">
                <div class="row-top">
                  <div class="examine-name">{{ req.nickname || req.uid }}</div>
                  <span v-if="req.bfMyBlack" class="black-tag">已拉黑</span>
                </div>
                <div class="examine-msg">{{ req.message }}</div>
              </div>
              <div class="examine-actions">
                <button class="btn-accept" @click="openVerifyDetail(req)">验证</button>
              </div>
            </div>
          </template>
        </div>

        <div class="section-title">近期请求</div>
        <div class="section-card">
          <template v-if="recentRequests.length > 0">
            <div v-for="req in recentRequests" :key="req.id" class="examine-item">
              <TextAvatar :name="req.nickname || req.uid" :src="req.avatar" :size="34" />
              <div class="examine-info">
                <div class="row-top">
                  <div class="examine-name">{{ req.nickname || req.uid }}</div>
                  <span v-if="req.bfMyBlack" class="black-tag">已拉黑</span>
                </div>
                <div class="examine-msg">{{ req.message }}</div>
              </div>
              <span v-if="req.status === 'accepted'" class="status-text accepted">已同意</span>
              <span v-else class="status-text rejected">已拒绝</span>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.friend-examine {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f6f6f6;
  overflow-y: auto;
  position: relative;
}

.examine-header {
  padding: 20px;
  box-sizing: border-box;
  background: #fff;
  .title {
    font-size: 14px;
    color: #000;
  }
}

.examine-content {
  padding: 0 10px 20px;
}

.section-title {
  font-size: 14px;
  color: #b9babe;
  margin: 20px 0;
}

.section-card {
  background: #fff;
  border-radius: 4px;
  padding: 0 10px;
}

.loading {
  text-align: center;
  margin-top: 100px;
}

.icon-no-data {
  width: 80px;
  height: auto;
  margin-bottom: 8px;
}

.examine-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 54px;
  padding: 10px 0;
  border-bottom: 1px solid #f2f2f2;

  &:last-child {
    border-bottom: none;
  }
}

.examine-info {
  flex: 1;
  min-width: 0;
  margin-left: 10px;
}

.row-top {
  display: flex;
  align-items: center;
}

.examine-name {
  font-size: 12px;
  color: #000;
}

.black-tag {
  font-size: 10px;
  color: #fb2826;
  margin-left: 6px;
}

.examine-msg {
  font-size: 12px;
  color: #b9babe;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.examine-actions {
  margin-left: 12px;
}

.btn-accept {
  width: 66px;
  height: 24px;
  padding: 0;
  line-height: 24px;
  background: #3369fe;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.status-text {
  width: 66px;
  height: 24px;
  border: 1px solid #b9babe;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b9babe;
  font-size: 14px;
  border-radius: 4px;
  flex-shrink: 0;
}
</style>
