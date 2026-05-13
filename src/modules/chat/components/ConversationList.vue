<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CHANNEL_NOTIFICATION_TARGET_ID,
  GROUP_NOTIFICATION_TARGET_ID,
  useChatStore,
  isFileHelperTargetId,
  type Conversation,
} from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import { useUIStore } from '@/stores/useUIStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { ConversationType, isHiddenMessageType } from '@/types'
import TextAvatar from '@/components/TextAvatar.vue'
import dayjs from 'dayjs'
import {
  formatGroupNoticeDisplayText,
  getGroupNoticeActorId,
  getGroupNoticeGroupId,
  parseGroupNoticeExtraObject,
} from '@/utils/groupNoticeDisplay'
import { normalizeGroupNoticeText, translateGroupNoticeText } from '@/utils/groupNoticeI18n'
import { emojiObj } from '@/utils/emoji'
import mdrIcon from '@/assets/images/message/mdr-icon.png'
import archiveIcon from '@/assets/images/message/archive-icon.png'
import groupNotificationIcon from '@/assets/images/logo/group-icon.png'
import channelNotificationIcon from '@/assets/images/logo/channel-notice.webp'

const { t, locale } = useI18n()
const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()
const messageStore = useMessageStore()
const uiStore = useUIStore()
const authStore = useAuthStore()
const emojiMap = emojiObj as Record<string, string>
const HIDDEN_GROUP_NOTICE_TEXT = '群聊事件'
const HIDDEN_GROUP_QUIT_NOTICE_RE = /^#\{uids:[^}]*\}\s*退出群聊$/
const PENDING_GROUP_INVITE_RE = /邀请你加入群聊/

type DigestSegment =
  | { type: 'text'; text: string }
  | { type: 'emoji'; text: string; src: string }

/** 传输助手仅通过侧栏「传输」进入，不在会话列表重复展示（与 im 一致） */
function isNotFileHelper(c: Conversation): boolean {
  return !isFileHelperTargetId(c.targetId)
}

function isConversationInCurrentRelations(conv: Conversation): boolean {
  const hasGroupNotification = chatStore.conversations.some(
    (item) => item.type === ConversationType.Group && item.targetId === GROUP_NOTIFICATION_TARGET_ID,
  )
  if (conv.type === ConversationType.Friend && conv.targetId === CHANNEL_NOTIFICATION_TARGET_ID) {
    return true
  }
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) {
    return true
  }
  switch (conv.type) {
    case ConversationType.Friend:
      return Boolean(contactStore.getContact(conv.targetId))
    case ConversationType.Group:
      if (chatStore.isPendingGroupInviteConversation(conv.targetId)) return false
      if (!hasGroupNotification && PENDING_GROUP_INVITE_RE.test(String(conv.lastMsgDigest || ''))) return false
      return Boolean(groupStore.getGroup(conv.targetId))
    case ConversationType.Channel:
      return Boolean(channelStore.getChannel(conv.targetId))
    default:
      return false
  }
}

const normalConversations = computed(() =>
  chatStore.conversations.filter(
    c => !c.isArchived && isNotFileHelper(c) && isConversationInCurrentRelations(c),
  ),
)

const archivedConversations = computed(() =>
  chatStore.conversations.filter(
    c => c.isArchived && isNotFileHelper(c) && isConversationInCurrentRelations(c),
  ),
)

/** 与旧 im 归档入口 archiveText 一致：归档会话名称逗号拼接预览 */
const archivePreviewText = computed(() =>
  archivedConversations.value.map((c) => getName(c)).filter(Boolean).join(','),
)

/** 归档会话汇总未读（旧 im archiveUnreadCount） */
const archiveUnreadTotal = computed(() =>
  archivedConversations.value.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
)

const displayList = computed(() =>
  uiStore.chatArchiveListShow
    ? archivedConversations.value
    : ensureGroupNotificationVisible(normalConversations.value),
)

