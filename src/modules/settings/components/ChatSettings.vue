<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingStore } from '@/stores/useSettingStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore'
import { useMessageStore } from '@/stores/useMessageStore'
import AppSwitch from '@/components/AppSwitch.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { t: $t } = useI18n()
const settingStore = useSettingStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const messageStore = useMessageStore()

const sendShortcutKeyList = ['Enter', 'Ctrl+Enter'] as const
const screenshotShortcutText = computed(() => (
  navigator.platform.toLowerCase().includes('mac') ? 'control + shift + a' : 'ctrl + shift + a'
))
const sendShortcutKeyIndex = computed(() => {
  const i = sendShortcutKeyList.indexOf(
    settingStore.settings.sendShortcutKey as (typeof sendShortcutKeyList)[number],
  )
  return i >= 0 ? i : 0
})

const clearConfirmVisible = ref(false)

onMounted(() => {
  if (!settingStore.loaded) void settingStore.loadSettings()
})

async function onKeepHistoryChange(v: boolean) {
  await settingStore.updateSettings({ keepHistoryOnLogout: v })
}

async function setSendShortcut(index: number) {
  const key = sendShortcutKeyList[index]
  await settingStore.updateSettings({ sendShortcutKey: key })
}

function openClearConfirm() {
  clearConfirmVisible.value = true
}

async function confirmClearAll() {
  const uid = authStore.uid
  if (uid) {
    await chatStore.clearAllLocalChatHistory(uid)
  }
  messageStore.clearAllMessageCaches()
  clearConfirmVisible.value = false
}
</script>

<template>
  <div class="com-setting-dialog-chat">
    <h3>{{ $t('聊天') }}</h3>
    <dl>
      <dt>{{ $t('账户退出，保留聊天记录') }}</dt>
      <dd>
        <AppSwitch
          :model-value="settingStore.settings.keepHistoryOnLogout"
          @update:model-value="onKeepHistoryChange"
        />
      </dd>
    </dl>

    <h3>{{ $t('快捷键') }}</h3>
    <dl>
      <dt>{{ $t('发送') }}</dt>
      <dd>
        <div class="select">
          <span>{{ sendShortcutKeyList[sendShortcutKeyIndex] }}</span>
          <span class="choice-caret" aria-hidden="true" />
          <ul>
            <li
              v-for="(item, index) in sendShortcutKeyList"
              :key="item"
              @click="setSendShortcut(index)"
            >
              {{ item }}
            </li>
          </ul>
        </div>
      </dd>
    </dl>
    <dl>
      <dt>{{ $t('截屏') }}</dt>
      <dd>
        <div class="bg">
          <span>{{ screenshotShortcutText }}</span>
        </div>
      </dd>
    </dl>
    <dl class="row-clear">
      <dt />
      <dd>
        <button type="button" @click="openClearConfirm">
          {{ $t('清空全部聊天记录') }}
        </button>
      </dd>
    </dl>

    <ConfirmDialog
      v-model:visible="clearConfirmVisible"
      variant="im"
      :content="$t('删除聊天后，将同时删除记录。包括聊天中的文件、图片、视频等内容')"
      @confirm="confirmClearAll"
    />
  </div>
</template>

<style lang="scss" scoped>
.com-setting-dialog-chat {
  > h3 {
    line-height: 40px;
    margin: 0;
    color: #999;
    font-size: 14px;
    font-weight: 400;
  }

  > dl {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 10px;

    > dt {
      font-size: 14px;
      color: #333;
    }

    > dd {
      margin: 0;
    }
  }

  .row-clear {
    margin-top: 4px;
    margin-bottom: 0;

    > dt {
      flex: 0 0 0;
      width: 0;
      padding: 0;
      overflow: hidden;
    }

    > dd {
      flex: 1;
      display: flex;
      justify-content: flex-end;
    }

    button {
      padding: 0 12px;
      height: 32px;
      line-height: 32px;
      font-size: 12px;
      border-radius: 4px;
      border: 1px solid #3369fe;
      color: #fff;
      background-color: #3369fe;
      cursor: pointer;

      &:hover {
        opacity: 0.8;
      }
    }
  }

  .bg,
  .select {
    padding: 5px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 150px;
    background: #f5f5f5;
    border-radius: 4px;
    position: relative;
    box-sizing: border-box;

    > span:first-of-type {
      font-size: 14px;
      color: #333;
    }
  }

  .choice-caret {
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 5px solid #999;
    flex-shrink: 0;
    margin-left: 8px;
  }

  .select {
    cursor: pointer;

    &:hover > ul {
      display: block;
    }

    > ul {
      position: absolute;
      top: 28px;
      left: 0;
      background: #fff;
      z-index: 10;
      margin: 0;
      width: 150px;
      padding: 0;
      list-style: none;
      box-shadow: 0 20px 60px -2px rgb(27 33 58 / 40%);
      border-radius: 3px;
      display: none;

      > li {
        line-height: 30px;
        padding-left: 10px;
        font-size: 12px;
        cursor: pointer;
        border-bottom: 1px solid #eee;

        &:hover {
          opacity: 0.8;
        }

        &:last-child {
          border-bottom: none;
        }
      }
    }
  }
}
</style>
