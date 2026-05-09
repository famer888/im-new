<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import QrcodeVue from 'qrcode.vue'
import defaultLogo from '@/assets/images/logo/logo.png'
import freshIcon from '@/assets/images/login/fresh-icon.png'
import { getQrCodeUrl, getIsLogin, getUserInfo } from '@/api/imBase'
import { API_CONFIG, getBaseUrl } from '@/api/config'
import { getDeviceConfig } from '@/api/request'
import { getAllDomains, initDomainPoolFromApi, initDomainPoolFromOss } from '@/utils/domainPool'

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
const officialUrl = ref(API_CONFIG.officialUrl)
const isOutTime = ref(false)
const qrCodeUrlError = ref(false)
const isLoading = ref(false)
const hasLoadedFirstQr = ref(false)
const lastLoginInfo = ref<{ id?: string | number; icon?: string; name?: string; sessionId?: string }>({})
const lastAvatarLoadError = ref(false)

const domainList = ref<string[]>([getBaseUrl()])
const urlIndex = ref(0)
const activeQrBaseUrl = ref('')
let qrRequestSeq = 0

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

const avatarSrc = computed(() => String(lastLoginInfo.value.icon || '').trim())
const lastAvatarDisplaySrc = computed(() => {
  if (avatarSrc.value && !lastAvatarLoadError.value) return avatarSrc.value
  return defaultLogo
})

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
const showStartupLoading = computed(() => !hasLoadedFirstQr.value && !loginToken.value && !qrCodeUrlError.value)
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

function refreshDomainList() {
  const base = getBaseUrl()
  const poolDomains = getAllDomains('webBiz').map(d => d.domain).filter(Boolean)
  domainList.value = [...new Set([base, ...poolDomains.filter(d => d !== base)])]
  if (urlIndex.value >= domainList.value.length) {
    urlIndex.value = Math.max(0, domainList.value.length - 1)
  }
}

function retryNextDomain(): boolean {
  if (urlIndex.value >= domainList.value.length - 1) return false
  urlIndex.value++
  qrCodeUrlError.value = false
  isOutTime.value = false
  clearTimers()
  setTimeout(() => {
    handleGetQrCodeUrl()
  }, 300)
  return true
}

function loadLastLoginInfo() {
  try {
    const stored = localStorage.getItem('login-account-list')
    if (stored) {
      const list = JSON.parse(stored)
      if (Array.isArray(list) && list.length > 0) {
        const last = list[list.length - 1] || {}
        lastLoginInfo.value = {
          ...last,
          name: String(last.name || last.nickname || last.nickName || last.id || ''),
          icon: String(last.icon || last.avatar || last.pic || last.headUrl || ''),
        }
        lastAvatarLoadError.value = false
      }
    }
  } catch { /* ignore */ }
}

async function refreshLastLoginAvatar() {
  const id = Number(lastLoginInfo.value.id || 0)
  if (!Number.isFinite(id) || id <= 0) return
  if (avatarSrc.value) return

  try {
    const response = await getUserInfo({ uid: id }, currentBaseUrl.value)
    const userInfo = response.userInfo
    const icon = String(userInfo?.icon || '').trim()
    if (!icon) return

    lastLoginInfo.value = {
      ...lastLoginInfo.value,
      name: lastLoginInfo.value.name || String(userInfo?.nickName || id),
      icon,
    }
    lastAvatarLoadError.value = false

    const stored = localStorage.getItem('login-account-list')
    const list = stored ? JSON.parse(stored) : []
    if (!Array.isArray(list)) return
    const index = list.findIndex((item: any) => String(item?.id || '') === String(id))
    if (index < 0) return
    list[index] = {
      ...list[index],
      name: lastLoginInfo.value.name,
      icon,
    }
    localStorage.setItem('login-account-list', JSON.stringify(list))
  } catch {
    // 登录页头像只是展示增强，失败时保持二维码登录可用。
  }
}

function handleLastAvatarError() {
  lastAvatarLoadError.value = true
}

