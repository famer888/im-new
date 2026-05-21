<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Message } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useContactStore } from '@/stores/useContactStore'
import { useGroupStore } from '@/stores/useGroupStore'
import {
  getGroupNoticeActorId,
  getGroupNoticeGroupId,
  parseGroupNoticeExtraObject,
} from '@/utils/groupNoticeDisplay'
import { formatSystemNotificationText } from '@/utils/chatUnreadVisibility'
import { translateGroupNoticeText } from '@/utils/groupNoticeI18n'

const props = defineProps<{
  message: Message
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const contactStore = useContactStore()
const groupStore = useGroupStore()
const PURE_UID_RE = /\b\d{5,}\b/g

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function str(value: unknown): string {
  return String(value ?? '').trim()
}

function getExtraUserNameById(extra: Record<string, unknown> | null): Map<string, string> {
  const userMap = new Map<string, string>()
  if (!extra) return userMap

  const addUser = (candidate: unknown) => {
    const raw = asRecord(candidate)
    if (!raw) return
    const nested = asRecord(raw.user) || asRecord(raw.userInfo) || asRecord(raw.user_info)
    const relation = asRecord(raw.friendRelation) || asRecord(raw.friend_relation)
    const nestedRelation = nested ? (asRecord(nested.friendRelation) || asRecord(nested.friend_relation)) : null

    const id = [
      raw.userId, raw.user_id, raw.uid, raw.id,
      nested?.userId, nested?.user_id, nested?.uid, nested?.id,
    ].map(str).find(Boolean) || ''
    if (!id) return

    const name = [
      raw.remarkName, raw.remark_name,
      relation?.remarkName, relation?.remark_name,
      raw.nickname, raw.nickName, raw.nick_name, raw.name, raw.identify,
      nested?.remarkName, nested?.remark_name,
      nestedRelation?.remarkName, nestedRelation?.remark_name,
      nested?.nickname, nested?.nickName, nested?.nick_name, nested?.name, nested?.identify,
    ].map(str).find(Boolean) || ''
    if (!name || name === id) return
    userMap.set(id, name)
  }

  addUser(extra.fromUser)
  addUser(extra.targetUser)
  addUser(extra.checkUser)
  if (Array.isArray(extra.members)) {
    for (const member of extra.members) addUser(member)
  }
  return userMap
}

function translateNoticeText(text: string): string {
  const translatedGroupNotice = translateGroupNoticeText(text, t)
  if (translatedGroupNotice !== text) return translatedGroupNotice
  const translated = t(text)
  return translated === text ? text : translated
}

const parsedNotice = computed(() => {
  const extra = parseGroupNoticeExtraObject(props.message.extra)
  const groupId = getGroupNoticeGroupId(extra)
  const actorId = getGroupNoticeActorId(extra)
  const extraUserNameById = getExtraUserNameById(extra)
  const contextMembers = groupId ? groupStore.getMembers(groupId) : []
  const memberNameById = new Map(
    contextMembers
      .filter((member) => member.userId)
      .map((member) => [member.userId, String(member.nickname || '').trim()]),
  )
  const actorRole = groupId && actorId
    ? contextMembers.find((member) => member.userId === actorId)?.role
    : null

  const resolveUidDisplay = (id: string): string => {
    if (!id) return ''
    if (String(authStore.uid || '') === id) return t('你')
    const contactName = contactStore.getDisplayName(id)
    if (contactName && contactName !== id) return contactName
    const memberName = memberNameById.get(id) || ''
    if (memberName && memberName !== id) return memberName
    const extraName = extraUserNameById.get(id) || ''
    if (extraName && extraName !== id) return extraName
    return contactName || id
  }

  let content = formatSystemNotificationText(props.message, {
    currentUid: String(authStore.uid || ''),
    actorRole,
    contextMembers,
    resolveUidPlaceholder: resolveUidDisplay,
  })
  if (content.includes('邀请') && content.includes('加入群聊')) {
    content = content.replace(PURE_UID_RE, (uid) => resolveUidDisplay(uid))
  }
  if (!content) {
    return { prefix: '', text: '' }
  }
  if (!content.startsWith('!@#')) {
    return { prefix: '', text: translateNoticeText(content) }
  }

  const endIndex = content.lastIndexOf('!@#')
  if (endIndex <= 0) {
    return { prefix: '', text: translateNoticeText(content) }
  }

  return {
    prefix: content.slice(3, endIndex),
    text: translateNoticeText(content.slice(endIndex + 3)),
  }
})
</script>

<template>
  <div v-if="parsedNotice.prefix || parsedNotice.text" class="system-notification">
    <span class="text">
      <strong v-if="parsedNotice.prefix">{{ parsedNotice.prefix }}</strong>{{ parsedNotice.text }}
    </span>
  </div>
</template>

<style lang="scss" scoped>
.system-notification {
  text-align: center;
  padding: 10px 30px !important;
  position: relative;

  .text {
    display: inline-block;
    max-width: 100%;
    font-size: 12px;
    color: rgba(91, 91, 91);
    line-height: normal;
    text-align: center;
    word-break: break-word;

    strong {
      font-size: 12px;
      font-weight: 600;
      color: #333;
    }
  }
}
</style>
