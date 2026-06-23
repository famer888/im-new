import { useAuthStore } from '@/stores/useAuthStore'
import { useChannelStore } from '@/stores/useChannelStore'
import {
  CHANNEL_NOTIFICATION_TARGET_ID,
  OFFICIAL_ACCOUNT_NAME,
  isOfficialAccountTargetId,
  useChatStore,
} from '@/stores/useChatStore'
import { API_CONFIG } from '@/api/config'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import { useSettingStore } from '@/stores/useSettingStore'
import type { Message } from '@/stores/useMessageStore'
import { formatSystemNotificationPlainText } from '@/utils/systemNotificationDisplay'
import { parseGroupNoticeExtraObject, replaceGroupNoticeUidPlaceholders } from '@/utils/groupNoticeDisplay'
import { canUseNativeImageAvatar, resolveNativeAvatarSrc } from '@/utils/nativeImage'
import ch from '@/locales/ch.json'
import en from '@/locales/en.json'
import pt from '@/locales/pt.json'
import tw from '@/locales/tw.json'
import vi from '@/locales/vi.json'
import brandLogoIcon from '@/assets/images/logo/logo.png'
import official55Icon from '@/assets/images/logo/official-55.png'

type LocaleKey = 'ch' | 'en' | 'pt' | 'tw' | 'vi'
type LocaleMessages = Record<string, string>

const localeMessages: Record<LocaleKey, LocaleMessages> = {
  ch: ch as LocaleMessages,
  en: en as LocaleMessages,
  pt: pt as LocaleMessages,
  tw: tw as LocaleMessages,
  vi: vi as LocaleMessages,
}
const officialAccountIcon = API_CONFIG.brandId === '55' ? official55Icon : brandLogoIcon
const REPEATABLE_GROUP_INVITE_REQ_TYPES = new Set([1, 2, 15])
const REMINDER_COOLDOWN_MS = 900

let lastReminderAt = 0
let directoryPreloadPromise: Promise<void> | null = null
let processingReminderQueue = false
const reminderQueue: Array<{ message: Message | any; unreadCount: number }> = []
// 同一头像地址只复用一份预热任务，避免短时间多条消息反复发起相同请求。
const avatarPreloadPromises = new Map<string, Promise<void>>()

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

function shouldLogNotificationAvatar(): boolean {
  if (API_CONFIG.env === 'test' || API_CONFIG.env === 'uat') return true
  try {
    return localStorage.getItem('debug:notification-avatar') === '1'
  } catch {
    return false
  }
}

function notificationAvatarDebug(message: string, data?: Record<string, unknown>, level: 'info' | 'warn' = 'info') {
  if (!shouldLogNotificationAvatar()) return
  console[level](`[messageReminder] ${message}`, data || {})
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
  if (msgType === 8) {
    const formatted = formatSystemNotificationPlainText(message as Message, {
      t,
      currentUid: String(useAuthStore().uid || ''),
    })
    // 右下角提醒没有聊天页上下文时，仍要兜底替换群通知里的 UID 占位，避免直接显示 `#{uids:...}`。
    return replaceReminderUidPlaceholders(formatted || stripText(content)) || t('新消息')
  }
  return replaceReminderUidPlaceholders(stripText(content)).slice(0, 120) || t('新消息')
}

function replaceReminderUidPlaceholders(text: string): string {
  const currentUid = String(useAuthStore().uid || '')
  const contactStore = useContactStore()
  return replaceGroupNoticeUidPlaceholders(text, (uid) => {
    if (uid === currentUid) return t('你')
    const name = contactStore.getDisplayName(uid)
    return name && name !== uid ? name : uid
  })
}

