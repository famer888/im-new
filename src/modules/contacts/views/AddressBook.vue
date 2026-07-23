<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/useUIStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useChatStore } from '@/stores/useChatStore'
import TextAvatar from '@/components/TextAvatar.vue'
import { filterSensitiveWords } from '@/utils/sensitiveWords'
import addNewIcon from '@/assets/images/headNav/add-new-icon.png'
import jtIcon from '@/assets/images/headNav/jt-icon.png'

const { t, locale } = useI18n()
const uiStore = useUIStore()
const authStore = useAuthStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()
const chatStore = useChatStore()

const groupExpanded = ref(true)
const channelExpanded = ref(true)
const contentRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(0)

let resizeObserver: ResizeObserver | null = null

type ContactItem = (typeof contactStore.contacts)[number]
type GroupItem = (typeof groupStore.groups)[number]
type ChannelItem = (typeof channelStore.addressBookChannels)[number]

type BookRow =
  | { key: string; type: 'section'; section: 'groups' | 'channels'; title: string; expanded: boolean }
  | { key: string; type: 'friend-title'; title: string }
  | { key: string; type: 'letter'; letter: string }
  | { key: string; type: 'group'; group: GroupItem }
  | { key: string; type: 'channel'; channel: ChannelItem }
  | { key: string; type: 'friend'; contact: ContactItem }
  | { key: string; type: 'channel-no-more' }
  | { key: string; type: 'contact-count'; label: string }

type PositionedBookRow = BookRow & {
  top: number
  height: number
}

interface GroupedContacts {
  letter: string
  items: ContactItem[]
}

const ROW_HEIGHT = {
  section: 26,
  letter: 40,
  item: 59,
  noMore: 40,
  contactCount: 88,
} as const

const OVERSCAN_PX = ROW_HEIGHT.item * 8

const letterOrder = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#',
]
const letterRank = new Map(letterOrder.map((letter, index) => [letter, index]))
const contactCollator = new Intl.Collator(['zh-Hans-CN-u-co-pinyin', 'en'], {
  numeric: true,
  sensitivity: 'base',
})

const contactCountLabel = computed(() => {
  void locale.value
  return t('联系人列表人数', { count: contactStore.contacts.length })
})

const activeFriendId = computed(() => {
  if (uiStore.detailView !== 'friend-detail') return null
  const current = chatStore.currentConversation
  if (!current || current.type !== 0) return null
  return current.targetId
})

const activeGroupId = computed(() => {
  if (uiStore.detailView !== 'group-detail') return null
  const current = chatStore.currentConversation
  if (!current || current.type !== 1) return null
  return current.targetId
})

const activeChannelId = computed(() => {
  const current = chatStore.currentConversation
  if (!current || current.type !== 2) return null
  return current.targetId
})

const groupedContacts = computed((): GroupedContacts[] => {
  // 对齐旧版分桶顺序，同时兼容本地联系人缺少 letter/pinyin 时的英文昵称首字母。
  const sorted = [...contactStore.contacts].sort((a, b) => {
    const groupDiff = (letterRank.get(getGroupLetter(a)) ?? 999) - (letterRank.get(getGroupLetter(b)) ?? 999)
    if (groupDiff !== 0) return groupDiff

    const sortDiff = contactCollator.compare(getSortKey(a), getSortKey(b))
    if (sortDiff !== 0) return sortDiff

    return contactCollator.compare(getContactDisplayName(a), getContactDisplayName(b))
  })

  const buckets = new Map<string, ContactItem[]>()
  for (const contact of sorted) {
    const letter = getGroupLetter(contact)
    const bucket = buckets.get(letter)
    if (bucket) {
      bucket.push(contact)
    } else {
      buckets.set(letter, [contact])
    }
  }

  return letterOrder.flatMap((letter) => {
    const items = buckets.get(letter)
    return items && items.length > 0 ? [{ letter, items }] : []
  })
})

