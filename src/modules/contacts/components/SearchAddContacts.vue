<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUIStore } from '@/stores/useUIStore'
import { useChatStore } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { findContactsList, groupSearch } from '@/api/imBase'
import TextAvatar from '@/components/TextAvatar.vue'
import searchBlueIcon from '@/assets/images/headNav/search-blue.png'
import arrowRightIcon from '@/assets/images/headNav/arrow-right.png'
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

const authStore = useAuthStore()
const uiStore = useUIStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const { t } = useI18n()

const searching = ref(false)
const remoteSearchTriggered = ref(false)
const searchDone = ref(false)
const tabAction = ref<0 | 1>(1)
const groupHit = ref<GroupHit | null>(null)
const contactHits = ref<FoundContact[]>([])
const searchResultNone = ref(false)

const trimmedQuery = computed(() => props.searchText.replace(/@/g, '').trim())

const tabList = [
  { name: '群聊', key: 0 },
  { name: '联系人', key: 1 },
] as const

let searchRunId = 0

function resetResultState() {
  searchRunId += 1
  searching.value = false
  remoteSearchTriggered.value = false
  searchDone.value = false
  tabAction.value = 1
  groupHit.value = null
  contactHits.value = []
  searchResultNone.value = false
}

function clearPreview() {
  uiStore.setAddContactTarget(null)
  if (uiStore.detailView === 'add-contact') {
    uiStore.setDetailView('none')
  }
}

watch(
  trimmedQuery,
  () => {
    resetResultState()
    clearPreview()
  },
)

onMounted(() => {
  if (authStore.uid) {
    void contactStore.loadContacts(authStore.uid)
  }
})

function tabSelect(key: 0 | 1) {
  tabAction.value = key
}

function getLocalContactName(contact: (typeof contactStore.contacts)[0]) {
  return contact.remark || contact.nickname || contact.id
}

function getHighlightSegments(value: string) {
  const keyword = trimmedQuery.value
  if (!keyword) return [{ text: value, matched: false }]

  const source = value || ''
  const sourceUpper = source.toUpperCase()
  const keywordUpper = keyword.toUpperCase()
  const segments: Array<{ text: string; matched: boolean }> = []
  let cursor = 0

  while (cursor < source.length) {
    const index = sourceUpper.indexOf(keywordUpper, cursor)
    if (index < 0) {
      segments.push({ text: source.slice(cursor), matched: false })
      break
    }
    if (index > cursor) {
      segments.push({ text: source.slice(cursor, index), matched: false })
    }
    segments.push({ text: source.slice(index, index + keyword.length), matched: true })
    cursor = index + keyword.length
  }

  return segments.length > 0 ? segments : [{ text: source, matched: false }]
}

const localContactHits = computed(() => {
  const query = trimmedQuery.value.toUpperCase()
  if (!query || remoteSearchTriggered.value) return []
  return contactStore.contacts.filter((contact) => {
    const fields = [
      contact.id,
      contact.nickname || '',
      contact.remark || '',
      contact.pinyin || '',
    ]
    return fields.some((field) => field.toUpperCase().includes(query))
  })
})

function stringifyId(value: unknown): string {
  if (value == null) return ''
  return String(value)
}

function parseGroupHit(gs: unknown): GroupHit | null {
  const gd = (gs as any)?.groupDetail
  const gb = gd?.groupBase
  if (!gb) return null
  const id = stringifyId(gb.groupId ?? gb.id)
  if (!id) return null
  return {
    id,
    name: String(gb.name ?? gb.groupName ?? ''),
    avatar: String(gb.pic ?? gb.icon ?? ''),
  }
}

function mapContacts(resp: any): FoundContact[] {
  const list = resp?.detailList || []
  return list
    .map((item: any) => {
      const userInfo = item.userInfo || {}
      const uid = stringifyId(userInfo.uid || userInfo.id)
      return {
        uid,
        nickname: userInfo.nickName || userInfo.nickname || '',
        avatar: userInfo.icon || userInfo.avatar || '',
        addToken: item.addToken || '',
        isFriend: !!userInfo.friendRelation?.bfFriend,
      }
    })
    .filter((item: FoundContact) => item.uid)
}

