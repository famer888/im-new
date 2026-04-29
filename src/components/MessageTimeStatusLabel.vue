<script setup lang="ts">
/**
 * 自旧 im `chat-msg-list/msg/time-status-label.vue` 迁移：
 * 气泡右下角：时间 +（己方）发送中/失败/已送达/已读图标。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Message } from '@/stores/useMessageStore'
import { useMessageStore } from '@/stores/useMessageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { MessageStatus } from '@/types/message'
import { formatTimeStamp } from '@/utils/formatTimeStamp'
import ComLoading from '@/components/ComLoading.vue'
import hasSendUrl from '@/assets/images/message/has-send.png'
import hasReadUrl from '@/assets/images/message/has-read.png'

const props = defineProps<{
  message: Message
  /** 是否己方消息（仅己方展示状态图标，与旧版 msgInfo.isSelf 一致） */
  isSelf: boolean
}>()

const { t, locale } = useI18n()
const authStore = useAuthStore()
const messageStore = useMessageStore()

const timeText = computed(() => {
  void locale.value
  return formatTimeStamp(props.message.sendTime, locale.value, t)
})

const showLoading = computed(
  () => props.isSelf && props.message.status === MessageStatus.Sending,
)

const showFailed = computed(
  () => props.isSelf && props.message.status === MessageStatus.Failed,
)

/** 对齐旧 im：readStatus 1=发送成功，2=已读。 */
const isRead = computed(
  () =>
    props.isSelf &&
    (props.message.readStatus === 2 || props.message.status === MessageStatus.Read),
)

/** 已送达（单勾）：已发送且未显示已读 */
const isSentOnly = computed(
  () =>
    props.isSelf &&
    !showLoading.value &&
    !showFailed.value &&
    !isRead.value &&
    (props.message.readStatus === 1 ||
      props.message.status === MessageStatus.Sent ||
      props.message.status === MessageStatus.Delivered),
)

async function handleResend() {
  if (!showFailed.value || !authStore.uid) return
  try {
    await messageStore.resendMessage(authStore.uid, props.message)
  } catch (err) {
    console.warn('[msg] resend failed:', err)
  }
}
</script>

<template>
  <div class="com-time-status-label">
    <span class="time-text">{{ timeText }}</span>
    <ComLoading v-if="showLoading" />
    <div v-else-if="isSelf" class="tips">
      <i v-if="showFailed" role="button" tabindex="0" @click.stop="handleResend" @keydown.enter.prevent="handleResend" @keydown.space.prevent="handleResend">!</i>
      <img v-else-if="isRead" class="tip-icon" :src="hasReadUrl" alt="" />
      <img v-else-if="isSentOnly" class="tip-icon" :src="hasSendUrl" alt="" />
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 自旧 im `time-status-label.vue` 样式 */
.com-time-status-label {
  position: absolute;
  right: 8px;
  bottom: 0;
  display: flex;
  align-items: center;
  z-index: 1;

  .time-text {
    font-size: 12px;
    color: #666;
    white-space: nowrap;
  }

  .tips {
    display: flex;
    width: 16px;
    align-items: center;
    margin-left: 6px;

    .tip-icon {
      height: 16px;
    }

    > i {
      color: red;
      font-family: cursive;
      font-style: normal;
      width: 16px;
      height: 16px;
      line-height: 16px;
      text-align: center;
      cursor: pointer;

      &:hover {
        opacity: 0.8;
      }
    }
  }
}
</style>
