import { useChannelStore } from '@/stores/useChannelStore'
import { useChatStore } from '@/stores/useChatStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { playNotificationSound } from '@/utils/notificationSound'

const alertedMessageKeysByUid = new Map<string, Set<string>>()

export function clearIncomingMessageAlertState(uid?: string): void {
  if (uid) {
    alertedMessageKeysByUid.delete(uid)
    return
  }
  alertedMessageKeysByUid.clear()
}

export function resolveIncomingSenderId(message: any): string {
  const direct = String(message?.senderId ?? message?.sender_id ?? '').trim()
  if (direct) return direct

  const extra = message?.extra && typeof message.extra === 'object' ? message.extra : {}
  const sendMember = extra.sendMember ?? extra.send_member
  if (sendMember && typeof sendMember === 'object') {
    const fromMember = String(
      sendMember.userId
        ?? sendMember.user_id
        ?? sendMember.uid
        ?? sendMember.id
        ?? '',
    ).trim()
    if (fromMember) return fromMember
  }

  return String(
    extra.fromUid
      ?? extra.from_uid
      ?? extra.sendUid
      ?? extra.send_uid
      ?? '',
  ).trim()
}

export function getIncomingAlertMessageKey(message: any): string {
  const convId = String(message?.conversationId ?? message?.conversation_id ?? '')
  const id = String(message?.id ?? message?.msgId ?? message?.msg_id ?? '')
  const customMsgId = String(message?.customMsgId ?? message?.custom_msg_id ?? '')
  const extra = message?.extra && typeof message.extra === 'object' ? message.extra : {}
  const fallbackId = String(extra?.notificationIdentity ?? extra?.groupEventMsgId ?? '')
  return `${convId}:${id || customMsgId || fallbackId}`
}

function isMessageAlreadyInStore(message: any): boolean {
  const messageStore = useMessageStore()
  const convId = String(message?.conversationId ?? message?.conversation_id ?? '')
  const id = String(message?.id ?? message?.msgId ?? message?.msg_id ?? '')
  const customMsgId = String(message?.customMsgId ?? message?.custom_msg_id ?? '')
  if (!convId.includes('_') || (!id && !customMsgId)) return false

  return messageStore.getMessages(convId).some((item) => (
    (!!id && String(item.id || '') === id)
    || (!!customMsgId && String(item.customMsgId || '') === customMsgId)
  ))
}

function isConversationMutedForAlert(conversationId: string): boolean {
  const chatStore = useChatStore()
  const channelStore = useChannelStore()
  const conversation = chatStore.conversations.find((item) => item.id === conversationId)
  if (conversation?.isMuted || conversation?.isArchived) return true

  const targetId = conversation?.targetId || conversationId.split('_')[1] || ''
  if (conversationId.startsWith('2_')) {
    const channel = channelStore.getChannel(targetId)
      || channelStore.channels.find((item) => item.id === targetId || item.channelId === targetId)
    return Boolean(channel?.isDisturb)
  }
  return false
}

export function isIncomingMessageAlertEligible(message: any, currentUid: string): boolean {
  if (!currentUid) return false

  const conversationId = String(message?.conversationId ?? message?.conversation_id ?? '')
  const senderId = resolveIncomingSenderId(message)
  if (!conversationId.includes('_') || !senderId || senderId === currentUid) return false
  if (Boolean(message?.isDeleted ?? message?.is_deleted ?? false)) return false
  if (isConversationMutedForAlert(conversationId)) return false
  if (isMessageAlreadyInStore(message)) return false

  const alertKey = getIncomingAlertMessageKey(message)
  const alertedKeys = alertedMessageKeysByUid.get(currentUid)
  if (alertKey.endsWith(':') || alertedKeys?.has(alertKey)) return false

  return true
}

export function filterIncomingMessageAlerts(messages: any[], currentUid: string): any[] {
  if (!currentUid) return []
  return messages.filter((message) => isIncomingMessageAlertEligible(message, currentUid))
}

function rememberAlertedMessages(currentUid: string, messages: any[]): void {
  const nextKeys = alertedMessageKeysByUid.get(currentUid) ?? new Set<string>()
  for (const message of messages) {
    const key = getIncomingAlertMessageKey(message)
    if (!key.endsWith(':')) nextKeys.add(key)
  }
  alertedMessageKeysByUid.set(currentUid, nextKeys)
}

export async function playIncomingMessageAlertIfNeeded(
  messages: any[],
  currentUid: string,
): Promise<void> {
  if (!currentUid || messages.length === 0) return

  // 必须先同步筛选：msg:batch 里若先 await 设置再判断，同批消息可能已被 batchAppend 写入 store，
  // isMessageAlreadyInStore 会误判，导致单聊/群聊永远不响（旧 ocs 在入站当下即 fnHint，不依赖 store 去重）。
  const alertMessages = filterIncomingMessageAlerts(messages, currentUid)
  if (alertMessages.length === 0) return

  const settingStore = useSettingStore()
  if (!settingStore.loaded) {
    await settingStore.loadSettings({ syncRemote: false })
  }
  if (!settingStore.settings.notificationSound) return

  const played = await playNotificationSound()
  if (played) {
    rememberAlertedMessages(currentUid, alertMessages)
  }
}
