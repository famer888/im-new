import { useChannelStore } from '@/stores/useChannelStore'
import { useChatStore } from '@/stores/useChatStore'
import { ConversationType } from '@/types'

const CONTENT_LIMIT_FIELD_CANDIDATES = [
  'isLimit',
  'is_limit',
  'contentLimit',
  'content_limit',
  'bfContentLimit',
  'bf_content_limit',
  'limitContent',
  'limit_content',
  'isContentLimit',
  'is_content_limit',
] as const

/** 频道详情/列表接口用 isLimit（1=限制）；WS 事件 proto 用 contentLimit。 */
export function parseChannelContentLimitFromApi(item: Record<string, unknown> | null | undefined): boolean {
  if (!item || typeof item !== 'object') return false
  const raw = item.isLimit ?? item.is_limit ?? item.contentLimit ?? item.content_limit
  if (raw === undefined || raw === null || raw === '') return false
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  const text = String(raw).trim().toLowerCase()
  if (text === '0' || text === 'false' || text === 'no') return false
  if (text === '1' || text === 'true' || text === 'yes') return true
  return Boolean(raw)
}

function pickContentLimitRelatedFields(source: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!source || typeof source !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const key of CONTENT_LIMIT_FIELD_CANDIDATES) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key]
    }
  }
  for (const [key, value] of Object.entries(source)) {
    if (/(limit|content)/i.test(key) && !Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = value
    }
  }
  return out
}

/** 进入频道 / 拉详情 / 收到限制变更时打印，便于对比限制与非限制频道的字段。 */
export function logChannelContentLimitDebug(
  channelId: string,
  source: string,
  rawApiData?: Record<string, unknown> | null,
) {
  if (!import.meta.env.DEV) return
  const id = String(channelId || '').trim()
  if (!id) return

  const channel = useChannelStore().getChannel(id)
  const memberType = channel?.memberType ?? null
  const restricted = isChannelContentSaveRestricted(id, memberType)
  const limitFields = pickContentLimitRelatedFields(rawApiData || undefined)

  console.info('[channel-content-limit]', {
    source,
    channelId: id,
    channelName: channel?.channelName || channel?.name || '',
    apiLimitFields: limitFields,
    apiAllKeys: rawApiData ? Object.keys(rawApiData).sort() : [],
    store: {
      contentLimit: channel?.contentLimit ?? null,
      isLimit: channel?.contentLimit ? 1 : 0,
      memberType,
    },
    saveRestricted: restricted,
    hint: restricted
      ? '当前账号应禁止保存图片/文件'
      : (isChannelManagerMemberType(memberType)
        ? '频道主/管理员不受「限制保存内容」约束'
        : '当前账号可保存图片/文件'),
  })
}

/** 频道订阅者（memberType=3）；所有者=1、管理员=2，与 ChannelInfoPanel / MessageInput 一致。 */
export function isChannelSubscriberMemberType(memberType?: number | null): boolean {
  const role = Number(memberType)
  return Number.isFinite(role) && role === 3
}

/** 频道主/管理员不受「限制保存内容」约束，仅订阅者受限。 */
export function isChannelManagerMemberType(memberType?: number | null): boolean {
  const role = Number(memberType)
  return role === 1 || role === 2
}

/** 频道主/管理员不受「限制保存内容」约束；仅订阅者（memberType=3）受限。 */
export function isChannelContentSaveRestricted(
  channelId: string,
  memberType?: number | null,
): boolean {
  const id = String(channelId || '').trim()
  if (!id) return false

  const channel = useChannelStore().getChannel(id)
  if (!channel?.contentLimit) return false

  const role = memberType ?? channel.memberType
  if (isChannelManagerMemberType(role)) return false
  if (isChannelSubscriberMemberType(role)) return true

  // 身份未回填时与 ChannelInfoPanel 一致：先按订阅者处理，避免误放开；详情加载后会更新 memberType。
  return Number(role ?? 3) === 3
}

export function isCurrentChannelContentSaveRestricted(): boolean {
  const conv = useChatStore().currentConversation
  if (!conv || conv.type !== ConversationType.Channel) return false
  return isChannelContentSaveRestricted(conv.targetId)
}
