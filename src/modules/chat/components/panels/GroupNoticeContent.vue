<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useGroupStore, type GroupMember } from '@/stores/useGroupStore'
import { useUIStore, type AddChannelTarget, type AddGroupTarget, type MemberInfoProfile } from '@/stores/useUIStore'
import { eventBus } from '@/utils/eventBus'
import { ConversationType } from '@/types'
import {
  groupOrUserDetail,
  groupQrUrlFromShortLink,
  queryGroupLink,
  type GroupDetailFromQrCodeResp,
} from '@/api/imBase'
import {
  isChannelLink,
  searchAliasContent,
  type ChannelLinkResp,
} from '@/api/imChannel'

const props = withDefaults(defineProps<{
  content: string
  groupId: string
  height?: string
  compact?: boolean
  clickable?: boolean
}>(), {
  height: '',
  compact: false,
  clickable: true,
})

const { t } = useI18n()
const authStore = useAuthStore()
const chatStore = useChatStore()
const channelStore = useChannelStore()
const groupStore = useGroupStore()
const uiStore = useUIStore()
const emit = defineEmits<{
  (e: 'navigated'): void
}>()
const resolvingLinkKeys = ref(new Set<string>())
const resolvingMentionKeys = ref(new Set<string>())
const openingLinkKeys = new Set<string>()
const openingMentionKeys = new Set<string>()

type NoticeSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; memberId?: string }
  | { type: 'link'; text: string; href: string }

interface MentionCandidate {
  label: string
  memberId: string
}

type AliasTarget =
  | { type: 'member'; context: string; profile: MemberInfoProfile }
  | { type: 'joined-group'; target: AddGroupTarget }
  | { type: 'add-group'; target: AddGroupTarget }
  | { type: 'channel'; channel: Record<string, any> }
  | { type: 'private-channel'; channel: Record<string, any> }
  | { type: 'missing' }

const LINK_FORBIDDEN_CHARS = '\\s"\'<>\\u4e00-\\u9fa5\\u3000-\\u303F\\uFF00-\\uFFEF\\u2000-\\u206F'
const LINK_SAFE_END_CHAR = `[^${LINK_FORBIDDEN_CHARS}\\.,;:?!()\\[\\]{}]`
const LINK_AT_START_REGEX = new RegExp(
  `^((?:(?:https?)://|www\\.)[^${LINK_FORBIDDEN_CHARS}]*${LINK_SAFE_END_CHAR})`,
  'i',
)
const aliasTargetCache = new Map<string, Promise<AliasTarget>>()

const members = computed(() => props.groupId ? groupStore.getMembers(props.groupId) : [])
const isEmpty = computed(() => !String(props.content || '').trim())