const bookRows = computed((): BookRow[] => {
  const rows: BookRow[] = [
    {
      key: 'section-groups',
      type: 'section',
      section: 'groups',
      title: t('群组'),
      expanded: groupExpanded.value,
    },
  ]

  if (groupExpanded.value) {
    for (const group of groupStore.groups) {
      rows.push({ key: `group-${group.id}`, type: 'group', group })
    }
  }

  rows.push({
    key: 'section-channels',
    type: 'section',
    section: 'channels',
    title: t('频道'),
    expanded: channelExpanded.value,
  })

  if (channelExpanded.value) {
    for (const channel of channelStore.addressBookChannels) {
      rows.push({ key: `channel-${channel.id}`, type: 'channel', channel })
    }

    if (!channelStore.loading) {
      rows.push({ key: 'channel-no-more', type: 'channel-no-more' })
    }
  }

  rows.push({ key: 'friend-title', type: 'friend-title', title: t('联系人') })

  for (const group of groupedContacts.value) {
    rows.push({ key: `letter-${group.letter}`, type: 'letter', letter: group.letter })
    for (const contact of group.items) {
      rows.push({ key: `friend-${contact.id}`, type: 'friend', contact })
    }
  }

  rows.push({ key: 'contact-count', type: 'contact-count', label: contactCountLabel.value })
  return rows
})

const positionedRows = computed((): PositionedBookRow[] => {
  let top = 0
  // 通讯录可能同时包含几百个频道和好友，只定位全部行，DOM 只渲染可视区域。
  return bookRows.value.map((row) => {
    const height = getRowHeight(row)
    const positioned = { ...row, top, height }
    top += height
    return positioned
  })
})

const virtualTotalHeight = computed(() => {
  const rows = positionedRows.value
  const last = rows[rows.length - 1]
  return last ? last.top + last.height : 0
})

const visibleRows = computed(() => {
  const start = Math.max(0, scrollTop.value - OVERSCAN_PX)
  const end = scrollTop.value + viewportHeight.value + OVERSCAN_PX
  return positionedRows.value.filter((row) => row.top + row.height >= start && row.top <= end)
})

// 计算当前滚动位置对应的分组标题，供虚拟列表顶部吸顶使用。
const stickyTitleRow = computed(() => {
  let current: PositionedBookRow | null = null
  for (const row of positionedRows.value) {
    if (row.top > scrollTop.value) break
    // 虚拟列表会卸载滚出视口的标题行，所以不能直接依赖原行做 CSS sticky。
    if (row.type === 'section' || row.type === 'friend-title') {
      current = row
    }
  }
  return current
})

function openFriendExamine() {
  contactStore.setNewFriendReqTotal(0, String(authStore.uid || ''))
  uiStore.setDetailView('friend-examine')
}

function handleScroll(event: Event) {
  scrollTop.value = (event.currentTarget as HTMLElement).scrollTop
}

function updateViewportHeight() {
  viewportHeight.value = contentRef.value?.clientHeight || 0
}

function toggleSection(section: 'groups' | 'channels') {
  if (section === 'groups') {
    groupExpanded.value = !groupExpanded.value
  } else {
    channelExpanded.value = !channelExpanded.value
  }
}

function getRowHeight(row: BookRow): number {
  switch (row.type) {
    case 'section':
    case 'friend-title':
      return ROW_HEIGHT.section
    case 'letter':
      return ROW_HEIGHT.letter
    case 'channel-no-more':
      return ROW_HEIGHT.noMore
    case 'contact-count':
      return ROW_HEIGHT.contactCount
    default:
      return ROW_HEIGHT.item
  }
}

function normalizeLetter(value: string | null | undefined): string {
  const initial = String(value || '').trim().charAt(0).toUpperCase()
  return /^[A-Z]$/.test(initial) ? initial : '#'
}

