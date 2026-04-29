<script setup lang="ts">
import { computed } from 'vue'
import { emojiObj } from '@/utils/emoji'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore, FILE_HELPER_TARGET_ID } from '@/stores/useChatStore'
import { useGroupStore, type GroupMember } from '@/stores/useGroupStore'
import { useUIStore } from '@/stores/useUIStore'
import { ConversationType } from '@/types'
import MessageTimeStatusLabel from '@/components/MessageTimeStatusLabel.vue'

const props = defineProps<{
  message: Message
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const groupStore = useGroupStore()
const uiStore = useUIStore()
const isSelf = computed(() => props.message.senderId === authStore.uid)
const isFileHelperChat = computed(
  () => chatStore.currentConversation?.targetId === FILE_HELPER_TARGET_ID,
)
const displayAsSelf = computed(() => isSelf.value || isFileHelperChat.value)

type ContentSegment =
  | { type: 'text'; text: string }
  | { type: 'emoji'; name: string; src: string }
  | { type: 'at'; text: string; memberId?: string }

interface MentionCandidate {
  label: string
  memberId: string
}

function parseConversationRef(conversationId: string): { type: number; targetId: string } {
  const i = conversationId.indexOf('_')
  if (i <= 0) return { type: 0, targetId: conversationId }
  return {
    type: Number(conversationId.slice(0, i)),
    targetId: conversationId.slice(i + 1),
  }
}

const messageConversation = computed(() =>
  parseConversationRef(props.message.conversationId || chatStore.currentConversationId || ''),
)

const messageGroupId = computed(() =>
  messageConversation.value.type === ConversationType.Group ? messageConversation.value.targetId : '',
)

const groupMembers = computed(() =>
  messageGroupId.value ? groupStore.getMembers(messageGroupId.value) : [],
)

const mentionCandidates = computed<MentionCandidate[]>(() => {
  const seen = new Set<string>()
  const result: MentionCandidate[] = []

  for (const member of groupMembers.value) {
    const names = [member.nickname, member.userId]
      .map((name) => String(name || '').trim())
      .filter(Boolean)

    for (const name of names) {
      const label = `@${name.replace(/^@+/, '')}`
      if (label === '@' || seen.has(label)) continue
      seen.add(label)
      result.push({ label, memberId: member.userId })
    }
  }

  return result.sort((a, b) => b.label.length - a.label.length)
})

function isMentionBoundary(char: string): boolean {
  return !char || /\s/.test(char) || /[,.!?;:，。！？；：、)）\]】>》]/.test(char)
}

function findKnownMention(content: string, start: number): MentionCandidate | null {
  for (const candidate of mentionCandidates.value) {
    if (!content.startsWith(candidate.label, start)) continue
    if (!isMentionBoundary(content.charAt(start + candidate.label.length))) continue
    return candidate
  }
  return null
}

function readUnknownMention(content: string, start: number): string {
  if (content.charAt(start) !== '@') return ''

  let end = start + 1
  while (end < content.length && !/\s/.test(content.charAt(end))) {
    end += 1
  }

  const token = content.slice(start, end)
  return token.length > 1 ? token : ''
}

function pushTextSegment(segments: ContentSegment[], text: string) {
  if (!text) return
  const last = segments[segments.length - 1]
  if (last?.type === 'text') {
    last.text += text
  } else {
    segments.push({ type: 'text', text })
  }
}

function resolveEmojiSrc(name: string): string {
  const mapped = (emojiObj as Record<string, string>)[`[${name}]`]
  const fileName = mapped || (/^pet_emoji_\d+$/.test(name) ? name : '')
  return fileName ? `/images/emoji/${fileName}.png` : ''
}