const mentionCandidates = computed<MentionCandidate[]>(() => {
  const seen = new Set<string>()
  const result: MentionCandidate[] = []

  for (const member of members.value) {
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

const contentStyle = computed(() => {
  if (!props.height) return undefined
  return { height: props.height }
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
  while (end < content.length && !isMentionBoundary(content.charAt(end))) {
    end += 1
  }

  const token = content.slice(start, end)
  return token.length > 1 ? token : ''
}

function detectLinkAtStart(content: string, start: number): { text: string; href: string } | null {
  const match = content.slice(start).match(LINK_AT_START_REGEX)
  if (!match) return null

  const url = match[1]
  if (url.startsWith('http') && url.length <= 7) return null
  if (url.startsWith('www.') && url.length <= 5) return null
  return { text: url, href: url }
}

function pushTextSegment(segments: NoticeSegment[], text: string) {
  if (!text) return
  const last = segments[segments.length - 1]
  if (last?.type === 'text') {
    last.text += text
  } else {
    segments.push({ type: 'text', text })
  }
}

const segments = computed<NoticeSegment[]>(() => {
  if (isEmpty.value) return []

  const result: NoticeSegment[] = []
  const content = String(props.content || '')
  let index = 0

  while (index < content.length) {
    // 对齐旧 im：群简介里的链接和 @ 要优先拆成可点击片段，而不是作为普通文本展示。
    const link = detectLinkAtStart(content, index)
    if (link) {
      result.push({ type: 'link', text: link.text, href: link.href })
      index += link.text.length
      continue
    }

    if (content.charAt(index) === '@') {
      const knownMention = findKnownMention(content, index)
      if (knownMention) {
        result.push({ type: 'mention', text: knownMention.label, memberId: knownMention.memberId })
        index += knownMention.label.length
        continue
      }

      const unknownMention = readUnknownMention(content, index)
      if (unknownMention) {
        result.push({ type: 'mention', text: unknownMention })
        index += unknownMention.length
        continue
      }
    }

    pushTextSegment(result, content.charAt(index))
    index += 1
  }

  return result
})

function completionUrl(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text)) return text
  return `https://${text}`
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

async function openExternalLink(rawHref: string) {
  const target = completionUrl(rawHref)
  if (!target) return

  if ((window as any).__TAURI_INTERNALS__) {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(target)
    return
  }

  window.open(target, '_blank')
}

async function getGroupQrUrlFromLink(href: string): Promise<string> {
  const url = normalizeUrl(href)
  if (url && getSearchParam(url, 'qrCode') && getSearchParam(url, 'IdCode')) {
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

function isAliasGroupMember(raw: any): boolean {
  const gd = raw?.groupDetail || raw?.groupAlias || raw
  const gb = gd?.groupBase || gd?.groupBaseResp || gd
  const flags = [
    raw?.bfMember,
    raw?.bfGroupMember,
    raw?.member,
    gd?.bfMember,
    gd?.bfGroupMember,
    gd?.member,
    gb?.bfMember,
    gb?.bfGroupMember,
    gb?.member,
  ]
  return flags.some((value) => value === true || Number(value) === 1)
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

async function isAlreadyInChannel(channelId: string, serverMember: boolean): Promise<boolean> {
  if (serverMember || channelStore.getChannel(channelId)) return true
  if (authStore.uid && channelStore.channels.length === 0) {
    await channelStore.loadChannels(authStore.uid)
  }
  return Boolean(channelStore.getChannel(channelId))
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

async function openGroupInviteLink(href: string): Promise<boolean> {
  const groupInfo = await resolveGroupInfoFromLink(href)
  if (!groupInfo) return false

  const target = parseGroupTarget(groupInfo)
  if (!target) throw new Error('群聊链接解析失败')

  uiStore.setAddContactTarget(null)

  if (await isAlreadyInGroup(target.id, Boolean(groupInfo.bfMember))) {
    uiStore.setAddGroupTarget(null)
    openGroupConversation(target)
    eventBus.emit('show-toast', { message: t('已在群聊中'), type: 'success' })
    emit('navigated')
    return true
  }

  uiStore.setAddGroupTarget(target)
  uiStore.setRightPanel('none')
  uiStore.openAddGroupDialog()
  emit('navigated')
  return true
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

function readChannelNumber(raw: any, camelKey: string, snakeKey: string): number | null {
  const value = raw?.[camelKey] ?? raw?.[snakeKey]
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function canOpenChannelDirectly(raw: any): Promise<boolean> {
  const channelId = normalizeChannelId(raw)
  const memberType = readChannelNumber(raw, 'memberType', 'member_type')
  if (memberType !== null) {
    // 别名接口可能只返回当前链路的 memberType；本地已加入时仍要直接跳会话，避免误弹加入窗口。
    return memberType > 0 || (channelId ? await isAlreadyInChannel(channelId, false) : false)
  }

  const linkType = readChannelNumber(raw, 'linkType', 'link_type')
  return (channelId ? await isAlreadyInChannel(channelId, false) : false) || linkType === null || linkType === 0
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
  void channelStore.ensureChannelDetailReady(channelId)

  const conv = chatStore.ensureConversation(ConversationType.Channel, channelId)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
  emit('navigated')
  return true
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
  emit('navigated')
}

async function resolveChannelLinkTarget(href: string): Promise<ChannelLinkResp | null> {
  const link = completionUrl(href)
  if (!link) return null
  try {
    const res = await isChannelLink({ link })
    if (Number(res?.code ?? 0) === 200 && res?.data) return res
    if (Number(res?.code ?? 0) === 200) return { ...res, data: null }

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
    console.warn('[GroupNoticeContent] resolve channel link failed:', error)
    throw error
  }
  return null
}

async function openChannelInviteLink(href: string): Promise<boolean> {
  let channelLink: ChannelLinkResp | null = null
  try {
    channelLink = await resolveChannelLinkTarget(href)
  } catch {
    return false
  }
  if (channelLink?.data) {
    if (await canOpenChannelDirectly(channelLink.data)) {
      openChannelConversation(channelLink.data)
    } else {
      openAddChannelDialog(channelLink.data)
    }
    return true
  }
  return false
}

async function openInviteLinkOrExternal(href: string) {
  const normalizedHref = completionUrl(href)
  if (!normalizedHref) return

  // 对齐聊天消息链接：群简介里的群/频道邀请链接优先在应用内跳转对应会话或加入窗口。
  if (await openChannelInviteLink(normalizedHref)) return
  try {
    if (await openGroupInviteLink(normalizedHref)) return
  } catch (error) {
    console.warn('[GroupNoticeContent] resolve group invite link failed:', error)
  }

  await openExternalLink(normalizedHref)
}

function linkResolvingKey(segment: Extract<NoticeSegment, { type: 'link' }>): string {
  return `${props.groupId}:${segment.href}`
}

function setLinkResolving(key: string, resolving: boolean) {
  const next = new Set(resolvingLinkKeys.value)
  if (resolving) next.add(key)
  else next.delete(key)
  resolvingLinkKeys.value = next
}

function isLinkResolving(segment: Extract<NoticeSegment, { type: 'link' }>): boolean {
  return resolvingLinkKeys.value.has(linkResolvingKey(segment))
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

function isMentionResolving(segment: Extract<NoticeSegment, { type: 'mention' }>): boolean {
  return resolvingMentionKeys.value.has(aliasTargetCacheKey(segment.text, props.groupId))
}

async function resolveRemoteAliasTarget(label: string): Promise<AliasTarget> {
  const context = label.replace(/^@+/, '').trim()
  if (!context) return { type: 'missing' }

  // 对齐聊天消息里的 @ 行为：未知 @ 先查别名，避免把群/频道别名误当成成员资料打开。
  try {
    const aliasResp = await searchAliasContent({ fromUid: authStore.uid || 0, content: context })
    if (Number(aliasResp?.code ?? 0) === 200 && aliasResp?.data) {
      const searchType = Number(aliasResp.data.searchType)
      const channelInfo = aliasResp.data.channelInfo
      if (searchType === 2 && channelInfo) {
        return await canOpenChannelDirectly(channelInfo)
          ? { type: 'channel', channel: channelInfo as Record<string, any> }
          : { type: 'private-channel', channel: channelInfo as Record<string, any> }
      }
    }
  } catch (error) {
    console.warn('[GroupNoticeContent] searchAliasContent failed, fallback to groupOrUserDetail:', error)
  }

  try {
    const resp = await groupOrUserDetail({ fromUid: authStore.uid || 0, context })
    const profile = parseMemberProfile(resp)
    if (profile) {
      return { type: 'member', context, profile }
    }

    const groupTarget = parseGroupTargetFromAlias(resp)
    if (groupTarget) {
      if (groupTarget.id === props.groupId || (await isAlreadyInGroup(groupTarget.id, isAliasGroupMember(resp)))) {
        return { type: 'joined-group', target: groupTarget }
      }

      return { type: 'add-group', target: groupTarget }
    }
  } catch (error) {
    console.warn('[GroupNoticeContent] groupOrUserDetail failed:', error)
  }

  return { type: 'missing' }
}

async function openRemoteAliasTarget(label: string): Promise<AliasTarget> {
  const key = aliasTargetCacheKey(label, props.groupId)
  let request = aliasTargetCache.get(key)
  if (!request) {
    request = resolveRemoteAliasTarget(label).catch((error) => {
      aliasTargetCache.delete(key)
      throw error
    })
    aliasTargetCache.set(key, request)
  }

  const target = await request
  if (target.type === 'member') {
    uiStore.openMemberInfo(target.profile.userId, props.groupId, [target.context, target.profile.nickname], target.profile)
  } else if (target.type === 'joined-group') {
    openGroupConversation(target.target)
    emit('navigated')
  } else if (target.type === 'add-group') {
    uiStore.setAddGroupTarget(target.target)
    uiStore.setRightPanel('none')
    uiStore.openAddGroupDialog()
    emit('navigated')
  } else if (target.type === 'channel') {
    openChannelConversation(target.channel)
  } else if (target.type === 'private-channel') {
    openAddChannelDialog(target.channel)
  } else {
    aliasTargetCache.delete(key)
    eventBus.emit('show-toast', { message: t('抱歉，该用户/群/频道不存在'), type: 'error' })
  }
  return target
}

function findMemberBySegment(segment: Extract<NoticeSegment, { type: 'mention' }>): GroupMember | undefined {
  if (segment.memberId) {
    return members.value.find((member) => member.userId === segment.memberId)
  }

  const cleanLabel = segment.text.replace(/^@+/, '').trim()
  return members.value.find((member) =>
    member.userId === cleanLabel || String(member.nickname || '').trim() === cleanLabel,
  )
}

async function handleMentionClick(segment: Extract<NoticeSegment, { type: 'mention' }>) {
  if (!props.clickable) return
  const cleanLabel = segment.text.replace(/^@+/, '').trim()
  if (!cleanLabel || cleanLabel === '所有人' || cleanLabel === '全体成员') return
  const openingKey = aliasTargetCacheKey(cleanLabel, props.groupId)
  if (openingMentionKeys.has(openingKey)) return
  openingMentionKeys.add(openingKey)

  try {
    const member = findMemberBySegment(segment)
    if (member) {
      uiStore.openMemberInfo(
        member.userId,
        props.groupId,
        [cleanLabel, member.nickname || '', member.userId].filter(Boolean),
        {
          userId: member.userId,
          nickname: member.nickname || member.userId,
          avatar: member.avatar || '',
        },
      )
      return
    }

    const slowTimer = window.setTimeout(() => {
      setMentionResolving(openingKey, true)
    }, 350)
    try {
      await openRemoteAliasTarget(cleanLabel)
    } finally {
      window.clearTimeout(slowTimer)
      setMentionResolving(openingKey, false)
    }
  } finally {
    openingMentionKeys.delete(openingKey)
  }
}

async function handleLinkClick(event: MouseEvent, segment: Extract<NoticeSegment, { type: 'link' }>) {
  event.preventDefault()
  event.stopPropagation()
  if (!props.clickable) return

  const key = linkResolvingKey(segment)
  if (openingLinkKeys.has(key)) return
  openingLinkKeys.add(key)

  const slowTimer = window.setTimeout(() => {
    setLinkResolving(key, true)
  }, 250)

  try {
    await openInviteLinkOrExternal(segment.href)
  } catch (error) {
    console.error('[GroupNoticeContent] open link failed:', error)
    eventBus.emit('show-toast', { message: t('操作失败'), type: 'error' })
  } finally {
    window.clearTimeout(slowTimer)
    setLinkResolving(key, false)
    openingLinkKeys.delete(key)
  }
}
</script>

<template>
  <div
    :class="['group-notice-content', { compact, disabled: !clickable }]"
    :style="contentStyle"
  >
    <template v-if="segments.length">
      <template v-for="(segment, index) in segments" :key="index">
        <span
          v-if="segment.type === 'mention'"
          :class="['notice-mention', { resolving: isMentionResolving(segment) }]"
          role="button"
          tabindex="0"
          @click.stop="handleMentionClick(segment)"
          @keydown.enter.prevent="handleMentionClick(segment)"
          @keydown.space.prevent="handleMentionClick(segment)"
        >
          {{ segment.text }}
        </span>
        <a
          v-else-if="segment.type === 'link'"
          :class="['notice-link', { resolving: isLinkResolving(segment) }]"
          href="#"
          @click="handleLinkClick($event, segment)"
        >
          {{ segment.text }}
        </a>
        <span v-else>{{ segment.text }}</span>
      </template>
    </template>
    <span v-else class="notice-empty">{{ t('无简介') }}</span>
  </div>
</template>

<style lang="scss" scoped>
.group-notice-content {
  overflow-y: auto;
  font-size: 14px;
  color: #787878;
  line-height: 20px;
  word-break: break-word;
  white-space: pre-wrap;
  user-select: text;

  &.compact {
    overflow: hidden;
    font-size: 13px;
    color: #999;
  }

  &.disabled {
    .notice-mention,
    .notice-link {
      cursor: default;
    }
  }
}

.notice-mention,
.notice-link {
  color: #3369fe;
  cursor: pointer;
  text-decoration: none;
  font-weight: normal;
  position: relative;

  &:hover {
    text-decoration: underline;
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
    animation: notice-link-resolving-spin 0.7s linear infinite;
  }
}

.notice-empty {
  color: #d3d1d1;
}

@keyframes notice-link-resolving-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