function getConversationType(conversationId: string): 'friend' | 'group' | 'channel' {
  if (conversationId === `0_${CHANNEL_NOTIFICATION_TARGET_ID}`) return 'channel'
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

  // 频道通知沿用旧 im 的伪会话 id，但桌面提醒标题要显示真实频道名，不能按普通好友会话取值。
  if (conversationId === `0_${CHANNEL_NOTIFICATION_TARGET_ID}`) {
    const channelId = extraString(extra, ['channelId', 'channel_id'])
    const channel = channelStore.channels.find((item) =>
      item.id === channelId || item.channelId === channelId,
    )
    const channelName = extraString(extra, ['channelName', 'channel_name'])
    return channel?.remark || channel?.channelName || channel?.name || channelName || t('频道通知')
  }

  if (conversationId.startsWith('0_')) {
    if (isOfficialAccountTargetId(targetId)) return OFFICIAL_ACCOUNT_NAME
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

function getConversationAvatar(conversationId: string, message?: any): string | null {
  const contactStore = useContactStore()
  const groupStore = useGroupStore()
  const channelStore = useChannelStore()
  const chatStore = useChatStore()
  const conversation = chatStore.conversations.find((item) => item.id === conversationId)
  const targetId = conversation?.targetId || conversationId.split('_')[1] || ''
  const extra = parseExtra(message?.extra)

  if (conversationId === `0_${CHANNEL_NOTIFICATION_TARGET_ID}`) {
    const channelId = extraString(extra, ['channelId', 'channel_id'])
    const channel = channelStore.channels.find((item) =>
      item.id === channelId || item.channelId === channelId,
    )
    return stripText(extra.icon) || channel?.avatar || channel?.icon || null
  }

  if (conversationId.startsWith('0_')) {
    if (isOfficialAccountTargetId(targetId)) {
      // 按当前品牌包展示官方号头像：55 使用老 im 头像，其它品牌使用各自 logo。
      return officialAccountIcon
    }
    return contactStore.getContact(targetId)?.avatar || null
  }
  if (conversationId.startsWith('1_')) {
    const group = groupStore.getGroup(targetId)
    const extraAvatar = extraString(extra, ['groupAvatar', 'group_avatar', 'avatar', 'icon', 'pic'])
    // 对齐旧 im：群通知头像优先使用会话对应的群头像；本地群资料未回填时再用消息 extra 里的群头像。
    return group?.avatar || extraAvatar || null
  }
  if (conversationId.startsWith('2_')) {
    const channel = channelStore.channels.find((item) => item.id === targetId || item.channelId === targetId)
    return channel?.avatar || channel?.icon || null
  }
  return null
}

function isConversationMuted(conversationId: string): boolean {
  const chatStore = useChatStore()
  const channelStore = useChannelStore()
  const conversation = chatStore.conversations.find((item) => item.id === conversationId)
  if (conversation?.isMuted || conversation?.isArchived) return true

  const targetId = conversation?.targetId || conversationId.split('_')[1] || ''
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

  // 这里调用时机会话未读通常已经在 store 里自增过了；再叠加本批消息数会把单条新消息算成 2 条。
  // 取两者较大值，兼容“store 已更新”和“store 还未来得及更新”两种时机。
  return Math.max(storedUnread, incomingCount)
}

function getMessageSendTime(message: any): number {
  const value = Number(message?.sendTime ?? message?.send_time ?? 0)
  if (!Number.isFinite(value) || value <= 0) return Date.now()
  return value < 10_000_000_000 ? value * 1000 : value
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

// 仅预热通知窗可直接消费的图片协议，避免把无效 src 也塞进 Image 触发额外噪音。
function isPreloadableAvatarSrc(value: string): boolean {
  return /^https?:\/\//i.test(value)
    || /^(asset|tauri|blob):/i.test(value)
    || /^data:image\/(png|jpe?g|gif|webp|bmp|avif);base64,/i.test(value)
}

async function preloadReminderAvatar(avatar: string | null): Promise<void> {
  const src = String(avatar || '').trim()
  if (!src || !isPreloadableAvatarSrc(src) || typeof Image === 'undefined') return

  const cached = avatarPreloadPromises.get(src)
  if (cached) {
    await cached
    return
  }

  const preloadTask = new Promise<void>((resolve) => {
    const img = new Image()
    let settled = false
    // 提醒不能因为头像站点慢或偶发失败而卡住，这里只给一个很短的预热窗口。
    const timer = window.setTimeout(finish, 1200)

    function finish() {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      img.onload = null
      img.onerror = null
      resolve()
    }

    img.onload = finish
    img.onerror = finish
    img.src = src

    if (img.complete) finish()
  }).finally(() => {
    // 只把最近一次预热任务留在内存里，避免消息量大时无限增长。
    window.setTimeout(() => {
      avatarPreloadPromises.delete(src)
    }, 60_000)
  })

  avatarPreloadPromises.set(src, preloadTask)
  await preloadTask
}

async function resolveReminderAvatarSrc(
  conversationId: string,
  conversationType: 'friend' | 'group' | 'channel',
  avatar: string | null,
): Promise<string | null> {
  const src = String(avatar || '').trim()
  const nativeCandidate = canUseNativeImageAvatar(src)
  notificationAvatarDebug('avatar resolve start', {
    conversationId,
    conversationType,
    rawAvatar: src,
    nativeCandidate,
  })
  if (!src) return null
  if (!nativeCandidate) return src

  try {
    // mac 打包端右下角提醒是独立 WebView，远程头像先走 NativeImage 缓存/候选域名，
    // 但 NativeImage 只是优化，失败时仍要保留原始远程头像给通知窗继续尝试。
    const nativeAvatar = await resolveNativeAvatarSrc({
      id: conversationId.split('_')[1] || conversationId,
      type: conversationType,
      src,
    })
    notificationAvatarDebug('avatar resolve native result', {
      conversationId,
      conversationType,
      rawAvatar: src,
      nativeAvatar,
      displayAvatar: nativeAvatar || src,
    })
    return nativeAvatar || src
  } catch (error) {
    notificationAvatarDebug('avatar resolve native failed', {
      conversationId,
      conversationType,
      rawAvatar: src,
      displayAvatar: src,
      error,
    }, 'warn')
    return src
  }
}

export function isRepeatableGroupInviteReminderMessage(message: Message | any): boolean {
  const convId = String(message?.conversationId ?? message?.conversation_id ?? '')
  if (convId !== '1_invitation') return false
  const msgType = Number(message?.msgType ?? message?.msg_type ?? 0)
  if (msgType !== 8) return false

  const extra = parseGroupNoticeExtraObject(message?.extra)
  if (!extra) return false
  const source = String(extra.source ?? '')
  const reqType = Number(extra.groupReqType ?? 0)
  const reqStatus = Number(extra.groupReqStatus ?? 0)
  // 与群邀请页保持一致：被邀请入群的桌面提醒要覆盖链接/二维码等再次邀请场景，
  // 否则“拒绝后再次邀请”会因为 reqType 变化而漏弹。
  return source === 'group-event-req'
    && REPEATABLE_GROUP_INVITE_REQ_TYPES.has(reqType)
    && (reqStatus === 0 || reqStatus === 1)
}

async function shouldShowMinimizedReminder(): Promise<boolean> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const currentWindow = getCurrentWindow()
    const [minimized, visible] = await Promise.all([
      currentWindow.isMinimized(),
      currentWindow.isVisible(),
    ])
    // 对齐桌面端目标行为：主窗口最小化或已隐藏到托盘时，都允许弹出右下角提醒。
    return minimized || !visible
  } catch {
    // 前端窗口状态读取在权限/平台差异下可能失败；后端命令会再次判断主窗口状态，这里放行避免误挡普通消息提醒。
    return true
  }
}

async function showNotificationWindow(message: any, unreadCount: number) {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const conversationId = String(message?.conversationId ?? message?.conversation_id ?? '')
    const uid = String(useAuthStore().uid || '')
    // 提醒可能已经排队；真正弹窗前再读一次当前免打扰状态，避免用户刚开启免打扰后仍弹旧队列。
    if (isConversationMuted(conversationId)) return
    await ensureDirectoryLoadedForReminder(uid, conversationId)
    if (isConversationMuted(conversationId)) return
    const conversationType = getConversationType(conversationId)
    const extra = parseExtra(message?.extra)
    const rawAvatar = getConversationAvatar(conversationId, message)
    const displayAvatar = await resolveReminderAvatarSrc(
      conversationId,
      conversationType,
      rawAvatar,
    )
    const senderName = stripText(
      extra.senderName
        ?? extra.nickName
        ?? extra.nickname
        ?? message?.senderName
        ?? message?.sender_name
        ?? '',
    )
    const digest = getMessageDigest(message)

    // 右下角提醒窗口是按需新建的，先在主窗口把头像资源拉进缓存，避免首帧偶发显示损坏图标。
    await preloadReminderAvatar(displayAvatar)

    notificationAvatarDebug('notification payload', {
      conversationId,
      conversationType,
      rawAvatar,
      displayAvatar,
      senderName,
      unreadCount,
    })

    // 头像预热等异步步骤期间仍可能切换免打扰；Tauri 调用前做最后一次拦截。
    if (isConversationMuted(conversationId)) return
    await invoke('show_notification_window', {
      data: {
        conversationId,
        title: getConversationTitle(conversationId, message),
        body: digest || t('新消息'),
        avatar: displayAvatar,
        conversationType,
        senderName: conversationType === 'group' || conversationType === 'channel' ? senderName : null,
        unreadCount,
      },
    })
  } catch (error) {
    console.warn('[messageReminder] show notification window failed:', error)
  }
}