const contentSegments = computed<ContentSegment[]>(() => {
  const content = props.message.content ?? ''
  const segments: ContentSegment[] = []
  let index = 0

  while (index < content.length) {
    const rest = content.slice(index)
    const emojiMatch = rest.match(/^\[([^\]]+)\]/)
    if (emojiMatch) {
      const name = emojiMatch[1]
      const src = resolveEmojiSrc(name)
      if (src) {
        segments.push({ type: 'emoji', name, src })
      } else {
        pushTextSegment(segments, emojiMatch[0])
      }
      index += emojiMatch[0].length
      continue
    }

    if (content.charAt(index) === '@') {
      const knownMention = findKnownMention(content, index)
      if (knownMention) {
        segments.push({ type: 'at', text: knownMention.label, memberId: knownMention.memberId })
        index += knownMention.label.length
        continue
      }

      const unknownMention = readUnknownMention(content, index)
      if (unknownMention) {
        segments.push({ type: 'at', text: unknownMention })
        index += unknownMention.length
        continue
      }
    }

    pushTextSegment(segments, content.charAt(index))
    index += 1
  }

  return segments
})

function findMentionMember(label: string, members: GroupMember[]): GroupMember | undefined {
  const cleanLabel = label.replace(/^@+/, '').trim()
  if (!cleanLabel || cleanLabel === '所有人' || cleanLabel === '全体成员') return undefined

  return members.find((member) => {
    const nickname = String(member.nickname || '').trim()
    return member.userId === cleanLabel || nickname === cleanLabel
  })
}

async function handleAtClick(segment: Extract<ContentSegment, { type: 'at' }>) {
  const groupId = messageGroupId.value
  if (!groupId) return

  const cleanLabel = segment.text.replace(/^@+/, '').trim()
  if (!cleanLabel || cleanLabel === '所有人' || cleanLabel === '全体成员') return

  let members = groupMembers.value
  let member = segment.memberId
    ? members.find((item) => item.userId === segment.memberId)
    : findMentionMember(segment.text, members)

  if (!member && authStore.uid) {
    try {
      members = await groupStore.loadMembers(authStore.uid, groupId)
      member = segment.memberId
        ? members.find((item) => item.userId === segment.memberId)
        : findMentionMember(segment.text, members)
    } catch {
      // 成员列表加载失败时仍允许按文本兜底打开，与旧 im 的 atClick 交互保持一致。
    }
  }

  uiStore.openMemberInfo(member?.userId || cleanLabel, groupId, [cleanLabel])
}
</script>

<template>
  <!-- 结构对齐旧 im `msg/text.vue` + `time-status-label`：气泡内右下时间/状态 -->
  <div :class="['text-message', 'com-msg-text', { self: displayAsSelf }]">
    <div class="content-text">
      <template v-for="(segment, index) in contentSegments" :key="index">
        <span
          v-if="segment.type === 'at'"
          class="at-mention"
          @click.stop="handleAtClick(segment)"
        >
          {{ segment.text }}
        </span>
        <img
          v-else-if="segment.type === 'emoji'"
          class="inline-emoji"
          :src="segment.src"
          :alt="segment.name"
        />
        <span v-else>{{ segment.text }}</span>
      </template>
    </div>
    <MessageTimeStatusLabel :message="message" :is-self="displayAsSelf" />
  </div>
</template>

<style lang="scss" scoped>
.text-message.com-msg-text {
  max-width: 450px;
  min-width: 130px;
  border-radius: 10px;
  border-top-left-radius: 0;
  word-wrap: break-word;
  background: #ffffff;
  position: relative;
  padding: 10px 10px 10px 12px;

  &.self {
    background: #98daff;
    border: 1px solid #87cdf6;
    border-top-left-radius: 10px;
    border-top-right-radius: 0;
  }

  > .content-text {
    padding-right: 75px;
    line-height: 22px;
    white-space: pre-wrap;
    letter-spacing: 0.5px;
    font-size: 14px;

    .at-mention {
      color: #3369fe;
      display: inline-block;
      cursor: pointer;
      font-weight: normal;

      &:hover {
        opacity: 0.8;
      }
    }
  }
}

.inline-emoji {
  width: 20px;
  height: 20px;
  vertical-align: middle;
  margin: 0 2px;
  display: inline-block;
  position: relative;
  top: 4px;
}
</style>