function ensureGroupNotificationVisible(conversations: Conversation[]): Conversation[] {
  const hasGroupNotification = conversations.some(
    (conv) => conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID,
  )
  if (hasGroupNotification) return conversations

  const pendingInvite = chatStore.conversations.find(
    (conv) => conv.type === ConversationType.Group
      && conv.targetId !== GROUP_NOTIFICATION_TARGET_ID
      && PENDING_GROUP_INVITE_RE.test(String(conv.lastMsgDigest || '')),
  )
  if (!pendingInvite) return conversations

  return [
    {
      ...pendingInvite,
      id: `1_${GROUP_NOTIFICATION_TARGET_ID}`,
      targetId: GROUP_NOTIFICATION_TARGET_ID,
      senderName: null,
    },
    ...conversations,
  ]
}

function getName(conv: Conversation): string {
  if (conv.type === ConversationType.Friend && conv.targetId === CHANNEL_NOTIFICATION_TARGET_ID) {
    return t('频道通知')
  }
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) {
    return t('群通知')
  }
  switch (conv.type) {
    case ConversationType.Friend:
      return contactStore.getDisplayName(conv.targetId)
    case ConversationType.Group:
      return groupStore.getGroup(conv.targetId)?.name ?? conv.targetId
    case ConversationType.Channel:
      return channelStore.getChannel(conv.targetId)?.channelName
        ?? channelStore.getChannel(conv.targetId)?.name
        ?? conv.targetId
    default:
      return conv.targetId
  }
}

function getAvatar(conv: Conversation): string | null {
  if (conv.type === ConversationType.Friend && conv.targetId === CHANNEL_NOTIFICATION_TARGET_ID) {
    return channelNotificationIcon
  }
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) {
    return groupNotificationIcon
  }
  switch (conv.type) {
    case ConversationType.Friend:
      return contactStore.getContact(conv.targetId)?.avatar ?? null
    case ConversationType.Group:
      return groupStore.getGroup(conv.targetId)?.avatar ?? null
    case ConversationType.Channel:
      return channelStore.getChannel(conv.targetId)?.avatar ?? null
    default:
      return null
  }
}

function getAvatarId(conv: Conversation): string | undefined {
  if (conv.type !== ConversationType.Channel) return undefined
  const channel = channelStore.getChannel(conv.targetId)
  return channel?.channelId || channel?.id || conv.targetId
}

function getAvatarColor(conv: Conversation): string | undefined {
  if (conv.type !== ConversationType.Channel) return undefined
  return channelStore.getChannel(conv.targetId)?.logoColor || undefined
}

function getAvatarType(conv: Conversation): 'friend' | 'group' | 'channel' {
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) {
    return 'group'
  }
  switch (conv.type) {
    case ConversationType.Group:
      return 'group'
    case ConversationType.Channel:
      return 'channel'
    default:
      return 'friend'
  }
}

function formatTime(ts: number): string {
  if (!ts) return ''
  void locale.value
  const d = dayjs(ts)
  const today = dayjs()
  if (d.isSame(today, 'day')) return d.format('HH:mm')
  if (d.isSame(today.subtract(1, 'day'), 'day')) return t('昨天')
  if (d.isSame(today, 'year')) return d.format('MM/DD')
  return d.format('YYYY/MM/DD')
}

/** 与 im 会话列表 `&.online` 绿点一致：单聊好友在线且允许展示时显示 */
function showFriendOnlineDot(conv: Conversation): boolean {
  if (conv.type !== ConversationType.Friend) return false
  if (isFileHelperTargetId(conv.targetId)) return false
  const c = contactStore.getContact(conv.targetId)
  if (!c || c.bfShowOnline === false) return false
  return Boolean(c.online)
}

function translateKnownDigest(raw: string): string {
  return translateGroupNoticeText(raw, t)
}

function isHiddenGroupNoticeDigest(digest: string): boolean {
  const raw = digest.trim().replace(/\s+/g, ' ')
  return raw === HIDDEN_GROUP_NOTICE_TEXT || HIDDEN_GROUP_QUIT_NOTICE_RE.test(raw)
}

