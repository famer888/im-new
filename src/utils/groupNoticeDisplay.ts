import { resolveGroupMemberDisplayName } from '@/utils/groupRemovedMemberNameCache'

interface FormatOptions {
  currentUid?: string | number | null
  maxMembers?: number
  actorRole?: number | null
  contextMembers?: unknown[]
  /** 将会话里的 `#{uids:123}` 等占位替换为可读昵称（如通讯录备注/昵称） */
  resolveUidPlaceholder?: (uid: string) => string
}

const UID_PLACEHOLDER_GROUP_RE = /#\{uids:([^}]+)\}/g

/** 替换群通知里的 `#{uids:...}` 为可读昵称 */
export function replaceGroupNoticeUidPlaceholders(
  raw: string,
  resolveName: (uid: string) => string,
): string {
  return raw.replace(UID_PLACEHOLDER_GROUP_RE, (match, idsPart: string) => {
    const ids = String(idsPart ?? '')
      .split(/[,，]/)
      .map((id) => id.trim())
      .filter(Boolean)
    if (!ids.length) return match
    return ids.map((id) => resolveName(id)).join('，')
  })
}

function finalizeGroupNoticeDisplay(text: string, options: FormatOptions): string {
  if (!options.resolveUidPlaceholder) return text
  return replaceGroupNoticeUidPlaceholders(text, options.resolveUidPlaceholder)
}

interface NoticePerson {
  id: string
  name: string
}

type ExtraObject = Record<string, unknown>

const INVITE_REQ_TYPES = new Set([1, 3])
const ACTIVE_INVITE_STATUSES = new Set([0, 1])
const REJECT_REQ_TYPES = new Set([3, 4, 5])

export function parseGroupNoticeExtraObject(rawExtra: unknown): ExtraObject | null {
  if (!rawExtra) return null
  if (typeof rawExtra === 'object') return rawExtra as ExtraObject
  if (typeof rawExtra !== 'string') return null

  try {
    const parsed = JSON.parse(rawExtra)
    if (typeof parsed === 'string') {
      const nested = JSON.parse(parsed)
      return nested && typeof nested === 'object' ? nested as ExtraObject : null
    }
    return parsed && typeof parsed === 'object' ? parsed as ExtraObject : null
  } catch {
    return null
  }
}

function asRecord(value: unknown): ExtraObject | null {
  return value && typeof value === 'object' ? value as ExtraObject : null
}

function getNestedUser(raw: ExtraObject | null): ExtraObject | null {
  return asRecord(raw?.user) || asRecord(raw?.userInfo) || asRecord(raw?.user_info)
}

function stringValue(value: unknown): string {
  return String(value ?? '').trim()
}

function getUserId(rawUser: unknown, fallbackId?: unknown): string {
  const raw = asRecord(rawUser)
  const user = getNestedUser(raw)
  return [
    raw?.userId,
    raw?.user_id,
    raw?.uid,
    raw?.id,
    user?.userId,
    user?.user_id,
    user?.uid,
    user?.id,
    fallbackId,
  ].map(stringValue).find(Boolean) || ''
}

function getRelationName(raw: ExtraObject | null): string {
  const relation = asRecord(raw?.friendRelation) || asRecord(raw?.friend_relation)
  return stringValue(relation?.remarkName ?? relation?.remark_name)
}

function getUserDisplayName(rawUser: unknown, fallbackId?: unknown): string {
  const raw = asRecord(rawUser)
  const user = getNestedUser(raw)
  const relationName = getRelationName(raw)
  const nestedRelationName = getRelationName(user)
  const fallback = stringValue(fallbackId)

  return [
    raw?.remarkName,
    raw?.remark_name,
    relationName,
    raw?.nickname,
    raw?.nickName,
    raw?.nick_name,
    raw?.name,
    user?.remarkName,
    user?.remark_name,
    nestedRelationName,
    user?.nickname,
    user?.nickName,
    user?.nick_name,
    user?.name,
    raw?.identify,
    user?.identify,
    fallback,
  ].map(stringValue).find(Boolean) || ''
}

function normalizeComparable(value: string): string {
  return value.replace(/\s+/g, '')
}

function getExtraUserId(extra: ExtraObject, ...keys: string[]): string {
  for (const key of keys) {
    const id = stringValue(extra[key])
    if (id && id !== '0') return id
  }
  return ''
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const role = Number(value)
  return Number.isFinite(role) ? role : null
}

