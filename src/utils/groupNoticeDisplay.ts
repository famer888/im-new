interface FormatOptions {
  currentUid?: string | number | null
  maxMembers?: number
  actorRole?: number | null
  contextMembers?: unknown[]
}

interface NoticePerson {
  id: string
  name: string
}

type ExtraObject = Record<string, unknown>

const INVITE_REQ_TYPES = new Set([1, 3])
const ACTIVE_INVITE_STATUSES = new Set([0, 1])

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
  return actor.replace(/^(群主|管理员|群员)[:：]\s*/, '').trim()
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

function getActorRolePrefix(extra: ExtraObject, actorRole?: number | null): string {
  const role = getActorRole(extra, actorRole)
  if (role === 1) return '管理员：'
  if (role === 2) return '群员：'
  return ''
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
  if (/^(群主|管理员|群员)[:：]/.test(actor)) return actor
  return `${getActorRolePrefix(extra, actorRole)}${name}`
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

function appendContextTargets(
  extra: ExtraObject,
  currentUid: string,
  targets: NoticePerson[],
  contextMembers: unknown[],
  maxMembers: number,
): NoticePerson[] {
  const actorId = getExtraUserId(extra, 'fromUid', 'sendUid')
    || getUserId(extra.fromUser)
  const currentUserIsTarget = Boolean(currentUid)
    && targets.some((target) => target.id === currentUid || target.name === '你')

  if (!currentUserIsTarget || actorId === currentUid || targets.length !== 1 || !contextMembers.length) {
    return targets
  }

  const seen = new Set(targets.map((target) => target.id || target.name))
  const appended = [...targets]

  for (const member of contextMembers) {
    const id = getUserId(member)
    if (!id || id === currentUid || id === actorId || seen.has(id)) continue

    const name = getUserDisplayName(member, id)
    if (!name) continue

    seen.add(id)
    appended.push({ id, name })
    if (appended.length >= maxMembers) break
  }

  return appended
}

function rawHasAllTargets(raw: string, targets: NoticePerson[]): boolean {
  const comparableRaw = normalizeComparable(raw)
  return targets.every((target) => {
    const comparableName = normalizeComparable(target.name)
    return comparableName && comparableRaw.includes(comparableName)
  })
}

export function formatGroupNoticeDisplayText(
  content: string | null | undefined,
  rawExtra: unknown,
  options: FormatOptions = {},
): string {
  const raw = String(content || '').trim().replace(/\s+/g, ' ')
  const extra = parseGroupNoticeExtraObject(rawExtra)
  if (!raw || !extra) return raw

  const reqType = Number(extra.groupReqType ?? 0)
  const reqStatus = Number(extra.groupReqStatus ?? 0)
  if (!INVITE_REQ_TYPES.has(reqType) || !ACTIVE_INVITE_STATUSES.has(reqStatus)) {
    return raw
  }
  if (!raw.includes('邀请') && !raw.includes('加入群聊')) return raw

  const currentUid = stringValue(options.currentUid)
  const maxMembers = Math.max(1, Number(options.maxMembers || 31))
  const explicitTargets = collectInviteTargets(
    extra,
    currentUid,
    maxMembers,
  )
  const targets = appendContextTargets(
    extra,
    currentUid,
    explicitTargets,
    options.contextMembers || [],
    maxMembers,
  )
  if (!targets.length) return raw

  const actor = getActorName(extra, raw)
  const actorDisplayName = formatActorDisplayName(actor, extra, currentUid, options.actorRole)
  const rawActor = extractRawInviteActor(raw)
  if (rawHasAllTargets(raw, targets) && rawActor && rawActor !== '你' && rawActor === actorDisplayName) {
    return raw
  }

  const targetText = targets.map((target) => target.name).join('，')
  const actorText = actorDisplayName
    ? `${actorDisplayName}邀请`
    : '邀请'
  return `${actorText}${targetText}加入群聊`
}
