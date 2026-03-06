<script setup lang="ts">
import { ref } from 'vue'
import TextAvatar from '@/components/TextAvatar.vue'

interface FriendRequest {
  id: string
  uid: string
  nickname: string
  avatar: string | null
  message: string
  status: 'pending' | 'accepted' | 'rejected'
}

const requests = ref<FriendRequest[]>([])

function handleAccept(req: FriendRequest) {
  req.status = 'accepted'
  // TODO: invoke accept_friend via Tauri
}

function handleReject(req: FriendRequest) {
  req.status = 'rejected'
  // TODO: invoke reject_friend via Tauri
}
</script>

<template>
  <div class="friend-examine">
    <div class="examine-header">
      <span class="title">好友验证</span>
    </div>
    <div class="examine-list">
      <div v-for="req in requests" :key="req.id" class="examine-item">
        <TextAvatar :name="req.nickname || req.uid" :src="req.avatar" :size="40" />
        <div class="examine-info">
          <div class="examine-name">{{ req.nickname || req.uid }}</div>
          <div class="examine-msg">{{ req.message }}</div>
        </div>
        <div v-if="req.status === 'pending'" class="examine-actions">
          <button class="btn-accept" @click="handleAccept(req)">接受</button>
          <button class="btn-reject" @click="handleReject(req)">拒绝</button>
        </div>
        <span v-else-if="req.status === 'accepted'" class="status-text accepted">已添加</span>
        <span v-else class="status-text rejected">已拒绝</span>
      </div>
      <div v-if="requests.length === 0" class="empty">暂无验证消息</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.friend-examine { flex: 1; display: flex; flex-direction: column; background: #fff; }

.examine-header {
  height: 50px; display: flex; align-items: center; padding: 0 20px;
  border-bottom: 1px solid #ebeef5;
  .title { font-size: 15px; font-weight: 500; color: #333; }
}

.examine-list { flex: 1; overflow-y: auto; }

.examine-item {
  display: flex; align-items: center; gap: 12px; padding: 12px 20px;
  border-bottom: 1px solid #f5f5f5;
}

.examine-info { flex: 1; min-width: 0; }
.examine-name { font-size: 14px; color: #333; }
.examine-msg { font-size: 12px; color: #999; margin-top: 2px; }

.examine-actions { display: flex; gap: 6px; }
.btn-accept {
  height: 28px; padding: 0 12px; background: #3369fe; color: #fff;
  border: none; border-radius: 4px; font-size: 12px; cursor: pointer;
}
.btn-reject {
  height: 28px; padding: 0 12px; background: #fff; color: #666;
  border: 1px solid #dcdfe6; border-radius: 4px; font-size: 12px; cursor: pointer;
}

.status-text { font-size: 12px; &.accepted { color: #67c23a; } &.rejected { color: #999; } }
.empty { text-align: center; padding: 60px; color: #ccc; font-size: 13px; }
</style>
