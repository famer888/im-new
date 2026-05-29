<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { emojiObj } from '@/utils/emoji'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore, isFileHelperTargetId } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore, type GroupMember } from '@/stores/useGroupStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useUIStore, type AddChannelTarget, type AddGroupTarget, type MemberInfoProfile } from '@/stores/useUIStore'
import { ConversationType } from '@/types'
import MessageTimeStatusLabel from '@/components/MessageTimeStatusLabel.vue'
import { eventBus } from '@/utils/eventBus'
import {
  groupOrUserDetail,
  groupQrUrlFromShortLink,
  queryGroupLink,
  type GroupDetailFromQrCodeResp,
} from '@/api/imBase'
import {
  getHistoryDomain,
  isChannelLink,
  searchAliasContent,
  type ChannelLinkResp,
  type HistoryDomainItem,
} from '@/api/imChannel'

const props = defineProps<{
  message: Message
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const channelStore = useChannelStore()
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
  | { type: 'link'; text: string; href: string; showConfirm?: boolean }

interface MentionCandidate {
  label: string
  memberId: string
}

interface ExtraLinkRange {
  location: number
  length: number
  link: string
}

type AliasTarget =
  | { type: 'member'; context: string; profile: MemberInfoProfile }
  | { type: 'joined-group' }
  | { type: 'add-group'; target: AddGroupTarget }
  | { type: 'channel'; channel: Record<string, any> }
  | { type: 'private-channel'; channel: Record<string, any> }
  | { type: 'missing' }

const GROUP_INVITE_HOSTS = new Set(['45chat.com', '55chat.com', '97chat.com', 'ocs.com'])
const INVITE_LINK_TYPE_GROUP = 1
const INVITE_LINK_TYPE_CHANNEL = 2
const INVITE_LINK_DOMAIN_CACHE_TTL = 24 * 60 * 60 * 1000
const LINK_FORBIDDEN_CHARS = '\\s"\'<>\\u4e00-\\u9fa5\\u3000-\\u303F\\uFF00-\\uFFEF\\u2000-\\u206F'
const LINK_SAFE_END_CHAR = `[^${LINK_FORBIDDEN_CHARS}\\.,;:?!()\\[\\]{}]`
const LINK_AT_START_REGEX = new RegExp(
  `^((?:(?:https?|rtmps?)://|www\\.)[^${LINK_FORBIDDEN_CHARS}]*${LINK_SAFE_END_CHAR})`,
)
const aliasTargetCache = new Map<string, Promise<AliasTarget>>()
const openingMentionKeys = new Set<string>()
const openingLinkKeys = new Set<string>()
const resolvingMentionKeys = ref(new Set<string>())
const resolvingLinkKeys = ref(new Set<string>())
let inviteLinkDomainCache: { expiresAt: number; items: HistoryDomainItem[] } | null = null
let inviteLinkDomainRequest: Promise<HistoryDomainItem[]> | null = null

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
  // 未命中群成员时也按 mention 边界截断，避免把尾部标点一起当成 @ 名称。
  while (end < content.length && !isMentionBoundary(content.charAt(end))) {
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

function pushLinkSegment(segments: ContentSegment[], link: { text: string; href: string; showConfirm?: boolean }) {
  const rtmpPrefixMatch = link.text.match(/^(rtmps?:\/\/)/i)
  if (!rtmpPrefixMatch) {
    segments.push({ type: 'link', text: link.text, href: link.href, showConfirm: link.showConfirm })
    return
  }

  // 对齐产品要求：rtmp:// 前缀仅展示为普通文本，不进入可点击范围。
  const prefix = rtmpPrefixMatch[1]
  const rest = link.text.slice(prefix.length)
  // 用 Word Joiner 禁止“rtmp://”和后续地址之间换行，确保这一段保持同一行展示。
  pushTextSegment(segments, `${prefix}\u2060`)
  if (rest) {
    segments.push({ type: 'link', text: rest, href: link.href, showConfirm: link.showConfirm })
  }
}

function parseMessageExtraObject(rawExtra: unknown): Record<string, unknown> | null {
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

function getExtraLinkRanges(content: string, rawExtra: unknown): ExtraLinkRange[] {
  const extra = parseMessageExtraObject(rawExtra)
  const rawLinks = Array.isArray(extra?.links) ? extra.links : []
  return rawLinks
    .map((item) => {
      const location = Number((item as any)?.location)
      const length = Number((item as any)?.length)
      const link = String((item as any)?.link || '').trim()
      return { location, length, link }
    })
    .filter((item) => (
      Number.isInteger(item.location)
      && Number.isInteger(item.length)
      && item.location >= 0
      && item.length > 0
      && item.location + item.length <= content.length
      && !!item.link
    ))
    .sort((a, b) => a.location - b.location || b.length - a.length)
}

function detectExtraLinkAt(content: string, start: number, ranges: ExtraLinkRange[]): { text: string; href: string } | null {
  const range = ranges.find((item) => item.location === start)
  if (!range) return null
  return {
    text: content.slice(range.location, range.location + range.length),
    href: range.link,
  }
}

function detectLinkAtStart(content: string, start: number): { text: string; href: string } | null {
  const rest = content.slice(start)
  const match = rest.match(LINK_AT_START_REGEX)
  if (!match) return null

  const url = match[1]
  if (url.startsWith('http') && url.length <= 7) return null // At least "http://" + one char
  if (url.startsWith('rtmp://') && url.length <= 8) return null
  if (url.startsWith('rtmps://') && url.length <= 9) return null
  if (url.startsWith('www.') && url.length <= 5) return null
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

function completionUrl(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text)) return text
  return `https://${text}`
}

function getSearchParam(url: URL, name: string): string {
  const target = name.toLowerCase()
  for (const [key, value] of url.searchParams.entries()) {
    if (key.toLowerCase() === target) return value
  }
  return ''
}

function normalizeHost(input: string | URL): string {
  const url = input instanceof URL ? input : normalizeUrl(input)
  return url?.hostname.replace(/^www\./, '').toLowerCase() || ''
}

function isGroupInviteLink(url: URL): boolean {
  const host = normalizeHost(url)
  if (getSearchParam(url, 'qrCode') && getSearchParam(url, 'IdCode')) return true
  return GROUP_INVITE_HOSTS.has(host)
}

function getInviteDomainHosts(item: HistoryDomainItem): string[] {
  return [
    item.currentDomain,
    ...(Array.isArray(item.historyDomainList) ? item.historyDomainList : []),
  ]
    .map((domain) => normalizeHost(String(domain || '')))
    .filter(Boolean)
}

async function loadInviteLinkDomains(): Promise<HistoryDomainItem[]> {
  if (inviteLinkDomainCache && inviteLinkDomainCache.expiresAt > Date.now()) {
    return inviteLinkDomainCache.items
  }

  if (!inviteLinkDomainRequest) {
    inviteLinkDomainRequest = getHistoryDomain()
      .then((res) => {
        const items = Number(res?.code ?? 0) === 200 && Array.isArray(res?.data) ? res.data : []
        inviteLinkDomainCache = {
          expiresAt: Date.now() + INVITE_LINK_DOMAIN_CACHE_TTL,
          items,
        }
        return items
      })
      .finally(() => {
        inviteLinkDomainRequest = null
      })
  }

  return inviteLinkDomainRequest
}

async function getInviteLinkType(href: string): Promise<number> {
  const url = normalizeUrl(href)
  if (!url) return 0

  const fallbackType = isGroupInviteLink(url) ? INVITE_LINK_TYPE_GROUP : 0
  try {
    const host = normalizeHost(url)
    const items = await loadInviteLinkDomains()
    const matched = items.find((item) => getInviteDomainHosts(item).includes(host))
    if (matched?.type !== undefined && matched.type !== null && matched.type !== '') {
      return Number(matched.type)
    }
    return fallbackType
  } catch (error) {
    console.warn('[TextMessage] load invite link domains failed:', error)
    return fallbackType
  }
}

async function getGroupQrUrlFromLink(href: string, force = false): Promise<string> {
  const url = normalizeUrl(href)
  if (!url || (!force && !isGroupInviteLink(url))) return ''

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

async function resolveGroupInfoFromLink(href: string, force = false): Promise<GroupDetailFromQrCodeResp | null> {
  const qrUrl = await getGroupQrUrlFromLink(href, force)
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

function openGroupConversation(target: AddGroupTarget) {
  groupStore.upsertGroup({
    id: target.id,
    name: target.name || target.id,
    avatar: target.avatar,
    ownerId: target.ownerId,
    memberCount: target.memberCount,
    groupAliasName: target.groupAliasName,
    updatedAt: Date.now(),
  })

  const conv = chatStore.ensureConversation(ConversationType.Group, target.id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
}

function normalizeChannelId(raw: any): string {
  return String(raw?.channelId ?? raw?.channel_id ?? raw?.cid ?? raw?.id ?? '').trim()
}

function parseChannelRemark(raw: any): string {
  const value = raw?.remark
    ?? raw?.channelDesc
    ?? raw?.channel_desc
    ?? raw?.description
    ?? raw?.describe
    ?? raw?.channelRemark
    ?? raw?.channel_remark
    ?? raw?.intro
    ?? ''
  return String(value || '').trim()
}

function openChannelConversation(raw: any): boolean {
  const channelId = normalizeChannelId(raw)
  if (!channelId) return false

  channelStore.patchChannel(channelId, {
    ...raw,
    id: channelId,
    channelId,
    name: raw?.channelName ?? raw?.name ?? channelId,
    channelName: raw?.channelName ?? raw?.name ?? channelId,
    avatar: raw?.icon ?? raw?.avatar ?? null,
    icon: raw?.icon ?? raw?.avatar ?? null,
    updatedAt: Date.now(),
  })
  // 从消息内容进入频道时先开会话，权限和成员身份在后台校准。
  void channelStore.ensureChannelDetailReady(channelId)

  const conv = chatStore.ensureConversation(ConversationType.Channel, channelId)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
  return true
}

function canOpenChannelDirectly(raw: any): boolean {
  return !Number(raw?.linkType || 0) || Boolean(Number(raw?.memberType || 0))
}

function parseChannelTarget(raw: any): AddChannelTarget | null {
  const id = normalizeChannelId(raw)
  if (!id) return null
  return {
    id,
    channelId: id,
    name: String(raw?.channelName ?? raw?.name ?? id),
    channelName: String(raw?.channelName ?? raw?.name ?? id),
    avatar: String(raw?.avatar ?? raw?.icon ?? ''),
    icon: String(raw?.icon ?? raw?.avatar ?? ''),
    logoColor: raw?.logoColor ?? null,
    memberCount: Number(raw?.memberCount ?? raw?.member_count ?? 0),
    remark: parseChannelRemark(raw),
    link: String(raw?.link ?? ''),
    linkType: raw?.linkType === undefined && raw?.link_type === undefined ? null : Number(raw.linkType ?? raw.link_type),
    memberType: raw?.memberType === undefined && raw?.member_type === undefined ? null : Number(raw.memberType ?? raw.member_type),
  }
}

function openAddChannelDialog(raw: any) {
  const target = parseChannelTarget(raw)
  if (!target) {
    eventBus.emit('show-toast', { message: t('此频道已失效或过期'), type: 'error' })
    return
  }
  uiStore.setAddChannelTarget(target)
  uiStore.setRightPanel('none')
  uiStore.openAddChannelDialog()
}

async function resolveChannelLinkTarget(href: string): Promise<ChannelLinkResp | null> {
  const link = completionUrl(href)
  if (!link) return null
  try {
    const res = await isChannelLink({ link })
    if (Number(res?.code ?? 0) === 200 && res?.data) return res
    // 服务端已返回成功但 data 为空时，才按“链接失效/过期”处理；避免把网络异常误判成失效。
    if (Number(res?.code ?? 0) === 200) return { ...res, data: null }
    // 兜底再试一次短链码：部分线路更偏向接收 path token，而不是完整 URL。
    const token = (() => {
      try {
        const parsed = new URL(link)
        return decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ''))
      } catch {
        return ''
      }
    })()
    if (token && !token.includes('/')) {
      const tokenRes = await isChannelLink({ link: token })
      if (Number(tokenRes?.code ?? 0) === 200 && tokenRes?.data) return tokenRes
      if (Number(tokenRes?.code ?? 0) === 200) return { ...tokenRes, data: null }
    }
  } catch (error) {
    console.warn('[TextMessage] resolve channel link failed:', error)
    throw error
  }
  return null
}

async function openChannelInviteLink(href: string, showInvalidToast: boolean): Promise<boolean> {
  let channelLink: ChannelLinkResp | null = null
  try {
    channelLink = await resolveChannelLinkTarget(href)
  } catch {
    // 兼容旧 im：频道链接解析遇到网络/端侧异常时不提示“已失效”，交给外链兜底打开。
    return false
  }
  if (channelLink?.data) {
    if (canOpenChannelDirectly(channelLink.data)) {
      openChannelConversation(channelLink.data)
    } else {
      openAddChannelDialog(channelLink.data)
    }
    return true
  }

  if (showInvalidToast) {
    eventBus.emit('show-toast', { message: t('此频道已失效或过期'), type: 'error' })
  }
  return false
}

async function openGroupInviteLink(href: string, force = false): Promise<boolean> {
  const groupInfo = await resolveGroupInfoFromLink(href, force)
  if (!groupInfo) return false

  const target = parseGroupTarget(groupInfo)
  if (!target) throw new Error('群聊链接解析失败')

  uiStore.setAddContactTarget(null)

  if (await isAlreadyInGroup(target.id, Boolean(groupInfo.bfMember))) {
    uiStore.setAddGroupTarget(null)
    openGroupConversation(target)
    eventBus.emit('show-toast', { message: t('已在群聊中'), type: 'success' })
    return true
  }

  uiStore.setAddGroupTarget(target)
  uiStore.setRightPanel('none')
  uiStore.openAddGroupDialog()
  return true
}

function aliasTargetCacheKey(label: string, groupId: string): string {
  return `${groupId}:${label.replace(/^@+/, '').trim()}`
}

function setMentionResolving(key: string, resolving: boolean) {
  const next = new Set(resolvingMentionKeys.value)
  if (resolving) next.add(key)
  else next.delete(key)
  resolvingMentionKeys.value = next
}

function setLinkResolving(key: string, resolving: boolean) {
  const next = new Set(resolvingLinkKeys.value)
  if (resolving) next.add(key)
  else next.delete(key)
  resolvingLinkKeys.value = next
}

async function resolveRemoteAliasTarget(label: string, groupId: string): Promise<AliasTarget> {
  const context = label.replace(/^@+/, '').trim()
  if (!context) return { type: 'missing' }

  // OpenChat 网关（固定 VITE_APP_OPEN_CHAT_DOMAIN）与业务域名（可为线路池/localStorage）
  // 可能不一致；searchAliasContent 抛错或未命中时仍需走 biz 的 groupOrUserDetail。
  try {
    const aliasResp = await searchAliasContent({ fromUid: authStore.uid || 0, content: context })
    if (Number(aliasResp?.code ?? 0) === 200 && aliasResp?.data) {
      const searchType = Number(aliasResp.data.searchType)
      const channelInfo = aliasResp.data.channelInfo
      if (searchType === 2 && channelInfo) {
        return canOpenChannelDirectly(channelInfo)
          ? { type: 'channel', channel: channelInfo as Record<string, any> }
          : { type: 'private-channel', channel: channelInfo as Record<string, any> }
      }
    }
  } catch (error) {
    console.warn('[TextMessage] searchAliasContent failed, fallback to groupOrUserDetail:', error)
  }

  try {
    const resp = await groupOrUserDetail({ fromUid: authStore.uid || 0, context })
    const profile = parseMemberProfile(resp)
    if (profile) {
      return { type: 'member', context, profile }
    }

    const groupTarget = parseGroupTargetFromAlias(resp)
    if (groupTarget) {
      if (groupTarget.id === groupId || (await isAlreadyInGroup(groupTarget.id, false))) {
        return { type: 'joined-group' }
      }

      return { type: 'add-group', target: groupTarget }
    }
  } catch (error) {
    console.warn('[TextMessage] groupOrUserDetail failed:', error)
  }

  return { type: 'missing' }
}

async function openRemoteAliasTarget(label: string, groupId: string) {
  const key = aliasTargetCacheKey(label, groupId)
  let request = aliasTargetCache.get(key)
  if (!request) {
    request = resolveRemoteAliasTarget(label, groupId).catch((error) => {
      aliasTargetCache.delete(key)
      throw error
    })
    aliasTargetCache.set(key, request)
  }

  const target = await request
  if (target.type === 'member') {
    uiStore.openMemberInfo(target.profile.userId, groupId, [target.context, target.profile.nickname], target.profile)
  } else if (target.type === 'joined-group') {
    eventBus.emit('show-toast', { message: t('已在群聊中'), type: 'success' })
  } else if (target.type === 'add-group') {
    uiStore.setAddGroupTarget(target.target)
    uiStore.setRightPanel('none')
    uiStore.openAddGroupDialog()
  } else if (target.type === 'channel') {
    openChannelConversation(target.channel)
  } else if (target.type === 'private-channel') {
    openAddChannelDialog(target.channel)
  } else {
    aliasTargetCache.delete(key)
    eventBus.emit('show-toast', { message: t('抱歉，该用户/群/频道不存在'), type: 'error' })
  }
}

const contentSegments = computed<ContentSegment[]>(() => {
  const rawContent = props.message.content ?? ''
  // 仅针对推流地址展示：把“推流地址：”和 rtmp:// 之间空白改成不可换行空格，强制同一行显示。
  const content = rawContent.replace(
    /(推流地址[：:])[\s\u2028\u2029]+(rtmps?:\/\/)/gi,
    '$1\u00A0$2',
  )
  const extraLinkRanges = getExtraLinkRanges(content, props.message.extra)
  // 常规纯文本消息不进入逐字符解析，减少首屏大量文本消息的渲染开销。
  if (content && !extraLinkRanges.length && !/[@\[]|https?:\/\/|rtmps?:\/\/|www\./i.test(content)) {
    return [{ type: 'text', text: content }]
  }
  const segments: ContentSegment[] = []
  let index = 0

  while (index < content.length) {
    // 对齐旧 im：服务端下发的 links(location/length/link) 优先作为可点击链接渲染。
    const extraLink = detectExtraLinkAt(content, index, extraLinkRanges)
    if (extraLink) {
      pushLinkSegment(segments, { text: extraLink.text, href: extraLink.href, showConfirm: true })
      index += extraLink.text.length
      continue
    }

    const rest = content.slice(index)

    // Links take priority over emoji and mentions
    const linkMatch = detectLinkAtStart(content, index)
    if (linkMatch) {
      pushLinkSegment(segments, { text: linkMatch.text, href: linkMatch.href })
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

function resolveMentionLocalFriend(cleanLabel: string): { userId: string; nickname: string; avatar: string; remark: string | null; depict: string | null; isFriend: boolean } | null {
  const text = cleanLabel.trim()
  if (!text) return null

  const contact = contactStore.contacts.find((item) =>
    String(item.id || '').trim() === text
    || String(item.nickname || '').trim() === text
    || String(item.remark || '').trim() === text,
  )
  if (!contact?.id) return null

  return {
    userId: contact.id,
    nickname: contact.nickname || contact.id,
    avatar: contact.avatar || '',
    remark: contact.remark || null,
    depict: (contact as any).depict || null,
    isFriend: true,
  }
}

async function handleAtClick(segment: Extract<ContentSegment, { type: 'at' }>) {
  const groupId = messageGroupId.value

  const cleanLabel = segment.text.replace(/^@+/, '').trim()
  if (!cleanLabel || cleanLabel === '所有人' || cleanLabel === '全体成员') return
  const openingKey = aliasTargetCacheKey(cleanLabel, groupId)
  if (openingMentionKeys.has(openingKey)) return
  openingMentionKeys.add(openingKey)

  try {
    const members = groupId ? groupMembers.value : []
    const member = segment.memberId
      ? members.find((item) => item.userId === segment.memberId)
      : findMentionMember(segment.text, members)

    if (!member) {
      const localFriend = resolveMentionLocalFriend(cleanLabel)
      if (localFriend) {
        // 群聊里的 @ 文本可能是备注/昵称，先映射到好友 uid 再打开，确保展示“发送消息”入口。
        uiStore.openMemberInfo(localFriend.userId, groupId, [cleanLabel], localFriend)
        return
      }
      if (groupId) {
        // 对齐“点击头像”逻辑：群内 @ 未命中本地成员缓存时，先按 uid 直开成员信息，避免误走远端别名导致“未找到”。
        uiStore.openMemberInfo(cleanLabel, groupId, [cleanLabel])
        return
      }
      const slowTimer = window.setTimeout(() => {
        setMentionResolving(openingKey, true)
      }, 350)
      try {
        await openRemoteAliasTarget(cleanLabel, groupId)
      } finally {
        window.clearTimeout(slowTimer)
        setMentionResolving(openingKey, false)
      }
      return
    }

    uiStore.openMemberInfo(member.userId, groupId, [cleanLabel])
  } finally {
    openingMentionKeys.delete(openingKey)
  }
}

function isAtResolving(segment: Extract<ContentSegment, { type: 'at' }>): boolean {
  const groupId = messageGroupId.value
  return resolvingMentionKeys.value.has(aliasTargetCacheKey(segment.text, groupId))
}

function linkResolvingKey(segment: Extract<ContentSegment, { type: 'link' }>): string {
  return `${props.message.id || props.message.customMsgId || props.message.conversationId}:${segment.href}`
}

function isLinkResolving(segment: Extract<ContentSegment, { type: 'link' }>): boolean {
  return resolvingLinkKeys.value.has(linkResolvingKey(segment))
}

function isStreamLikeLink(rawHref: string): boolean {
  const href = String(rawHref || '').trim().toLowerCase()
  return href.startsWith('rtmp://') || href.startsWith('rtmps://')
}

function isStreamLinkSegment(segment: Extract<ContentSegment, { type: 'link' }>): boolean {
  return isStreamLikeLink(segment.href)
}

async function openExternalLink(rawHref: string) {
  const target = rawHref || ''
  if (!target) return
  // 推流协议本身不是浏览器导航协议；对齐产品期望，点击后用 https 落到浏览器打开。
  const browserTarget = target
    .replace(/^rtmps?:\/\//i, 'https://')
  if ((window as any).__TAURI_INTERNALS__) {
    // 桌面端统一用系统浏览器打开可导航 URL。
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(browserTarget)
    return
  }
  window.open(browserTarget, '_blank')
}

async function handleLinkClick(event: MouseEvent, segment: Extract<ContentSegment, { type: 'link' }>) {
  event.preventDefault()
  event.stopPropagation()

  const key = linkResolvingKey(segment)
  if (openingLinkKeys.has(key)) return
  openingLinkKeys.add(key)

  const slowTimer = window.setTimeout(() => {
    setLinkResolving(key, true)
  }, 250)

  let normalizedHref = ''
  let inviteLinkType = 0
  try {
    if (segment.showConfirm) {
      const ok = window.confirm(`${t('打开链接')}\n${segment.href}`)
      if (!ok) return
    }

    // 推流地址不参与邀请链路识别，直接打开浏览器，避免点击后网络探测导致卡顿。
    if (isStreamLikeLink(segment.href)) {
      await openExternalLink(segment.href)
      return
    }

    normalizedHref = completionUrl(segment.href)
    inviteLinkType = await getInviteLinkType(normalizedHref)

    if (inviteLinkType === INVITE_LINK_TYPE_GROUP) {
      if (await openGroupInviteLink(normalizedHref, true)) return
      await openExternalLink(normalizedHref || segment.href)
      return
    }

    if (inviteLinkType === INVITE_LINK_TYPE_CHANNEL) {
      await openChannelInviteLink(normalizedHref, true)
      return
    }

    if (await openChannelInviteLink(normalizedHref, false)) return

    const url = normalizeUrl(normalizedHref)
    if (url && isGroupInviteLink(url) && await openGroupInviteLink(normalizedHref)) return

    await openExternalLink(normalizedHref || segment.href)
  } catch (error) {
    console.error('[TextMessage] resolve group invite link failed:', error)
    eventBus.emit('show-toast', { message: (error as Error)?.message || t('加入群聊失败'), type: 'error' })
    if (inviteLinkType === INVITE_LINK_TYPE_GROUP && normalizedHref) {
      await openExternalLink(normalizedHref)
    }
  } finally {
    window.clearTimeout(slowTimer)
    setLinkResolving(key, false)
    openingLinkKeys.delete(key)
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
          :class="['at-mention', { resolving: isAtResolving(segment) }]"
          @pointerdown.left.stop.prevent="handleAtClick(segment)"
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
          :class="['text-link', { resolving: isLinkResolving(segment), 'stream-link': isStreamLinkSegment(segment) }]"
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
  max-width: 650px;
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
    padding-right: 12px;
    padding-bottom: 18px;
    line-height: 22px;
    white-space: pre-wrap;
    letter-spacing: 0.5px;
    font-size: 14px;

    .at-mention,
    .text-link {
      color: #3369fe;
      cursor: pointer;
      font-weight: normal;
      position: relative;

      &:hover {
        opacity: 0.8;
      }

      &.resolving {
        cursor: progress;
        padding-right: 16px;
        opacity: 0.75;
      }

      &.resolving::after {
        content: '';
        position: absolute;
        top: 50%;
        right: 2px;
        width: 9px;
        height: 9px;
        margin-top: -5px;
        border: 1px solid rgba(51, 105, 254, 0.35);
        border-top-color: #3369fe;
        border-radius: 50%;
        animation: mention-resolving-spin 0.7s linear infinite;
      }
    }

    .at-mention {
      display: inline-block;
    }

    .text-link {
      display: inline;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }

      &.stream-link {
        white-space: nowrap;
      }
    }
  }

  &.channel > .content-text {
    padding-right: 12px;
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

@keyframes mention-resolving-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