function formatDigestText(digest: string): string {
  const raw = digest.trim()
  if (!raw) return ''
  const translated = translateKnownDigest(raw)
  if (translated !== raw) return translated
  if (raw === '暂不支持该消息类型') return ''
  if (raw.includes('\uFFFD')) return `[${t('名片')}]`

  if (/^(?:ht_(?:[2-9]|10|[AJQK])|JOCK[12])(?:\|\|.+)?$/i.test(raw)) {
    return `[${t('扑克牌')}]`
  }

  const bracketMatch = raw.match(/^\[(图片|语音|视频|名片|文件|骰子|扑克牌)\]$/)
  if (bracketMatch) return `[${t(bracketMatch[1])}]`

  try {
    const parsed = JSON.parse(raw)
    if (
      parsed
      && typeof parsed === 'object'
      && (parsed.url || parsed.fileUrl || parsed.thumbnailUrl || parsed.thumbUrl)
    ) {
      return `[${t('图片')}]`
    }
  } catch {
    // 非 JSON 文本按原内容显示
  }

  return raw
}

function parseMessageExtra(rawExtra: unknown): Record<string, unknown> | null {
  if (!rawExtra) return null
  if (typeof rawExtra === 'string') {
    try {
      const parsed = JSON.parse(rawExtra)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
  return typeof rawExtra === 'object' ? rawExtra as Record<string, unknown> : null
}

function getGroupReqUserName(user: unknown, fallbackId?: unknown): string {
  const raw = user && typeof user === 'object' ? user as Record<string, unknown> : null
  const relation = raw?.friendRelation && typeof raw.friendRelation === 'object'
    ? raw.friendRelation as Record<string, unknown>
    : null
  const names = [
    raw?.remarkName,
    relation?.remarkName,
    raw?.nickName,
    raw?.nickname,
    raw?.nick_name,
    raw?.name,
    raw?.identify,
    raw?.uid,
    raw?.userId,
    fallbackId,
  ]
  return names.map((v) => String(v ?? '').trim()).find(Boolean) || ''
}

function getGroupNoticeActorRole(extra: Record<string, unknown> | null): number | null {
  if (!extra) return null
  const groupId = getGroupNoticeGroupId(extra)
  const actorId = getGroupNoticeActorId(extra)
  if (!groupId || !actorId) return null
  const role = groupStore.getMembers(groupId).find((member) => member.userId === actorId)?.role
  return Number.isFinite(Number(role)) ? Number(role) : null
}

function getGroupNoticeContextMembers(extra: Record<string, unknown> | null) {
  if (!extra) return []
  const groupId = getGroupNoticeGroupId(extra)
  return groupId ? groupStore.getMembers(groupId) : []
}

function formatGroupNotificationDigest(content: string, extra: Record<string, unknown> | null): string {
  const formattedContent = formatGroupNoticeDisplayText(content, extra, {
    currentUid: authStore.uid,
    actorRole: getGroupNoticeActorRole(extra),
  })
  const raw = normalizeGroupNoticeText(formattedContent.trim().replace(/\s+/g, ' '))
  if (isHiddenGroupNoticeDigest(raw)) return ''
  const translated = translateKnownDigest(raw)
  if (!extra) return translated
  if (/^\S*(?:群主|群员|管理员|（群员）|（管理员）|（群主）)/.test(raw)) return translated

  const type = Number(extra.groupReqType ?? 0)
  const status = Number(extra.groupReqStatus ?? 0)
  const shouldPrefix =
    /^(拒绝加入|同意加入|申请加入|邀请你加入|加入)/.test(raw) ||
    (status === 2 && raw.includes('拒绝')) ||
    [1, 2, 3, 4, 14, 15].includes(type)
  if (!shouldPrefix) return translated

  const user =
    status === 2
      ? extra.targetUser || extra.fromUser || extra.checkUser
      : extra.fromUser || extra.targetUser || extra.checkUser
  const fallbackId = status === 2 ? extra.receiveUid : extra.sendUid
  const name = getGroupReqUserName(user, fallbackId)
  if (!name || raw.includes(name)) return translated

  return `${name}${translated}`.slice(0, 200)
}

function shouldShowDraft(conv: Conversation): boolean {
  return Boolean(conv.draft) && conv.id !== chatStore.currentConversationId
}

function getMessageDigest(message: Message): string {
  const raw = (message.content || '').trim()
  if (message.msgType === 1) return `[${t('图片')}]`
  if (message.msgType === 2) return `[${t('语音')}]`
  if (message.msgType === 3) return `[${t('视频')}]`
  if (message.msgType === 5) return `[${t('名片')}]`
  if (message.msgType === 7) return `[${t('文件')}]`
  if (message.msgType === 12) return `[${t('骰子')}]`
  if (message.msgType === 18) return `[${t('扑克牌')}]`
  if (isHiddenMessageType(message.msgType)) return ''
  if (message.msgType === 8) {
    const extra = parseGroupNoticeExtraObject(message.extra)
    const isGroupNotification = message.conversationId === `1_${GROUP_NOTIFICATION_TARGET_ID}`
    const formatted = formatGroupNoticeDisplayText(raw, extra, {
      currentUid: authStore.uid,
      actorRole: getGroupNoticeActorRole(extra),
      contextMembers: isGroupNotification ? [] : getGroupNoticeContextMembers(extra),
    })
    if (isHiddenGroupNoticeDigest(formatted)) return ''
    return formatted ? formatDigestText(formatted) : ''
  }
  return raw ? formatDigestText(raw) : ''
}

function getLoadedLatestDigest(conv: Conversation): string {
  const loaded = messageStore.getMessages(conv.id)
  if (loaded.length === 0) return ''
  const latest = [...loaded].reverse().find((message) => !isHiddenMessageType(message.msgType))
  if (!latest) return ''
  const isCurrentConversation = conv.id === chatStore.currentConversationId
  const latestTime = Number(latest.sendTime || 0)
  const convTime = Number(conv.lastMsgTime || 0)
  const lastMsgId = String(conv.lastMsgId || '')
  const latestMatchesSummary = Boolean(
    lastMsgId
    && (String(latest.id || '') === lastMsgId || String(latest.customMsgId || '') === lastMsgId),
  )

  if (!isCurrentConversation && !latestMatchesSummary && latestTime < convTime) return ''
  const digest = getMessageDigest(latest)
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) {
    return formatGroupNotificationDigest(digest, parseMessageExtra(latest.extra))
  }
  return digest
}

function getDigest(conv: Conversation): string {
  if (shouldShowDraft(conv)) return conv.draft || ''
  const loadedDigest = getLoadedLatestDigest(conv)
  if (loadedDigest) return loadedDigest
  if (conv.lastMsgDigest && conv.lastMsgDigest.trim()) {
    if (isHiddenGroupNoticeDigest(conv.lastMsgDigest)) return ''
    return formatDigestText(conv.lastMsgDigest)
  }

  return ''
}

function getDigestEmojiSrc(token: string): string {
  const fileName = emojiMap[token]
  return fileName ? `/images/emoji/${fileName}.png` : ''
}

function splitDigestSegments(text: string): DigestSegment[] {
  const segments: DigestSegment[] = []
  const tokenPattern = /\[[^\]]+\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  const pushText = (value: string) => {
    if (!value) return
    const last = segments[segments.length - 1]
    if (last?.type === 'text') {
      last.text += value
    } else {
      segments.push({ type: 'text', text: value })
    }
  }

  while ((match = tokenPattern.exec(text)) !== null) {
    const token = match[0]
    const src = getDigestEmojiSrc(token)
    if (!src) continue

    pushText(text.slice(lastIndex, match.index))
    segments.push({ type: 'emoji', text: token, src })
    lastIndex = match.index + token.length
  }

  pushText(text.slice(lastIndex))
  return segments
}

function getDigestSegments(conv: Conversation): DigestSegment[] {
  return splitDigestSegments(getDigest(conv))
}

function handleSelect(conv: Conversation) {
  if (conv.type === ConversationType.Friend && conv.targetId === CHANNEL_NOTIFICATION_TARGET_ID) {
    chatStore.setCurrentConversation(conv.id)
    chatStore.clearChannelNotificationUnread()
    uiStore.setRightPanel('none')
    uiStore.setDetailView('channel-notice-list')
    return
  }
  if (conv.type === ConversationType.Group && conv.targetId === GROUP_NOTIFICATION_TARGET_ID) {
    chatStore.setCurrentConversation(conv.id)
    chatStore.clearGroupNotificationUnread()
    uiStore.setRightPanel('none')
    uiStore.setDetailView('group-invitation')
    return
  }
  if (conv.type === ConversationType.Friend && !isFileHelperTargetId(conv.targetId)) {
    void contactStore.ensureContactDetailLoaded(conv.targetId)
  }
  chatStore.setCurrentConversation(conv.id)
  // 点击会话项后收起右侧信息面板（与 im 交互一致）
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
}

function handleContextMenu(e: MouseEvent, conv: Conversation) {
  e.preventDefault()
  uiStore.showContextMenu(e.clientX, e.clientY, {
    type: 'conversation',
    conversationId: conv.id,
    isPinned: conv.isPinned,
    isMuted: conv.isMuted,
    isArchived: conv.isArchived,
  })
}
</script>

<template>
  <div class="conversation-list">
    <!-- 归档入口（对齐旧 im chats/index.vue .archive） -->
    <div
      v-if="archivedConversations.length > 0 && !uiStore.chatArchiveListShow"
      class="archive-entry"
      @click="uiStore.setChatArchiveListShow(true)"
    >
      <img class="archive-entry-icon" :src="archiveIcon" alt="" />
      <div class="archive-entry-main">
        <div class="archive-entry-title-row">
          <span class="archive-entry-title">{{ $t('归档会话') }}</span>
          <span v-if="archiveUnreadTotal > 0" class="archive-entry-badge">
            {{ archiveUnreadTotal > 99 ? '99+' : archiveUnreadTotal }}
          </span>
        </div>
        <div v-if="archivePreviewText" class="archive-entry-preview">{{ archivePreviewText }}</div>
      </div>
    </div>

    <div class="list">
      <div
        v-for="conv in displayList"
        :key="conv.id"
        :class="['conv-item', {
          active: conv.id === chatStore.currentConversationId,
          pinned: conv.isPinned && !conv.isArchived,
          'friend-online': showFriendOnlineDot(conv),
          'has-unread': conv.unreadCount > 0,
        }]"
        @click="handleSelect(conv)"
        @contextmenu="handleContextMenu($event, conv)"
      >
        <div class="conv-avatar-wrap">
          <TextAvatar
            :id="getAvatarId(conv)"
            :name="getName(conv)"
            :src="getAvatar(conv)"
            :avatar-type="getAvatarType(conv)"
            :color="getAvatarColor(conv)"
            :size="35"
            :rounded="!!getAvatar(conv)"
          />
        </div>

        <div class="conv-body">
          <div class="conv-row-top">
            <h3 class="conv-name">{{ getName(conv) }}</h3>
            <span class="conv-time">{{ formatTime(conv.lastMsgTime) }}</span>
          </div>
          <div class="conv-row-bottom">
            <span v-if="!shouldShowDraft(conv) && conv.atMe" class="at-me">[{{ t('有人@我') }}]</span>
            <span v-if="shouldShowDraft(conv)" class="draft-tag">[{{ t('草稿') }}]</span>
            <span v-if="conv.senderName && !shouldShowDraft(conv)" class="sender-name">{{ conv.senderName }}:</span>
            <span class="conv-digest">
              <template v-for="(segment, index) in getDigestSegments(conv)" :key="`${conv.id}-digest-${index}`">
                <img
                  v-if="segment.type === 'emoji'"
                  class="conv-digest-emoji"
                  :src="segment.src"
                  :alt="segment.text"
                />
                <span v-else>{{ segment.text }}</span>
              </template>
            </span>
            <span v-if="conv.isMuted" class="muted-icon">
              <img :src="mdrIcon" alt="" />
            </span>
          </div>
        </div>

        <span v-if="conv.unreadCount > 0 && !conv.isMuted" class="badge">
          {{ conv.unreadCount > 99 ? '99+' : conv.unreadCount }}
        </span>
        <span v-else-if="conv.unreadCount > 0 && conv.isMuted" class="muted-dot" />

        <div class="conv-divider" />
      </div>
    </div>

    <div v-if="displayList.length === 0" class="empty-tip">
      {{ uiStore.chatArchiveListShow ? t('暂无归档会话') : t('暂时没有新的聊天会话') }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.conversation-list {
  flex: 1;
  position: relative;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #999 transparent;
}

.list {
  position: relative;
  min-height: 100%;
}

.archive-entry {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 59px;
  padding: 8px 16px 8px 63px;
  box-sizing: border-box;
  background-color: #fcfcfc;
  border-bottom: 1px solid #f1f0f0;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover { background: #f9f9f9; }
}

.archive-entry-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  width: 35px;
  height: 35px;
  transform: translateY(-50%);
  object-fit: cover;
}

