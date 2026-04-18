<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { useContactStore } from '@/stores/useContactStore'
import { useUIStore } from '@/stores/useUIStore'
import { findContactsList, contactsRelation } from '@/api/imBase'
import TextAvatar from '@/components/TextAvatar.vue'
import FriendList from './FriendList.vue'
/** 与 im `search-add-contacts.vue` 一致 */
import searchBlueIcon from '@/assets/images/headNav/search-blue.png'
import addNewIcon from '@/assets/images/headNav/add-new-icon.png'
import emptyIcon from '@/assets/images/common/empty-icon.png'
import searchNoDataImg from '@/assets/images/common/search-no-data.png'

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
const contactStore = useContactStore()
const uiStore = useUIStore()

const searching = ref(false)
const searchTriggered = ref(false)
const searchDone = ref(false)
const searchResult = ref<FoundContact[]>([])
const selectedUser = ref<FoundContact | null>(null)
const verifyMessage = ref('')
const sending = ref(false)
const sendResult = ref<'success' | 'fail' | null>(null)

const trimmedQuery = computed(() => props.searchText.replace(/@/g, '').trim())

onMounted(() => {
  if (authStore.uid) contactStore.loadContacts(authStore.uid)
})

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
  const val = trimmedQuery.value
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

function goNewFriendExamine() {
  uiStore.setDetailView('friend-examine')
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
        <button type="button" class="back-row" @click="handleBack">
          <span class="back-text">返回</span>
        </button>
        <div class="detail-card">
          <TextAvatar :name="selectedUser.nickname || selectedUser.uid" :src="selectedUser.avatar" :size="72" rounded />
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
          <button type="button" class="send-btn" :disabled="sending" @click="handleAdd">
            {{ sending ? '发送中...' : '发送验证' }}
          </button>
          <div v-if="sendResult === 'success'" class="send-tip success">已向对方发送添加申请</div>
          <div v-else-if="sendResult === 'fail'" class="send-tip fail">发送失败，请稍后重试</div>
        </template>
      </div>
    </template>

    <template v-else>
      <div class="add-contacts-body">
        <!-- 与 im `.add-tip`：白底卡片 + 蓝方块放大镜 + 文案 + 右箭头 -->
        <div
          v-if="trimmedQuery && !searchTriggered"
          class="search-entry-card"
          role="button"
          tabindex="0"
          @click="handleSearch"
          @keydown.enter.prevent="handleSearch"
        >
          <div class="search-entry-left">
            <img class="search-entry-icon" :src="searchBlueIcon" alt="" />
            <span class="search-entry-label">搜索{{ trimmedQuery }}</span>
          </div>
          <span class="search-entry-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                stroke-width="2.25"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
        </div>

        <div v-if="searchTriggered" class="search-result-wrap">
          <div v-if="searching" class="state-loading">搜索中...</div>
          <template v-else-if="searchResult.length > 0">
            <div
              v-for="user in searchResult"
              :key="user.uid"
              class="result-contact-row"
              @click="handleSelectUser(user)"
            >
              <TextAvatar :name="user.nickname || user.uid" :src="user.avatar" :size="40" rounded />
              <span class="result-name">{{ user.nickname || user.uid }}</span>
            </div>
          </template>
          <div v-else-if="searchDone" class="search-no-data-block">
            <img class="search-no-data-img" :src="searchNoDataImg" alt="" />
            <span class="search-no-data-tip">搜索无结果</span>
          </div>
        </div>

        <!-- 与 AddressBook「新的好友」行一致 -->
        <div class="new-friend-row" role="button" tabindex="0" @click="goNewFriendExamine" @keydown.enter.prevent="goNewFriendExamine">
          <img class="new-friend-icon" :src="addNewIcon" alt="" />
          <span class="new-friend-title">新的好友</span>
        </div>

        <!-- 本地无好友：与全局搜索空态一致的 briefcase 风 empty-icon -->
        <div v-if="contactStore.contacts.length === 0" class="empty-book">
          <img class="empty-book-icon" :src="emptyIcon" alt="" />
          <span class="empty-book-text">暂无数据</span>
        </div>
        <FriendList v-else embed class="friend-list-embed" />
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.search-add-contacts {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.add-contacts-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 8px 12px 16px;
  box-sizing: border-box;
}

/* —— 搜索入口卡片（对齐 im `.add-tip`） —— */
.search-entry-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  box-sizing: border-box;
  padding: 14px 14px 14px 12px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;

  &:hover {
    background: #fafafa;
  }

  &:active {
    opacity: 0.92;
  }

  &:hover .search-entry-chevron {
    color: #aeaeb2;
  }
}

