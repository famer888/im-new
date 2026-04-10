<template>
  <div ref="accountDialogRef" class="account-dialog" @click.stop>
    <div class="dialog-head">
      <TextAvatar
        :name="displayName"
        :src="authStore.avatar || undefined"
        :size="55"
        rounded
      />
      <h2 class="dialog-title ellipsis">{{ displayName }}</h2>
    </div>

    <p
      :class="['dialog-row', 'nickname-row', { editing: isNicknameEditing }]"
      @mousedown="handleNicknameRowMouseDown"
    >
      <span>{{ $t('昵称') }}:</span>
      <input
        v-if="isNicknameEditing"
        ref="nicknameInputRef"
        v-model.trim="nicknameDraft"
        class="nickname-input"
        type="text"
        :placeholder="$t('请输入内容')"
        @blur="handleNicknameSave"
        @keydown.enter.prevent="handleNicknameSave"
        @keydown.esc.prevent="handleNicknameCancel"
      />
      <i v-else class="ellipsis nickname-text">{{ authStore.nickname || '-' }}</i>
      <button
        v-if="!isNicknameEditing"
        class="edit-btn"
        type="button"
        :aria-label="$t('编辑昵称')"
        @mousedown.stop.prevent="handleNicknameEdit"
      >
        <img :src="editIcon" alt="" />
      </button>
    </p>
    <p class="dialog-row">
      <span>{{ $t('性别') }}:</span>
      <i>{{ $t('保密') }}</i>
    </p>

    <div class="export-db">
      <input
        v-model="password"
        type="password"
        maxlength="4"
        :placeholder="$t('请输入导出密码')"
      />
      <button
        :class="{ disable: password.length !== 4 }"
        @click.stop="handleExport"
      >
        {{ $t('导出保存本地') }}
      </button>
      <div class="tips">
        <span>!</span>
        <div class="tips-pop">
          <p>1.{{ $t('导出密码用于载入使用，如不符则档案无法导入成功') }}</p>
          <p>2.{{ $t('密码为4位数字') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TextAvatar from '@/components/TextAvatar.vue'
import { useAuthStore } from '@/stores/useAuthStore'

const { t: $t } = useI18n()
const authStore = useAuthStore()

defineEmits<{
  (e: 'close'): void
}>()

const password = ref('')
const isNicknameEditing = ref(false)
const nicknameDraft = ref('')
const nicknameInputRef = ref<HTMLInputElement | null>(null)
const accountDialogRef = ref<HTMLElement | null>(null)
const editIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwBAMAAAClLOS0AAAAJFBMVEUAAAAyMjIzMzMyMjIzMzMzMzMyMjIzMzMxMTE0NDQ1NTUzMzM8TXAkAAAAC3RSTlMAf5xb79mZc0M7Ikz8ah8AAAC7SURBVDjL1ZQxCsJAEAAXD4vYWduktwlYprexsbW38wOCD7CwsbH3CxpRYT8nWYOzYQVBEMw0R26Yg5DbyK+ZNOt2+KKon3tqixwUqnpj/BSZemHB2YK+Tt1RFuQmdpejAIFsrgIukNEpBogYIAgQQIAgQAABgiAViFZQVggCdhBNEEWy4K3Ig+CTBmF0RSTuT1uU3LgPIh71Ty8YBWMAqxuD4xnM7oyaZ6lzE5kG9sI4exbCD8Czlq94AETJjYyDbpR3AAAAAElFTkSuQmCC'

const displayName = computed(() => authStore.nickname || authStore.uid || 'User')

function handleExport() {
  if (password.value.length !== 4) return
}

function handleNicknameEdit() {
  if (isNicknameEditing.value) return
  nicknameDraft.value = authStore.nickname || ''
  isNicknameEditing.value = true
  nextTick(() => {
    nicknameInputRef.value?.focus()
    nicknameInputRef.value?.select()
  })
}

function handleNicknameRowMouseDown(event: MouseEvent) {
  if (isNicknameEditing.value) {
    return
  }

  event.preventDefault()
  handleNicknameEdit()
}

function handleDocumentMouseDown(event: MouseEvent) {
  if (!isNicknameEditing.value) return

  const target = event.target as Node | null
  if (nicknameInputRef.value?.contains(target)) return
  if (accountDialogRef.value && target && accountDialogRef.value.contains(target)) {
    handleNicknameSave()
  }
}

function handleNicknameCancel() {
  nicknameDraft.value = authStore.nickname || ''
  isNicknameEditing.value = false
}

function handleNicknameSave() {
  const nextName = nicknameDraft.value.trim()
  if (!nextName) {
    nicknameDraft.value = authStore.nickname || ''
    isNicknameEditing.value = false
    return
  }

  if (nextName !== authStore.nickname) {
    authStore.updateProfile({ nickname: nextName })
  }

  isNicknameEditing.value = false
}

onMounted(() => {
  window.addEventListener('mousedown', handleDocumentMouseDown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleDocumentMouseDown, true)
})
</script>

<style lang="scss" scoped>
.account-dialog {
  width: 350px;
  min-height: 265px;
  padding: 40px;
  box-sizing: border-box;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
  text-align: left;
}

.dialog-head {
  display: flex;
  align-items: center;
  height: 76px;
  margin-bottom: 10px;
  border-bottom: 1px solid #eee;
}

.dialog-title {
  width: 205px;
  height: 55px;
  margin: 0 0 0 10px;
  line-height: 55px;
  font-size: 16px;
  color: #333;
  font-weight: 400;
}

.dialog-row {
  display: flex;
  align-items: center;
  height: 30px;
  line-height: 30px;
  margin: 0;
  color: #333;
  font-size: 14px;

  > span {
    width: 37px;
    margin-right: 5px;
    color: #666;
    flex-shrink: 0;
  }

  > i {
    font-style: normal;
    max-width: 220px;
  }
}

.nickname-row {
  cursor: pointer;
  user-select: none;

  &.editing {
    cursor: text;
    user-select: text;
  }
}

.nickname-text {
  max-width: 200px;
}

.nickname-input {
  width: 200px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: #333;
}

.edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  margin-left: 5px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }

  > img {
    display: block;
    width: 15px;
    height: 15px;
  }
}

