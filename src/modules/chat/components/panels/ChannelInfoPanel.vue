<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QrcodeVue from 'qrcode.vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useContactStore } from '@/stores/useContactStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useUIStore } from '@/stores/useUIStore'
import { ConversationType, MessageType } from '@/types'
import { deleteChannelManage, getChannelDetail, getChannelManages, getChannelUsers, updateMember, updateChannel } from '@/api/imChannel'
import AppSwitch from '@/components/AppSwitch.vue'
import RadioSelectDialog from '@/components/RadioSelectDialog.vue'
import TextAvatar from '@/components/TextAvatar.vue'
import Toast from '@/components/Toast.vue'
import ImageOverwriteDialog from '@/components/ImageOverwriteDialog.vue'
import GroupNoticeContent from './GroupNoticeContent.vue'
import { exportBase64ImgToLocal, userSelectPngSavePathWithOverwrite } from '@/utils/fileTools'
import { formatLastActiveText } from '@/utils/userOnlineStatus'
import { shouldShowChannelShareInfo } from './channelShareVisibility'
import searchIcon from '@/assets/images/headNav/search-icon.png'
import codeIcon from '@/assets/images/chat/code.png'
import arrowRightIcon from '@/assets/images/chat/arrow-rgiht.png'

interface ChannelMember {
  id: string
  name: string
  avatar: string
  memberType: number
  online?: boolean
  createTime?: number
}

interface ChannelManager extends ChannelMember {
  removeAuthorize: boolean
  setterUid?: string
  setterText: string
}

const { t, locale } = useI18n()
const authStore = useAuthStore()
const chatStore = useChatStore()
const channelStore = useChannelStore()
const contactStore = useContactStore()
const messageStore = useMessageStore()
const uiStore = useUIStore()

/** 英文/葡语/越南语界面下，另存为等对话框更适合拉丁文件名（与 GroupQRCode 一致） */
function prefersAsciiFriendlyFileNames(): boolean {
  const loc = (locale.value || '').toLowerCase()
  return loc.startsWith('en') || loc.startsWith('pt') || loc.startsWith('vi')
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/

function safeChannelFileNameId(): string {
  return String(channelId.value || 'channel').replace(/[/\\?%*:|"<>.\s]/g, '_').slice(0, 48) || 'channel'
}

function sanitizeChannelFileNameStem(name: string): string {
  const s = name.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 120)
  return s || t('频道二维码')
}

function channelQrImageFileStem(): string {
  const raw = channelName.value.trim()
  const idPart = safeChannelFileNameId()
  const latinUi = prefersAsciiFriendlyFileNames()

  if (!raw) {
    return latinUi ? t('频道二维码默认文件名', { id: idPart }) : sanitizeChannelFileNameStem(t('频道二维码'))
  }
  if (latinUi && CJK_RE.test(raw)) {
    return t('频道二维码默认文件名', { id: idPart })
  }
  return sanitizeChannelFileNameStem(raw)
}

function channelQrImageFileName(): string {
  return `${channelQrImageFileStem()}.png`
}

const detail = ref<Record<string, any>>({})
const members = ref<ChannelMember[]>([])
const keyword = ref('')
const updatingDisturb = ref(false)
const editDescVisible = ref(false)
const editDescDraft = ref('')
const editDescDraftCopy = ref('')
const isEditDesc = ref(false)
const showQrCode = ref(false)
const managerDialogVisible = ref(false)
const loadingManagers = ref(false)
const managerOwner = ref<ChannelManager | null>(null)
const managerList = ref<ChannelManager[]>([])
const removingManagerId = ref('')
const toastMessage = ref('')
const toastTimer = ref<number | null>(null)
const loadingMembers = ref(false)
const clearMsgTypeList = ref<string[]>([])
let loadSeq = 0
const CHANNEL_DETAIL_CACHE_TTL_MS = 60 * 1000
const CHANNEL_MEMBERS_CACHE_TTL_MS = 60 * 1000
const CHANNEL_MANAGERS_CACHE_TTL_MS = 60 * 1000
const managerDataReadyChannelId = ref('')
const managerPrefetching = ref(false)

const conv = computed(() => chatStore.currentConversation)
const channel = computed(() => {
  const id = conv.value?.targetId || ''
  return id ? channelStore.getChannel(id) : null
})
const channelId = computed(() => conv.value?.targetId || '')
const channelName = computed(() =>
  String(detail.value.channelName || channel.value?.channelName || channel.value?.name || channelId.value),
)

/** 对齐老 im：频道二维码和“复制链接”都直接使用后端返回的频道直链，不再额外拼接 id 参数。 */
const inviteUrl = computed(() => {
  return String(detail.value.link || '').trim()
})
const alias = computed(() => String(detail.value.alias || ''))
// 频道详情异步回填前，先显示“加载中”，避免右侧别名区域空白。
const aliasDisplayText = computed(() => {
  const aliasValue = alias.value.trim()
  return aliasValue ? `@${aliasValue}` : t('加载中')
})
const hasChannelAlias = computed(() => Boolean(alias.value.trim()))
const description = computed(() =>
  String(detail.value.remark ?? detail.value.channelDesc ?? channel.value?.remark ?? channel.value?.description ?? ''),
)
const adminPrivacy = computed(() => Number(detail.value.adminPrivacy ?? channel.value?.adminPrivacy ?? 0))
const channelMemberType = computed(() => {
  const value = detail.value.memberType ?? channel.value?.memberType
  return value === undefined || value === null || value === '' ? null : Number(value)
})
const channelLinkType = computed(() => {
  const value = detail.value.linkType ?? channel.value?.linkType
  return value === undefined || value === null || value === '' ? null : Number(value)
})
const showChannelAliasLink = computed(() => {
  return shouldShowChannelShareInfo(channelLinkType.value, channelMemberType.value)
})
const channelDisturbed = computed(() =>
  toBool(detail.value.isDisturb ?? channel.value?.isDisturb ?? conv.value?.isMuted ?? false),
)
const receiveNotifications = computed(() => !channelDisturbed.value)
const filteredMembers = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  const baseList = !q
    ? members.value
    : members.value.filter((item) => item.name.toLowerCase().includes(q) || item.id.includes(q))
  // 对齐老 im 视觉语义：成员区固定“所有者 -> 管理员 -> 其他成员”顺序，避免接口返回顺序导致角色顺位抖动。
  return baseList
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const roleDiff = memberRoleSortWeight(a.item.memberType) - memberRoleSortWeight(b.item.memberType)
      return roleDiff !== 0 ? roleDiff : a.index - b.index
    })
    .map(({ item }) => item)
})
const managerCount = computed(() => managerList.value.length + (managerOwner.value ? 1 : 0))

