<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { emojiObj } from '@/utils/emoji'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore, isFileHelperTargetId } from '@/stores/useChatStore'
import { useGroupStore, type GroupMember } from '@/stores/useGroupStore'
import { useUIStore, type AddGroupTarget, type MemberInfoProfile } from '@/stores/useUIStore'
import { ConversationType } from '@/types'
import MessageTimeStatusLabel from '@/components/MessageTimeStatusLabel.vue'
import { eventBus } from '@/utils/eventBus'
import {
  groupOrUserDetail,
  groupQrUrlFromShortLink,
  queryGroupLink,
  type GroupDetailFromQrCodeResp,
} from '@/api/imBase'

const props = defineProps<{
  message: Message
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const groupStore = useGroupStore()
const uiStore = useUIStore()
const { t } = useI18n()
const isSelf = computed(() => props.message.senderId === authStore.uid)
const isFileHelperChat = computed(
  () => isFileHelperTargetId(chatStore.currentConversation?.targetId),
)
const isChannelChat = computed(
  () => chatStore.currentConversation?.type === ConversationType.Channel,
)
/** 旧 im 频道消息统一按左侧白色气泡展示，即使是自己发送的消息也不右对齐。 */
const displayAsSelf = computed(() => (isSelf.value || isFileHelperChat.value) && !isChannelChat.value)

type ContentSegment =
  | { type: 'text'; text: string }
  | { type: 'emoji'; name: string; src: string }
  | { type: 'at'; text: string; memberId?: string }
  | { type: 'link'; text: string; href: string }

interface MentionCandidate {
  label: string
  memberId: string
}

const GROUP_INVITE_HOSTS = new Set(['55chat.com', '97chat.com', 'ocs.com'])

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

function detectLinkAtStart(content: string, start: number): { text: string; href: string } | null {
  const rest = content.slice(start)

  // URL中禁止的字符（空格、引号、HTML、中文、通用标点）
  // Matches: spaces, quotes, HTML brackets, CJK characters, CJK symbols, fullwidth chars, general punctuation
  const forbiddenChars = '\\s"\'<>\\u4e00-\\u9fa5\\u3000-\\u303F\\uFF00-\\uFFEF\\u2000-\\u206F'

  // 安全结束字符：不得为标点符号或分隔符
  const safeEndChar = `[^${forbiddenChars}\\.,;:?!()\\[\\]{}]`

  const regex = new RegExp(`^(https?://[^${forbiddenChars}]*${safeEndChar})`)
  const match = rest.match(regex)
  if (!match) return null

  const url = match[1]
  if (url.length <= 7) return null // At least "http://" + one char
  return { text: url, href: url }
}

function resolveEmojiSrc(name: string): string {
  const mapped = (emojiObj as Record<string, string>)[`[${name}]`]
  const fileName = mapped || (/^pet_emoji_\d+$/.test(name) ? name : '')
  return fileName ? `/images/emoji/${fileName}.png` : ''
}

function normalizeUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    try {
      return new URL(`https://${raw}`)
    } catch {
      return null
    }
  }
}

function getSearchParam(url: URL, name: string): string {
  const target = name.toLowerCase()
  for (const [key, value] of url.searchParams.entries()) {
    if (key.toLowerCase() === target) return value
  }
  return ''
}

function isGroupInviteLink(url: URL): boolean {
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  if (getSearchParam(url, 'qrCode') && getSearchParam(url, 'IdCode')) return true
  return GROUP_INVITE_HOSTS.has(host) && url.search.length > 1
}

async function getGroupQrUrlFromLink(href: string): Promise<string> {
  const url = normalizeUrl(href)
  if (!url || !isGroupInviteLink(url)) return ''

  if (getSearchParam(url, 'qrCode') && getSearchParam(url, 'IdCode')) {
    return url.href
  }

  const resp = await groupQrUrlFromShortLink({ shortLink: href })
  const common = resp.commonResult || {}
  const errCode = Number(common.errCode ?? 0)
  if (errCode !== 200 && errCode !== 0) {
    throw new Error(common.errMsg || resp.errorDesc || '群聊链接解析失败')
  }

  return String(resp.qrUrl || '').trim()
}

