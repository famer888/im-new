<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/useUIStore'
import { useChatStore } from '@/stores/useChatStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { subscribeChannel } from '@/api/imChannel'
import { ConversationType } from '@/types'
import TextAvatar from '@/components/TextAvatar.vue'
import closeIcon from '@/assets/images/common/close-icon.png'

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
const remark = computed(() => target.value?.remark || '')
const joinedChannel = computed(() => {
  const id = target.value?.id || target.value?.channelId || ''
  return id ? channelStore.getChannel(id) : undefined
})
const buttonText = computed(() => {
  if (joinedChannel.value || Number(target.value?.memberType || 0)) return t('进入频道')
  if (joining.value) return t('加入中...')
  return t('加入频道')
})
const joinDisabled = computed(() => !target.value || joining.value)

watch(target, () => {
  joining.value = false
  tipText.value = ''
  tipType.value = 'success'
})

function closeDialog() {
  emit('close')
}

function upsertAndOpenChannel(joined = false) {
  const current = target.value
  const id = current?.id || current?.channelId || ''
  if (!current || !id) return
  const currentMemberType = Number(current.memberType || 0)

  channelStore.patchChannel(id, {
    ...current,
    id,
    channelId: id,
    name: current.channelName || current.name || id,
    channelName: current.channelName || current.name || id,
    avatar: current.avatar || current.icon || null,
    icon: current.icon || current.avatar || null,
    memberType: joined ? 3 : (currentMemberType > 0 ? current.memberType : joinedChannel.value?.memberType ?? 1),
    updatedAt: Date.now(),
  }, { allowRemoved: true })

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

  if (joinedChannel.value || Number(current.memberType || 0)) {
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
</script>

<template>
  <div v-if="visible" class="add-channel-dialog" @click.self="closeDialog">
    <div class="dialog-card">
      <button type="button" class="dialog-close" @click="closeDialog">
        <img :src="closeIcon" alt="" />
      </button>

      <div v-if="target" class="dialog-inner">
        <TextAvatar
          :name="displayName"
          :src="target.avatar || target.icon"
          :size="62"
          rounded
        />
        <div class="channel-name">{{ displayName }}</div>
        <div class="subscriber-count">{{ t('{value}位订阅者', { value: memberCount }) }}</div>
        <p v-if="remark" class="channel-remark">{{ remark }}</p>
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
  width: min(420px, calc(100vw - 40px));
  min-height: 264px;
  box-sizing: border-box;
  border-radius: 8px;
  background: #fff;
}

.dialog-inner {
  padding: 26px 28px 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}

.channel-name {
  max-width: 340px;
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
  margin-top: 8px;
  color: #999;
  font-size: 12px;
  line-height: 17px;
}

.channel-remark {
  width: 100%;
  max-height: 66px;
  margin: 16px 0 0;
  color: #666;
  font-size: 13px;
  line-height: 22px;
  text-align: left;
  overflow: hidden;
  word-break: break-word;
}

.button-row {
  width: 100%;
  display: flex;
  gap: 12px;
  margin-top: 28px;
}

.cancel-btn,
.join-btn {
  flex: 1;
  height: 32px;
  border: 0;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.cancel-btn {
  background: #f2f3f5;
  color: #333;
}

.join-btn {
  background: #3369fe;
  color: #fff;

  &:disabled {
    opacity: 0.65;
    cursor: default;
  }
}

.join-tip {
  max-width: 340px;
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

.dialog-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 30px;
  height: 30px;
  border: 0;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    opacity: 0.8;
  }
}
</style>