function toBool(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value).trim().toLowerCase()
  if (text === '0' || text === 'false' || text === 'no') return false
  if (text === '1' || text === 'true' || text === 'yes') return true
  return Boolean(value)
}

function responseOk(resp: { code?: number } | null | undefined): boolean {
  const code = Number(resp?.code ?? 200)
  return code === 200 || code === 0
}

function memberRoleSortWeight(memberType: number): number {
  if (memberType === 1) return 0
  if (memberType === 2) return 1
  return 2
}

function detailCacheKey(id: string): string {
  // 频道详情缓存按账号隔离，避免切换账号后复用到上个账号的频道权限数据。
  return `channel-info:detail:${authStore.uid || 'guest'}:${id}`
}

function membersCacheKey(id: string): string {
  // 成员列表同样按账号隔离，防止跨账号看到旧成员身份（owner/admin）造成权限误判。
  return `channel-info:members:${authStore.uid || 'guest'}:${id}`
}

function managersCacheKey(id: string): string {
  // 管理员列表缓存按账号隔离，避免切号后把上个账号的管理员关系带进来。
  return `channel-info:managers:${authStore.uid || 'guest'}:${id}`
}

function readCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ts?: number; data?: T }
    if (!parsed || typeof parsed.ts !== 'number') return null
    if (Date.now() - parsed.ts > ttlMs) return null
    return parsed.data ?? null
  } catch {
    return null
  }
}

function writeCache<T>(key: string, data: T) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // ignore sessionStorage errors
  }
}

function syncDisturbFromDetail(data: Record<string, any>, targetChannelId: string) {
  if (data?.isDisturb === undefined || !conv.value) return
  chatStore.updateConversation({
    id: conv.value.id,
    isMuted: toBool(data.isDisturb),
  })
  channelStore.patchChannel(targetChannelId, { isDisturb: toBool(data.isDisturb) })
}

function shouldLoadMembersByDetail(data: Record<string, any> | null | undefined): boolean {
  return Number(data?.adminPrivacy ?? 0) > 0
}

// 统一把不同接口形态的在线字段转成 boolean，避免 "0"/"1"/true/false 混用导致误判。
function normalizeOnlineFlag(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return undefined
  }
  const text = String(value).trim().toLowerCase()
  if (text === 'true' || text === '1') return true
  if (text === 'false' || text === '0') return false
  return undefined
}

function normalizeTimestampMs(value: unknown): number | undefined {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num) || num <= 0) return undefined
  // 兼容部分线路返回秒级时间戳，统一转成毫秒用于“xx前在线”文案。
  return num < 1e12 ? Math.trunc(num * 1000) : Math.trunc(num)
}

function normalizeChannelMemberType(raw: Record<string, unknown>): number {
  if (raw.memberType !== undefined && raw.memberType !== null && raw.memberType !== '') {
    return Number(raw.memberType)
  }
  const type = Number(raw.type ?? raw.role ?? 2)
  // 对齐老 im：channelAdminRight/pageAdmin 的 type 0/1/2 分别映射 owner/admin/member。
  if (type === 0) return 1
  if (type === 1) return 2
  if (type === 2) return 3
  return 3
}

function parseChannelManager(raw: Record<string, unknown>): ChannelManager {
  const user = (raw.userInfoDTO || raw) as Record<string, unknown>
  const id = String(user.uid ?? user.id ?? raw.uid ?? raw.id ?? '')
  const online =
    normalizeOnlineFlag(user.onLineStatus)
    ?? normalizeOnlineFlag(raw.onLineStatus)
    ?? normalizeOnlineFlag(user.online)
    ?? normalizeOnlineFlag(raw.online)
  const createTime =
    normalizeTimestampMs(user.createTime)
    ?? normalizeTimestampMs(raw.createTime)
    ?? normalizeTimestampMs(user.lastTime)
    ?? normalizeTimestampMs(raw.lastTime)
  return {
    id,
    name: String(user.name || user.nickName || user.nickname || id),
    avatar: String(user.icon || raw.icon || ''),
    memberType: normalizeChannelMemberType(raw),
    online,
    createTime,
    setterUid: String(raw.setterUid ?? ''),
    setterText: String(raw.setter || ''),
    removeAuthorize: false,
  }
}

function canRemoveManager(manager: ChannelManager, ownerId: string, loginId: string): boolean {
  if (!ownerId || !loginId) return false
  if (ownerId === loginId) return true
  if (!manager.setterUid) return false
  return manager.setterUid === loginId
}

function formatManagerSetterText(rawText: string): string {
  const text = String(rawText || '').trim()
  if (!text) return ''
  // 管理员来源文案由服务端下发中文模板，前端按“由{name}设置为管理员”做最小解析并走 i18n。
  const match = text.match(/^由(.+?)设置为管理员$/)
  if (match) {
    const name = String(match[1] || '').trim()
    if (name) return t('由{name}设置为管理员', { name })
  }
  return text
}

function getManagerExtraText(member: ChannelManager): string {
  if (member.memberType === 1) return getMemberStatus(member)
  if (member.setterText.trim()) return formatManagerSetterText(member.setterText)
  return getMemberStatus(member)
}

function toFallbackManager(member: ChannelMember): ChannelManager {
  return {
    ...member,
    removeAuthorize: false,
    setterUid: '',
    setterText: '',
  }
}

function applyManagersFromSource(source: ChannelManager[] | null | undefined, targetChannelId: string) {
  const parsed = source || []
  const fallbackOwner = members.value.find((item) => item.memberType === 1)
  const fallbackAdmins = members.value.filter((item) => item.memberType === 2)
  const owner = parsed.find((item) => item.memberType === 1)
    ?? (fallbackOwner ? toFallbackManager(fallbackOwner) : null)
  const admins = parsed.filter((item) => item.memberType === 2)
  const ownerId = owner?.id || ''
  const loginId = String(authStore.uid || '')

  managerOwner.value = owner
  // 对齐老 im：群主可移除全部管理员；管理员只能移除自己设置的管理员。
  managerList.value = (admins.length > 0 ? admins : fallbackAdmins.map((item) => toFallbackManager(item)))
    .map((item) => ({
      ...item,
      removeAuthorize: canRemoveManager(item, ownerId, loginId),
    }))
  managerDataReadyChannelId.value = targetChannelId
}

