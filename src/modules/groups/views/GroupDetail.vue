<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGroupStore, type GroupMember } from '@/stores/useGroupStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useUIStore } from '@/stores/useUIStore'
import { getGroupDetail } from '@/api/imBase'
import TextAvatar from '@/components/TextAvatar.vue'
import { eventBus } from '@/utils/eventBus'

// 群详情接口只做短期内存缓存，既减少重复 groupDetail 请求，也避免长期展示过期群资料。
const GROUP_DETAIL_CACHE_TTL_MS = 30 * 1000
const groupDetailCache = new Map<string, { valid: boolean; checkedAt: number; groupPatch?: Record<string, any> }>()
const groupDetailRequestMap = new Map<string, Promise<boolean>>()

const props = defineProps<{ groupId: string }>()
const { t } = useI18n()
const groupStore = useGroupStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUIStore()
const loadingMembers = ref(false)
const sendingMessage = ref(false)

const group = computed(() => groupStore.getGroup(props.groupId))

function groupDiag(message: string, data: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'warn') {
  void message
  void data
  void level
}

/** 与老项目 im/details/group.vue 一致：store 已按 role 排序，截取前 8 人展示 */
const previewMembers = computed(() => groupStore.getMembers(props.groupId).slice(0, 8))
const displayedMemberCount = computed(() => group.value?.memberCount || previewMembers.value.length)
const showMemberLoading = computed(() => loadingMembers.value && previewMembers.value.length === 0)

// immediate watcher 首次执行会同步调用成员加载，序号必须先初始化，避免首次进群详情时加载流程中断。
let memberLoadSeq = 0

watch(
  () => [props.groupId, authStore.uid] as const,
  ([groupId, uid]) => {
    if (!groupId || !uid) {
      loadingMembers.value = false
      return
    }
    // 登录态可能晚于详情页恢复；同时监听 uid，避免首次跳过后成员头像区一直为空。
    void loadPreviewMembers(groupId)
    void refreshGroupDetail(groupId)
  },
  { immediate: true },
)

async function loadPreviewMembers(groupId: string) {
  const normalizedId = String(groupId || '').trim()
  const uid = authStore.uid
  if (!normalizedId || !uid) return

  const seq = ++memberLoadSeq
  const hasCachedMembers = groupStore.getMembers(normalizedId).length > 0
  // 只有成员框没有可展示缓存时才露出 loading；有缓存则直接展示，避免切回群详情时闪烁。
  loadingMembers.value = !hasCachedMembers
  try {
    await groupStore.loadMembers(uid, normalizedId, { previewOnly: true })
  } finally {
    // 快速切换群时只允许最后一次请求关闭当前 loading，避免旧请求回包覆盖新群状态。
    if (seq === memberLoadSeq && props.groupId === normalizedId) {
      loadingMembers.value = false
    }
  }
}

async function handleInvalidGroup(groupId: string) {
  const normalizedId = String(groupId || '').trim()
  if (!normalizedId) return
  if (authStore.uid) {
    groupDetailCache.delete(getGroupDetailCacheKey(authStore.uid, normalizedId))
  }
  const conversationId = `1_${normalizedId}`
  // 无效群要同时退出详情视图并清掉当前会话，避免页面继续停留在“资料不可用”状态。
  if (uiStore.detailView === 'group-detail') {
    uiStore.setDetailView('none')
  }
  if (chatStore.currentConversation?.id === conversationId) {
    chatStore.setCurrentConversation(null)
  }
  groupStore.removeGroup(normalizedId)
  if (authStore.uid) {
    await chatStore.deleteConversation(authStore.uid, conversationId).catch(() => undefined)
  }
}

function getGroupDetailCacheKey(uid: string, groupId: string) {
  return `${uid}:${groupId}`
}

function getCachedGroupDetail(cacheKey: string) {
  const cached = groupDetailCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.checkedAt > GROUP_DETAIL_CACHE_TTL_MS) {
    groupDetailCache.delete(cacheKey)
    return null
  }
  return cached
}

