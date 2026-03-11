<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import QrcodeVue from 'qrcode.vue'
import defaultLogo from '@/assets/images/logo/logo.png'
import freshIcon from '@/assets/images/login/fresh-icon.png'
import { getQrCodeUrl, getIsLogin } from '@/api/imBase'
import { getBaseUrl } from '@/api/config'
import { getDeviceConfig } from '@/api/request'
import { useAuthStore } from '@/stores/useAuthStore'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const emit = defineEmits<{
  (e: 'login-success', data: {
    sessionUrl: string; wsUrl: string; aesKey: string; installCode: string
    uid?: string; nickname?: string; avatar?: string; sessionId?: string
  }): void
  (e: 'show-network'): void
  (e: 'show-import'): void
}>()

const loginToken = ref('')
const officialUrl = ref('55chat.com')
const isOutTime = ref(false)
const qrCodeUrlError = ref(false)
const isLoading = ref(false)
const lastLoginInfo = ref<{ icon?: string; name?: string }>({})

const domainList = ref<string[]>([getBaseUrl()])
const urlIndex = ref(0)

let timerOutTimer: ReturnType<typeof setTimeout> | null = null
let loginPollingTimer: ReturnType<typeof setTimeout> | null = null

const avatarSrc = computed(() => lastLoginInfo.value.icon || defaultLogo)

const qrCodeValue = computed(() => {
  if (!loginToken.value) return ''
  return `${officialUrl.value}?token=${loginToken.value}&imQrCodeType=2`
})

const currentBaseUrl = computed(() => {
  if (!domainList.value.length) return getBaseUrl()
  const index = Math.max(0, Math.min(urlIndex.value, domainList.value.length - 1))
  return domainList.value[index] || getBaseUrl()
})

const showOverlay = computed(() => qrCodeUrlError.value || isOutTime.value || isLoading.value)

function loadLastLoginInfo() {
  try {
    const stored = localStorage.getItem('login-account-list')
    if (stored) {
      const list = JSON.parse(stored)
      if (Array.isArray(list) && list.length > 0) {
        lastLoginInfo.value = list[list.length - 1]
      }
    }
  } catch { /* ignore */ }
}

async function handleGetQrCodeUrl() {
  isLoading.value = true
  qrCodeUrlError.value = false

  try {
    const res = await getQrCodeUrl(currentBaseUrl.value)
    isLoading.value = false

    const errCode = res?.commonResult?.errCode
    if (errCode && errCode !== 200) {
      console.error('[QRCode] Server error:', res.commonResult?.errMsg)
      qrCodeUrlError.value = true
      return
    }

    if (res?.token) {
      loginToken.value = res.token
      if (res.officialUrl) {
        officialUrl.value = res.officialUrl
      }

      timerOutTimer = setTimeout(() => {
        isOutTime.value = true
      }, 20000)

      loginPollingTimer = setTimeout(() => {
        handleIsLoginGet()
      }, 1500)
    } else {
      qrCodeUrlError.value = true
    }
  } catch (err) {
    console.error('[QRCode] Failed to get QR code URL:', err)
    isLoading.value = false
    qrCodeUrlError.value = true

    if (domainList.value.length > 1) {
      urlIndex.value++
    }
  }
}

function handleReGetQrCodeUrl() {
  if (!qrCodeUrlError.value && !isOutTime.value) return

  qrCodeUrlError.value = false
  isOutTime.value = false
  isLoading.value = true

  clearTimers()
  setTimeout(() => {
    handleGetQrCodeUrl()
  }, 1500)
}

async function handleIsLoginGet() {
  const device = getDeviceConfig()

  try {
    const res = await getIsLogin({
      token: loginToken.value,
      sysMac: device.sysMac,
      sysModel: device.sysModel,
    }, currentBaseUrl.value)

    if (res && res.uid && Number(res.uid) > 0) {
      const loginId = String(res.uid)

      authStore.addOrUpdateAccount({
        id: loginId,
        name: res.nickName || '',
        icon: res.icon || undefined,
        sessionId: res.sessionId || undefined,
      })

      emit('login-success', {
        sessionUrl: currentBaseUrl.value,
        wsUrl: res.urls?.session || '',
        aesKey: '',
        installCode: '',
        uid: loginId,
        nickname: res.nickName || '',
        avatar: res.icon || '',
        sessionId: res.sessionId || '',
      })

      router.push('/home?loginId=' + loginId)
    } else {
      loginPollingTimer = setTimeout(() => {
        if (isOutTime.value || qrCodeUrlError.value) return
        handleIsLoginGet()
      }, 1500)
    }
  } catch {
    loginPollingTimer = setTimeout(() => {
      if (isOutTime.value || qrCodeUrlError.value) return
      handleIsLoginGet()
    }, 1500)
  }
}

function clearTimers() {
  if (timerOutTimer) {
    clearTimeout(timerOutTimer)
    timerOutTimer = null
  }
  if (loginPollingTimer) {
    clearTimeout(loginPollingTimer)
    loginPollingTimer = null
  }
}

onMounted(() => {
  getDeviceConfig()
  loadLastLoginInfo()
  handleGetQrCodeUrl()
})

onBeforeUnmount(() => {
  clearTimers()
})
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
    <section @click="handleReGetQrCodeUrl">
      <qrcode-vue
        class="ecode"
        :value="qrCodeValue"
        level="H"
        :size="160"
      />
      <p v-if="showOverlay">
        <img
          :src="freshIcon"
          :class="{ load: isLoading }"
        />
        <span v-if="qrCodeUrlError">{{ t('登录二维码获取失败!') }}</span>
      </p>
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
    display: inline-block;

    .ecode {
      display: block;
      margin: 0 auto;
    }

    > p {
      top: 0;
      position: absolute;
      width: 100%;
      height: 100%;
      background-color: rgba(255, 255, 255, 0.9);

      img {
        position: absolute;
        left: 50%;
        top: 50%;
        margin-left: -20px;
        margin-top: -20px;
        cursor: pointer;
        transform-origin: center;
        width: 40px;
        height: 40px;

        &.load {
          animation: load 1s linear infinite;
        }
      }

      > span {
        color: #f44e5a;
        position: absolute;
        left: 50%;
        bottom: 20px;
        transform: translateX(-50%);
        white-space: nowrap;
        font-size: 12px;
      }
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

@keyframes load {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
