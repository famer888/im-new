import { useChannelStore } from '@/stores/useChannelStore'
import { useChatStore } from '@/stores/useChatStore'
import { ConversationType } from '@/types'

/** 频道主（memberType=1）不受「限制保存内容」约束。 */
export function isChannelContentSaveRestricted(
  channelId: string,
  memberType?: number | null,
): boolean {
  const id = String(channelId || '').trim()
  if (!id) return false

  const channel = useChannelStore().getChannel(id)
  if (!channel?.contentLimit) return false

  const role = memberType ?? channel.memberType
  if (Number(role) === 1) return false
  return true
}

export function isCurrentChannelContentSaveRestricted(): boolean {
  const conv = useChatStore().currentConversation
  if (!conv || conv.type !== ConversationType.Channel) return false
  return isChannelContentSaveRestricted(conv.targetId)
}