function getMemberStatus(member: ChannelMember): string {
  const contact = contactStore.getContact(member.id)
  // 优先用实时推送的好友在线状态；没有推送时回退到频道成员接口字段。
  const online = typeof contact?.online === 'boolean' ? contact.online : member.online
  if (online) return t('在线')
  const lastActiveMs = contact?.onlineStatusUpdateTime ?? member.createTime
  return formatLastActiveText(lastActiveMs, t)
}

async function loadChannelMembers(targetChannelId: string, seq: number) {
  if (!targetChannelId || seq !== loadSeq) return
  const cachedMembers = readCache<ChannelMember[]>(membersCacheKey(targetChannelId), CHANNEL_MEMBERS_CACHE_TTL_MS)
  if (cachedMembers && cachedMembers.length > 0) {
    members.value = cachedMembers
    loadingMembers.value = false
    return
  }
  loadingMembers.value = true
  try {
    const usersResp = await getChannelUsers({ channelId: targetChannelId, pageNum: 1, pageSize: 20 })
    if (seq !== loadSeq || targetChannelId !== channelId.value) return
    const rows = usersResp.data?.rowList || []
    const parsedMembers = rows.map((raw) => {
      const user = raw.userInfoDTO || raw
      const id = String(user.uid ?? user.id ?? raw.uid ?? raw.id ?? '')
      // 兼容 onLineStatus / online 两套字段名，按“用户信息优先、原始行兜底”合并。
      const online =
        normalizeOnlineFlag((user as Record<string, unknown>).onLineStatus)
        ?? normalizeOnlineFlag((raw as Record<string, unknown>).onLineStatus)
        ?? normalizeOnlineFlag((user as Record<string, unknown>).online)
        ?? normalizeOnlineFlag((raw as Record<string, unknown>).online)
      // 兼容 createTime / lastTime，两者都可能作为“最后活跃时间”返回。
      const createTime =
        normalizeTimestampMs((user as Record<string, unknown>).createTime)
        ?? normalizeTimestampMs((raw as Record<string, unknown>).createTime)
        ?? normalizeTimestampMs((user as Record<string, unknown>).lastTime)
        ?? normalizeTimestampMs((raw as Record<string, unknown>).lastTime)
      return {
        id,
        name: String(user.name || user.nickName || user.nickname || id),
        avatar: String(user.icon || raw.icon || ''),
        memberType: Number(raw.memberType ?? raw.type ?? raw.role ?? 3),
        online,
        createTime,
      }
    }).filter((item) => item.id)
    members.value = parsedMembers
    writeCache(membersCacheKey(targetChannelId), parsedMembers)
  } catch (error) {
    if (seq === loadSeq) {
      members.value = []
    }
    console.warn('[ChannelInfoPanel] load channel members failed:', error)
  } finally {
    if (seq === loadSeq) {
      loadingMembers.value = false
    }
  }
}

async function loadChannelInfo() {
  if (!channelId.value || conv.value?.type !== ConversationType.Channel) return

  const seq = ++loadSeq
  const targetChannelId = channelId.value
  members.value = []
  loadingMembers.value = false
  managerOwner.value = null
  managerList.value = []
  managerDataReadyChannelId.value = ''
  const cachedDetail = readCache<Record<string, any>>(detailCacheKey(targetChannelId), CHANNEL_DETAIL_CACHE_TTL_MS)

  if (cachedDetail) {
    detail.value = cachedDetail
    channelStore.patchChannel(targetChannelId, {
      ...cachedDetail,
      isDisturb: toBool(cachedDetail.isDisturb),
    })
    syncDisturbFromDetail(cachedDetail, targetChannelId)
    if (shouldLoadMembersByDetail(cachedDetail)) {
      void loadChannelMembers(targetChannelId, seq)
      void prefetchManagerList()
    }
    return
  }

  try {
    const detailResp = await getChannelDetail({ channelId: targetChannelId })
    if (seq !== loadSeq || targetChannelId !== channelId.value) return

    detail.value = detailResp.data || {}
    if (detailResp.data) {
      writeCache(detailCacheKey(targetChannelId), detailResp.data)
      channelStore.patchChannel(targetChannelId, {
        ...detailResp.data,
        isDisturb: toBool(detailResp.data.isDisturb),
      })
      syncDisturbFromDetail(detailResp.data, targetChannelId)
    }

    // 成员列表放到详情渲染后再异步请求，优先保证右侧面板首屏可交互。
    if (shouldLoadMembersByDetail(detailResp.data)) {
      void loadChannelMembers(targetChannelId, seq)
      void prefetchManagerList()
    }
  } catch (error) {
    console.warn('[ChannelInfoPanel] load channel info failed:', error)
  }
}

async function togglePin() {
  if (!conv.value) return
  await chatStore.pinConversation(authStore.uid, conv.value.id, !conv.value.isPinned)
}

async function setChannelReceiveNotifications(receive: boolean) {
  if (!conv.value || !channelId.value || updatingDisturb.value) return
  const nextDisturb = !receive
  updatingDisturb.value = true
  try {
    const resp = await updateMember({
      channelId: channelId.value,
      isDisturb: Number(nextDisturb),
    })
    if (!responseOk(resp)) throw new Error(resp?.msg || 'update channel disturb failed')

    detail.value = { ...detail.value, isDisturb: nextDisturb }
    writeCache(detailCacheKey(channelId.value), detail.value)
    channelStore.patchChannel(channelId.value, { isDisturb: nextDisturb })
    chatStore.updateConversation({ id: conv.value.id, isMuted: nextDisturb })
    if (authStore.uid) {
      await chatStore.muteConversation(authStore.uid, conv.value.id, nextDisturb).catch((error) => {
        console.warn('[ChannelInfoPanel] local mute sync failed:', error)
      })
    }
  } catch (error) {
    console.warn('[ChannelInfoPanel] update channel disturb failed:', error)
  } finally {
    updatingDisturb.value = false
  }
}

function openClearDialog() {
  if (!conv.value) return
  clearMsgTypeList.value = [
    t('仅清空本地聊天记录'),
    t('清空本地和对方设备的聊天记录'),
  ]
}