function mergeContacts(list: FoundContact[]): FoundContact[] {
  const seen = new Set<string>()
  return list.filter((item) => {
    if (seen.has(item.uid)) return false
    seen.add(item.uid)
    return true
  })
}

async function findContactsByQuery(query: string): Promise<FoundContact[]> {
  const byPhone = await findContactsList({ phoneNum: query, findType: 1 })
  const phoneHits = mapContacts(byPhone)
  if (phoneHits.length > 0 || !/^\d+$/.test(query)) return phoneHits

  const targetUid = Number(query)
  if (!Number.isFinite(targetUid)) return phoneHits
  const byUid = await findContactsList({ targetUid, findType: 1 })
  return mergeContacts([...phoneHits, ...mapContacts(byUid)])
}

async function handleSearch(query: string) {
  const val = query.trim()
  if (!val) return

  const runId = ++searchRunId
  searching.value = true
  remoteSearchTriggered.value = true
  searchDone.value = false
  groupHit.value = null
  contactHits.value = []
  searchResultNone.value = false

  const fromUid = Number(authStore.uid)
  const [groupResult, contactResult] = await Promise.allSettled([
    groupSearch({ fromUid: Number.isFinite(fromUid) ? fromUid : 0, context: val }),
    findContactsByQuery(val),
  ])

  if (runId !== searchRunId) return

  const nextGroup = groupResult.status === 'fulfilled' ? parseGroupHit(groupResult.value) : null
  const nextContacts = contactResult.status === 'fulfilled' ? contactResult.value : []

  groupHit.value = nextGroup
  contactHits.value = nextContacts
  tabAction.value = nextContacts.length > 0 ? 1 : nextGroup ? 0 : 1
  searchResultNone.value = !nextGroup && nextContacts.length === 0

  if (nextContacts.length > 0) {
    handleSelectUser(nextContacts[0])
  }

  searching.value = false
  searchDone.value = true
}

function handleSelectUser(user: FoundContact) {
  uiStore.setAddContactTarget(user)
  uiStore.setRightPanel('none')
  uiStore.setDetailView('add-contact')
}