async function handleGetQrCodeUrl() {
  const requestSeq = ++qrRequestSeq
  const baseUrl = currentBaseUrl.value
  activeQrBaseUrl.value = baseUrl
  clearTimers()
  isLoading.value = true
  qrCodeUrlError.value = false
  isOutTime.value = false

  try {
    const res = await getQrCodeUrl(baseUrl)
    if (requestSeq !== qrRequestSeq) return
    isLoading.value = false

    const errCode = Number(res?.commonResult?.errCode || 0)
    if (errCode && errCode !== 200) {
      console.error('[QRCode] Server error:', res.commonResult?.errMsg)
      isLoading.value = false
      // 与老 im 一致：当前域名失败后切到下一个域名重试
      if (retryNextDomain()) return
      qrCodeUrlError.value = true
      return
    }

    if (res?.token) {
      hasLoadedFirstQr.value = true
      loginToken.value = res.token
      // 注意：与老 im 一致——*不* 用 res.officialUrl 覆盖当前包的固定官网域名。
      // 二维码必须保持 `{brand}chat.com?token=X&imQrCodeType=2` 格式。

      timerOutTimer = setTimeout(() => {
        isOutTime.value = true
      }, 20000)

      loginPollingTimer = setTimeout(() => {
        handleIsLoginGet()
      }, 1500)
    } else {
      // 与老 im 一致：token 无效也尝试切换域名
      if (retryNextDomain()) return
      hasLoadedFirstQr.value = true
      qrCodeUrlError.value = true
    }
  } catch (err) {
    if (requestSeq !== qrRequestSeq) return
    console.error('[QRCode] Failed to get QR code URL:', err)
    isLoading.value = false

    if (retryNextDomain()) return
    hasLoadedFirstQr.value = true
    qrCodeUrlError.value = true
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
  const baseUrl = activeQrBaseUrl.value || currentBaseUrl.value

  try {
    const res = await getIsLogin({
      token: loginToken.value,
      sysMac: device.sysMac,
      sysModel: device.sysModel,
    }, baseUrl)

    // 与老 im 一致：扫码登录成功仅以 uid > 0 为准
    if (res && res.uid && Number(res.uid) > 0) {
      const loginId = String(res.uid)
      clearTimers()

      emit('login-success', {
        sessionUrl: baseUrl,
        wsUrl: normalizeWsUrl(res.urls?.session || '') || inferSessionWsUrl(baseUrl),
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

onMounted(async () => {
  getDeviceConfig()
  loadLastLoginInfo()
  refreshLastLoginAvatar()

  // 登录前准备域名池：先用 OSS/预埋域名，再尝试从动态域名 API 补全。
  refreshDomainList()
  handleGetQrCodeUrl()

  initDomainPoolFromOss()
    .then(refreshDomainList)
    .catch(() => {})
  initDomainPoolFromApi()
    .then(refreshDomainList)
    .catch(() => {})
})

onBeforeUnmount(() => {
  clearTimers()
})
</script>

<template>
  <div class="comEcode">
    <template v-if="showStartupLoading">
      <div class="startupBox">
        <img :src="defaultLogo" />
        <span class="startupSpinner"></span>
      </div>
    </template>

    <template v-else>
      <div class="lastBox">
        <img
          :src="lastAvatarDisplaySrc"
          @error="handleLastAvatarError"
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
      <p>{{ t('使用品牌手机版扫描二维码登录', { brand: API_CONFIG.brandId }) }}</p>
      <a :href="`https://${officialUrl}`" target="_blank">{{ officialUrl }}</a>
      <button class="btn-primary importBtn" @click="emit('show-import')">
        {{ t('载入账户设置') }}
      </button>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.comEcode {
  position: relative;
  text-align: center;
  margin-top: 40px;

  .startupBox {
    height: 340px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;

    > img {
      width: 64px;
      height: 64px;
      object-fit: contain;
    }
  }

  .startupSpinner {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid rgba(51, 105, 254, 0.16);
    border-top-color: #3369fe;
    animation: load 0.8s linear infinite;
  }

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
      max-width: 60px;
      max-height: 60px;
      width: auto;
      height: auto;
      object-fit: contain;
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
