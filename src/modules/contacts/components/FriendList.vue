<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useContactStore } from '@/stores/useContactStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import TextAvatar from '@/components/TextAvatar.vue'

const props = withDefaults(
  defineProps<{
    /** 嵌入「添加好友」等侧栏：隐藏「联系人」标题与底部人数统计 */
    embed?: boolean
  }>(),
  { embed: false },
)

const { t, locale } = useI18n()
const contactStore = useContactStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUIStore()

const contactCountLabel = computed(() => {
  void locale.value
  return t('联系人列表人数', { count: contactStore.contacts.length })
})

onMounted(() => {
  if (authStore.uid) contactStore.loadContacts(authStore.uid)
})

interface GroupedContacts {
  letter: string
  items: (typeof contactStore.contacts)
}

const letterOrder = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#',
]
const letterRank = new Map(letterOrder.map((letter, index) => [letter, index]))
const contactCollator = new Intl.Collator(['zh-Hans-CN-u-co-pinyin', 'en'], {
  numeric: true,
  sensitivity: 'base',
})

function normalizeLetter(value: string | null | undefined): string {
  const initial = String(value || '').trim().charAt(0).toUpperCase()
  return /^[A-Z]$/.test(initial) ? initial : '#'
}

function getGroupLetter(contact: (typeof contactStore.contacts)[number]): string {
  const letter = normalizeLetter(contact.letter)
  if (letter !== '#') return letter

  const pinyinLetter = normalizeLetter(contact.pinyin)
  if (pinyinLetter !== '#') return pinyinLetter

  return normalizeLetter(getDisplayName(contact))
}

function getSortKey(contact: (typeof contactStore.contacts)[number]): string {
  return String(contact.pinyin || '').trim() || getDisplayName(contact).trim()
}

const grouped = computed((): GroupedContacts[] => {
  // 对齐旧版分桶顺序，同时兼容本地联系人缺少 letter/pinyin 时的英文昵称首字母。
  const sorted = [...contactStore.contacts].sort((a, b) => {
    const groupDiff = (letterRank.get(getGroupLetter(a)) ?? 999) - (letterRank.get(getGroupLetter(b)) ?? 999)
    if (groupDiff !== 0) return groupDiff

    const sortDiff = contactCollator.compare(getSortKey(a), getSortKey(b))
    if (sortDiff !== 0) return sortDiff

    return contactCollator.compare(getDisplayName(a), getDisplayName(b))
  })

  const buckets = new Map<string, (typeof contactStore.contacts)>()
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

const activeFriendId = computed(() => {
  if (uiStore.detailView !== 'friend-detail') return null
  const current = chatStore.currentConversation
  if (!current || current.type !== 0) return null
  return current.targetId
})

function handleSelect(contact: typeof contactStore.contacts[0]) {
  const conv = chatStore.ensureConversation(0, contact.id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setDetailView('friend-detail')
}

function getDisplayName(contact: (typeof contactStore.contacts)[0]) {
  return contact.remark || contact.nickname || contact.id
}
</script>

<template>
  <div class="friend-root" :class="{ embed: props.embed }">
    <h2 v-if="!props.embed" class="section-title">{{ t('联系人') }}</h2>
    <div v-for="group in grouped" :key="group.letter" class="friend-group">
      <div class="group-letter">{{ group.letter }}</div>
      <ul class="friend-list">
        <li
          v-for="contact in group.items"
          :key="contact.id"
          class="friend-item"
          :class="{
            active: activeFriendId === contact.id,
            'friend-online': contact.bfShowOnline !== false && Boolean(contact.online),
          }"
          @click="handleSelect(contact)"
        >
          <div class="friend-avatar-wrap">
            <TextAvatar
              class="avatar"
              :name="contact.nickname || contact.id"
              :src="contact.avatar"
              rounded
              :size="35"
            />
          </div>
          <h3>{{ getDisplayName(contact) }}</h3>
          <!-- 与 im address-book/friends.vue：<p v-if="item.online">{{ $t("在线") }}</p> -->
          <p v-if="contact.bfShowOnline !== false && contact.online" class="online-label">
            {{ t('在线') }}
          </p>
        </li>
      </ul>
    </div>
    <div v-if="!props.embed" class="contact-count">{{ contactCountLabel }}</div>
  </div>
</template>

<style lang="scss" scoped>
.section-title {
  margin: 0;
  padding-left: 20px;
  height: 26px;
  line-height: 26px;
  font-size: 14px;
  color: #333;
  font-weight: normal;
}

.group-letter {
  padding: 0 16px 0 20px;
  height: 40px;
  line-height: 40px;
  font-size: 14px;
  color: #333;
  font-weight: normal;
  border-top: 1px solid #eee;
}

/* h2 才是第一个子节点，.friend-group 不是 :first-child，需用相邻兄弟选择器 */
.section-title + .friend-group .group-letter {
  border-top: none;
}

.friend-list {
  padding: 0;
  margin: 0;
}

.friend-item {
  position: relative;
  padding: 0 16px 0 63px;
  display: flex;
  flex-direction: column;
  justify-content: center;
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

.friend-avatar-wrap {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 35px;
  height: 35px;
}

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

/* 与 im address-book/index.vue `> ul > li > p` 一致 */
.friend-item > p.online-label {
  margin: 0;
  margin-top: 4px;
  width: 120px;
  font-size: 14px;
  font-weight: 400;
  color: #999;
  line-height: 18px;
}

.contact-count {
  line-height: 38px;
  text-align: center;
  font-size: 14px;
  color: #333;
  font-weight: normal;
  border-top: 1px solid #eee;
  margin-bottom: 50px;
}

.friend-root.embed .group-letter:first-of-type {
  border-top: none;
}
</style>