function handleSelectLocalContact(contact: (typeof contactStore.contacts)[0]) {
  uiStore.setAddContactTarget(null)
  const conv = chatStore.ensureConversation(0, contact.id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
}

function handleSelectGroup() {
  const g = groupHit.value
  if (!g?.id) return
  uiStore.setAddContactTarget(null)
  const conv = chatStore.ensureConversation(1, g.id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
}

function goNewFriendExamine() {
  uiStore.setAddContactTarget(null)
  uiStore.setRightPanel('none')
  uiStore.setDetailView('friend-examine')
}
</script>

<template>
  <div class="search-add-contacts">
    <div class="search-result-wrap">
      <template v-if="!remoteSearchTriggered">
        <button
          type="button"
          class="add-tip"
          @click="handleSearch(trimmedQuery)"
        >
          <div class="add-tip-left">
            <img class="icon-search" :src="searchBlueIcon" alt="" />
            <span>{{ t('搜索关键词', { keyword: trimmedQuery }) }}</span>
          </div>
          <img class="arrow" :src="arrowRightIcon" alt="" />
        </button>

        <button
          type="button"
          class="new-friend-row"
          @click="goNewFriendExamine"
        >
          <img class="new-friend-icon" :src="addNewIcon" alt="" />
          <span class="new-friend-title">{{ t('新的好友') }}</span>
        </button>

        <div v-if="localContactHits.length > 0" class="local-section">
          <div class="local-title">{{ t('联系人') }}</div>
          <button
            v-for="contact in localContactHits"
            :key="contact.id"
            type="button"
            class="local-contact-row"
            @click="handleSelectLocalContact(contact)"
          >
            <TextAvatar :name="getLocalContactName(contact)" :src="contact.avatar" :size="34" rounded />
            <span class="result-name">
              <span
                v-for="(segment, index) in getHighlightSegments(getLocalContactName(contact))"
                :key="`${index}-${segment.text}`"
                :class="{ 'keyword-highlight': segment.matched }"
              >{{ segment.text }}</span>
            </span>
          </button>
        </div>
      </template>

      <div v-else-if="searching" class="state-loading">{{ t('搜索中') }}</div>
      <template v-else>
        <div class="search-tabs">
          <button
            v-for="item in tabList"
            :key="item.key"
            type="button"
            class="tab-item"
            :class="{ 'tab-active': tabAction === item.key }"
            @click="tabSelect(item.key)"
          >
            {{ t(item.name) }}
          </button>
        </div>

        <div v-if="tabAction === 0" class="tab-panel">
          <button
            v-if="groupHit"
            type="button"
            class="result-contact-row"
            @click="handleSelectGroup"
          >
            <TextAvatar
              :name="groupHit.name || groupHit.id"
              :src="groupHit.avatar"
              avatar-type="group"
              :size="34"
            />
            <span class="result-name">{{ groupHit.name || groupHit.id }}</span>
          </button>
          <div v-else-if="searchDone" class="search-no-data-block">
            <img class="search-no-data-img" :src="searchNoDataImg" alt="" />
            <span class="search-no-data-tip">{{ t('搜索无结果') }}</span>
          </div>
        </div>

        <div v-else class="tab-panel">
          <button
            v-for="user in contactHits"
            :key="user.uid"
            type="button"
            class="result-contact-row"
            @click="handleSelectUser(user)"
          >
            <TextAvatar :name="user.nickname || user.uid" :src="user.avatar" :size="34" rounded />
            <span class="result-name">{{ user.nickname || user.uid }}</span>
          </button>
          <div v-if="searchDone && searchResultNone" class="search-no-data-block">
            <img class="search-no-data-img" :src="searchNoDataImg" alt="" />
            <span class="search-no-data-tip">{{ t('搜索无结果') }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.search-add-contacts {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: rgb(252, 252, 252);
}

.search-result-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0 16px;
  box-sizing: border-box;
}

.add-tip {
  width: calc(100% - 24px);
  min-height: 58px;
  margin: 0 12px;
  padding: 16px;
  border: 1px solid #e5e5e5;
  border-radius: 4px;
  background: #fff;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.add-tip-left {
  display: flex;
  align-items: center;
  min-width: 0;

  span {
    margin-left: 10px;
    font-size: 14px;
    color: #111;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.icon-search {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.arrow {
  width: 6px;
  height: 11px;
  flex-shrink: 0;
}

.new-friend-row {
  width: 100%;
  min-height: 56px;
  padding: 8px 16px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: #f4f4f4;
  }
}

.new-friend-icon {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
}

.new-friend-title {
  margin-left: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #111;
}

.local-section {
  margin-top: 2px;
}

.local-title {
  height: 27px;
  padding: 0 16px;
  box-sizing: border-box;
  line-height: 27px;
  font-size: 12px;
  color: #999;
  background: #f2f2f2;
}

.local-contact-row {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 59px;
  padding: 10px 16px;
  box-sizing: border-box;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: #f4f4f4;
  }
}

.state-loading {
  padding: 18px 0;
  text-align: center;
  font-size: 13px;
  color: #999;
}

.search-tabs {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 25px;
  padding: 0 16px;
  box-sizing: border-box;
}

.tab-item {
  padding: 0;
  border: none;
  background: transparent;
  font-size: 14px;
  line-height: 20px;
  color: #222;
  cursor: pointer;
}

.tab-active {
  color: #1684ff;
  font-weight: 500;
}

.tab-panel {
  min-height: 0;
}

.result-contact-row {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 48px;
  padding: 7px 16px;
  box-sizing: border-box;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: #f4f4f4;
  }
}

.result-name {
  min-width: 0;
  margin-left: 10px;
  font-size: 14px;
  line-height: 20px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keyword-highlight {
  color: #3369fe;
}

.search-no-data-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0 8px;

  .search-no-data-img {
    width: 42%;
    max-width: 180px;
    min-width: 120px;
    height: auto;
    object-fit: contain;
  }

  .search-no-data-tip {
    margin-top: 12px;
    font-size: 13px;
    color: #b9babe;
  }
}
</style>
