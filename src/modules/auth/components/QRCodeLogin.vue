<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import defaultLogo from '@/assets/images/logo/logo.png'

const { t } = useI18n()

const props = defineProps<{
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'login-success', data: { sessionUrl: string; wsUrl: string; aesKey: string; installCode: string }): void
  (e: 'show-network'): void
  (e: 'show-import'): void
}>()

const qrCodeUrl = ref('')
const loginToken = ref('')
const officialUrl = ref('55chat.com')
const isOutTime = ref(false)
const qrCodeUrlError = ref(false)
const isLoading = ref(false)
const lastLoginInfo = ref<{ icon?: string; name?: string }>({})

const avatarSrc = computed(() => lastLoginInfo.value.icon || defaultLogo)
</script>

<template>
  <div class="comEcode">
    <div class="lastBox">
      <img
        :src="avatarSrc"
        @click="emit('show-network')"
      />
      <div v-if="lastLoginInfo.name">{{ lastLoginInfo.name }}</div>
    </div>
    <section>
      <div class="ecode-placeholder">
        <span v-if="isLoading">{{ t('加载中') }}...</span>
        <span v-else-if="qrCodeUrlError">{{ t('登录二维码获取失败!') }}</span>
      </div>
    </section>
    <p>{{ t('使用手机版扫描二维码登录') }}</p>
    <a :href="`https://${officialUrl}`" target="_blank">{{ officialUrl }}</a>
    <button class="primaryBtn" @click="emit('show-import')">
      {{ t('载入账户设置') }}
    </button>
  </div>
</template>

<style lang="scss" scoped>
.comEcode {
  position: relative;
  text-align: center;
  margin-top: 40px;

  a {
    position: relative;
    z-index: 1;
  }

  > a {
    font-size: 16px;
    font-weight: 600;
    color: #3369fe;
    display: block;
    line-height: 25px;
    margin-bottom: 5px;
  }

  > section {
    position: relative;

    .ecode-placeholder {
      width: 160px;
      height: 160px;
      margin: 0 auto;
      border: 1px solid #e8e8e8;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      font-size: 13px;
    }
  }

  > .lastBox {
    margin-bottom: 10px;

    > img {
      display: block;
      margin: 0 auto;
      width: 60px;
      height: 60px;
      border-radius: 100%;
      cursor: pointer;
    }

    > div {
      margin-top: 3px;
    }
  }

  > p {
    margin: 5px 0;
    font-size: 14px;
    color: #999;
    padding: 0 20px;
  }

  > .primaryBtn {
    margin-top: 5px;
    padding: 6px 16px;
    background: none;
    border: 1px solid #3369fe;
    border-radius: 4px;
    color: #3369fe;
    font-size: 13px;
    cursor: pointer;

    &:hover {
      background: rgba(51, 105, 254, 0.05);
    }
  }
}
</style>