export function getGroupNoticeActorId(rawExtra: unknown): string {
  const extra = parseGroupNoticeExtraObject(rawExtra)
  if (!extra) return ''
  return getExtraUserId(extra, 'fromUid', 'sendUid') || getUserId(extra.fromUser)
}

export function getGroupNoticeGroupId(rawExtra: unknown): string {
  const extra = parseGroupNoticeExtraObject(rawExtra)
  if (!extra) return ''
  return getExtraUserId(extra, 'groupId')
}

function extractRawInviteActor(raw: string): string {
  const index = raw.indexOf('邀请')
  if (index <= 0) return ''
  return raw.slice(0, index).trim()
}

function stripActorRolePrefix(actor: string): string {
  return actor
    .replace(/^(群主|管理员|群员)[：:\s]*/, '')
    .replace(/[（(]\s*(群主|管理员|群员)\s*[）)]\s*$/g, '')
    .replace(/\s*(群主|管理员|群员)\s*$/g, '')
    .trim()
}

function getActorName(extra: ExtraObject, raw: string): string {
  const rawActor = extractRawInviteActor(raw)

  const actorId = getExtraUserId(extra, 'fromUid', 'sendUid')
    || getUserId(extra.fromUser)
  const actorName = getUserDisplayName(extra.fromUser, actorId)
  if (actorName) return actorName

  if (rawActor && rawActor !== '你') return rawActor
  return actorId || rawActor || ''
}

function getActorRole(extra: ExtraObject, actorRole?: number | null): number | null {
  const fromUser = asRecord(extra.fromUser)
  return [
    actorRole,
    extra.actorRole,
    extra.actorMemberRole,
    fromUser?.role,
    fromUser?.type,
    fromUser?.memberType,
    Number(extra.checkUserType) === 1 || Number(extra.checkUserType) === 2
      ? extra.checkUserType
      : null,
  ].map(numberValue).find((value): value is number => value !== null) ?? null
}

function formatActorDisplayName(
  actor: string,
  extra: ExtraObject,
  currentUid: string,
  actorRole?: number | null,
): string {
  const name = stripActorRolePrefix(actor)
  if (!name) return ''
  const actorId = getExtraUserId(extra, 'fromUid', 'sendUid') || getUserId(extra.fromUser)
  if (actorId && actorId === currentUid && getActorRole(extra, actorRole) === 0) return '你'
  // 邀请入群文案保持稳定，不拼接“群员/管理员”角色前缀，避免异步角色数据导致动态切换。
  return name
}

function getRejectActorId(extra: ExtraObject): string {
  return getExtraUserId(extra, 'checkUid')
    || getUserId(extra.checkUser)
    || getExtraUserId(extra, 'fromUid', 'sendUid')
    || getUserId(extra.fromUser)
}

function resolveDisplayNameById(id: string, options: FormatOptions): string {
  if (!id || !options.resolveUidPlaceholder) return ''
  const resolved = options.resolveUidPlaceholder(id)
  return resolved && resolved !== id ? resolved : ''
}

function getRejectActorName(extra: ExtraObject, options: FormatOptions): string {
  const checkId = getExtraUserId(extra, 'checkUid') || getUserId(extra.checkUser)
  const checkName = getUserDisplayName(extra.checkUser, checkId)
    || resolveDisplayNameById(checkId, options)
  if (checkName && checkName !== checkId) return checkName

  const actorId = getExtraUserId(extra, 'fromUid', 'sendUid') || getUserId(extra.fromUser)
  const actorName = getUserDisplayName(extra.fromUser, actorId)
    || resolveDisplayNameById(actorId, options)
  return actorName && actorName !== actorId ? actorName : ''
}

