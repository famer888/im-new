<template>
  <div class="account-dialog" @click.stop>
    <div class="dialog-head">
      <TextAvatar
        :name="displayName"
        :src="authStore.avatar || undefined"
        :size="55"
        rounded
      />
      <h2 class="dialog-title ellipsis">{{ displayName }}</h2>
    </div>

    <p class="dialog-row">
      <span>{{ $t('昵称') }}:</span>
      <i class="ellipsis">{{ authStore.nickname || '-' }}</i>
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
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TextAvatar from '@/components/TextAvatar.vue'
import { useAuthStore } from '@/stores/useAuthStore'

const { t: $t } = useI18n()
const authStore = useAuthStore()

defineEmits<{
  (e: 'close'): void
}>()

const password = ref('')

const displayName = computed(() => authStore.nickname || authStore.uid || 'User')

function handleExport() {
  if (password.value.length !== 4) return
}
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
