<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import QrcodeVue from 'qrcode.vue'
import defaultLogo from '@/assets/images/logo/logo.png'
import freshIcon from '@/assets/images/login/fresh-icon.png'
import { getQrCodeUrl, getIsLogin } from '@/api/imBase'
import { API_CONFIG, getBaseUrl } from '@/api/config'
import { getDeviceConfig } from '@/api/request'
import { getAllDomains } from '@/utils/domainPool'

const props = defineProps<{
  loading?: boolean
  extraDomains?: string[]
}>()

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'login-success', data: {
    sessionUrl: string; wsUrl: string; aesKey: string; installCode: string
    uid?: string; nickname?: string; avatar?: string; sessionId?: string
  }): void
  (e: 'show-network'): void
  (e: 'show-import'): void
}>()

const loginToken = ref('')
const officialUrl = ref('97chat.com')
const isOutTime = ref(false)
const qrCodeUrlError = ref(false)
const isLoading = ref(false)
const lastLoginInfo = ref<{ icon?: string; name?: string }>({})

const domainList = ref<string[]>([getBaseUrl()])
const urlIndex = ref(0)

// 接收来自 NetworkConfig 检测出的有效域名，合并后切到首个有效域名重新拉取二维码
watch(() => props.extraDomains, (newDomains) => {
  if (!newDomains || !newDomains.length) return
  const existingSet = new Set(domainList.value)
  const toAdd = newDomains.filter(u => !existingSet.has(u))
  if (toAdd.length) {
    domainList.value = [...domainList.value, ...toAdd]
  }
  const firstValidIdx = domainList.value.indexOf(newDomains[0])
  if (firstValidIdx !== -1) urlIndex.value = firstValidIdx

  qrCodeUrlError.value = false
  isOutTime.value = false
  clearTimers()
  setTimeout(() => { handleGetQrCodeUrl() }, 500)
})

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
const overlayText = computed(() => {
  if (qrCodeUrlError.value) return t('登录二维码获取失败!')
  return ''
})

function normalizeWsUrl(input: string): string {
  const raw = (input || '').trim()
  if (!raw) return ''
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw
  if (raw.startsWith('https://')) return `wss://${raw.slice('https://'.length)}`
  if (raw.startsWith('http://')) return `ws://${raw.slice('http://'.length)}`
  return `ws://${raw}`
}

function inferSessionWsUrl(baseUrl: string): string {
  const base = (baseUrl || '').trim()
  if (!base) return ''
  return normalizeWsUrl(base.replace(/webbiz/gi, 'websession'))
}

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
  clearTimers()
  isLoading.value = true
  qrCodeUrlError.value = false
  isOutTime.value = false

  try {
    const res = await getQrCodeUrl(currentBaseUrl.value)
    isLoading.value = false

    const errCode = Number(res?.commonResult?.errCode || 0)
    if (errCode && errCode !== 200) {
      console.error('[QRCode] Server error:', res.commonResult?.errMsg)
      qrCodeUrlError.value = true
      isLoading.value = false
      // 与老 im 一致：当前域名失败后切到下一个域名重试
      if (domainList.value.length > 1) {
        urlIndex.value++
      }
      return
    }

    if (res?.token) {
      loginToken.value = res.token
      // 注意：与老 im 完全一致——*不* 用 res.officialUrl 覆盖默认值。
      // 二维码必须始终保持 `97chat.com?token=X&imQrCodeType=2` 格式，
      // 手机 App 只认这个固定 host，其它 host 扫了没反应 → loginStatus 永远是 NOT_SCAN=0。

      timerOutTimer = setTimeout(() => {
        isOutTime.value = true
      }, 20000)

      loginPollingTimer = setTimeout(() => {
        handleIsLoginGet()
      }, 1500)
    } else {
      qrCodeUrlError.value = true
      // 与老 im 一致：token 无效也尝试切换域名
      if (domainList.value.length > 1) {
        urlIndex.value++
      }
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

    // 与老 im 一致：扫码登录成功仅以 uid > 0 为准
    if (res && res.uid && Number(res.uid) > 0) {
      const loginId = String(res.uid)
      clearTimers()

      emit('login-success', {
        sessionUrl: currentBaseUrl.value,
        wsUrl: normalizeWsUrl(res.urls?.session || '') || inferSessionWsUrl(currentBaseUrl.value),
        aesKey: API_CONFIG.aesKey,
        installCode: '',
        uid: loginId,
        nickname: res.nickName || '',
        avatar: res.icon || '',
        sessionId: res.sessionId || '',
      })
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

  // 从缓存预加载可用域名，避免首次启动只有一个兜底域名
  const poolDomains = getAllDomains('webBiz').map(d => d.domain).filter(Boolean)
  if (poolDomains.length) {
    const base = getBaseUrl()
    domainList.value = [...new Set([base, ...poolDomains.filter(d => d !== base)])]
  }

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
        v-if="loginToken"
        class="ecode"
        :value="qrCodeValue"
        level="H"
        :size="160"
      />
      <div v-else class="ecode ecode-placeholder" />
      <p v-if="showOverlay">
        <img
          :src="freshIcon"
          :class="{ load: isLoading }"
        />
        <span v-if="overlayText">{{ overlayText }}</span>
      </p>
    </section>
    <p>{{ t('使用手机版扫描二维码登录') }}</p>
    <a :href="`https://${officialUrl}`" target="_blank">{{ officialUrl }}</a>
    <button class="btn-primary importBtn" @click="emit('show-import')">
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

    .ecode-placeholder {
      width: 160px;
      height: 160px;
      border-radius: 12px;
      background:
        linear-gradient(135deg, rgba(51, 105, 254, 0.08), rgba(51, 105, 254, 0.16));
      border: 1px solid rgba(51, 105, 254, 0.12);
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

  > .importBtn {
    margin-top: 5px;
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
