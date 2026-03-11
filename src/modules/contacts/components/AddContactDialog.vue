<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { findContactsList, contactsRelation } from '@/api/imBase'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const authStore = useAuthStore()

type FoundContact = {
  uid: string
  nickname: string
  avatar: string
  addToken: string
  isFriend: boolean
}

const searchText = ref('')
const searching = ref(false)
const searchDone = ref(false)
const searchResult = ref<FoundContact[]>([])
const selectedUser = ref<FoundContact | null>(null)
const verifyMessage = ref('')
const sending = ref(false)
const sendResult = ref<'success' | 'fail' | null>(null)

watch(() => props.visible, (v) => {
  if (v) reset()
})

function reset() {
  searchText.value = ''
  searching.value = false
  searchDone.value = false
  searchResult.value = []
  selectedUser.value = null
  verifyMessage.value = ''
  sending.value = false
  sendResult.value = null
}

async function handleSearch() {
  const val = searchText.value.replace(/@/g, '').trim()
  if (!val) return

  searching.value = true
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
        addToken: item.addToken || '',
        isFriend: !!userInfo.friendRelation?.bfFriend,
      }
    })
  } catch (e) {
    console.error('[AddContact] Search failed:', e)
    searchResult.value = []
  } finally {
    searching.value = false
    searchDone.value = true
  }
}

function handleSelectUser(user: FoundContact) {
  selectedUser.value = user
  verifyMessage.value = '我是' + (authStore.nickname || '')
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
    if (errCode === 200 || errCode === 0) {
      sendResult.value = 'success'
    } else {
      sendResult.value = 'fail'
    }
  } catch (e) {
    console.error('[AddContact] Add failed:', e)
    sendResult.value = 'fail'
  } finally {
    sending.value = false
  }
}

function handleClose() {
  emit('update:visible', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="handleClose">
        <div class="add-dialog">
          <div class="dialog-header">
            <button v-if="selectedUser" class="back-btn" @click="handleBack">←</button>
            <span>{{ selectedUser ? '添加好友' : '搜索联系人' }}</span>
            <button class="close-btn" @click="handleClose">×</button>
          </div>

          <!-- 搜索页 -->
          <template v-if="!selectedUser">
            <div class="dialog-body">
              <div class="search-row">
                <input
                  v-model="searchText"
                  placeholder="输入通讯号/手机号搜索"
                  @keyup.enter="handleSearch"
                />
                <button class="search-btn" :disabled="searching" @click="handleSearch">
                  {{ searching ? '搜索中...' : '搜索' }}
                </button>
              </div>

              <!-- 搜索结果列表 -->
              <div v-if="searchResult.length" class="result-list">
                <div
                  v-for="user in searchResult"
                  :key="user.uid"
                  class="result-item"
                  @click="handleSelectUser(user)"
                >
                  <div class="user-avatar">
                    <img v-if="user.avatar" :src="user.avatar" />
                    <span v-else>{{ user.nickname?.[0] ?? '?' }}</span>
                  </div>
                  <div class="user-info">
                    <span class="user-name">{{ user.nickname || user.uid }}</span>
                  </div>
                  <span class="arrow">›</span>
                </div>
              </div>

              <!-- 搜索无结果 -->
              <div v-else-if="searchDone && !searching" class="no-result">
                <div class="no-result-icon">🔍</div>
                <span>搜索无结果</span>
              </div>
            </div>
          </template>

          <!-- 用户详情 + 验证页 -->
          <template v-else>
            <div class="dialog-body detail-body">
              <div class="detail-card">
                <div class="detail-avatar">
                  <img v-if="selectedUser.avatar" :src="selectedUser.avatar" />
                  <span v-else>{{ selectedUser.nickname?.[0] ?? '?' }}</span>
                </div>
                <span class="detail-name">{{ selectedUser.nickname || selectedUser.uid }}</span>
              </div>

              <template v-if="selectedUser.isFriend">
                <div class="already-friend">已经是好友</div>
              </template>
              <template v-else>
                <div class="verify-section">
                  <label>验证消息</label>
                  <textarea v-model="verifyMessage" placeholder="验证消息" rows="3" />
                </div>
                <button class="send-btn" :disabled="sending" @click="handleAdd">
                  {{ sending ? '发送中...' : '发送验证' }}
                </button>

                <div v-if="sendResult === 'success'" class="send-tip success">
                  已向对方发送添加申请
                </div>
                <div v-else-if="sendResult === 'fail'" class="send-tip fail">
                  发送失败，请稍后尝试
                </div>
              </template>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-dialog {
  width: 400px;
  max-height: 520px;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  font-size: 15px;
  font-weight: 500;
  border-bottom: 1px solid #f0f0f0;

  span {
    flex: 1;
  }

  .back-btn {
    background: none;
    border: none;
    font-size: 18px;
    color: #3369fe;
    cursor: pointer;
    margin-right: 8px;
    padding: 0;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 20px;
    color: #999;
    cursor: pointer;
    padding: 0;
  }
}

.dialog-body {
  padding: 16px 20px 20px;
  overflow-y: auto;
  flex: 1;
}

.search-row {
  display: flex;
  gap: 8px;

  input {
    flex: 1;
    height: 36px;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    padding: 0 12px;
    font-size: 14px;
    outline: none;

    &:focus {
      border-color: #3369fe;
    }
  }

  .search-btn {
    height: 36px;
    padding: 0 16px;
    background: #3369fe;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}

.result-list {
  margin-top: 12px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f5f5f5;
  cursor: pointer;

  &:hover {
    background: #fafafa;
  }

  .user-avatar {
    width: 40px;
    height: 40px;
    border-radius: 4px;
    background: #3369fe;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .user-info {
    flex: 1;
    min-width: 0;
  }

  .user-name {
    font-size: 14px;
    color: #333;
  }

  .arrow {
    color: #c0c4cc;
    font-size: 18px;
  }
}

.no-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0;
  color: #b9babe;

  .no-result-icon {
    font-size: 40px;
    margin-bottom: 12px;
    opacity: 0.5;
  }

  span {
    font-size: 14px;
  }
}

.detail-body {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.detail-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0 16px;

  .detail-avatar {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: #3369fe;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .detail-name {
    font-size: 18px;
    color: #333;
    margin-top: 12px;
    font-weight: 500;
  }
}

.already-friend {
  color: #67c23a;
  font-size: 14px;
  padding: 12px 0;
}

.verify-section {
  width: 100%;
  margin-top: 8px;

  label {
    font-size: 13px;
    color: #666;
    display: block;
    margin-bottom: 6px;
  }

  textarea {
    width: 100%;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 14px;
    resize: none;
    outline: none;
    font-family: inherit;

    &:focus {
      border-color: #3369fe;
    }
  }
}

.send-btn {
  display: block;
  width: 100%;
  height: 36px;
  margin-top: 12px;
  background: #3369fe;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: rgba(51, 105, 254, 0.85);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.send-tip {
  margin-top: 10px;
  font-size: 13px;
  text-align: center;

  &.success {
    color: #67c23a;
  }

  &.fail {
    color: #f56c6c;
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