async function resolveGroupInfoFromLink(href: string): Promise<GroupDetailFromQrCodeResp | null> {
  const qrUrl = await getGroupQrUrlFromLink(href)
  if (!qrUrl) return null

  let parsed = normalizeUrl(qrUrl)
  if (!parsed) {
    try {
      parsed = new URL(qrUrl, href)
    } catch {
      parsed = null
    }
  }
  if (!parsed) throw new Error('群聊链接解析失败')

  const qrCode = getSearchParam(parsed, 'qrCode')
  const IdCode = getSearchParam(parsed, 'IdCode')
  const groupId = getSearchParam(parsed, 'groupId')
  if (!qrCode || !IdCode) throw new Error('群聊链接解析失败')

  const resp = await queryGroupLink({ qrCode, IdCode, groupId: groupId || 0 })
  const common = resp.commonResult || {}
  const errCode = Number(common.errCode ?? 0)
  if (errCode !== 200 && errCode !== 0) {
    throw new Error(common.errMsg || resp.errorDesc || '加入群聊失败')
  }

  return resp
}

function parseGroupTarget(groupInfo: GroupDetailFromQrCodeResp): AddGroupTarget | null {
  const groupBase = groupInfo.groupBase || {}
  const id = String(groupBase.groupId ?? groupBase.id ?? '').trim()
  if (!id) return null

  return {
    id,
    name: String(groupBase.name ?? groupBase.groupName ?? ''),
    avatar: String(groupBase.pic ?? groupBase.icon ?? groupBase.avatar ?? ''),
    memberCount: Number(groupBase.memberCount ?? groupBase.member_count ?? 0),
    groupAliasName: String(groupBase.groupAliasName ?? groupBase.groupAlias ?? ''),
    ownerId: groupBase.hostId == null ? null : String(groupBase.hostId),
    addToken: String(groupInfo.addToken ?? groupBase.addToken ?? ''),
    bfJoinCheck: Boolean(groupBase.bfJoinCheck ?? false),
    joinSource: 'link',
  }
}

function parseGroupTargetFromAlias(raw: any): AddGroupTarget | null {
  const gd = raw?.groupDetail || raw?.groupAlias || raw
  const gb = gd?.groupBase || gd?.groupBaseResp || gd
  const id = String(gb?.groupId ?? gb?.id ?? '').trim()
  if (!id) return null

  return {
    id,
    name: String(gb.name ?? gb.groupName ?? ''),
    avatar: String(gb.pic ?? gb.icon ?? gb.avatar ?? ''),
    memberCount: Number(gb.memberCount ?? gb.member_count ?? 0),
    groupAliasName: String(gb.groupAliasName ?? gb.groupAlias ?? ''),
    ownerId: gb.hostId == null ? null : String(gb.hostId),
    addToken: String(raw?.addToken ?? gd?.addToken ?? gb?.addToken ?? ''),
    bfJoinCheck: Boolean(gb?.bfJoinCheck ?? gd?.bfJoinCheck ?? raw?.bfJoinCheck ?? false),
    joinSource: 'alias',
  }
}

function parseMemberProfile(raw: any): MemberInfoProfile | null {
  const detail = raw?.targetUser || raw?.userDetail || raw?.contactsDetailBase || raw
  const user = detail?.userInfo || detail?.userInfoBaseResp || detail
  const userId = String(user?.uid ?? user?.id ?? '').trim()
  if (!userId) return null

  return {
    userId,
    nickname: String(user?.nickName ?? user?.nickname ?? ''),
    avatar: String(user?.icon ?? user?.avatar ?? ''),
    remark: user?.friendRelation?.remarkName ?? detail?.name ?? detail?.remarkName ?? null,
    depict: detail?.depict ?? user?.depict ?? null,
    addToken: String(detail?.addToken ?? raw?.addToken ?? ''),
    isFriend: Boolean(user?.friendRelation?.bfFriend ?? detail?.bfFriend ?? false),
  }
}