.export-db {
  display: flex;
  align-items: center;
  height: 20px;
  margin-top: 10px;

  > input {
    width: 110px;
    height: 22px;
    box-sizing: border-box;
    margin-right: 10px;
    padding: 0 10px;
    border: 1px solid #3369fe;
    border-radius: 4px;
    text-align: center;
    outline: none;

    &::placeholder {
      font-size: 12px;
      color: #999;
    }
  }

  > button {
    height: 22px;
    padding: 0 13px;
    border: 0;
    border-radius: 4px;
    background: #3369fe;
    color: #fff;
    font-size: 12px;
    line-height: 22px;
    cursor: pointer;

    &.disable {
      opacity: 0.5;
      cursor: default;
    }
  }
}

.tips {
  position: relative;
  width: 16px;
  height: 16px;
  margin-left: 5px;
  border: 1px solid #3369fe;
  border-radius: 50%;
  line-height: 16px;
  text-align: center;
  cursor: pointer;

  &:hover .tips-pop {
    display: block;
  }

  > span {
    display: block;
    color: #3369fe;
    font-size: 12px;
  }
}

.tips-pop {
  position: absolute;
  left: 0;
  bottom: 22px;
  display: none;
  padding: 10px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  box-shadow: 0 2px 2px 0 rgba(0, 0, 0, 0.14), 0 3px 1px -2px rgba(0, 0, 0, 0.2), 0 1px 5px 0 rgba(0, 0, 0, 0.12);
  background: #fff;
  line-height: 20px;
  text-align: left;

  > p {
    margin: 0;
    white-space: nowrap;
    color: #3369fe;
    font-size: 12px;
  }
}
</style>