function formatRejectedGroupNotice(raw: string, extra: ExtraObject, options: FormatOptions): string {
  const replaced = options.resolveUidPlaceholder
    ? replaceGroupNoticeUidPlaceholders(raw, (id) => resolveDisplayNameById(id, options))
    : raw
  if (!REJECT_REQ_TYPES.has(Number(extra.groupReqType ?? 0)) || Number(extra.groupReqStatus ?? 0) !== 2) {
    return replaced
  }

  const comparable = normalizeComparable(replaced)
  const actorId = getRejectActorId(extra)
  const actorName = getRejectActorName(extra, options)

  if (actorName && actorName !== actorId && !comparable.includes(normalizeComparable(actorName))) {
    if (Number(extra.groupReqType ?? 0) === 5) return `${actorName}${replaced}`
    if (comparable.includes('拒绝')) return `管理员 ${actorName} ${replaced}`
  }

  if (comparable.includes('拒绝')) return replaced
  if (!actorName) return replaced
  if (Number(extra.groupReqType ?? 0) === 5) return `${actorName}拒绝加入群聊`
  return `管理员 ${actorName} 拒绝你加入群聊`
}

function memberCandidates(extra: ExtraObject): unknown[] {
  const fromMembers = Array.isArray(extra.members) ? extra.members : []
  const candidates: unknown[] = [...fromMembers]

  if (extra.groupMember) candidates.push(extra.groupMember)
  if (extra.targetUser) candidates.push(extra.targetUser)

  return candidates
}

function collectInviteTargets(
  extra: ExtraObject,
  currentUid: string,
  maxMembers: number,
): NoticePerson[] {
  const actorId = getExtraUserId(extra, 'fromUid', 'sendUid')
    || getUserId(extra.fromUser)
  const receiveUid = getExtraUserId(extra, 'receiveUid')
  const seen = new Set<string>()
  const people: NoticePerson[] = []

  const addPerson = (candidate: unknown, fallbackId?: unknown) => {
    const id = getUserId(candidate, fallbackId)
    if (id && id === actorId) return

    const name = id && id === currentUid
      ? '你'
      : getUserDisplayName(candidate, id || fallbackId)
    if (!name) return

    const key = id || name
    if (seen.has(key)) return
    seen.add(key)
    people.push({ id, name })
  }

  for (const candidate of memberCandidates(extra)) {
    addPerson(candidate)
  }

  if (!people.length && receiveUid) {
    addPerson(null, receiveUid)
  }

  const sortedPeople = currentUid
    ? [
        ...people.filter((person) => person.id && person.id === currentUid),
        ...people.filter((person) => !person.id || person.id !== currentUid),
      ]
    : people

  return sortedPeople.slice(0, maxMembers)
}

function rawHasAllTargets(raw: string, targets: NoticePerson[]): boolean {
  const comparableRaw = normalizeComparable(raw)
  return targets.every((target) => {
    const comparableName = normalizeComparable(target.name)
    return comparableName && comparableRaw.includes(comparableName)
  })
}

function getRemovedMemberId(extra: ExtraObject): string {
  for (const candidate of memberCandidates(extra)) {
    const id = getUserId(candidate)
    if (id) return id
  }
  return getUserId(extra.targetUser)
}

function resolveNoticePersonName(
  id: string,
  extra: ExtraObject,
  options: FormatOptions,
): string {
  if (!id) return ''
  const currentUid = stringValue(options.currentUid)
  if (id === currentUid) return '你'

  const groupId = getGroupNoticeGroupId(extra)
  if (groupId) {
    const cachedName = resolveGroupMemberDisplayName(groupId, id)
    if (cachedName && cachedName !== id) return cachedName
  }

  for (const candidate of memberCandidates(extra)) {
    if (getUserId(candidate) !== id) continue
    const name = getUserDisplayName(candidate, id)
    if (name && name !== id) return name
  }

  const resolved = resolveDisplayNameById(id, options)
  if (resolved) return resolved

  if (Array.isArray(options.contextMembers)) {
    for (const candidate of options.contextMembers) {
      if (getUserId(candidate) !== id) continue
      const name = getUserDisplayName(candidate, id)
      if (name && name !== id) return name
    }
  }

  return id
}

function replaceBareUidTokens(text: string, resolveName: (id: string) => string): string {
  return text.replace(/\b\d{5,}\b/g, (uid) => {
    const name = resolveName(uid)
    return name && name !== uid ? name : uid
  })
}

