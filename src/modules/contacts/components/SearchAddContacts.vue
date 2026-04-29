<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUIStore } from '@/stores/useUIStore'
import { useChatStore } from '@/stores/useChatStore'
import { findContactsList, groupSearch } from '@/api/imBase'
import TextAvatar from '@/components/TextAvatar.vue'
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

const searching = ref(false)
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

let searchTimer: number | null = null
let searchRunId = 0

function clearSearchTimer() {
  if (searchTimer === null) return
  window.clearTimeout(searchTimer)
  searchTimer = null
}

function resetResultState() {
  searchRunId += 1
  searching.value = false
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
  (query) => {
    clearSearchTimer()
    resetResultState()
    clearPreview()

    if (!query) return
    searchTimer = window.setTimeout(() => {
      void handleSearch(query)
    }, 180)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearSearchTimer()
})

function tabSelect(key: 0 | 1) {
  tabAction.value = key
}

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

function handleSelectGroup() {
  const g = groupHit.value
  if (!g?.id) return
  uiStore.setAddContactTarget(null)
  const conv = chatStore.ensureConversation(1, g.id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
}
</script>

<template>
  <div class="search-add-contacts">
    <div class="search-result-wrap">
      <div v-if="searching" class="state-loading">搜索中...</div>
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
            {{ item.name }}
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
            <span class="search-no-data-tip">搜索无结果</span>
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
            <span class="search-no-data-tip">搜索无结果</span>
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