.search-entry-left {
  display: flex;
  align-items: center;
  min-width: 0;
}

/* 与 im 一致：headNav/search-blue.png 自带蓝底方块 + 放大镜 */
.search-entry-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: block;
  object-fit: contain;
}

.search-entry-label {
  margin-left: 10px;
  font-size: 15px;
  color: #333;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 列表右侧指示：矢量尖角，避免 PNG 发糊、双影 */
.search-entry-chevron {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-left: 4px;
  color: #c5c5c7;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
}

/* —— 搜索结果 —— */
.search-result-wrap {
  margin-top: 10px;
  flex-shrink: 0;
}

.state-loading {
  padding: 24px 0;
  text-align: center;
  font-size: 14px;
  color: #999;
}

.result-contact-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  cursor: pointer;

  &:hover {
    background: #fafafa;
  }
}

.result-name {
  font-size: 15px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-no-data-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 0 8px;

  .search-no-data-img {
    width: 36%;
    max-width: 200px;
    min-width: 140px;
    height: auto;
    object-fit: contain;
  }

  .search-no-data-tip {
    margin-top: 14px;
    font-size: 14px;
    color: #b9babe;
  }
}

/* —— 新的好友 —— */
.new-friend-row {
  display: flex;
  align-items: center;
  margin-top: 14px;
  padding: 10px 8px 12px 4px;
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 6px;

  &:hover {
    background: rgba(0, 0, 0, 0.03);
  }
}

.new-friend-icon {
  width: 35px;
  height: 35px;
  flex-shrink: 0;
}

.new-friend-title {
  margin-left: 10px;
  font-size: 15px;
  font-weight: 600;
  color: #000;
}

/* —— 暂无数据 —— */
.empty-book {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 36px 16px 24px;
  min-height: 120px;
}

.empty-book-icon {
  display: block;
  width: 32%;
  max-width: 160px;
  height: auto;
  opacity: 0.85;
}

.empty-book-text {
  margin-top: 14px;
  font-size: 14px;
  color: #999;
  text-align: center;
}

.friend-list-embed {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0 -12px;
  padding: 0 12px;
  background: #fcfcfc;
  border-radius: 6px;
}

/* —— 详情 —— */
.user-detail {
  padding: 12px 16px 24px;
  background: #f5f5f5;
  min-height: 100%;
  box-sizing: border-box;
}

.back-row {
  display: flex;
  align-items: center;
  padding: 4px 0 12px;
  border: none;
  background: none;
  cursor: pointer;
}

.back-text {
  font-size: 15px;
  color: #333;
}

.detail-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 16px 24px;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #eee;
}

.detail-name {
  margin-top: 16px;
  font-size: 18px;
  color: #333;
  font-weight: 600;
}

.already-friend {
  margin-top: 20px;
  text-align: center;
  color: #67c23a;
  font-size: 15px;
}

.verify-section {
  margin-top: 16px;
  width: 100%;

  label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    color: #666;
  }

  textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #dcdfe6;
    border-radius: 8px;
    resize: none;
    outline: none;
    box-sizing: border-box;
    font-size: 15px;
    font-family: inherit;
    background: #fff;
  }
}

.send-btn {
  width: 100%;
  height: 44px;
  margin-top: 16px;
  border: none;
  border-radius: 8px;
  background: #3369fe;
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.send-tip {
  margin-top: 12px;
  text-align: center;
  font-size: 14px;

  &.success {
    color: #67c23a;
  }
  &.fail {
    color: #f56c6c;
  }
}
</style>
