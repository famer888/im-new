<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QrcodeVue from 'qrcode.vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useUIStore } from '@/stores/useUIStore'
import { ConversationType, MessageType } from '@/types'
import { getChannelDetail, getChannelUsers, updateMember, updateChannel } from '@/api/imChannel'
import AppSwitch from '@/components/AppSwitch.vue'
import TextAvatar from '@/components/TextAvatar.vue'
import Toast from '@/components/Toast.vue'
import ImageOverwriteDialog from '@/components/ImageOverwriteDialog.vue'
import { exportBase64ImgToLocal, userSelectPngSavePathWithOverwrite } from '@/utils/fileTools'
import searchIcon from '@/assets/images/headNav/search-icon.png'
import codeIcon from '@/assets/images/chat/code.png'
import arrowRightIcon from '@/assets/images/chat/arrow-rgiht.png'

interface ChannelMember {
  id: string
  name: string
  avatar: string
  memberType: number
}

const { t, locale } = useI18n()
const authStore = useAuthStore()
const chatStore = useChatStore()
const channelStore = useChannelStore()
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
const toastMessage = ref('')
const toastTimer = ref<number | null>(null)
const loadingMembers = ref(false)
let loadSeq = 0
const CHANNEL_DETAIL_CACHE_TTL_MS = 60 * 1000
const CHANNEL_MEMBERS_CACHE_TTL_MS = 60 * 1000

const conv = computed(() => chatStore.currentConversation)
const channel = computed(() => {
  const id = conv.value?.targetId || ''
  return id ? channelStore.getChannel(id) : null
})
const channelId = computed(() => conv.value?.targetId || '')
const channelName = computed(() =>
  String(detail.value.channelName || channel.value?.channelName || channel.value?.name || channelId.value),
)

