import { useAuthStore } from '@/stores/useAuthStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useChatStore } from '@/stores/useChatStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useSettingStore } from '@/stores/useSettingStore'
import type { Message } from '@/stores/useMessageStore'
import ch from '@/locales/ch.json'
import en from '@/locales/en.json'
import pt from '@/locales/pt.json'
import tw from '@/locales/tw.json'
import vi from '@/locales/vi.json'

type LocaleKey = 'ch' | 'en' | 'pt' | 'tw' | 'vi'
type LocaleMessages = Record<string, string>

const localeMessages: Record<LocaleKey, LocaleMessages> = {
  ch: ch as LocaleMessages,
  en: en as LocaleMessages,
  pt: pt as LocaleMessages,
  tw: tw as LocaleMessages,
  vi: vi as LocaleMessages,
}
const REMINDER_COOLDOWN_MS = 900

let lastReminderAt = 0
let directoryPreloadPromise: Promise<void> | null = null

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

function t(key: string): string {
  const settingStore = useSettingStore()
  const locale = String(settingStore.settings.language || 'ch') as LocaleKey
  return localeMessages[locale]?.[key] || localeMessages.en[key] || key
}

function parseExtra(rawExtra: unknown): Record<string, unknown> {
  if (!rawExtra) return {}
  if (typeof rawExtra === 'object') return rawExtra as Record<string, unknown>
  if (typeof rawExtra !== 'string') return {}
  try {
    const parsed = JSON.parse(rawExtra)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function stripText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extraString(extra: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = stripText(extra[key])
    if (value) return value
  }
  return ''
}

function getMessageDigest(message: any): string {
  const msgType = Number(message?.msgType ?? message?.msg_type ?? 0)
  const content = message?.content ?? ''
  if (msgType === 0) return stripText(content).slice(0, 120)
  if (msgType === 1) return `[${t('图片')}]`
  if (msgType === 9) return `[${t('动画表情')}]`
  if (msgType === 2) return `[${t('语音')}]`
  if (msgType === 3) return `[${t('视频')}]`
  if (msgType === 5) return `[${t('名片')}]`
  if (msgType === 7) return `[${t('文件')}]`
  if (msgType === 12) return `[${t('骰子')}]`
  if (msgType === 18) return `[${t('扑克牌')}]`
  if ([10, 13, 14, 15].includes(msgType)) return t('暂不支持该消息类型')
  return stripText(content).slice(0, 120) || t('新消息')
}

function getConversationType(conversationId: string): 'friend' | 'group' | 'channel' {
  if (conversationId.startsWith('1_')) return 'group'
  if (conversationId.startsWith('2_')) return 'channel'
  return 'friend'
}

function getConversationTitle(conversationId: string, message?: any): string {
  const chatStore = useChatStore()
  const contactStore = useContactStore()
  const groupStore = useGroupStore()
  const channelStore = useChannelStore()
  const conversation = chatStore.conversations.find((item) => item.id === conversationId)
  const targetId = conversation?.targetId || conversationId.split('_')[1] || ''
  const extra = parseExtra(message?.extra)

  if (conversationId.startsWith('0_')) {
    const contact = contactStore.getContact(targetId)
    const senderName = extraString(extra, ['senderName', 'nickName', 'nickname'])
    return contact?.remark || contact?.nickname || conversation?.senderName || senderName || targetId || t('新消息')
  }

  if (conversationId.startsWith('1_')) {
    const group = groupStore.getGroup(targetId)
    const groupName = extraString(extra, ['groupName', 'group_name'])
    return group?.name || groupName || t('群聊')
  }

  if (conversationId.startsWith('2_')) {
    const channel = channelStore.channels.find((item) => item.id === targetId || item.channelId === targetId)
    const channelName = extraString(extra, ['channelName', 'channel_name'])
    return channel?.remark || channel?.channelName || channel?.name || channelName || t('频道通知')
  }

  return t('新消息')
}

async function ensureDirectoryLoadedForReminder(uid: string, conversationId: string) {
  if (!uid) return

  const targetId = conversationId.split('_')[1] || ''
  const contactStore = useContactStore()
  const groupStore = useGroupStore()
  const channelStore = useChannelStore()

  if (conversationId.startsWith('0_') && contactStore.getContact(targetId)) return
  if (conversationId.startsWith('1_') && groupStore.getGroup(targetId)) return
  if (
    conversationId.startsWith('2_')
    && channelStore.channels.some((item) => item.id === targetId || item.channelId === targetId)
  ) return

  if (!directoryPreloadPromise) {
    directoryPreloadPromise = Promise.allSettled([
      contactStore.loadContacts(uid),
      groupStore.loadGroups(uid),
      channelStore.loadChannels(uid),
    ]).then(() => undefined).finally(() => {
      directoryPreloadPromise = null
    })
  }

  await directoryPreloadPromise
}

function getConversationAvatar(conversationId: string): string | null {
  const contactStore = useContactStore()
  const groupStore = useGroupStore()
  const channelStore = useChannelStore()
  const chatStore = useChatStore()
  const conversation = chatStore.conversations.find((item) => item.id === conversationId)
  const targetId = conversation?.targetId || conversationId.split('_')[1] || ''

  if (conversationId.startsWith('0_')) {
    return contactStore.getContact(targetId)?.avatar || null
  }
  if (conversationId.startsWith('1_')) {
    return groupStore.getGroup(targetId)?.avatar || null
  }
  if (conversationId.startsWith('2_')) {
    const channel = channelStore.channels.find((item) => item.id === targetId || item.channelId === targetId)
    return channel?.avatar || channel?.icon || null
  }
  return null
}

function isConversationMuted(conversationId: string): boolean {
  const chatStore = useChatStore()
  const groupStore = useGroupStore()
  const channelStore = useChannelStore()
  const conversation = chatStore.conversations.find((item) => item.id === conversationId)
  if (conversation?.isMuted || conversation?.isArchived) return true

  const targetId = conversation?.targetId || conversationId.split('_')[1] || ''
  if (conversationId.startsWith('1_')) {
    return Boolean(groupStore.getGroup(targetId)?.isMuted)
  }
  if (conversationId.startsWith('2_')) {
    const channel = channelStore.channels.find((item) => item.id === targetId || item.channelId === targetId)
    return Boolean(channel?.isDisturb)
  }
  return false
}

function getReminderCandidates(messages: any[], currentUid: string) {
  return messages
    .filter((item) => {
      const conversationId = String(item?.conversationId ?? item?.conversation_id ?? '')
      const senderId = String(item?.senderId ?? item?.sender_id ?? '')
      if (!conversationId.includes('_') || !senderId || senderId === currentUid) return false
      if (Boolean(item?.isDeleted ?? item?.is_deleted ?? false)) return false
      return !isConversationMuted(conversationId)
    })
    .sort((a, b) =>
      Number(b?.sendTime ?? b?.send_time ?? 0) - Number(a?.sendTime ?? a?.send_time ?? 0),
    )
}

function getConversationUnreadCount(conversationId: string, messages: any[]): number {
  const chatStore = useChatStore()
  const conversation = chatStore.conversations.find((item) => item.id === conversationId)
  const storedUnread = Math.max(0, Number(conversation?.unreadCount || 0))
  const incomingCount = messages.filter((item) => {
    const convId = String(item?.conversationId ?? item?.conversation_id ?? '')
    return convId === conversationId
  }).length

  return storedUnread + incomingCount
}

async function shouldShowMinimizedReminder(): Promise<boolean> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const currentWindow = getCurrentWindow()
    return currentWindow.isMinimized().catch(() => false)
  } catch {
    return false
  }
}

