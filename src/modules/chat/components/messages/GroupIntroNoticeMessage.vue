<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Message } from '@/stores/useMessageStore'
import noticeIcon from '@/assets/images/notice.svg'
import arrowIcon from '@/assets/images/arrow.svg'
import GroupNoticeContent from '../panels/GroupNoticeContent.vue'
import { getGroupIntroNoticePayload } from '@/utils/groupIntroNotice'

const props = defineProps<{
  message: Message
}>()

const emit = defineEmits<{
  (e: 'open'): void
}>()

const { t } = useI18n()
const noticePayload = computed(() => getGroupIntroNoticePayload(props.message))
const noticeContent = computed(() => noticePayload.value.notice)
const groupId = computed(() => noticePayload.value.groupId)
</script>

<template>
  <div
    class="group-intro-notice-message"
    role="button"
    tabindex="0"
    @click.stop="emit('open')"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <h3>
      <img :src="noticeIcon" alt="" />
      <span>{{ t('群简介') }}</span>
    </h3>
    <picture>
      <img :src="arrowIcon" alt="" />
    </picture>
    <GroupNoticeContent
      class="intro-content"
      :content="noticeContent"
      :group-id="groupId"
    />
  </div>
</template>

<style scoped lang="scss">
.group-intro-notice-message {
  background: #fffbd8;
  max-width: 450px;
  min-width: min(300px, calc(100vw - 160px));
  border-radius: 10px;
  border-top-right-radius: 0;
  padding: 10px 85px 24px 12px;
  border: #fae8c6 solid 1px;
  word-wrap: break-word;
  position: relative;
  cursor: pointer;
  box-sizing: border-box;

  &:hover {
    opacity: 0.8;
  }

  > h3 {
    font-size: 14px;
    margin: 0;
    color: #178aff;
    height: 25px;
    font-weight: bold;
    display: flex;
    align-items: center;

    > img {
      display: block;
      height: 18px;
      margin-right: 5px;
    }

    > span {
      color: #178aff;
    }
  }

  > picture {
    position: absolute;
    right: 2px;
    top: 10px;
    height: 25px;
    width: 25px;
    display: flex;
    align-items: center;
    justify-content: center;

    > img {
      display: block;
      height: 22px;
    }
  }

  .intro-content {
    margin: 0;
    line-height: 22px;
    font-size: 14px;
    color: rgba(53, 53, 52);

    :deep(.notice-mention),
    :deep(.notice-link) {
      color: #3369fe;
      cursor: pointer;
    }
  }
}
</style>