/** 与二维码编码一致：邀请页链接 + id，供转发/复制（老 im 侧实质也是按链接里的 id 拉起频道） */
const inviteUrlWithChannelId = computed(() => {
  const base = String(detail.value.link || '').trim()
  const id = channelId.value
  if (!base || !id) return ''
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}id=${encodeURIComponent(id)}`
})
const alias = computed(() => String(detail.value.alias || ''))
const description = computed(() =>
  String(detail.value.remark ?? detail.value.channelDesc ?? channel.value?.remark ?? channel.value?.description ?? ''),
)
const adminPrivacy = computed(() => Number(detail.value.adminPrivacy ?? channel.value?.adminPrivacy ?? 0))
const channelDisturbed = computed(() =>
  toBool(detail.value.isDisturb ?? channel.value?.isDisturb ?? conv.value?.isMuted ?? false),
)
const receiveNotifications = computed(() => !channelDisturbed.value)
const filteredMembers = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return members.value
  return members.value.filter((item) => item.name.toLowerCase().includes(q) || item.id.includes(q))
})

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

function detailCacheKey(id: string): string {
  return `channel-info:detail:${id}`
}

function membersCacheKey(id: string): string {
  return `channel-info:members:${id}`
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
      return {
        id,
        name: String(user.name || user.nickName || user.nickname || id),
        avatar: String(user.icon || raw.icon || ''),
        memberType: Number(raw.memberType ?? raw.type ?? raw.role ?? 3),
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

async function clearHistory() {
  if (!conv.value) return
  await messageStore.clearConversationHistory(conv.value.id, false)
  chatStore.updateConversation({
    id: conv.value.id,
    lastMsgDigest: null,
    lastMsgId: null,
    unreadCount: 0,
  })
}

const currentUserMemberType = computed(() => {
  const currentUserId = authStore.uid
  const currentMember = members.value.find((m) => m.id === currentUserId)
  return currentMember?.memberType ?? 3
})

const canClearHistory = computed(() => {
  const memberType = currentUserMemberType.value
  return memberType !== 3
})

function roleLabel(memberType: number): string {
  if (memberType === 1) return t('所有者')
  if (memberType === 2) return t('管理员')
  return ''
}

function openEditDesc() {
  if (!canClearHistory.value) return
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
  if (!channelId.value) return
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
  const qrLink = inviteUrlWithChannelId.value
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
    toastMessage.value = '复制成功'
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
    }
  },
)
onMounted(loadChannelInfo)

onBeforeUnmount(() => {
  if (imageOverwriteResolver) {
    imageOverwriteResolver(false)
    imageOverwriteResolver = null
  }
})
</script>

<template>
  <div v-if="conv" class="channel-info-panel">
    <section v-if="alias || adminPrivacy" class="channel-link" @click="showQrCode = true">
      <h4>{{ t('频道别名') }}</h4>
      <div class="channel-link-info">
        <span class="alias" @click.stop="copyAlias">{{ alias ? `@${alias}` : '' }}</span>
        <div class="code-entrance">
          <img class="code-icon" :src="codeIcon" alt="" />
          <img class="more-icon" :src="arrowRightIcon" alt="" />
        </div>
      </div>
    </section>

    <div v-if="toastMessage" class="toast">{{ toastMessage }}</div>

    <section class="panel-section intro-section" :class="{ clickable: canClearHistory }" @click="canClearHistory && openEditDesc()">
      <div class="section-head">
        <h4>{{ t('频道简介') }}</h4>
        <span class="arrow">›</span>
      </div>
      <p>{{ description || t('无简介') }}</p>
    </section>

    <!-- 编辑频道简介对话框 -->
    <div v-if="editDescVisible" class="comGroupNoticeDialog" @click="handleClose">
      <div class="content" @click.stop>
        <picture @click.stop="handleClose">
          <img src="@/assets/images/common/close-icon.png" />
        </picture>
        <section>
          <textarea
            v-if="isEditDesc && canClearHistory"
            v-model="editDescDraft"
            maxlength="800"
            type="text"
            :placeholder="t('请输入内容')"
            :disabled="!canClearHistory"
          />
          <div v-else :style="{ height: '203px' }">
            <p :class="['notice-view', { empty: !editDescDraft }]">{{ editDescDraft || t('无简介') }}</p>
          </div>
          <span v-if="canClearHistory && isEditDesc">{{ 800 - editDescDraft.length }}</span>
        </section>
        <template v-if="canClearHistory">
          <div class="bottom" v-if="!isEditDesc">
            <span @click.stop="isEditDesc = true">{{ t('修改') }}</span>
          </div>
          <div class="bottom" v-else>
            <span @click.stop="handleOk">{{ t('确定') }}</span>
            <span @click.stop="handleCancel">{{ t('取消') }}</span>
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
              :value="inviteUrlWithChannelId"
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

    <section v-if="adminPrivacy" class="manager-title">
      <h4>{{ t('管理员') }}</h4>
    </section>

    <section v-if="adminPrivacy" class="member-section">
      <label class="member-search">
        <img :src="searchIcon" alt="" />
        <input v-model="keyword" type="text" :placeholder="t('搜索')" />
      </label>

      <div v-if="loadingMembers" class="member-loading">{{ t('加载中') }}...</div>
      <ul v-else class="member-list">
        <li v-for="member in filteredMembers" :key="member.id">
          <TextAvatar
            :name="member.name || member.id"
            :src="member.avatar || null"
            :size="35"
            rounded
          />
          <div class="member-info">
            <div class="member-name">{{ member.name || member.id }}</div>
            <div class="member-status">在线</div>
          </div>
          <span v-if="roleLabel(member.memberType)" class="role-badge">
            {{ roleLabel(member.memberType) }}
          </span>
        </li>
      </ul>
    </section>

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

  p {
    margin: 0;
    line-height: 22px;
    color: #333;
    word-break: break-word;
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

  h4 {
    margin: 0;
    font-size: 14px;
    color: #333;
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
  background: #3369fe;
  color: #fff;
  font-size: 12px;
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
