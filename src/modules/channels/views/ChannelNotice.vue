<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import TextAvatar from '@/components/TextAvatar.vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { CHANNEL_NOTIFICATION_TARGET_ID, useChatStore } from '@/stores/useChatStore'
import { useMessageStore, type Message } from '@/stores/useMessageStore'
import { useUIStore } from '@/stores/useUIStore'
import {
  channelCheckJoin,
  getChannelDetail,
  getChannelEventList,
  type ChannelEventReqItem,
} from '@/api/imChannel'
import { eventBus } from '@/utils/eventBus'
import { ConversationType } from '@/types'

interface ChannelNoticeItem {
  id: string
  jumpPage: boolean
  channelName: string
  channelId: string
  uid: string
  icon: string
  logoColor: string
  content: string
  sendTime: number
  reqStatus: number
  reqType: number
}

const { t } = useI18n()
const authStore = useAuthStore()
const channelStore = useChannelStore()
const chatStore = useChatStore()
const messageStore = useMessageStore()
const uiStore = useUIStore()

const list = ref<ChannelNoticeItem[]>([])
const pageNum = ref(1)
const pageSize = 10
const loading = ref(false)
const hasMore = ref(true)

function statusLabel(status: number): string {
  const map: Record<number, string> = {
    1: t('已同意'),
    2: t('已拒绝'),
    3: t('已失效'),
  }
  return map[status] || ''
}

function formatTime(ts: number): string {
  if (!ts) return ''
  const d = dayjs(ts)
  const today = dayjs()
  if (d.isSame(today, 'day')) return d.format('HH:mm')
  return d.format('MM/DD HH:mm')
}

function showTip(message: string, type: 'success' | 'error' = 'success') {
  eventBus.emit('show-toast', { message, type })
}

function parseNoticeItem(item: ChannelEventReqItem): ChannelNoticeItem {
  const raw = item as ChannelEventReqItem & {
    channelInfo?: Record<string, unknown> | null
  }
  const channelInfo = raw.channelInfo && typeof raw.channelInfo === 'object' ? raw.channelInfo : {}
  const channelId = String(item.channelId ?? channelInfo.channelId ?? channelInfo.id ?? '')
  const channelName = String(item.channelName || channelInfo.channelName || channelInfo.name || channelId || '')
  return {
    id: String(item.id ?? ''),
    jumpPage: Boolean(item.jumpPage),
    channelName,
    channelId,
    uid: String(item.uid ?? ''),
    icon: item.icon || String(channelInfo.icon || channelInfo.avatar || ''),
    logoColor: item.logoColor || String(channelInfo.logoColor || '') || '#ff6b35',
    content: item.noticeMsg || '',
    sendTime: Number(item.createTime || item.updateTime || Date.now()),
    reqStatus: item.reqStatus === undefined || item.reqStatus === null ? -1 : Number(item.reqStatus),
    reqType: Number(item.reqType || 0),
  }
}