async function handleClearSubmit(index: number) {
  if (index === -1 || !conv.value) {
    clearMsgTypeList.value = []
    return
  }
  // 第二项沿用现有清空协议，通知其它端同步清空频道消息。
  const isRemoteDeletion = index === 1
  const conversationId = conv.value.id
  clearMsgTypeList.value = []
  await messageStore.clearConversationHistory(conversationId, isRemoteDeletion)
  chatStore.updateConversation({
    id: conversationId,
    lastMsgDigest: null,
    lastMsgId: null,
    unreadCount: 0,
  })
}

function clearHistory() {
  if (!conv.value) return
  openClearDialog()
}

const currentUserMemberType = computed(() => {
  const detailMemberType = detail.value.memberType ?? channel.value?.memberType
  if (detailMemberType !== undefined && detailMemberType !== null && detailMemberType !== '') {
    return Number(detailMemberType)
  }
  // 详情接口未回填身份时，再用成员列表兜底，避免管理员加载前被误判成普通订阅者。
  const currentUserId = String(authStore.uid || '')
  const currentMember = members.value.find((m) => m.id === currentUserId)
  return currentMember?.memberType ?? 3
})

const canClearHistory = computed(() => {
  const memberType = currentUserMemberType.value
  return memberType !== 3
})

function closeManagerDialog() {
  managerDialogVisible.value = false
  removingManagerId.value = ''
}

async function loadManagerList(options?: { preferCache?: boolean; showLoading?: boolean }) {
  if (!channelId.value) return
  const targetChannelId = channelId.value
  const preferCache = options?.preferCache ?? true
  const showLoading = options?.showLoading ?? true

  if (preferCache) {
    const cachedManagers = readCache<ChannelManager[]>(
      managersCacheKey(targetChannelId),
      CHANNEL_MANAGERS_CACHE_TTL_MS,
    )
    if (cachedManagers) {
      applyManagersFromSource(cachedManagers, targetChannelId)
      return
    }
  }

  if (showLoading) {
    loadingManagers.value = true
  }
  try {
    const resp = await getChannelManages({ channelId: targetChannelId, pageNum: 1, pageSize: 200 })
    const parsed = (resp.data?.rowList || [])
      .map((row: unknown) => parseChannelManager(row as Record<string, unknown>))
      .filter((item: ChannelManager) => item.id)
    writeCache(managersCacheKey(targetChannelId), parsed)
    if (channelId.value !== targetChannelId) return
    applyManagersFromSource(parsed, targetChannelId)
  } catch (error) {
    console.warn('[ChannelInfoPanel] load channel managers failed:', error)
    if (channelId.value !== targetChannelId) return
    // 管理员接口失败时回退到成员列表，保证“管理员弹窗”至少可展示当前成员角色信息。
    applyManagersFromSource(null, targetChannelId)
  } finally {
    if (showLoading) {
      loadingManagers.value = false
    }
  }
}

async function prefetchManagerList() {
  if (!channelId.value || !adminPrivacy.value) return
  if (managerPrefetching.value) return
  if (readCache<ChannelManager[]>(managersCacheKey(channelId.value), CHANNEL_MANAGERS_CACHE_TTL_MS)) return
  managerPrefetching.value = true
  try {
    await loadManagerList({ preferCache: false, showLoading: false })
  } finally {
    managerPrefetching.value = false
  }
}

async function openManagerDialog() {
  if (!adminPrivacy.value) return
  managerDialogVisible.value = true
  const currentChannelId = channelId.value
  const hasReadyData = Boolean(currentChannelId && managerDataReadyChannelId.value === currentChannelId)
  if (!hasReadyData) {
    await loadManagerList({ preferCache: true, showLoading: true })
    return
  }
  if (readCache<ChannelManager[]>(managersCacheKey(currentChannelId), CHANNEL_MANAGERS_CACHE_TTL_MS)) {
    return
  }
  // 已有可用数据时改为后台刷新，不阻塞弹窗首屏显示。
  void loadManagerList({ preferCache: false, showLoading: false })
}

async function removeManager(item: ChannelManager) {
  if (!channelId.value || !item.id || !item.removeAuthorize || removingManagerId.value) return
  removingManagerId.value = item.id
  try {
    const resp = await deleteChannelManage({ channelId: channelId.value, uid: item.id })
    if (!responseOk(resp)) throw new Error(resp?.msg || 'delete channel manager failed')
    showQrToast(t('移除成功'))
    managerList.value = managerList.value.filter((manager) => manager.id !== item.id)
    if (channelId.value) {
      // 移除成功后同步更新管理员缓存，避免下次打开弹窗仍展示旧管理员。
      const cacheRows: ChannelManager[] = [
        ...(managerOwner.value ? [{ ...managerOwner.value, removeAuthorize: false }] : []),
        ...managerList.value.map((manager) => ({ ...manager, removeAuthorize: false })),
      ]
      writeCache(managersCacheKey(channelId.value), cacheRows)
    }
    // 弹窗移除成功后同步当前成员列表角色，避免主列表角标滞后。
    members.value = members.value.map((member) =>
      member.id === item.id ? { ...member, memberType: 3 } : member,
    )
  } catch (error) {
    console.warn('[ChannelInfoPanel] remove channel manager failed:', error)
    showQrToast(t('修改失败'), 'error')
  } finally {
    removingManagerId.value = ''
  }
}

// 频道简介编辑权限按“频道创建人”控制：非创建人也能打开弹窗，但只能查看不能修改。
const canEditChannelDescription = computed(() => {
  const ownerId = String(
    detail.value.ownerId
    ?? detail.value.owner_id
    ?? detail.value.hostId
    ?? channel.value?.ownerId
    ?? '',
  ).trim()
  if (!authStore.uid) return false
  // 部分接口不返回 ownerId，回退到 memberType=1（所有者）判断，避免创建人被误判为只读。
  if (!ownerId) {
    return Number(detail.value.memberType ?? channel.value?.memberType ?? currentUserMemberType.value ?? 3) === 1
  }
  return ownerId === String(authStore.uid)
})

function roleLabel(memberType: number): string {
  if (memberType === 1) return t('所有者')
  if (memberType === 2) return t('管理员')
  return ''
}

function openMemberProfile(member: ChannelMember) {
  if (!member.id) return
  // 与群成员列表保持一致：点击成员行直接打开资料弹窗，并把基础资料透传给弹窗首屏展示。
  uiStore.openMemberInfo(
    member.id,
    '',
    [member.id, member.name].filter(Boolean),
    {
      userId: member.id,
      nickname: member.name || member.id,
      avatar: member.avatar || '',
    },
  )
}

