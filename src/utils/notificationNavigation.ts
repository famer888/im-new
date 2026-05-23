import { router } from '@/router'
import {
  CHANNEL_NOTIFICATION_TARGET_ID,
  GROUP_NOTIFICATION_TARGET_ID,
  useChatStore,
} from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import type { Message } from '@/stores/useMessageStore'
import { MessageType } from '@/types'
import { parseGroupNoticeExtraObject } from '@/utils/groupNoticeDisplay'

export type NotificationModuleTarget = 'group' | 'channel'

export function getNotificationModuleTargetFromConversationId(
  conversationId: string | null | undefined,
): NotificationModuleTarget | null {
  const id = String(conversationId || '').trim()
  if (!id) return null
  if (id === `1_${GROUP_NOTIFICATION_TARGET_ID}`) return 'group'
  if (id === `0_${CHANNEL_NOTIFICATION_TARGET_ID}`) return 'channel'
  return null
}

export function resolveNotificationModuleTargetFromMessage(
  message: Pick<Message, 'msgType' | 'conversationId' | 'extra'>,
): NotificationModuleTarget | null {
  const extra = parseGroupNoticeExtraObject(message.extra)
  const source = String(extra?.source || '').trim()
  const conversationTarget = getNotificationModuleTargetFromConversationId(message.conversationId)

  if (
    message.msgType === MessageType.Notice
    && source === 'group-event-req-chat'
    && Number(extra?.groupReqStatus ?? 0) !== 1
  ) {
    return 'group'
  }

  if (conversationTarget) return conversationTarget
  if (source === 'group-event-req') return 'group'
  if (source === 'channel-notice' || source === 'channel-remove') return 'channel'
  return null
}

export function isPendingGroupInviteChatMessage(
  message: Pick<Message, 'msgType' | 'extra'> | null | undefined,
): boolean {
  if (!message || message.msgType !== MessageType.Notice) return false
  const extra = parseGroupNoticeExtraObject(message.extra)
  return String(extra?.source || '') === 'group-event-req-chat'
    && Number(extra?.groupReqStatus ?? 0) !== 1
}

export async function openNotificationModule(target: NotificationModuleTarget): Promise<void> {
  const chatStore = useChatStore()
  const uiStore = useUIStore()

  // 通知入口统一复用同一跳转，避免侧栏/桌面通知/聊天内按钮出现行为漂移。
  if (target === 'group') {
    chatStore.setCurrentConversation(`1_${GROUP_NOTIFICATION_TARGET_ID}`)
    chatStore.clearGroupNotificationUnread()
    uiStore.setRightPanel('none')
    uiStore.setDetailView('group-invitation')
  } else {
    chatStore.setCurrentConversation(`0_${CHANNEL_NOTIFICATION_TARGET_ID}`)
    chatStore.clearChannelNotificationUnread()
    uiStore.setRightPanel('none')
    uiStore.setDetailView('channel-notice-list')
  }

  if (router.currentRoute.value.path !== '/home') {
    await router.replace('/home').catch(() => {})
  }
}

export async function openNotificationModuleByConversationId(
  conversationId: string | null | undefined,
): Promise<boolean> {
  const target = getNotificationModuleTargetFromConversationId(conversationId)
  if (!target) return false
  await openNotificationModule(target)
  return true
}