function buildGroupPatch(groupId: string, groupBase: Record<string, any>) {
  const hasReadBurn = Object.prototype.hasOwnProperty.call(groupBase, 'bfGroupReadCancel')
    || Object.prototype.hasOwnProperty.call(groupBase, 'groupReadCancel')
  const hasReadBurnTime = Object.prototype.hasOwnProperty.call(groupBase, 'groupMsgCancelTime')
  return {
    id: groupId,
    name: groupBase.name ?? groupBase.groupName,
    avatar: groupBase.pic ?? groupBase.avatar ?? groupBase.groupAvatar,
    ownerId: groupBase.hostId ? String(groupBase.hostId) : undefined,
    memberCount: Number(groupBase.memberCount ?? 0),
    groupAliasName: groupBase.groupAliasName ?? null,
    // 群详情字段是局部回填；只有服务端明确返回阅后即焚字段时才覆盖本地会话状态。
    ...(hasReadBurn ? { bfGroupReadCancel: Boolean(groupBase.bfGroupReadCancel ?? groupBase.groupReadCancel) } : {}),
    ...(hasReadBurnTime ? { groupMsgCancelTime: Number(groupBase.groupMsgCancelTime ?? 0) } : {}),
  }
}

async function refreshGroupDetail(groupId: string, options: { forceRemote?: boolean } = {}): Promise<boolean> {
  const normalizedId = String(groupId || '').trim()
  if (!normalizedId) return false
  const cacheKey = getGroupDetailCacheKey(String(authStore.uid || ''), normalizedId)
  const startedAt = Date.now()

  if (!options.forceRemote) {
    const cached = getCachedGroupDetail(cacheKey)
    if (cached) {
      // 详情页重复打开同一群时先复用同账号短期缓存，减少 groupDetail 重复请求并保持旧 im 的可见信息。
      if (cached.valid && cached.groupPatch) {
        groupStore.upsertGroup(cached.groupPatch)
      }
      groupDiag('detail cache hit', {
        groupId: normalizedId,
        valid: cached.valid,
        durationMs: Date.now() - startedAt,
      })
      return cached.valid
    }
  }

  const existingRequest = groupDetailRequestMap.get(cacheKey)
  if (existingRequest) {
    groupDiag('detail pending reused', {
      groupId: normalizedId,
      forceRemote: !!options.forceRemote,
    })
    return existingRequest
  }

  const request = (async () => {
    try {
      groupDiag('detail request start', {
        groupId: normalizedId,
        forceRemote: !!options.forceRemote,
        hasLocalGroup: !!groupStore.getGroup(normalizedId),
      })
      const detail = await getGroupDetail({ groupId: normalizedId })
      const detailCode = Number((detail as any)?.commonResult?.errCode ?? 200)
      const groupBase = (detail as any)?.group
      groupDiag('detail response received', {
        groupId: normalizedId,
        code: detailCode,
        hasGroup: !!groupBase,
        name: groupBase?.name ?? groupBase?.groupName ?? '',
        durationMs: Date.now() - startedAt,
      })
      // 详情接口失败或无群对象时，按无效群处理并从列表移除，避免继续进入空群会话。
      if ((detailCode !== 0 && detailCode !== 200) || !groupBase) {
        await handleInvalidGroup(normalizedId)
        return false
      }
      const groupPatch = buildGroupPatch(normalizedId, groupBase)
      // 详情接口比本地缓存更新；打开群资料时回填名称和人数，避免缺失时显示数字 ID 或 0 人。
      groupStore.upsertRemoteGroup(groupPatch)
      groupDetailCache.set(cacheKey, { valid: true, checkedAt: Date.now(), groupPatch })
      groupDiag('detail applied', {
        groupId: normalizedId,
        name: groupPatch.name || '',
        memberCount: groupPatch.memberCount,
        durationMs: Date.now() - startedAt,
      })
      return true
    } catch (error) {
      console.error('[GroupDetail] refresh group detail failed:', error)
      groupDiag('detail request failed', {
        groupId: normalizedId,
        forceRemote: !!options.forceRemote,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      }, 'error')
      return false
    }
  })().finally(() => {
    groupDetailRequestMap.delete(cacheKey)
  })

  groupDetailRequestMap.set(cacheKey, request)
  return request
}

function openGroupConversation(groupId: string) {
  const conv = chatStore.ensureConversation(1, groupId)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setDetailView('chat')
}

async function startChat() {
  if (sendingMessage.value) return
  const groupId = String(props.groupId || '').trim()
  if (!groupId) return

  const hasLocalGroup = !!group.value
  groupDiag('enter click', {
    groupId,
    hasLocalGroup,
  })

  if (hasLocalGroup) {
    // 对齐老 im：已有本地群资料时先进入聊天；后台校验复用详情页请求/短期缓存，避免线上慢接口被点击再次触发。
    openGroupConversation(groupId)
    void refreshGroupDetail(groupId).then((available) => {
      groupDiag('enter background validation done', {
        groupId,
        available,
      })
      if (!available) {
        eventBus.emit('show-toast', { message: t('该群聊已解散'), type: 'error' })
      }
    })
    return
  }

  // 没有本地群资料时仍需先校验，防止从异常入口进入一个不存在的空群会话。
  sendingMessage.value = true
  try {
    const available = await refreshGroupDetail(groupId, { forceRemote: true })
    if (!available) {
      eventBus.emit('show-toast', { message: t('该群聊已解散'), type: 'error' })
      return
    }
    openGroupConversation(groupId)
  } finally {
    sendingMessage.value = false
  }
}