function getGroupLetter(contact: ContactItem): string {
  const letter = normalizeLetter(contact.letter)
  if (letter !== '#') return letter

  const pinyinLetter = normalizeLetter(contact.pinyin)
  if (pinyinLetter !== '#') return pinyinLetter

  return normalizeLetter(getContactDisplayName(contact))
}

function getSortKey(contact: ContactItem): string {
  return String(contact.pinyin || '').trim() || getContactDisplayName(contact).trim()
}

function getContactDisplayName(contact: ContactItem) {
  return contact.remark || contact.nickname || contact.id
}

function getContactDisplayText(contact: ContactItem) {
  return filterSensitiveWords(getContactDisplayName(contact))
}

function getChannelDisplayName(channel: ChannelItem) {
  return channel.channelName || channel.name || channel.id || ''
}

function getChannelDisplayText(channel: ChannelItem) {
  return filterSensitiveWords(getChannelDisplayName(channel))
}

function sanitizeName(value: string | null | undefined) {
  return String(value || '').replaceAll('🪵', '?')
}

function selectGroup(group: GroupItem) {
  const conv = chatStore.ensureConversation(1, group.id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setDetailView('group-detail')
}

function selectChannel(channel: ChannelItem) {
  // 通讯录入口同样不等待频道详情，统一“秒开会话 + 后台校准权限”的交互。
  void channelStore.ensureChannelDetailReady(channel.id)
  const conv = chatStore.ensureConversation(2, channel.id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
}

function selectContact(contact: ContactItem) {
  const conv = chatStore.ensureConversation(0, contact.id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setDetailView('friend-detail')
}

onMounted(() => {
  const uid = String(authStore.uid || '')
  if (uid) {
    // 只读本地已读状态；未读增量由 WS friend:req-num 写入，勿用待处理列表长度覆盖。
    contactStore.loadNewFriendReqTotal(uid)

    if (contactStore.contacts.length === 0) {
      void contactStore.loadContacts(uid, { refreshRemote: false })
    }
    if (groupStore.groups.length === 0) {
      void groupStore.loadGroups(uid)
    }
    if (channelStore.addressBookChannels.length === 0) {
      void channelStore.loadChannels(uid, { refreshRemote: true })
    }
  }

  void nextTick(updateViewportHeight)
  if (contentRef.value) {
    resizeObserver = new ResizeObserver(updateViewportHeight)
    resizeObserver.observe(contentRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div class="address-book">
    <!-- Old tabs UI (kept for rollback)
    <div class="book-tabs">
      <button :class="['tab', { active: activeTab === 'friends' }]" @click="activeTab = 'friends'">好友</button>
      <button :class="['tab', { active: activeTab === 'groups' }]" @click="activeTab = 'groups'">群组</button>
      <button :class="['tab', { active: activeTab === 'channels' }]" @click="activeTab = 'channels'">频道</button>
    </div>
    <div class="book-content">
      <FriendList v-if="activeTab === 'friends'" />
      <GroupList v-else-if="activeTab === 'groups'" />
      <ChannelList v-else />
    </div>
    -->

    <div class="new-friend" @click="openFriendExamine">
      <img class="new-friend-icon" :src="addNewIcon" alt="new-friend" />
      <span class="new-friend-title">{{ t('新的好友') }}</span>
      <span v-if="contactStore.newFriendReqTotal > 0" class="new-friend-badge">
        {{ contactStore.newFriendReqTotal > 99 ? '99+' : contactStore.newFriendReqTotal }}
      </span>
    </div>

    <div ref="contentRef" class="book-content" @scroll="handleScroll">
      <!-- 单独渲染当前分组标题，保证群组/频道/联系人滚动时始终吸顶显示。 -->
      <h2
        v-if="stickyTitleRow?.type === 'section'"
        class="section-title sticky-section-title"
        @click="toggleSection(stickyTitleRow.section)"
      >
        {{ stickyTitleRow.title }}
        <img
          class="arrow"
          :class="{ collapsed: !stickyTitleRow.expanded }"
          :src="jtIcon"
          alt="toggle"
        />
      </h2>

      <h2
        v-else-if="stickyTitleRow?.type === 'friend-title'"
        class="section-title sticky-section-title"
      >
        {{ stickyTitleRow.title }}
      </h2>

      <div class="virtual-spacer" :style="{ height: `${virtualTotalHeight}px` }">
        <div
          v-for="row in visibleRows"
          :key="row.key"
          class="virtual-row"
          :style="{ transform: `translateY(${row.top}px)`, height: `${row.height}px` }"
        >
          <h2 v-if="row.type === 'section'" class="section-title" @click="toggleSection(row.section)">
            {{ row.title }}
            <img
              class="arrow"
              :class="{ collapsed: !row.expanded }"
              :src="jtIcon"
              alt="toggle"
            />
          </h2>

          <h2 v-else-if="row.type === 'friend-title'" class="section-title">
            {{ row.title }}
          </h2>

          <div v-else-if="row.type === 'letter'" class="group-letter">
            {{ row.letter }}
          </div>

          <div
            v-else-if="row.type === 'group'"
            class="group-item"
            :class="{ active: activeGroupId === row.group.id }"
            @click="selectGroup(row.group)"
          >
            <TextAvatar
              class="group-avatar"
              :name="row.group.name || row.group.id"
              :src="row.group.avatar"
              avatar-type="group"
              :size="35"
            />
            <h3 class="item-name">{{ sanitizeName(row.group.name || row.group.id) }}</h3>
          </div>

          <div
            v-else-if="row.type === 'channel'"
            class="channel-item"
            :class="{ active: activeChannelId === row.channel.id }"
            @click="selectChannel(row.channel)"
          >
            <div class="channel-avatar">
              <TextAvatar
                v-if="!row.channel.avatar"
                :id="row.channel.channelId || row.channel.id"
                :name="getChannelDisplayName(row.channel)"
                avatar-type="text"
                :color="row.channel.logoColor || undefined"
                :size="35"
                rounded
              />
              <TextAvatar
                v-else
                :id="row.channel.channelId || row.channel.id"
                :name="getChannelDisplayName(row.channel)"
                :src="row.channel.avatar"
                avatar-type="channel"
                :color="row.channel.logoColor || undefined"
                :size="35"
                rounded
              />
            </div>
            <h3 class="channel-name">
              <span class="channel-name-text">
                {{ sanitizeName(getChannelDisplayText(row.channel)) }}
              </span>
            </h3>
          </div>

          <div
            v-else-if="row.type === 'friend'"
            class="friend-item"
            :class="{
              active: activeFriendId === row.contact.id,
              'friend-online': row.contact.bfShowOnline !== false && Boolean(row.contact.online),
            }"
            @click="selectContact(row.contact)"
          >
            <div class="friend-avatar-wrap">
              <TextAvatar
                class="avatar"
                :name="getContactDisplayText(row.contact)"
                :src="row.contact.avatar"
                rounded
                :size="35"
              />
            </div>
            <h3>{{ getContactDisplayText(row.contact) }}</h3>
            <p v-if="row.contact.bfShowOnline !== false && row.contact.online" class="online-label">
              {{ t('在线') }}
            </p>
          </div>

          <div v-else-if="row.type === 'channel-no-more'" class="channel-no-more">
            没有更多数据了
          </div>

          <div v-else-if="row.type === 'contact-count'" class="contact-count">
            {{ row.label }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* Old tabs styles (kept for rollback)
.address-book { display: flex; flex-direction: column; height: 100%; }

.book-tabs {
  display: flex; padding: 8px 12px 0; gap: 4px;
  .tab {
    flex: 1; height: 30px; background: transparent; border: none; border-radius: 4px;
    font-size: 13px; color: #666; cursor: pointer;
    &.active { background: #d4d4d4; color: #333; }
    &:hover:not(.active) { background: #e0e0e0; }
  }
}

.book-content { flex: 1; overflow-y: auto; }
*/

.address-book {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: PingFangSC-Regular, 'PingFang SC', sans-serif;
  -webkit-font-smoothing: auto;
  -moz-osx-font-smoothing: auto;
}

.new-friend {
  display: flex;
  align-items: center;
  padding: 10px 20px !important;
  box-sizing: border-box;
  cursor: pointer;
  position: relative;
}

.new-friend-icon {
  width: 35px;
  height: 35px;
  flex-shrink: 0;
}

.new-friend-title {
  margin-left: 10px;
  font-size: 14px;
  font-weight: normal;
  color: #000;
}

.new-friend-badge {
  position: absolute;
  left: 36px;
  top: 2px;
  margin-top: 4px;
  padding: 1px 7px;
  display: inline-block;
  font-size: 12px;
  background: #f44e5a;
  font-weight: 400;
  border-radius: 10px;
  transform: scale(0.86);
  color: #fff;
  text-align: center;
  white-space: nowrap;
  z-index: 2;
}

.book-content {
  flex: 1;
  overflow-y: auto;
  position: relative;
}

.virtual-spacer {
  position: relative;
  min-height: 100%;
}

.virtual-row {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  overflow: hidden;
}

.section-title {
  position: relative;
  margin: 0;
  padding-left: 20px;
  height: 26px;
  line-height: 26px;
  font-size: 14px;
  color: #333;
  font-weight: normal;
  cursor: pointer;
}

.sticky-section-title {
  /* 覆盖在虚拟列表顶部，不参与列表高度计算，避免整体内容下移。 */
  position: sticky;
  top: 0;
  z-index: 3;
  margin-bottom: -26px;
  background: #fcfcfc;
}

.arrow {
  position: absolute;
  width: 12px;
  right: 16px;
  top: 7px;
  transition: 0.3s all;

  &.collapsed {
    transform: rotate(180deg);
  }
}

.group-letter {
  padding: 0 16px 0 20px;
  height: 40px;
  line-height: 40px;
  font-size: 14px;
  color: #333;
  font-weight: normal;
  border-top: 1px solid #eee;
  box-sizing: border-box;
}

.group-item,
.channel-item,
.friend-item {
  position: relative;
  padding: 0 16px 0 63px;
  display: flex;
  align-items: center;
  width: 100%;
  background-color: #fcfcfc;
  height: 59px;
  box-sizing: border-box;
  cursor: pointer;

  &:hover {
    background: #f9f9f9;
  }

  &.active {
    background: #efefef;
  }
}

.group-avatar,
.channel-avatar,
.friend-avatar-wrap {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 35px;
  height: 35px;
}

.channel-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-name,
.friend-item > h3 {
  margin: 0;
  width: 120px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  font-size: 14px;
  color: #333;
  font-weight: normal;
  line-height: 18px;
}

.channel-name {
  display: flex;
  align-items: center;
  margin: 0;
  width: 120px;
  font-size: 14px;
  color: #333;
  font-weight: normal;
  line-height: 18px;
}

.channel-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-item {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;

  &.friend-online::before {
    content: '';
    position: absolute;
    height: 8px;
    width: 8px;
    border-radius: 50%;
    left: 43px;
    bottom: 15px;
    background: #10d561;
    z-index: 1;
  }
}

.friend-item > p.online-label {
  margin: 0;
  margin-top: 4px;
  width: 120px;
  font-size: 14px;
  font-weight: 400;
  color: #999;
  line-height: 18px;
}

.channel-no-more {
  text-align: center;
  line-height: 40px;
  color: #999;
  font-weight: normal;
  box-sizing: border-box;
}

.contact-count {
  height: 88px;
  line-height: 38px;
  text-align: center;
  font-size: 14px;
  color: #333;
  font-weight: normal;
  border-top: 1px solid #eee;
  box-sizing: border-box;
}
</style>
