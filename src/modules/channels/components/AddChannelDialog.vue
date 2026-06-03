<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/useUIStore'
import { useChatStore } from '@/stores/useChatStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { subscribeChannel } from '@/api/imChannel'
import { ConversationType } from '@/types'
import TextAvatar from '@/components/TextAvatar.vue'

const props = withDefaults(defineProps<{
  visible?: boolean
}>(), {
  visible: true,
})

const emit = defineEmits<{
  close: []
}>()

const uiStore = useUIStore()
const chatStore = useChatStore()
const channelStore = useChannelStore()
const { t } = useI18n()

const joining = ref(false)
const tipText = ref('')
const tipType = ref<'success' | 'error'>('success')

const target = computed(() => uiStore.addChannelTarget)
const displayName = computed(() => target.value?.channelName || target.value?.name || target.value?.id || '')
const memberCount = computed(() => Number(target.value?.memberCount || 0))
const subscriberText = computed(() => t('订阅者数量', { count: memberCount.value }))
const remark = computed(() => target.value?.remark || '')
const remarkRef = ref<HTMLElement | null>(null)
const remarkExpanded = ref(false)
const showRemarkMore = ref(false)
const joinedChannel = computed(() => {
  const id = target.value?.id || target.value?.channelId || ''
  return id ? channelStore.getChannel(id) : undefined
})
const targetMemberType = computed(() => Number(target.value?.memberType || 0))
const joinedChannelMemberType = computed(() => Number(joinedChannel.value?.memberType || 0))
function hasExplicitNonMember(channel: { memberType?: number | null } | null | undefined): boolean {
  return channel?.memberType !== undefined && channel?.memberType !== null && Number(channel.memberType) <= 0
}
const canEnterChannel = computed(() => {
  // 本地可能残留 memberType=0 的频道资料；明确未加入时不能当成已加入频道。
  if (hasExplicitNonMember(target.value) || hasExplicitNonMember(joinedChannel.value)) return false
  return targetMemberType.value > 0 || joinedChannelMemberType.value > 0 || Boolean(joinedChannel.value)
})
const buttonText = computed(() => {
  if (canEnterChannel.value) return t('进入频道')
  if (joining.value) return t('加入中...')
  return t('加入频道')
})
const joinDisabled = computed(() => !target.value || joining.value)

watch(target, () => {
  joining.value = false
  tipText.value = ''
  tipType.value = 'success'
  remarkExpanded.value = false
  void nextTick(checkRemarkOverflow)
})

function closeDialog() {
  emit('close')
}

async function checkRemarkOverflow() {
  await nextTick()
  const el = remarkRef.value
  if (!el) {
    showRemarkMore.value = false
    return
  }
  // 以 5 行高度作为折叠阈值，只有超出时才显示“更多”。
  const collapsedHeight = 18 * 5
  showRemarkMore.value = el.scrollHeight > collapsedHeight + 1
}

function expandRemark() {
  remarkExpanded.value = true
  showRemarkMore.value = false
}

function upsertAndOpenChannel(joined = false) {
  const current = target.value
  const id = current?.id || current?.channelId || ''
  if (!current || !id) return

  channelStore.patchChannel(id, {
    ...current,
    id,
    channelId: id,
    name: current.channelName || current.name || id,
    channelName: current.channelName || current.name || id,
    avatar: current.avatar || current.icon || null,
    icon: current.icon || current.avatar || null,
    memberType: joined ? 3 : (targetMemberType.value > 0 ? current.memberType : joinedChannel.value?.memberType ?? 1),
    updatedAt: Date.now(),
  }, { allowRemoved: true })
  // 加入后可能拿到更高权限，强刷一次详情；仍保持非阻塞，避免“进入频道”按钮延迟。
  void channelStore.ensureChannelDetailReady(id, { force: joined })

  const conv = chatStore.ensureConversation(ConversationType.Channel, id)
  chatStore.setCurrentConversation(conv.id)
  uiStore.setSidebarTab('chats')
  uiStore.setRightPanel('none')
  uiStore.setDetailView('chat')
  closeDialog()
}

function showTip(message: string, type: 'success' | 'error') {
  tipText.value = message
  tipType.value = type
}