// 频道简介入口始终可打开，编辑能力在弹窗内按 canEditChannelDescription 单独限制。
function openDescriptionDialog() {
  editDescDraft.value = description.value || ''
  editDescDraftCopy.value = editDescDraft.value
  editDescVisible.value = true
  isEditDesc.value = false
}

function handleClose() {
  isEditDesc.value = false
  editDescVisible.value = false
}

function handleCancel() {
  isEditDesc.value = false
  editDescDraft.value = editDescDraftCopy.value
}

async function handleOk() {
  if (!channelId.value || !canEditChannelDescription.value) return
  try {
    const resp = await updateChannel({
      channelId: channelId.value,
      remark: editDescDraft.value,
    })
    if (!responseOk(resp)) throw new Error(resp?.msg || 'update channel description failed')

    detail.value = { ...detail.value, remark: editDescDraft.value, channelDesc: editDescDraft.value }
    writeCache(detailCacheKey(channelId.value), detail.value)
    channelStore.patchChannel(channelId.value, { remark: editDescDraft.value, description: editDescDraft.value })
    editDescDraftCopy.value = editDescDraft.value
    isEditDesc.value = false
    handleClose()
    showQrToast(t('修改成功'))
  } catch (error) {
    console.warn('[ChannelInfoPanel] save channel description failed:', error)
    showQrToast(t('修改失败'), 'error')
  }
}

const qrToastVisible = ref(false)
const qrToastMessage = ref('')
const qrToastType = ref<'success' | 'error'>('success')
const imageOverwriteVisible = ref(false)
const imageOverwriteFileName = ref('')
const imageOverwriteDirectoryName = ref('')
let imageOverwriteResolver: ((value: boolean) => void) | null = null

function showQrToast(msg: string, type: 'success' | 'error' = 'success') {
  qrToastMessage.value = msg
  qrToastType.value = type
  qrToastVisible.value = true
}

function handleCopyQrLink() {
  const qrLink = inviteUrl.value
  if (!qrLink) {
    showQrToast(t('复制失败'), 'error')
    return
  }
  navigator.clipboard.writeText(qrLink).then(() => {
    showQrToast(t('复制成功'))
  }).catch(() => {
    showQrToast(t('复制失败'), 'error')
  })
}

function pathBaseName(filePath: string): string {
  const segments = filePath.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] || filePath
}

function pathDirectoryName(filePath: string): string {
  const segments = filePath.split(/[\\/]/).filter(Boolean)
  return segments.length > 1 ? segments[segments.length - 2] : pathBaseName(filePath)
}

function resolveImageOverwrite(result: boolean) {
  imageOverwriteVisible.value = false
  const resolver = imageOverwriteResolver
  imageOverwriteResolver = null
  resolver?.(result)
}

function promptImageOverwrite(filePath: string): Promise<boolean> {
  if (imageOverwriteResolver) {
    imageOverwriteResolver(false)
    imageOverwriteResolver = null
  }

  imageOverwriteFileName.value = pathBaseName(filePath)
  imageOverwriteDirectoryName.value = pathDirectoryName(filePath)
  imageOverwriteVisible.value = true

  return new Promise((resolve) => {
    imageOverwriteResolver = resolve
  })
}

function isTauri(): boolean {
  return !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
}

/** 与老 im menu-qrcode「转发给朋友」一致：合成二维码图 → 选中会话后进输入区上传发送（见 MessageInput 对 data: 转发图的处理） */
function handleForwardQrCode() {
  const qrCodeBase64 = buildChannelQrForwardImage()
  if (!qrCodeBase64) {
    showQrToast(t('转发失败'), 'error')
    return
  }
  const imageName = channelQrImageFileName()
  uiStore.openForwardDialogWithPayload({
    msgType: MessageType.Image,
    content: JSON.stringify({
      name: imageName,
      url: qrCodeBase64,
      thumbnailUrl: qrCodeBase64,
    }),
  })
}

function handleSaveQrCode() {
  const dataUrl = buildChannelQrForwardImage()
  if (!dataUrl) {
    showQrToast(t('保存失败无画布'), 'error')
    return
  }
  handleExportChannelQr(dataUrl)
}

async function handleExportChannelQr(qrCodeBase64: string) {
  const suffix = '.png'
  const fileName = channelQrImageFileName()

  if (!isTauri()) {
    const link = document.createElement('a')
    link.download = fileName
    link.href = qrCodeBase64
    link.click()
    showQrToast(t('保存成功'))
    return
  }

  try {
    const {
      filePath,
      canceled,
      needsOverwriteConfirm,
    } = await userSelectPngSavePathWithOverwrite(fileName)
    if (!filePath || canceled) return
    const finalPath = filePath.endsWith(suffix) ? filePath : `${filePath}${suffix}`
    if (needsOverwriteConfirm) {
      const confirmed = await promptImageOverwrite(finalPath)
      if (!confirmed) return
    }
    const err = await exportBase64ImgToLocal(qrCodeBase64, finalPath)
    if (err) {
      showQrToast(t('保存失败详情', { detail: err.message }), 'error')
      return
    }
    showQrToast(t('保存成功'))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    showQrToast(t('保存失败详情', { detail: message }), 'error')
  }
}

function copyAlias() {
  if (!alias.value) return
  const textToCopy = `@${alias.value}`
  navigator.clipboard.writeText(textToCopy).then(() => {
    toastMessage.value = t('复制成功')
    if (toastTimer.value) clearTimeout(toastTimer.value)
    toastTimer.value = window.setTimeout(() => {
      toastMessage.value = ''
    }, 2000)
  }).catch(() => {
    console.warn('[ChannelInfoPanel] failed to copy alias')
  })
}

const qrcodeWrapRef = ref<HTMLElement | null>(null)

function resolveQrCanvas(): HTMLCanvasElement | null {
  const wrap = qrcodeWrapRef.value
  if (!wrap) return null
  const canvas = wrap.querySelector('canvas')
  if (canvas instanceof HTMLCanvasElement) return canvas
  return null
}

