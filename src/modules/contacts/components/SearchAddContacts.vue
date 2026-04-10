<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { findContactsList, contactsRelation } from '@/api/imBase'
import TextAvatar from '@/components/TextAvatar.vue'

const props = defineProps<{
  searchText: string
}>()

type FoundContact = {
  uid: string
  nickname: string
  avatar: string
  isFriend: boolean
}

const authStore = useAuthStore()
const searching = ref(false)
const searchTriggered = ref(false)
const searchDone = ref(false)
const searchResult = ref<FoundContact[]>([])
const selectedUser = ref<FoundContact | null>(null)
const verifyMessage = ref('')
const sending = ref(false)
const sendResult = ref<'success' | 'fail' | null>(null)

function resetResultState() {
  searching.value = false
  searchTriggered.value = false
  searchDone.value = false
  searchResult.value = []
  selectedUser.value = null
  verifyMessage.value = ''
  sending.value = false
  sendResult.value = null
}

watch(() => props.searchText, () => {
  resetResultState()
})

async function handleSearch() {
  const val = props.searchText.replace(/@/g, '').trim()
  if (!val) return

  searching.value = true
  searchTriggered.value = true
  searchDone.value = false
  searchResult.value = []
  selectedUser.value = null

  try {
    const resp = await findContactsList({ phoneNum: val, findType: 1 })
    const list = resp.detailList || []
    searchResult.value = list.map((item: any) => {
      const userInfo = item.userInfo || {}
      return {
        uid: String(userInfo.uid || ''),
        nickname: userInfo.nickName || userInfo.nickname || '',
        avatar: userInfo.icon || userInfo.avatar || '',
        isFriend: !!userInfo.friendRelation?.bfFriend,
      }
    })
  } catch (error) {
    console.error('[SearchAddContacts] search failed:', error)
    searchResult.value = []
  } finally {
    searching.value = false
    searchDone.value = true
  }
}

function handleSelectUser(user: FoundContact) {
  selectedUser.value = user
  verifyMessage.value = `我是${authStore.nickname || ''}`
  sendResult.value = null
}

function handleBack() {
  selectedUser.value = null
  sendResult.value = null
}

async function handleAdd() {
  if (!selectedUser.value || sending.value) return
  sending.value = true
  sendResult.value = null

  try {
    const resp = await contactsRelation({
      targetUid: Number(selectedUser.value.uid),
      msg: verifyMessage.value,
      type: 0,
      op: 0,
    })
    const errCode = (resp as any).commonResult?.errCode
    sendResult.value = errCode === 200 || errCode === 0 ? 'success' : 'fail'
  } catch (error) {
    console.error('[SearchAddContacts] add failed:', error)
    sendResult.value = 'fail'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="search-add-contacts">
    <template v-if="selectedUser">
      <div class="user-detail">
        <button class="back-btn" @click="handleBack">返回</button>
        <div class="detail-card">
          <TextAvatar :name="selectedUser.nickname || selectedUser.uid" :src="selectedUser.avatar" :size="64" />
          <div class="detail-name">{{ selectedUser.nickname || selectedUser.uid }}</div>
        </div>

        <template v-if="selectedUser.isFriend">
          <div class="already-friend">已经是好友</div>
        </template>
        <template v-else>
          <div class="verify-section">
            <label>验证消息</label>
            <textarea v-model="verifyMessage" rows="3" placeholder="请输入验证消息" />
          </div>
          <button class="send-btn" :disabled="sending" @click="handleAdd">
            {{ sending ? '发送中...' : '发送验证' }}
          </button>
          <div v-if="sendResult === 'success'" class="send-tip success">已向对方发送添加申请</div>
          <div v-else-if="sendResult === 'fail'" class="send-tip fail">发送失败，请稍后重试</div>
        </template>
      </div>
    </template>

    <template v-else>
      <div v-if="props.searchText && !searchTriggered" class="add-tip" @click="handleSearch">
        <span>搜索 {{ props.searchText }}</span>
      </div>

      <div v-else-if="searching" class="loading">搜索中...</div>

      <div v-else-if="searchResult.length > 0" class="result-list">
        <div
          v-for="user in searchResult"
          :key="user.uid"
          class="result-item"
          @click="handleSelectUser(user)"
        >
          <TextAvatar :name="user.nickname || user.uid" :src="user.avatar" :size="36" />
          <div class="user-name">{{ user.nickname || user.uid }}</div>
        </div>
      </div>

      <div v-else-if="searchDone" class="no-result">
        <span>搜索无结果</span>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.search-add-contacts {
  padding: 4px 0 0;
}

.add-tip {
  margin-top: 4px;
  padding: 16px;
  border: 1px solid #e5e5e5;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #333;
}

.loading,
.no-result {
  padding: 40px 0;
  text-align: center;
  color: #b9babe;
  font-size: 14px;
}

.result-list {
  margin-top: 10px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  cursor: pointer;
  border-bottom: 1px solid #f2f2f2;

  &:hover {
    background: #fafafa;
  }
}

.user-name {
  font-size: 14px;
  color: #333;
}

.user-detail {
  padding-top: 8px;
}

.back-btn {
  border: none;
  background: none;
  padding: 0;
  margin-bottom: 10px;
  font-size: 12px;
  color: #333;
  cursor: pointer;
}

.detail-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0 16px;
}

.detail-name {
  margin-top: 12px;
  font-size: 16px;
  color: #333;
  font-weight: 500;
}

.already-friend {
  text-align: center;
  color: #67c23a;
  font-size: 14px;
}

.verify-section {
  margin-top: 8px;

  label {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
    color: #666;
  }

  textarea {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    resize: none;
    outline: none;
    box-sizing: border-box;
    font-size: 14px;
    font-family: inherit;
  }
}

.send-btn {
  width: 100%;
  height: 36px;
  margin-top: 12px;
  border: none;
  border-radius: 4px;
  background: #3369fe;
  color: #fff;
  font-size: 14px;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.send-tip {
  margin-top: 10px;
  text-align: center;
  font-size: 13px;

  &.success { color: #67c23a; }
  &.fail { color: #f56c6c; }
}
</style>