async function handleJoinChannel() {
  const current = target.value
  if (!current || joinDisabled.value) return

  if (canEnterChannel.value) {
    upsertAndOpenChannel()
    return
  }

  joining.value = true
  tipText.value = ''
  try {
    const resp = await subscribeChannel({
      channelId: current.channelId || current.id,
      link: current.link,
    })
    const code = Number(resp?.code ?? 0)
    if (code !== 200 && code !== 0) {
      showTip(resp?.msg || t('加入频道失败'), 'error')
      return
    }

    showTip(resp?.msg || t('加入频道成功'), 'success')
    upsertAndOpenChannel(true)
  } catch (error) {
    console.error('[AddChannelDialog] join failed:', error)
    showTip(t('加入频道失败'), 'error')
  } finally {
    joining.value = false
  }
}

function handleWindowResize() {
  if (!props.visible || !remark.value || remarkExpanded.value) return
  void checkRemarkOverflow()
}

watch(() => props.visible, (visible) => {
  if (!visible) return
  remarkExpanded.value = false
  void checkRemarkOverflow()
})

watch(remark, () => {
  remarkExpanded.value = false
  void checkRemarkOverflow()
})

onMounted(() => {
  window.addEventListener('resize', handleWindowResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
})
</script>

<template>
  <div v-if="visible" class="add-channel-dialog" @click.self="closeDialog">
    <div class="dialog-card">
      <div v-if="target" class="dialog-inner">
        <TextAvatar
          class="channel-avatar"
          :id="target.channelId || target.id"
          :name="displayName"
          :src="target.avatar || target.icon"
          :color="target.logoColor || undefined"
          :size="80"
          avatar-type="channel"
          rounded
        />
        <div class="channel-name">{{ displayName }}</div>
        <div class="subscriber-count">{{ subscriberText }}</div>
        <div v-if="remark" class="channel-remark-wrap">
          <p
            ref="remarkRef"
            class="channel-remark"
            :class="{ 'is-expanded': remarkExpanded }"
          >
            {{ remark }}
          </p>
          <button
            v-if="showRemarkMore"
            type="button"
            class="remark-more-btn"
            @click="expandRemark"
          >
            {{ t('更多') }}
          </button>
        </div>
        <div class="button-row">
          <button type="button" class="cancel-btn" @click="closeDialog">{{ t('取消') }}</button>
          <button type="button" class="join-btn" :disabled="joinDisabled" @click="handleJoinChannel">
            {{ buttonText }}
          </button>
        </div>
        <div v-if="tipText" class="join-tip" :class="`tip-${tipType}`">{{ tipText }}</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.add-channel-dialog {
  position: fixed;
  inset: 0;
  z-index: 2200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

.dialog-card {
  position: relative;
  width: min(300px, calc(100vw - 40px));
  box-sizing: border-box;
  border-radius: 8px;
  background: #fff;
}

.dialog-inner {
  padding: 26px 20px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}

.channel-avatar {
  :deep(.avatar-text) {
    font-size: 24px;
  }
}

.channel-name {
  max-width: 260px;
  margin-top: 10px;
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscriber-count {
  margin-top: 6px;
  color: #666;
  font-size: 12px;
  line-height: 18px;
}

.channel-remark-wrap {
  width: 100%;
  margin: 10px 0 0;
  position: relative;
}

.channel-remark {
  color: rgba(45, 45, 45);
  font-size: 14px;
  line-height: 18px;
  font-weight: 900;
  text-align: left;
  max-height: 90px;
  overflow-y: auto;
  word-break: break-all;

  &.is-expanded {
    max-height: none;
    overflow-y: visible;
  }
}

.remark-more-btn {
  margin-top: 6px;
  margin-left: auto;
  padding: 2px 8px;
  display: block;
  border: none;
  border-radius: 10px;
  background: #e6f2ff;
  color: #178aff;
  font-size: 12px;
  line-height: 18px;
  font-weight: 700;
  cursor: pointer;
}

.button-row {
  width: 100%;
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.cancel-btn,
.join-btn {
  flex: 1;
  height: 40px;
  border: 0;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.cancel-btn {
  background: #9197ad;
  color: #fff;
}

.join-btn {
  background: #178aff;
  color: #fff;

  &:disabled {
    opacity: 0.65;
    cursor: default;
  }
}

.join-tip {
  max-width: 260px;
  margin-top: 10px;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}

.tip-success {
  color: #52c41a;
}

.tip-error {
  color: #f56c6c;
}

</style>