/** 合成与群二维码转发相同规格的图片，供消息转发对话框使用 */
function buildChannelQrForwardImage(): string | null {
  const qrcodeElement = resolveQrCanvas()
  if (!qrcodeElement) {
    console.warn('[ChannelInfoPanel] buildChannelQrForwardImage: canvas not found')
    return null
  }

  try {
    const dpr = window.devicePixelRatio || 1
    const baseWidth = 360
    const baseHeight = 340

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    canvas.width = baseWidth * dpr
    canvas.height = baseHeight * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#F5F5F5'
    ctx.fillRect(0, 0, baseWidth, baseHeight)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, baseWidth, baseHeight - 40)

    const drawCodeSize = 250
    const codeX = (baseWidth - drawCodeSize) / 2
    const codeY = 12
    ctx.drawImage(qrcodeElement, codeX, codeY, drawCodeSize, drawCodeSize)

    ctx.fillStyle = '#787878'
    ctx.font = '16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(t('二维码长期有效'), baseWidth / 2, 286)

    ctx.fillStyle = '#000000'
    ctx.font = '22px sans-serif'
    ctx.fillText(channelName.value || '', baseWidth / 2, 318)

    return canvas.toDataURL('image/png')
  } catch (e) {
    console.warn('[ChannelInfoPanel] buildChannelQrForwardImage failed:', e)
    return null
  }
}

watch(channelId, loadChannelInfo)
watch(
  () => conv.value?.type,
  (type) => {
    if (type !== ConversationType.Channel) {
      showQrCode.value = false
      closeManagerDialog()
    }
  },
)
onMounted(loadChannelInfo)

onBeforeUnmount(() => {
  if (imageOverwriteResolver) {
    imageOverwriteResolver(false)
    imageOverwriteResolver = null
  }
  closeManagerDialog()
})
</script>