function parseExtra(extra: string | null): Record<string, any> {
  if (!extra) return {}
  try {
    const parsed = JSON.parse(extra)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function isLocalRemoveNotice(message: Message): boolean {
  const extra = parseExtra(message.extra)
  const source = String(extra.source || '')
  return source === 'channel-remove'
    || (source === 'channel-notice' && Number(extra.subscriberOperateType ?? -1) === 2)
}

function parseLocalNoticeMessage(message: Message): ChannelNoticeItem | null {
  if (!isLocalRemoveNotice(message)) return null
  const extra = parseExtra(message.extra)
  const channelId = String(extra.channelId || '')
  const content = String(message.content || '').trim()
  if (!channelId && !content) return null
  const cachedChannel = channelId ? channelStore.getChannel(channelId) : null
  const removedChannel = channelId ? channelStore.getRemovedChannelMeta(channelId) : null
  const parsedName = content.match(/^(.+?)(?:已被移出频道|被移出频道)/)?.[1]
  const usableParsedName = parsedName && !['您', '你'].includes(parsedName.trim()) ? parsedName.trim() : ''
  const displayName = String(
    extra.channelName
    || cachedChannel?.channelName
    || cachedChannel?.name
    || removedChannel?.channelName
    || removedChannel?.name
    || usableParsedName
    || t('频道通知'),
  ).trim()
  return {
    id: `local-${message.id}`,
    jumpPage: false,
    channelName: displayName,
    channelId,
    uid: '',
    icon: String(extra.icon || cachedChannel?.icon || cachedChannel?.avatar || removedChannel?.icon || removedChannel?.avatar || ''),
    logoColor: String(extra.logoColor || cachedChannel?.logoColor || removedChannel?.logoColor || '') || '#ff6b35',
    content,
    sendTime: Number(message.sendTime || Date.now()),
    reqStatus: -1,
    reqType: 0,
  }
}

async function getLocalNoticeItems(): Promise<ChannelNoticeItem[]> {
  const uid = String(authStore.uid || '')
  const conversationId = `0_${CHANNEL_NOTIFICATION_TARGET_ID}`
  if (uid) {
    await messageStore.loadMessages(uid, conversationId, true).catch((error) => {
      console.warn('[ChannelNotice] load local notice messages failed:', error)
    })
  }
  const items = messageStore
    .getMessages(conversationId)
    .map(parseLocalNoticeMessage)
    .filter((item): item is ChannelNoticeItem => Boolean(item))
    .sort((a, b) => (b.sendTime || 0) - (a.sendTime || 0))

  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `remove-${item.channelId || item.channelName}-${item.content}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function mergeNoticeItems(remoteItems: ChannelNoticeItem[], localItems: ChannelNoticeItem[]) {
  const seen = new Set<string>()
  return [...remoteItems, ...localItems]
    .filter((item) => {
      const key = item.reqStatus < 0
        ? `local-${item.channelId || item.channelName}-${item.content}`
        : (item.id || `${item.channelId}-${item.content}-${item.sendTime}`)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => (b.sendTime || 0) - (a.sendTime || 0))
}

function syncSidebarPreview(items: ChannelNoticeItem[]) {
  const latest = items[0]
  if (latest) {
    chatStore.updateChannelNotificationConv(latest.content, latest.sendTime, 0)
  } else {
    chatStore.removeChannelNotificationConversation()
  }
}

async function loadList(isLoadMore = false) {
  if (loading.value) return
  loading.value = true
  try {
    const res = await getChannelEventList({
      pageNum: pageNum.value,
      pageSize,
    })
    const rows = res?.data?.rowList || []
    const remoteItems = rows.map(parseNoticeItem)
    const localItems = isLoadMore ? [] : await getLocalNoticeItems()
    const next = isLoadMore ? remoteItems : mergeNoticeItems(remoteItems, localItems)

    list.value = isLoadMore ? [...list.value, ...next] : next
    hasMore.value = remoteItems.length >= pageSize
    if (!isLoadMore) syncSidebarPreview(list.value)
  } catch (error) {
    console.error('[ChannelNotice] loadList failed:', error)
    if (!isLoadMore) {
      const localItems = await getLocalNoticeItems()
      list.value = localItems
      syncSidebarPreview(localItems)
    }
    hasMore.value = false
  } finally {
    loading.value = false
  }
}

async function refreshList() {
  pageNum.value = 1
  hasMore.value = true
  await loadList(false)
}

async function loadMore() {
  if (loading.value || !hasMore.value) return
  pageNum.value += 1
  await loadList(true)
}

function handleScroll(event: Event) {
  const el = event.target as HTMLElement
  if (!el) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) {
    void loadMore()
  }
}

async function upsertApprovedChannel(item: ChannelNoticeItem) {
  if (!item.channelId) return
  const detail = await channelStore.refreshChannelDetail(item.channelId)
  channelStore.patchChannel(item.channelId, {
    ...detail,
    id: item.channelId,
    channelId: item.channelId,
    name: detail?.channelName || detail?.name || item.channelName || item.channelId,
    channelName: detail?.channelName || detail?.name || item.channelName || item.channelId,
    avatar: detail?.avatar || detail?.icon || item.icon || null,
    icon: detail?.icon || detail?.avatar || item.icon || null,
    logoColor: detail?.logoColor || item.logoColor || null,
    memberType: detail?.memberType ?? 9,
    updatedAt: Date.now(),
  }, { allowRemoved: true })

  const conv = chatStore.ensureConversation(ConversationType.Channel, item.channelId)
  chatStore.addOrUpdateConversation({
    ...conv,
    lastMsgDigest: conv.lastMsgDigest || item.content || null,
    lastMsgTime: conv.lastMsgTime || item.sendTime || Date.now(),
    updatedAt: conv.updatedAt || item.sendTime || Date.now(),
  })
}

async function handleCheck(item: ChannelNoticeItem, flag: boolean, index: number) {
  if (!item.id) return
  try {
    const res = await channelCheckJoin({ id: item.id, flag })
    const code = Number(res?.code || res?.errCode || 0)
    if (code === 200) {
      showTip(t('操作成功'))
      list.value[index] = { ...list.value[index], reqStatus: flag ? 1 : 2 }
      if (flag && item.channelId) {
        await upsertApprovedChannel(item)
      }
      syncSidebarPreview(list.value)
      return
    }
    showTip(res?.msg || res?.errMsg || t('操作失败'), 'error')
  } catch (error) {
    console.error('[ChannelNotice] check failed:', error)
    showTip(t('操作失败'), 'error')
  }
}

function canOpenChannel(item: ChannelNoticeItem): boolean {
  return Boolean(item.channelId && (item.jumpPage || item.reqStatus === 1))
}

async function handleChannelClick(item: ChannelNoticeItem) {
  if (!canOpenChannel(item)) return
  try {
    const res = await getChannelDetail({ channelId: item.channelId })
    const detail = res?.data
    if (!detail || !Number(detail.memberType || 0)) {
      showTip(t('此频道已失效或过期'), 'error')
      return
    }

    channelStore.patchChannel(item.channelId, {
      ...detail,
      id: item.channelId,
      channelId: item.channelId,
      name: detail.channelName || item.channelName || item.channelId,
      channelName: detail.channelName || item.channelName || item.channelId,
      avatar: detail.icon || item.icon || null,
    }, { allowRemoved: true })
    const conv = chatStore.ensureConversation(ConversationType.Channel, item.channelId)
    chatStore.setCurrentConversation(conv.id)
    uiStore.setRightPanel('none')
    uiStore.setDetailView('chat')
  } catch (error) {
    console.error('[ChannelNotice] open channel failed:', error)
    showTip(t('此频道已失效或过期'), 'error')
  }
}

onMounted(() => {
  chatStore.clearChannelNotificationUnread()
  void loadList()
  eventBus.on('channel-notice:update', refreshList)
})

onBeforeUnmount(() => {
  eventBus.off('channel-notice:update', refreshList)
})
</script>

<template>
  <div class="channel-notice">
    <h1>{{ t('频道通知') }}</h1>
    <ul class="notify-box" @scroll="handleScroll">
      <li
        v-for="(item, index) in list"
        :key="item.id || `${item.channelId}-${index}`"
        :class="{ clickable: canOpenChannel(item) }"
        @click="handleChannelClick(item)"
      >
        <TextAvatar
          class="item-avatar"
          :id="item.channelId"
          :name="item.channelName"
          :src="item.icon || null"
          :color="item.logoColor"
          avatar-type="channel"
          :size="40"
          rounded
        />
        <div class="item-body">
          <div class="top-info">
            <h2>{{ item.channelName }}</h2>
            <span class="time"> · {{ formatTime(item.sendTime) }}</span>
          </div>
          <p class="line-notify">{{ item.content }}</p>
        </div>
        <div v-if="item.id && item.reqStatus >= 0" class="right-info">
          <template v-if="item.reqStatus === 0">
            <button type="button" @click.stop="handleCheck(item, false, index)">{{ t('拒绝') }}</button>
            <button type="button" class="active" @click.stop="handleCheck(item, true, index)">{{ t('通过') }}</button>
          </template>
          <span v-else class="status-label">{{ statusLabel(item.reqStatus) }}</span>
        </div>
      </li>
      <li v-if="loading" class="state-tip">{{ t('加载中...') }}</li>
      <li v-if="!hasMore && list.length > 0" class="state-tip">{{ t('没有更多了') }}</li>
      <li v-if="list.length === 0 && !loading" class="empty-tip">{{ t('暂无通知') }}</li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.channel-notice {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
  background: #fff;

  > h1 {
    margin: 0;
    display: flex;
    height: 51px;
    padding: 0 16px;
    align-items: center;
    border-bottom: 1px solid #eee;
    font-size: 16px;
    font-weight: 700;
    color: #333;
    flex-shrink: 0;
  }
}

.notify-box {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;

  > li {
    min-height: 72px;
    position: relative;
    padding: 12px 150px 12px 65px;
    display: flex;
    align-items: center;

    &::after {
      content: "";
      display: block;
      position: absolute;
      right: 0;
      bottom: 0;
      left: 65px;
      height: 1px;
      background: #ebebeb;
    }

    &:hover {
      background: #f9f9f9;
    }

    &.clickable {
      cursor: pointer;
    }

    &.empty-tip,
    &.state-tip {
      justify-content: center;
      padding: 24px;
      color: #999;
      font-size: 14px;

      &::after {
        display: none;
      }
    }
  }
}

.item-avatar {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
}

.item-body {
  flex: 1;
  min-width: 0;
}

.top-info {
  display: flex;
  align-items: center;

  > h2 {
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    color: #000;
    margin: 0 5px 0 0;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    max-width: 70%;
  }

  .time {
    font-size: 12px;
    color: #999;
    white-space: nowrap;
  }
}

.line-notify {
  margin: 0;
  line-height: 20px;
  color: #2288f0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.right-info {
  position: absolute;
  right: 15px;
  display: flex;
  gap: 5px;

  > button {
    border: 0;
    color: #fff;
    background: #666;
    line-height: 30px;
    padding: 0 10px;
    border-radius: 5px;
    min-width: 60px;
    width: auto;
    text-align: center;
    cursor: pointer;

    &:hover {
      opacity: 0.8;
    }

    &.active {
      background: #3369fe;
    }
  }

  .status-label {
    display: inline-block;
    line-height: 30px;
    min-height: 30px;
    padding: 0 8px;
    background: #eeeff3;
    color: #999b9e;
    min-width: 60px;
    max-width: 120px;
    text-align: center;
    border-radius: 5px;
    font-size: 12px;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
