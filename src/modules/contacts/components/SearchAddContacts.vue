<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUIStore } from '@/stores/useUIStore'
import { useChatStore } from '@/stores/useChatStore'
import { findContactsList, contactsRelation, groupSearch } from '@/api/imBase'
import TextAvatar from '@/components/TextAvatar.vue'
/** 与 im `search-add-contacts.vue` 一致：先群搜索再手机号找人；结果区仅「群聊 / 联系人」Tab */
import searchBlueIcon from '@/assets/images/headNav/search-blue.png'
import addNewIcon from '@/assets/images/headNav/add-new-icon.png'
import searchNoDataImg from '@/assets/images/common/search-no-data.png'

const props = defineProps<{
  searchText: string
}>()

type FoundContact = {
  uid: string
  nickname: string
  avatar: string
  addToken: string
  isFriend: boolean
}

type GroupHit = {
  id: string
  name: string
  avatar: string
}

const { t } = useI18n()
const authStore = useAuthStore()
const uiStore = useUIStore()
const chatStore = useChatStore()

const searching = ref(false)
const searchTriggered = ref(false)
const searchDone = ref(false)
/** 与老 im 一致：0=群聊 1=联系人 */
const tabAction = ref(0)
const groupHit = ref<GroupHit | null>(null)
const contactHits = ref<FoundContact[]>([])
const searchResultNone = ref(false)

const selectedUser = ref<FoundContact | null>(null)
const verifyMessage = ref('')
const sending = ref(false)
const sendResult = ref<'success' | 'fail' | null>(null)

const trimmedQuery = computed(() => props.searchText.replace(/@/g, '').trim())

const hasSearchPayload = computed(() => !!groupHit.value || contactHits.value.length > 0)

const tabList = [
  { name: '群聊', key: 0 },
  { name: '联系人', key: 1 },
]

function resetResultState() {
  searching.value = false
  searchTriggered.value = false
  searchDone.value = false
  tabAction.value = 1
  groupHit.value = null
  contactHits.value = []
  searchResultNone.value = false
  selectedUser.value = null
  verifyMessage.value = ''
  sending.value = false
  sendResult.value = null
}

watch(() => props.searchText, () => {
  resetResultState()
})

function tabSelect(key: number) {
  tabAction.value = key
}

function parseGroupHit(gs: unknown): GroupHit | null {
  const gd = (gs as any)?.groupDetail
  const gb = gd?.groupBase
  if (!gb) return null
  const rawId = gb.groupId ?? gb.id
  if (rawId == null || rawId === '') return null
  const id = typeof rawId === 'object' && rawId !== null && 'toString' in rawId
    ? String(rawId)
    : String(rawId)
  return {
    id,
    name: String(gb.name ?? gb.groupName ?? ''),
    avatar: String(gb.pic ?? gb.icon ?? ''),
  }
}

async function handleSearch() {
  const val = trimmedQuery.value
  if (!val) return

  searching.value = true
  searchTriggered.value = true
  searchDone.value = false
  groupHit.value = null
  contactHits.value = []
  searchResultNone.value = false
  selectedUser.value = null

  const fromUid = Number(authStore.uid)
  try {
    const gs = await groupSearch({ fromUid: Number.isFinite(fromUid) ? fromUid : 0, context: val })
    const gh = parseGroupHit(gs)
    if (gh) {
      groupHit.value = gh
      tabAction.value = 0
      return
    }

    const resp = await findContactsList({ phoneNum: val, findType: 1 })
    const list = resp.detailList || []
    contactHits.value = list.map((item: any) => {
      const userInfo = item.userInfo || {}
      return {
        uid: String(userInfo.uid || ''),
        nickname: userInfo.nickName || userInfo.nickname || '',
        avatar: userInfo.icon || userInfo.avatar || '',
        addToken: item.addToken || '',
        isFriend: !!userInfo.friendRelation?.bfFriend,
      }
    })
    tabAction.value = 1
    if (contactHits.value.length === 0) {
      searchResultNone.value = true
    }
  } catch (error) {
    console.error('[SearchAddContacts] search failed:', error)
    searchResultNone.value = true
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

function handleSelectGroup() {
  const g = groupHit.value
  if (!g?.id) return
  const conv = chatStore.ensureConversation(1, g.id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
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
      addToken: selectedUser.value.addToken,
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
          <template v-else-if="hasSearchPayload">
            <!-- 与老 im `.tabs`：仅群聊 / 联系人 -->
            <div class="search-tabs">
              <button
                v-for="item in tabList"
                :key="item.key"
                type="button"
                class="tab-item"
                :class="{ 'tab-active': tabAction === item.key }"
                @click="tabSelect(item.key)"
              >
                {{ item.name }}
              </button>
            </div>
            <template v-if="tabAction === 1 && contactHits.length > 0">
              <div
                v-for="user in contactHits"
                :key="user.uid"
                class="result-contact-row"
                @click="handleSelectUser(user)"
              >
                <TextAvatar :name="user.nickname || user.uid" :src="user.avatar" :size="40" rounded />
                <span class="result-name">{{ user.nickname || user.uid }}</span>
              </div>
            </template>
            <!-- 群聊 Tab 无群结果时：与老 im 搜索无数据图一致（assets 同 im `search-no-data.png`） -->
            <div v-else-if="tabAction === 0 && !groupHit" class="search-no-data-block tab-panel-empty">
              <img class="search-no-data-img" :src="searchNoDataImg" alt="" />
              <span class="search-no-data-tip">搜索无结果</span>
            </div>
            <div
              v-else-if="groupHit"
              class="result-contact-row"
              role="button"
              tabindex="0"
              @click="handleSelectGroup"
              @keydown.enter.prevent="handleSelectGroup"
            >
              <TextAvatar
                :name="groupHit.name || groupHit.id"
                :src="groupHit.avatar"
                avatar-type="group"
                :size="40"
              />
              <span class="result-name">{{ groupHit.name || groupHit.id }}</span>
            </div>
          </template>
          <div v-else-if="searchDone && searchResultNone" class="search-no-data-block">
            <img class="search-no-data-img" :src="searchNoDataImg" alt="" />
            <span class="search-no-data-tip">搜索无结果</span>
          </div>
        </div>

        <!-- 未发起搜索时保留入口；有结果后与老 im（searchAddContactsIng）一致不再展示 -->
        <div
          v-if="!searchTriggered"
          class="new-friend-row"
          role="button"
          tabindex="0"
          @click="goNewFriendExamine"
          @keydown.enter.prevent="goNewFriendExamine"
        >
          <img class="new-friend-icon" :src="addNewIcon" alt="" />
          <span class="new-friend-title">{{ t('新的好友') }}</span>
        </div>
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

/* 与老 im `.tabs` / `.tab-action` */
.search-tabs {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 10px;
  padding: 0 2px;
  flex-shrink: 0;
}

.tab-item {
  padding: 0;
  border: none;
  background: none;
  font-size: 15px;
  color: #333;
  cursor: pointer;
}

.tab-active {
  color: #429efd;
  font-weight: 500;
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

.tab-panel-empty {
  padding-top: 36px;
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