<template>
  <div v-if="conv" class="channel-info-panel">
    <section v-if="showChannelAliasLink" class="channel-link" @click="showQrCode = true">
      <h4>{{ t('频道别名') }}</h4>
      <div class="channel-link-info">
        <span class="alias" :class="{ 'is-loading': !hasChannelAlias }" @click.stop="copyAlias">{{ aliasDisplayText }}</span>
        <div class="code-entrance">
          <img class="code-icon" :src="codeIcon" alt="" />
          <img class="more-icon" :src="arrowRightIcon" alt="" />
        </div>
      </div>
    </section>

    <div v-if="toastMessage" class="toast">{{ toastMessage }}</div>

    <section class="panel-section intro-section clickable" @click="openDescriptionDialog">
      <div class="section-head">
        <h4>{{ t('频道简介') }}</h4>
        <span class="arrow">›</span>
      </div>
      <GroupNoticeContent
        class="channel-description-preview"
        :content="description"
        group-id=""
        compact
      />
    </section>

    <!-- 编辑频道简介对话框 -->
    <div v-if="editDescVisible" class="comGroupNoticeDialog" @click="handleClose">
      <div class="content" @click.stop>
        <picture @click.stop="handleClose">
          <img src="@/assets/images/common/close-icon.png" />
        </picture>
        <section>
          <textarea
            v-if="isEditDesc && canEditChannelDescription"
            v-model="editDescDraft"
            maxlength="800"
            type="text"
            :placeholder="t('请输入内容')"
            :disabled="!canEditChannelDescription"
          />
          <div v-else :style="{ height: '203px' }">
            <GroupNoticeContent
              class="notice-view"
              :class="{ empty: !editDescDraft }"
              :content="editDescDraft"
              group-id=""
              height="203px"
            />
          </div>
          <span v-if="canEditChannelDescription && isEditDesc">{{ 800 - editDescDraft.length }}</span>
        </section>
        <template v-if="canEditChannelDescription">
          <div class="bottom" v-if="!isEditDesc">
            <span @click.stop="isEditDesc = true">{{ t('修改') }}</span>
          </div>
          <div class="bottom" v-else>
            <span @click.stop="handleOk">{{ t('确定') }}</span>
            <span class="cancel-btn" @click.stop="handleCancel">{{ t('取消') }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- 二维码面板 -->
    <div v-if="showQrCode" class="qrcode-panel">
      <div class="qrcode-content">
        <div class="qrcode-header">
          <button class="qrcode-close" @click="showQrCode = false">
            <img src="@/assets/images/chat/arrow-left-blue.png" alt="" />
          </button>
          <span>{{ t('通过二维码邀请') }}</span>
        </div>
        <section class="qrcode-section">
          <div v-if="channelId" ref="qrcodeWrapRef" class="qrcode-wrap">
            <QrcodeVue
              class="qrcode"
              :value="inviteUrl"
              level="H"
              :size="180"
              render-as="canvas"
            />
          </div>
          <h3>{{ t('二维码长期有效') }}</h3>
        </section>
        <div class="qrcode-buttons">
          <div class="btn-item">
            <button @click="handleForwardQrCode">
              <img src="@/assets/images/system/share.png" alt="" />
            </button>
            <span class="btn-title">{{ t('转发给朋友') }}</span>
          </div>
          <div class="btn-item">
            <button @click="handleSaveQrCode">
              <img src="@/assets/images/system/down.png" alt="" />
            </button>
            <span class="btn-title">{{ t('保存图片') }}</span>
          </div>
          <div class="btn-item">
            <button @click="handleCopyQrLink">
              <img src="@/assets/images/system/link.png" alt="" />
            </button>
            <span class="btn-title">{{ t('复制链接') }}</span>
          </div>
        </div>
      </div>
    </div>

    <section class="panel-section config-section">
      <div class="config-item">
        <span>{{ t('置顶聊天') }}</span>
        <AppSwitch :model-value="conv.isPinned" @update:model-value="togglePin" />
      </div>
      <div class="config-item">
        <span>{{ t('接收通知') }}</span>
        <AppSwitch
          :model-value="receiveNotifications"
          :disabled="updatingDisturb"
          @update:model-value="setChannelReceiveNotifications"
        />
      </div>
      <button v-if="canClearHistory" class="clear-btn" type="button" @click="clearHistory">{{ t('清空聊天记录') }}</button>
    </section>

    <RadioSelectDialog
      v-if="clearMsgTypeList.length > 0"
      :title="t('请选择清空类型')"
      :radio-text-list="clearMsgTypeList"
      @submit="handleClearSubmit"
    />

    <section v-if="adminPrivacy" class="manager-title">
      <button class="manager-entry" type="button" @mouseenter="prefetchManagerList" @click="openManagerDialog">
        <span>{{ t('管理员') }}</span>
        <span class="arrow">›</span>
      </button>
    </section>

    <section v-if="adminPrivacy" class="member-section">
      <label class="member-search">
        <img :src="searchIcon" alt="" />
        <input v-model="keyword" type="text" :placeholder="t('搜索')" />
      </label>

      <div v-if="loadingMembers" class="member-loading">{{ t('加载中') }}...</div>
      <ul v-else class="member-list">
        <li v-for="member in filteredMembers" :key="member.id" @click="openMemberProfile(member)">
          <TextAvatar
            :name="member.name || member.id"
            :src="member.avatar || null"
            :size="35"
            rounded
          />
          <div class="member-info">
            <div class="member-name">{{ member.name || member.id }}</div>
            <div class="member-status">{{ getMemberStatus(member) }}</div>
          </div>
          <span
            v-if="roleLabel(member.memberType)"
            :class="['role-badge', member.memberType === 1 ? 'owner' : 'admin']"
          >
            {{ roleLabel(member.memberType) }}
          </span>
        </li>
      </ul>
    </section>

    <!-- 弹窗挂到 body，避免受右侧面板父级布局影响导致遮罩层高度不完整。 -->
    <Teleport to="body">
      <div v-if="managerDialogVisible" class="channelManageDialog" @click="closeManagerDialog">
        <div @click.stop>
          <picture @click="closeManagerDialog">
            <img src="@/assets/images/common/close-icon.png" alt="" />
          </picture>
          <div class="member-list"></div>
          <div class="title">{{ t('管理员') }}（{{ managerCount }}/50）</div>
          <div v-if="loadingManagers" class="member-list loading">{{ t('加载中') }}...</div>
          <div v-else class="member-list">
            <div v-if="managerOwner" class="member-item cursor" @click="openMemberProfile(managerOwner)">
              <TextAvatar
                class="member-avatar"
                :name="managerOwner.name || managerOwner.id"
                :src="managerOwner.avatar || null"
                :size="30"
                rounded
              />
              <div class="member-info">
                <div class="member-info-top">
                  <div class="member-name">{{ managerOwner.name || managerOwner.id }}</div>
                  <div class="badge">{{ t('所有者') }}</div>
                </div>
                <div class="member-online-state">{{ getManagerExtraText(managerOwner) }}</div>
              </div>
            </div>

            <div
              v-for="member in managerList"
              :key="member.id"
              class="member-item cursor"
              :class="{ 'has-remove-btn': member.removeAuthorize }"
              @click="openMemberProfile(member)"
            >
              <TextAvatar
                class="member-avatar"
                :name="member.name || member.id"
                :src="member.avatar || null"
                :size="30"
                rounded
              />
              <div class="member-info">
                <div class="member-info-top">
                  <div class="member-name">{{ member.name || member.id }}</div>
                </div>
                <div class="member-online-state">{{ getManagerExtraText(member) }}</div>
              </div>
              <span
                v-if="member.removeAuthorize"
                class="remove-manage cursor"
                @click.stop="removeManager(member)"
              >
                {{ removingManagerId === member.id ? `${t('加载中')}...` : t('移除') }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <Toast
      :visible="qrToastVisible"
      :message="qrToastMessage"
      :type="qrToastType"
      @update:visible="qrToastVisible = $event"
    />

    <ImageOverwriteDialog
      v-model:visible="imageOverwriteVisible"
      :file-name="imageOverwriteFileName"
      :directory-name="imageOverwriteDirectoryName"
      @confirm="resolveImageOverwrite(true)"
      @cancel="resolveImageOverwrite(false)"
    />
  </div>
</template>

<style lang="scss" scoped>
.channel-info-panel {
  min-height: 100%;
  background: #f4f4f4;
  color: #333;
  font-size: 14px;
}

.channel-link,
.panel-section,
.manager-title,
.member-section {
  background: #fff;
}

.channel-link {
  width: 100%;
  height: 55px;
  padding: 8px 10px;
  box-sizing: border-box;
  display: flex;
  align-items: center;

  h4 {
    flex: 1;
    margin: 0;
    font-size: 14px;
    color: #000;
  }
}

.channel-link-info {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
}

.alias {
  max-width: 200px;
  color: #178aff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  word-wrap: break-word;
  font-weight: 600;

  &.is-loading {
    color: #999;
    cursor: default;
  }
}

.code-entrance {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.code-icon {
  width: 22px;
  height: 22px;
  margin-left: 8px;
}

.more-icon {
  height: 22px;
}

.arrow {
  color: #9aa3b5;
  font-size: 24px;
  line-height: 1;
}

.panel-section {
  margin-top: 10px;
}

.intro-section {
  min-height: 80px;
  padding: 10px;
  box-sizing: border-box;

  .channel-description-preview {
    margin: 0;
    line-height: 22px;
    color: #787878;
    font-weight: 600;
    word-break: break-word;
    max-height: 44px;
  }
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;

  h4 {
    margin: 0;
    line-height: 32px;
    font-size: 14px;
    color: #000;
  }
}

.config-section {
  padding: 18px 10px 10px;
}

.config-item {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  color: #333;

  > span {
    font-weight: 600;
  }
}

.clear-btn {
  display: block;
  width: 100%;
  height: 42px;
  margin-top: 8px;
  border: 0;
  background: transparent;
  color: #f44e5a;
  font-size: 15px;
  cursor: pointer;
}

.manager-title {
  height: 45px;
  margin-top: 10px;
  padding: 0 10px;
  display: flex;
  align-items: center;
}

.manager-entry {
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  font-size: 14px;
  color: #333;

  > span:first-child {
    font-weight: 600;
  }

  .arrow {
    color: #b0b0b0;
    font-size: 18px;
    line-height: 1;
  }
}

.member-section {
  margin-top: 10px;
  padding: 10px;
}

.member-search {
  height: 30px;
  padding: 0 10px;
  border-radius: 4px;
  background: #f0f2f5;
  display: flex;
  align-items: center;

  img {
    width: 16px;
    height: 16px;
    margin-right: 6px;
  }

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    font-size: 14px;
  }
}

.member-list {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;

  li {
    height: 50px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }
}

.member-loading {
  margin-top: 12px;
  color: #999;
  font-size: 12px;
}

.member-info {
  flex: 1;
  min-width: 0;
  margin-left: 10px;
}

.member-name {
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-status {
  line-height: 18px;
  color: #999;
  font-size: 12px;
}

.role-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 9px;
  color: #fff;
  font-size: 12px;

  &.owner {
    background: #3369fe;
  }

  &.admin {
    background: #fb9203;
  }
}

.channelManageDialog {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 10000;
  background: rgba($color: #000000, $alpha: 0.2);
  > div {
    background: #fff;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 10px 16px;
    border-radius: 8px;
    width: 400px;
    box-sizing: border-box;
    > picture {
      position: absolute;
      top: 0;
      right: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;

      &:hover {
        opacity: 0.8;
      }
    }
    .title {
      background: #fff;
      color: #333;
      padding: 10px;
      box-sizing: border-box;
    }

    .member-list {
      margin-top: 10px;
      width: 100%;
      padding-bottom: 10px;
      background: #fff;
      overflow-y: auto;
      max-height: 350px;

      &.loading {
        color: #999;
        font-size: 12px;
        line-height: 22px;
      }

      .member-item {
        width: 100%;
        text-align: center;
        display: flex;
        align-items: center;
        position: relative;
        padding: 5px 10px;
        box-sizing: border-box;

        &:hover {
          background: #f5f5f5;
        }

        &.has-remove-btn {
          .member-info {
            padding-right: 42px;
          }
        }

        .remove-manage {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);

          &:hover {
            color: #3369fe;
          }
        }

        .member-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
        }

        .member-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 14px;
        }
        .badge {
          font-size: 10px;
          color: #fff;
          padding: 2px 6px;
          border-radius: 99px;
          background: #3369fe;
          flex-shrink: 0;
          margin-left: 4px;
        }

        .member-info {
          margin-left: 10px;
          width: 100%;
          overflow: hidden;
        }

        .member-info-top {
          display: flex;
          align-items: center;
          width: 100%;
          overflow: hidden;
        }

        .member-online-state {
          text-align: left;
          font-size: 12px;
          color: #b9babe;
          word-break: break-all;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          line-clamp: 2;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }
    }
  }
}

.intro-section.clickable {
  cursor: pointer;

  &:hover {
    background: #f0f0f0;
  }
}

.comGroupNoticeDialog {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.2);

  .content {
    padding-top: 30px;
  }

  > div {
    background: #fff;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 10px 16px;
    border-radius: 8px;
    width: 438px;
    box-sizing: border-box;

    > picture {
      position: absolute;
      top: 0;
      right: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;

      &:hover {
        opacity: 0.8;
      }
    }

    > section {
      position: relative;

      > textarea {
        padding: 15px 10px;
        box-sizing: border-box;
        width: 100%;
        height: 223px;
        background-color: rgb(245, 245, 245);
        border-radius: 8px;
        font-size: 14px;
        color: #333;
        display: block;
        border: none;
        font-family: inherit;
        resize: none;

        &:focus {
          outline: none;
        }

        &::placeholder {
          color:rgb(48, 48, 48);
          opacity: 1;
        }
      }

      > span {
        position: absolute;
        right: 10px;
        bottom: -18px;
        font-size: 12px;
        color: #666;
      }

      > div {
        padding: 15px 0;
        background-color: rgb(245, 245, 245);
        border-radius: 8px;
        height: 203px;
        overflow-y: auto;

        p {
          padding: 0 10px;
          margin: 0;
          font-size: 14px;
          color: #787878;
          line-height: 20px;
          white-space: pre-wrap;
          word-break: break-word;

          &.empty {
            color: #d3d1d1;
          }
        }
      }
    }

    > .bottom {
      margin-top: 5px;
      padding-top: 20px;
      padding-bottom: 10px;
      display: flex;
      justify-content: flex-end;

      > span {
        display: block;
        color: #fff;
        background-color: #3369fe;
        border: 1px solid #3369fe;
        cursor: pointer;
        padding: 0 28px;
        display: inline-block;
        height: 32px;
        line-height: 32px;
        font-size: 12px;
        font-weight: 600;
        border-radius: 4px;

        &:hover {
          opacity: 0.8;
        }

        &:nth-child(2) {
          background-color: #fff;
          border: 1px solid #eeeeee;
          color: #666666;
          font-weight: 400;
          margin-left: 10px;
        }

        &.cancel-btn {
          color: rgba(91, 91, 91);
          font-weight: 600;
        }
      }
    }
  }
}

