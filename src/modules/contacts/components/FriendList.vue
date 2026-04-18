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
  items: typeof contactStore.contacts
}

const grouped = computed((): GroupedContacts[] => {
  // 对齐旧版 im 的 eventFriend.fnFriendListFormat：按固定字母表分桶，
  // 每个分桶内保留后端/本地返回顺序，不再做额外排序。
  const letterOrder = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#',
  ]
  const result: GroupedContacts[] = []
  const list = contactStore.contacts

  for (const letter of letterOrder) {
    const items = list.filter((c) => {
      const fromLetter = (c as any).letter
      if (typeof fromLetter === 'string' && fromLetter.trim()) {
        return fromLetter.toUpperCase() === letter
      }
      const initial = (c.pinyin?.[0] ?? '#').toUpperCase()
      const fallback = /^[A-Z]$/.test(initial) ? initial : '#'
      return fallback === letter
    })
    if (items.length > 0) {
      result.push({ letter, items })
    }
  }

  return result
})

const activeFriendId = computed(() => {
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
          :class="{ active: activeFriendId === contact.id }"
          @click="handleSelect(contact)"
        >
          <TextAvatar
            class="avatar"
            :name="contact.nickname || contact.id"
            :src="contact.avatar"
            rounded
            :size="35"
          />
          <h3>{{ getDisplayName(contact) }}</h3>
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

  .avatar {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
  }
}

.friend-item > h3 {
  margin: 0;
  width: 140px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  font-size: 14px;
  color: #333;
  font-weight: normal;
  line-height: 18px;
}

.contact-count {
  line-height: 38px;
  text-align: center;
  font-size: 14px;
  color: #333;
  border-top: 1px solid #eee;
  margin-bottom: 50px;
}

.friend-root.embed .group-letter:first-of-type {
  border-top: none;
}
</style>