async function isAlreadyInGroup(groupId: string, serverMember: boolean): Promise<boolean> {
  if (serverMember || groupStore.getGroup(groupId)) return true
  if (authStore.uid && groupStore.groups.length === 0) {
    await groupStore.loadGroups(authStore.uid)
  }
  return Boolean(groupStore.getGroup(groupId))
}

async function openRemoteAliasTarget(label: string, groupId: string) {
  const context = label.replace(/^@+/, '').trim()
  if (!context) return false

  try {
    const resp = await groupOrUserDetail({ fromUid: authStore.uid || 0, context })
    const profile = parseMemberProfile(resp)
    if (profile) {
      uiStore.openMemberInfo(profile.userId, groupId, [context, profile.nickname], profile)
      return true
    }

    const groupTarget = parseGroupTargetFromAlias(resp)
    if (groupTarget) {
      if (groupTarget.id === groupId || (await isAlreadyInGroup(groupTarget.id, false))) {
        eventBus.emit('show-toast', { message: t('已在群聊中'), type: 'success' })
        return true
      }

      uiStore.setAddGroupTarget(groupTarget)
      uiStore.setRightPanel('none')
      uiStore.openAddGroupDialog()
      return true
    }
  } catch (error) {
    console.warn('[TextMessage] resolve alias target failed:', error)
  }

  eventBus.emit('show-toast', { message: t('抱歉，该用户/群/频道不存在'), type: 'error' })
  return false
}

const contentSegments = computed<ContentSegment[]>(() => {
  const content = props.message.content ?? ''
  const segments: ContentSegment[] = []
  let index = 0

  while (index < content.length) {
    const rest = content.slice(index)

    // Links take priority over emoji and mentions
    const linkMatch = detectLinkAtStart(content, index)
    if (linkMatch) {
      segments.push({ type: 'link', text: linkMatch.text, href: linkMatch.href })
      index += linkMatch.text.length
      continue
    }

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

  if (!member) {
    await openRemoteAliasTarget(cleanLabel, groupId)
    return
  }

  uiStore.openMemberInfo(member.userId, groupId, [cleanLabel])
}

async function handleLinkClick(event: MouseEvent, segment: Extract<ContentSegment, { type: 'link' }>) {
  event.preventDefault()
  event.stopPropagation()

  const url = normalizeUrl(segment.href)
  if (!url || !isGroupInviteLink(url)) {
    window.open(segment.href, '_blank')
    eventBus.emit('show-toast', { message: '已打开链接', type: 'success' })
    return
  }

  try {
    const groupInfo = await resolveGroupInfoFromLink(segment.href)
    if (!groupInfo) {
      window.open(segment.href, '_blank')
      eventBus.emit('show-toast', { message: '已打开链接', type: 'success' })
      return
    }

    const target = parseGroupTarget(groupInfo)
    if (!target) throw new Error('群聊链接解析失败')

    uiStore.setAddContactTarget(null)

    if (await isAlreadyInGroup(target.id, Boolean(groupInfo.bfMember))) {
      uiStore.setAddGroupTarget(null)
      eventBus.emit('show-toast', { message: t('已在群聊中'), type: 'success' })
      return
    }

    uiStore.setAddGroupTarget(target)
    uiStore.setRightPanel('none')
    uiStore.openAddGroupDialog()
  } catch (error) {
    console.error('[TextMessage] resolve group invite link failed:', error)
    eventBus.emit('show-toast', { message: (error as Error)?.message || '加入群聊失败', type: 'error' })
  }
}
</script>

<template>
  <!-- 结构对齐旧 im `msg/text.vue` + `time-status-label`：气泡内右下时间/状态 -->
  <div :class="['text-message', 'com-msg-text', { self: displayAsSelf, channel: isChannelChat }]">
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
        <span
          v-else-if="segment.type === 'link'"
          class="text-link"
          @click.stop="handleLinkClick($event, segment)"
        >
          {{ segment.text }}
        </span>
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

    .text-link {
      color: #3369fe;
      text-decoration: none;
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  &.channel > .content-text {
    padding-right: 92px;
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