async function processReminderQueue() {
  if (processingReminderQueue) return
  processingReminderQueue = true

  try {
    while (reminderQueue.length > 0) {
      if (!(await shouldShowMinimizedReminder())) {
        reminderQueue.length = 0
        break
      }

      const now = Date.now()
      const waitMs = Math.max(0, REMINDER_COOLDOWN_MS - (now - lastReminderAt))
      if (waitMs > 0) {
        await sleep(waitMs)
        if (!(await shouldShowMinimizedReminder())) {
          reminderQueue.length = 0
          break
        }
      }

      const task = reminderQueue.shift()
      if (!task) continue
      lastReminderAt = Date.now()
      await showNotificationWindow(task.message, task.unreadCount)
    }
  } finally {
    processingReminderQueue = false
  }
}

export async function showMinimizedMessageReminder(rawMessages: Message[] | any[], currentUid?: string) {
  if (!isTauri()) return

  const settingStore = useSettingStore()
  // 与旧 im 对齐：右下角弹窗只受“最小化时消息提醒”控制，不跟“新消息提示音”或通用通知开关绑定。
  if (!settingStore.settings.messageReminderWhenMinimized) return

  const uid = String(currentUid || useAuthStore().uid || '')
  if (!uid) return

  const candidates = getReminderCandidates(rawMessages, uid)
  if (candidates.length === 0) return
  if (!(await shouldShowMinimizedReminder())) return

  const repeatableInvites = candidates.filter(isRepeatableGroupInviteReminderMessage)
  const queueCandidates = repeatableInvites.length > 0
    ? [...repeatableInvites].sort((a, b) => getMessageSendTime(a) - getMessageSendTime(b))
    : [candidates[0]]

  for (const candidate of queueCandidates) {
    const conversationId = String(candidate?.conversationId ?? candidate?.conversation_id ?? '')
    reminderQueue.push({
      message: candidate,
      unreadCount: getConversationUnreadCount(conversationId, candidates),
    })
  }
  await processReminderQueue()
}