function handleMemberClick(member: GroupMember) {
  const candidateIds = previewMembers.value.map((m) => m.userId)
  uiStore.openMemberInfo(member.userId, props.groupId, candidateIds)
}
</script>

<template>
  <div class="communication-page">
    <div v-if="group" class="communication-page-box">
      <div class="user-info">
        <TextAvatar
          class="avatar"
          :name="group.name || group.id"
          :src="group.avatar"
          avatar-type="group"
          :size="60"
          rounded
        />
        <div>
          <div class="name">{{ group.name || group.id }}</div>
          <div class="count">
            {{ t('群成员共{value}人', { value: displayedMemberCount }) }}
          </div>
        </div>
      </div>

      <div class="user-des">
        <div class="memberList">
          <div v-if="showMemberLoading" class="member-loading">
            <span class="member-loading-spinner"></span>
            <span>{{ t('加载中') }}</span>
          </div>
          <template v-else>
            <div
              v-for="m in previewMembers"
              :key="m.userId"
              class="member-item"
              @click="handleMemberClick(m)"
            >
              <TextAvatar
                :name="m.nickname || m.userId"
                :src="m.avatar"
                avatar-type="friend"
                :size="35"
                rounded
              />
              <div class="nick-name" :title="m.nickname || m.userId">
                {{ m.nickname || m.userId }}
              </div>
              <div
                v-if="m.role === 0"
                class="member-identity member-master"
              >
                {{ t('群主') }}
              </div>
              <div
                v-else-if="m.role === 1"
                class="member-identity"
              >
                {{ t('管理员') }}
              </div>
            </div>
          </template>
        </div>
      </div>

      <div
        class="primaryBtn small"
        @click="startChat"
      >
        {{ sendingMessage ? t('进入中') : t('发送消息') }}
      </div>
    </div>
    <div v-else class="empty-hint">群资料暂不可用</div>
  </div>
</template>

<style lang="scss" scoped>
/* 布局对齐老项目 im/src/pages/home/details/group.vue，头图区按设计稿居中 */
.communication-page {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
}

.communication-page-box {
  padding: 80px 40px;
}

.user-info {
  padding: 0 0 20px;
  border-bottom: 1px solid #eee;
  display: block;
  .name {
  font-size: 16px;
  font-weight: normal;
  color: #333;
  user-select: text;
}

.count {
  margin-top: 5px;
  color: #999;
}
  .avatar {
    margin-right: 20px;
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 50%;
    display: block;
    margin-bottom: 12px;
  }
}

.user-des {
  padding: 20px 0 40px;
  .memberList {
    min-height: 77px;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    .member-loading {
      min-height: 77px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #999;
    }
    .member-loading-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #e5e5e5;
      border-top-color: #3369fe;
      border-radius: 50%;
      animation: member-loading-spin 0.8s linear infinite;
    }
    .member-item {
      margin-right: 10px;
      text-align: center;
      min-width: 50px;
      width: max-content;
      max-width: 128px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      .nick-name {
        margin-top: 6px;
        font-size: 12px;
        line-height: 12px;
        color: #333;
        white-space: nowrap;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        user-select: text;
      }
    }
  }
}

@keyframes member-loading-spin {
  to {
    transform: rotate(360deg);
  }
}


.member-identity {
  display: inline-block;
  max-width: 100%;
  font-size: 12px;
  color: #fff;
  padding: 2px 6px;
  border-radius: 99px;
  background: #fb9203;
  margin-top: 6px;
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-master {
  background: #3369fe;
}

.primaryBtn {
  color: #fff;
  background-color: #3369fe;
  text-align: center;
  border: 1px solid #3369fe;
  cursor: pointer;
  padding: 0 28px;
  display: inline-block;
  height: 32px;
  line-height: 32px;
  font-size: 12px;
  border-radius: 4px;

  &.small {
    margin-top: 0;
  }

  &:hover {
    background-color: rgba(51, 105, 254, 0.9);
  }
}

.empty-hint {
  padding: 80px 40px;
  text-align: center;
  color: #999;
  font-size: 14px;
}
</style>