.archive-entry-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.archive-entry-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.archive-entry-title {
  font-size: 14px;
  color: #333;
  font-weight: normal;
  line-height: 18px;
}

.archive-entry-badge {
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 7px;
  box-sizing: border-box;
  background: #666;
  border-radius: 20px;
  transform: scale(0.86);
  color: #fff;
  font-size: 12px;
  font-style: normal;
  line-height: 20px;
  text-align: center;
}

.archive-entry-preview {
  font-size: 12px;
  color: #999;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 16px 0 63px;
  height: 59px;
  background-color: #fcfcfc;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover { background: #f9f9f9; }
  &.active { background: #efefef; }
  &.pinned { background: #ede7e7; }
  &.pinned.active { background: #efefef; }

  &.friend-online .conv-avatar-wrap::after {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    right: -1px;
    bottom: -1px;
    background: #10d561;
    border: 1px solid #fcfcfc;
    box-sizing: border-box;
    z-index: 2;
  }
}

.conv-avatar-wrap {
  position: absolute;
  left: 16px;
  width: 35px;
  height: 35px;
  flex-shrink: 0;
}

.badge {
  position: absolute;
  right: 12px;
  bottom: 11px;
  z-index: 3;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  box-sizing: border-box;
  background: #f44e5a;
  border-radius: 18px;
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 18px;
  white-space: nowrap;
}

.muted-dot {
  position: absolute;
  right: 18px;
  bottom: 16px;
  z-index: 3;
  width: 8px;
  height: 8px;
  background: #ccc;
  border-radius: 50%;
}

.conv-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.conv-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.conv-name {
  font-size: 14px;
  color: #333;
  font-weight: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  max-width: 120px;
  line-height: 18px;
}

.conv-time {
  font-size: 11px;
  color: #999;
  flex-shrink: 0;
  margin-left: 8px;
}

.conv-row-bottom {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #aaaaaa;
  line-height: 20px;
  gap: 2px;
}

.conv-item.has-unread .conv-row-bottom {
  padding-right: 30px;
  box-sizing: border-box;
}

.at-me {
  color: #ff0000;
  font-size: 12px;
  flex-shrink: 0;
}

.draft-tag {
  color: #ff0000;
  font-size: 12px;
  flex-shrink: 0;
}

.sender-name {
  color: #aaaaaa;
  font-size: 12px;
  flex-shrink: 0;
}

.conv-digest {
  color: #aaaaaa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.conv-digest-emoji {
  display: inline-block;
  width: 16px;
  height: 16px;
  margin: 0 1px;
  vertical-align: -3px;
}

.muted-icon {
  flex-shrink: 0;
  margin-left: 6px;
  display: flex;
  align-items: center;

  img {
    display: block;
    width: 12px;
    height: 12px;
  }
}

.conv-divider {
  position: absolute;
  bottom: 0;
  left: 63px;
  right: 0;
  height: 1px;
  background: #f1f0f0;
}

.empty-tip {
  position: absolute;
  top: 50%;
  left: 50%;
  // width: 100%;
  transform: translate(-50%);
  text-align: center;
  color: #333;
  font-weight: 500;
  font-size: 13px;
}
</style>
