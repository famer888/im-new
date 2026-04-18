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
/* 仅调整外层卡片尺寸：略加宽，避免英文「导出」一行与密码框挤在一起；内部行布局不变 */
.account-dialog {
  --dialog-pad: clamp(1rem, 5vw, 2.5rem);
  box-sizing: border-box;
  width: min(100vw - 1rem, 28rem);
  max-width: 100%;
  min-height: 16.5rem;
  padding: var(--dialog-pad);
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
  text-align: left;
}

.dialog-head {
  display: flex;
  align-items: center;
  min-height: 4.75rem;
  margin: 0 calc(-1 * var(--dialog-pad)) 0.625rem;
  padding: 0 var(--dialog-pad) 0.625rem;
  border-bottom: 1px solid #eee;
  box-sizing: border-box;
}

.dialog-title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0 0 0 0.625rem;
  line-height: 1.35;
  font-size: 16px;
  color: #333;
  font-weight: 400;
}

.dialog-row {
  display: flex;
  align-items: center;
  gap: 0.375rem 0.625rem;
  min-height: 1.875rem;
  line-height: 1.4;
  margin: 0 0 0.625rem;
  color: #333;
  font-size: 14px;

  > span {
    flex: 0 0 auto;
    color: #666;
    white-space: nowrap;
  }

  > i {
    font-style: normal;
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
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
  flex: 1;
  min-width: 0;
  max-width: none;
}

.nickname-input {
  flex: 1 1 auto;
  min-width: 0;
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
  flex: 0 0 auto;
  width: 0.9375rem;
  height: 0.9375rem;
  margin-left: 0.125rem;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }

  > img {
    display: block;
    width: 0.9375rem;
    height: 0.9375rem;
  }
}

.export-db {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.625rem;
  min-height: 1.75rem;
  margin-top: 0.875rem;

  > input {
    flex: 1 1 7em;
    min-width: 6em;
    max-width: 100%;
    height: 1.375rem;
    box-sizing: border-box;
    padding: 0 0.625rem;
    border: 1px solid #3369fe;
    border-radius: 4px;
    text-align: center;
    outline: none;

    &::placeholder {
      font-size: 0.75rem;
      color: #999;
    }
  }

  > button {
    flex: 0 1 auto;
    min-height: 1.375rem;
    height: auto;
    padding: 0.25rem 0.75rem;
    border: 0;
    border-radius: 4px;
    background: #3369fe;
    color: #fff;
    font-size: 0.75rem;
    line-height: 1.35;
    cursor: pointer;
    white-space: normal;
    text-align: center;

    &.disable {
      opacity: 0.5;
      cursor: default;
    }
  }
}

.tips {
  position: relative;
  flex: 0 0 auto;
  width: 1rem;
  height: 1rem;
  margin-left: 0.125rem;
  border: 1px solid #3369fe;
  border-radius: 50%;
  line-height: 1rem;
  text-align: center;
  cursor: pointer;

  &:hover .tips-pop {
    display: block;
  }

  > span {
    display: block;
    color: #3369fe;
    font-size: 0.75rem;
  }
}

.tips-pop {
  position: absolute;
  left: 0;
  bottom: 1.375rem;
  display: none;
  padding: 0.625rem;
  border: 1px solid rgba(0, 0, 0, 0.15);
  box-shadow: 0 2px 2px 0 rgba(0, 0, 0, 0.14), 0 3px 1px -2px rgba(0, 0, 0, 0.2), 0 1px 5px 0 rgba(0, 0, 0, 0.12);
  background: #fff;
  line-height: 1.25;
  text-align: left;

  > p {
    margin: 0;
    max-width: min(90vw, 20rem);
    color: #3369fe;
    font-size: 0.75rem;
  }
}
</style>