async function showNotificationWindow(message: any, unreadCount: number) {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const conversationId = String(message?.conversationId ?? message?.conversation_id ?? '')
    const uid = String(useAuthStore().uid || '')
    await ensureDirectoryLoadedForReminder(uid, conversationId)
    const conversationType = getConversationType(conversationId)
    const extra = parseExtra(message?.extra)
    const senderName = stripText(
      extra.senderName
        ?? extra.nickName
        ?? extra.nickname
        ?? message?.senderName
        ?? message?.sender_name
        ?? '',
    )
    const digest = getMessageDigest(message)

    await invoke('show_notification_window', {
      data: {
        conversationId,
        title: getConversationTitle(conversationId, message),
        body: digest || t('新消息'),
        avatar: getConversationAvatar(conversationId),
        conversationType,
        senderName: conversationType === 'group' || conversationType === 'channel' ? senderName : null,
        unreadCount,
      },
    })
  } catch (error) {
    console.warn('[messageReminder] show notification window failed:', error)
  }
}

export async function showMinimizedMessageReminder(rawMessages: Message[] | any[], currentUid?: string) {
  if (!isTauri()) return

  const settingStore = useSettingStore()
  if (!settingStore.settings.notificationEnabled || !settingStore.settings.messageReminderWhenMinimized) return

  const uid = String(currentUid || useAuthStore().uid || '')
  if (!uid) return

  const candidates = getReminderCandidates(rawMessages, uid)
  if (candidates.length === 0) return

  const now = Date.now()
  if (now - lastReminderAt < REMINDER_COOLDOWN_MS) return
  if (!(await shouldShowMinimizedReminder())) return

  lastReminderAt = now
  const conversationId = String(candidates[0]?.conversationId ?? candidates[0]?.conversation_id ?? '')
  await showNotificationWindow(candidates[0], getConversationUnreadCount(conversationId, candidates))
}