.notice-view {
  word-wrap: break-word;
  user-select: text;
}

.qrcode-panel {
  position: fixed;
  right: 0;
  top: 34px;
  width: 270px;
  height: calc(100% - 34px);
  background: #ffffff;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-left: 1px solid #f5f5f5;
}

.qrcode-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qrcode-header {
  width: 100%;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding-left: 50px;
  box-sizing: border-box;
  background: #ffffff;
  border-bottom: 1px solid #f5f5f5;
  position: relative;
  font-size: 16px;
  font-weight: 600;
  color: #000;

  .qrcode-close {
    position: absolute;
    left: 0;
    top: 0;
    height: 50px;
    width: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;

    img {
      display: block;
      width: 25px;
    }

    &:hover {
      opacity: 0.8;
    }
  }
}

.qrcode-section {
  height: 250px;
  width: 100%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-direction: column;
  position: relative;
  box-sizing: border-box;
  padding-top: 15px;
  padding-bottom: 30px;

  .qrcode-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .qrcode {
    width: 180px;
    height: 180px;
  }

  h3 {
    display: block;
    font-size: 13px;
    color: #787878;
    line-height: 30px;
    margin: 0;
  }
}

.qrcode-buttons {
  display: flex;
  align-items: center;
  width: 100%;
  justify-content: center;
  border: none;

  .btn-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin-left: 20px;

    &:first-child {
      margin-left: 0;
    }

    button {
      width: 54px;
      height: 54px;
      background: #F2F9FF;
      border-radius: 16px;
      border: none;
      font-size: 16px;
      font-weight: 500;
      color: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 10px;
      cursor: pointer;
      position: relative;

      &:hover {
        background: #f9f9f9;
      }

      img {
        display: block;
        width: 20px;
      }
    }

    .btn-title {
      font-size: 12px;
      color: #000;
      font-weight: 600;
    }
  }
}

.toast {
  position: fixed;
  bottom: 50%;
  left: 50%;
  transform: translate(-50%, 50%);
  background: #333;
  color: #fff;
  padding: 12px 24px;
  border-radius: 4px;
  font-size: 14px;
  z-index: 1000;
  pointer-events: none;
  animation: fadeInOut 2s ease-in-out;
}

@keyframes fadeInOut {
  0% {
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
</style>