function formatGroupRemoveNotice(
  raw: string,
  extra: ExtraObject,
  options: FormatOptions,
): string {
  const removedId = getRemovedMemberId(extra)
  const removedName = resolveNoticePersonName(removedId, extra, options)
  const actorId = getExtraUserId(extra, 'fromUid', 'sendUid') || getUserId(extra.fromUser)
  const currentUid = stringValue(options.currentUid)

  let text = options.resolveUidPlaceholder
    ? replaceGroupNoticeUidPlaceholders(raw, (id) => resolveNoticePersonName(id, extra, options))
    : raw

  if (removedId && removedName && removedName !== removedId) {
    text = replaceBareUidTokens(text, (id) => resolveNoticePersonName(id, extra, options))
  }

  // 对齐旧 im group.js case 6：操作者是当前用户时，展示“你将{备注/昵称}移出群聊”。
  if (actorId && actorId === currentUid && removedName && removedName !== removedId) {
    return `你将${removedName}移出群聊`
  }

  if (text.includes('被移出群聊') && removedName && removedName !== removedId) {
    return text.replace(removedId, removedName)
  }

  return text
}

function formatLegacyInviteTargetText(targets: NoticePerson[], currentUid: string): string {
  const names = targets.map((target) => target.name).filter(Boolean)
  if (!names.length) return ''

  // 对齐旧 im：当前用户被邀请时固定显示“你”，后续被邀请人直接接在逗号后。
  const currentIndex = currentUid
    ? targets.findIndex((target) => target.id && target.id === currentUid)
    : -1
  if (currentIndex >= 0) {
    const currentName = names[currentIndex] || '你'
    const otherNames = names.filter((_, index) => index !== currentIndex)
    return otherNames.length ? `${currentName},${otherNames.join('，')}` : currentName
  }

  return names.join('，')
}

export function formatGroupNoticeDisplayText(
  content: string | null | undefined,
  rawExtra: unknown,
  options: FormatOptions = {},
): string {
  const raw = String(content || '').trim().replace(/\s+/g, ' ')
  const extra = parseGroupNoticeExtraObject(rawExtra)
  const fin = (text: string) => finalizeGroupNoticeDisplay(text, options)
  if (!raw) return fin('')
  if (!extra) return fin(raw)

  const reqType = Number(extra.groupReqType ?? 0)
  const reqStatus = Number(extra.groupReqStatus ?? 0)
  if (reqStatus === 2) {
    return formatRejectedGroupNotice(raw, extra, options)
  }
  if (reqType === 6) {
    return fin(formatGroupRemoveNotice(raw, extra, options))
  }
  if (!INVITE_REQ_TYPES.has(reqType) || !ACTIVE_INVITE_STATUSES.has(reqStatus)) {
    return fin(raw)
  }
  if (!raw.includes('邀请') && !raw.includes('加入群聊')) return fin(raw)

  const currentUid = stringValue(options.currentUid)
  const maxMembers = Math.max(1, Number(options.maxMembers || 31))
  const explicitTargets = collectInviteTargets(
    extra,
    currentUid,
    maxMembers,
  )
  // 入群验证通过后的群内提示只展示本次事件携带的邀请对象；
  // 不再用当前群成员列表补全，避免把既有成员误拼成“被邀请加入”的名单。
  const targets = explicitTargets
  if (!targets.length) return fin(raw)

  const resolvedTargets = targets.map((target) => {
    if (!options.resolveUidPlaceholder || !target.id) return target
    if (target.name && target.name !== target.id) return target
    const resolved = options.resolveUidPlaceholder(target.id)
    return resolved ? { ...target, name: resolved } : target
  })

  const actor = getActorName(extra, raw)
  const actorId = getExtraUserId(extra, 'fromUid', 'sendUid') || getUserId(extra.fromUser)
  let actorDisplayName = formatActorDisplayName(actor, extra, currentUid, options.actorRole)
  if (
    options.resolveUidPlaceholder
    && actorId
    && (!actorDisplayName || actorDisplayName === actorId)
  ) {
    actorDisplayName = options.resolveUidPlaceholder(actorId) || actorDisplayName
  }
  const rawActor = extractRawInviteActor(raw)
  if (rawHasAllTargets(raw, resolvedTargets) && rawActor && rawActor !== '你' && rawActor === actorDisplayName) {
    return fin(raw)
  }

  const targetText = formatLegacyInviteTargetText(resolvedTargets, currentUid)
  const actorText = actorDisplayName
    ? `${actorDisplayName} 邀请`
    : '邀请'
  return fin(`${actorText}${targetText}加入群聊`)
}
