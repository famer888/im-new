<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import QrcodeVue from 'qrcode.vue'
import defaultLogo from '@/assets/images/logo/logo.png'
import freshIcon from '@/assets/images/login/fresh-icon.png'
import { getQrCodeUrl, getIsLogin, getUserInfo } from '@/api/imBase'
import { API_CONFIG, getBaseUrl, isLoginOnlyBaseUrl } from '@/api/config'
import { getDeviceConfig } from '@/api/request'
import { getAllDomains, getOrderedDomainUrls, initDomainPoolFromApi, initDomainPoolFromOss, markDomainError } from '@/utils/domainPool'
import { getOrCreateInstallCode } from '@/utils/installCode'
import { WebLoginStatus } from '@/proto/generated'

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
// 对齐老 im：登录首屏始终保留二维码布局，加载只覆盖二维码区域。
const isLoading = ref(true)
const isScanned = ref(false)
const isScanCancelled = ref(false)
const hasLoadedFirstQr = ref(false)
const lastLoginInfo = ref<{ id?: string | number; icon?: string; name?: string; sessionId?: string }>({})
const lastAvatarLoadError = ref(false)

const QR_SUCCESS_BASE_URL_KEY = `qr-success-base-url:${API_CONFIG.env}:${API_CONFIG.brandId}`
const domainList = ref<string[]>([getStoredQrSuccessBaseUrl() || getBaseUrl()])
const urlIndex = ref(0)
const activeQrBaseUrl = ref('')
let qrRequestSeq = 0
let qrLoadCycleId = 0
let qrLoadCycleStartedAt = 0
const QR_REQUEST_TIMEOUT_MS = 8000

type QrAttemptStat = {
  baseUrl: string
  domainIndex: number
  startedAt: number
  elapsedMs?: number
  result?: 'success' | 'server-error' | 'missing-token' | 'timeout' | 'request-error' | 'stale'
  message?: string
  errCode?: number
}

let qrAttemptStats: QrAttemptStat[] = []

let timerOutTimer: ReturnType<typeof setTimeout> | null = null
let loginPollingTimer: ReturnType<typeof setTimeout> | null = null
let cancelRefreshTimer: ReturnType<typeof setTimeout> | null = null

const avatarSrc = computed(() => String(lastLoginInfo.value.icon || '').trim())
const lastAvatarDisplaySrc = computed(() => {
  if (avatarSrc.value && !lastAvatarLoadError.value) return avatarSrc.value
  return defaultLogo
})

const qrCodeValue = computed(() => {
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
  if (/^ws:\/\/[^/]+:443(?:\/|$)/i.test(raw)) {
    // 修复旧缓存/旧归一化写入的 ws://*:443；443 生产 webSession 需要按 TLS WebSocket 连接。
    return `wss://${raw.slice('ws://'.length)}`
  }
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw
  if (raw.startsWith('https://')) return `wss://${raw.slice('https://'.length)}`
  if (raw.startsWith('http://')) return `ws://${raw.slice('http://'.length)}`
  // 对齐旧 im 登录域名检查：生产 webSession 裸域名默认按 TLS WebSocket 连接，避免 443 被误连成明文 ws。
  return `wss://${raw}`
}

function inferSessionWsUrl(baseUrl: string): string {
  const base = (baseUrl || '').trim()
  if (!base) return ''
  return normalizeWsUrl(base.replace(/webbiz/gi, 'websession'))
}

function normalizeHttpBaseUrl(input: string): string {
  try {
    const parsed = new URL(String(input || '').trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return ''
  }
}

function getStoredQrSuccessBaseUrl(): string {
  try {
    return normalizeHttpBaseUrl(localStorage.getItem(QR_SUCCESS_BASE_URL_KEY) || '')
  } catch {
    return ''
  }
}

function persistQrSuccessBaseUrl(baseUrl: string) {
  const normalized = normalizeHttpBaseUrl(baseUrl)
  if (!normalized) return
  try {
    localStorage.setItem(QR_SUCCESS_BASE_URL_KEY, normalized)
  } catch {
    // ignore storage failures
  }
}

function clearQrSuccessBaseUrl(baseUrl?: string) {
  try {
    const stored = getStoredQrSuccessBaseUrl()
    const failed = normalizeHttpBaseUrl(baseUrl || '')
    if (!baseUrl || !failed || stored === failed) {
      localStorage.removeItem(QR_SUCCESS_BASE_URL_KEY)
    }
  } catch {
    // ignore storage failures
  }
}

function buildDomainList(preferredDomains: string[] = []): string[] {
  const preferred = preferredDomains.map(domain => String(domain || '').trim()).filter(Boolean)
  const lastSuccessBase = getStoredQrSuccessBaseUrl()
  const base = getBaseUrl()
  const loginPoolDomains = getOrderedDomainUrls('login_v2', { includeError: false })
  const normalPoolDomains = getOrderedDomainUrls('webBiz', { includeError: false })
  const errorPoolDomains = getAllDomains('webBiz')
    .filter(item => item.status === 'error')
    .map(item => item.domain)
    .filter(Boolean)

  return [...new Set([
    ...preferred,
    lastSuccessBase,
    ...loginPoolDomains,
    base,
    ...normalPoolDomains,
    ...errorPoolDomains,
  ])].filter(Boolean)
}

function refreshDomainList(preferredDomains: string[] = props.extraDomains || []): boolean {
  const previousList = domainList.value
  const previousCurrent = currentBaseUrl.value
  const nextList = buildDomainList(preferredDomains)
  const hasNewDomain = nextList.some(url => !previousList.includes(url))
  domainList.value = nextList

  const currentIndex = domainList.value.indexOf(previousCurrent)
  if (currentIndex >= 0) {
    urlIndex.value = currentIndex
  } else if (urlIndex.value >= domainList.value.length) {
    urlIndex.value = Math.max(0, domainList.value.length - 1)
  }

  qrDiag('domain list refreshed', {
    domainCount: domainList.value.length,
    domainIndex: urlIndex.value,
    hasNewDomain,
    lastSuccessBase: getStoredQrSuccessBaseUrl(),
    currentBaseUrl: currentBaseUrl.value,
  })
  return hasNewDomain
}

function applyPreferredDomains(newDomains: string[] | undefined, options: { shouldReload?: boolean } = {}) {
  if (!newDomains?.length) return

  domainList.value = buildDomainList(newDomains)
  const firstValidIdx = domainList.value.indexOf(newDomains[0])
  if (firstValidIdx !== -1) {
    urlIndex.value = firstValidIdx
  }

  if (!options.shouldReload) return

  qrCodeUrlError.value = false
  isOutTime.value = false
  clearTimers()
  // 网络检测返回有效域名后立刻用新域名拉二维码，不再保留旧 im 的 0.5s 等待。
  handleGetQrCodeUrl()
}

function activateResolvedBaseUrl(baseUrl: string) {
  const resolved = String(baseUrl || '').trim()
  if (!resolved) return

  // 底层 request 可能已自动切到备用域名；登录页必须同步，否则轮询会继续打被拦的旧域名。
  if (!domainList.value.includes(resolved)) {
    domainList.value = [resolved, ...domainList.value]
  }
  const nextIndex = domainList.value.indexOf(resolved)
  if (nextIndex >= 0) {
    urlIndex.value = nextIndex
  }
  activeQrBaseUrl.value = resolved
}

function getBusinessSessionBaseUrl(loginBaseUrl: string): string {
  const base = String(loginBaseUrl || '').trim()
  // 登录专用备用域名只用于二维码/轮询，登录后的业务和密钥接口继续走 webBiz。
  return base && !isLoginOnlyBaseUrl(base) ? base : getBaseUrl()
}

// 接收来自 NetworkConfig 检测出的有效域名，合并后切到首个有效域名重新拉取二维码
watch(
  () => props.extraDomains,
  (newDomains) => {
    applyPreferredDomains(newDomains, {
      shouldReload: !!newDomains?.length && (hasLoadedFirstQr.value || qrCodeUrlError.value || isOutTime.value),
    })
  },
  { immediate: true },
)

function retryAfterDomainRefresh() {
  if (loginToken.value) return
  if (!qrCodeUrlError.value && !(!hasLoadedFirstQr.value && isLoading.value)) return

  // 启动阶段首轮二维码请求如果卡住，也要允许域名池补齐后直接切到下一个域名重试，
  // 否则 Windows 端会一直停在转圈状态，直到用户手动退出再进。
  if (!qrCodeUrlError.value && !hasLoadedFirstQr.value && isLoading.value) {
    qrRequestSeq += 1
    isLoading.value = false
  }
  retryNextDomain()
}

function retryNextDomain(): boolean {
  const failedBase = currentBaseUrl.value
  clearQrSuccessBaseUrl(failedBase)
  void markDomainError(isLoginOnlyBaseUrl(failedBase) ? 'login_v2' : 'webBiz', failedBase)
  if (urlIndex.value >= domainList.value.length - 1) {
    qrDiag('retry domain exhausted', {
      failedBase,
      domainIndex: urlIndex.value,
      domainCount: domainList.value.length,
    })
    return false
  }
  // 还没有 token 时继续保持加载态，避免域名兜底间隙提前露出空二维码框。
  isLoading.value = true
  qrDiag('retry next domain', {
    failedBase,
    nextBase: domainList.value[urlIndex.value + 1] || '',
    nextIndex: urlIndex.value + 1,
    domainCount: domainList.value.length,
  })
  qrDiag('QR retry visual loading shown', {
    cycleId: qrLoadCycleId,
    hasLoadedFirstQr: hasLoadedFirstQr.value,
    hasToken: !!loginToken.value,
    isLoading: isLoading.value,
  })
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
        const currentUid = String(localStorage.getItem('current-uid') || '').trim()
        const preferred = currentUid
          ? list.find((item: any) => String(item?.id || '').trim() === currentUid)
          : null
        const last = preferred || list[list.length - 1] || {}
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

function qrDiag(message: string, data?: Record<string, unknown>) {
  void message
  void data
}

function startQrLoadCycle(reason: string) {
  qrLoadCycleId += 1
  qrLoadCycleStartedAt = Date.now()
  qrAttemptStats = []
  qrDiag('QR load cycle start', {
    cycleId: qrLoadCycleId,
    reason,
    currentBaseUrl: currentBaseUrl.value,
    domainIndex: urlIndex.value,
    domainCount: domainList.value.length,
    lastSuccessBase: getStoredQrSuccessBaseUrl(),
    hasExtraDomains: !!props.extraDomains?.length,
  })
}

function ensureQrLoadCycle(reason: string) {
  if (qrLoadCycleStartedAt > 0) return
  startQrLoadCycle(reason)
}

function finishQrAttempt(attempt: QrAttemptStat, result: QrAttemptStat['result'], data: Partial<QrAttemptStat> = {}) {
  attempt.result = result
  attempt.elapsedMs = Date.now() - attempt.startedAt
  Object.assign(attempt, data)
}

function getQrSlowReason() {
  const timeoutCount = qrAttemptStats.filter(item => item.result === 'timeout').length
  const requestErrorCount = qrAttemptStats.filter(item => item.result === 'request-error').length
  const serverErrorCount = qrAttemptStats.filter(item => item.result === 'server-error').length
  const missingTokenCount = qrAttemptStats.filter(item => item.result === 'missing-token').length
  if (timeoutCount > 0) return 'domain timeout'
  if (requestErrorCount > 0) return 'domain request error'
  if (serverErrorCount > 0) return 'server error'
  if (missingTokenCount > 0) return 'missing token response'
  if (qrAttemptStats.length > 1) return 'domain fallback'
  return 'single domain latency'
}

function logQrLoadSummary(result: 'success' | 'failed') {
  const totalElapsedMs = qrLoadCycleStartedAt ? Date.now() - qrLoadCycleStartedAt : 0
  const attempts = qrAttemptStats.map((item) => ({
    baseUrl: item.baseUrl,
    domainIndex: item.domainIndex,
    result: item.result || '',
    elapsedMs: item.elapsedMs ?? Date.now() - item.startedAt,
    errCode: item.errCode || 0,
    message: item.message || '',
  }))
  qrDiag('QR load summary', {
    cycleId: qrLoadCycleId,
    result,
    totalElapsedMs,
    attemptCount: qrAttemptStats.length,
    slowReason: getQrSlowReason(),
    attempts,
  })
}

async function handleGetQrCodeUrl() {
  ensureQrLoadCycle('handle get QR without explicit cycle')
  const requestSeq = ++qrRequestSeq
  const baseUrl = currentBaseUrl.value
  const startedAt = Date.now()
  const attemptStat: QrAttemptStat = {
    baseUrl,
    domainIndex: urlIndex.value,
    startedAt,
  }
  qrAttemptStats.push(attemptStat)
  activeQrBaseUrl.value = baseUrl
  clearTimers()
  isLoading.value = true
  isScanned.value = false
  isScanCancelled.value = false
  qrCodeUrlError.value = false
  isOutTime.value = false
  qrDiag('get QR code start', {
    cycleId: qrLoadCycleId,
    baseUrl,
    domainIndex: urlIndex.value,
    domainCount: domainList.value.length,
    attemptCount: qrAttemptStats.length,
  })

  try {
    let resolvedQrBaseUrl = baseUrl
    const res = await Promise.race([
      getQrCodeUrl(baseUrl, resolvedBaseUrl => {
        resolvedQrBaseUrl = resolvedBaseUrl
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`qrCodeUrl timeout after ${QR_REQUEST_TIMEOUT_MS}ms`))
        }, QR_REQUEST_TIMEOUT_MS)
      }),
    ])
    if (requestSeq !== qrRequestSeq) {
      finishQrAttempt(attemptStat, 'stale', { message: 'stale request ignored' })
      return
    }
    isLoading.value = false

    const errCode = Number(res?.commonResult?.errCode || 0)
    if (errCode && errCode !== 200) {
      finishQrAttempt(attemptStat, 'server-error', {
        errCode,
        message: res.commonResult?.errMsg || '',
      })
      console.error('[QRCode] Server error:', res.commonResult?.errMsg)
      qrDiag('get QR code server error', {
        cycleId: qrLoadCycleId,
        baseUrl,
        resolvedQrBaseUrl,
        errCode,
        errMsg: res.commonResult?.errMsg || '',
        elapsedMs: Date.now() - startedAt,
      })
      isLoading.value = false
      // 与老 im 一致：当前域名失败后切到下一个域名重试
      if (retryNextDomain()) return
      qrCodeUrlError.value = true
      logQrLoadSummary('failed')
      return
    }

    if (res?.token) {
      finishQrAttempt(attemptStat, 'success')
      activateResolvedBaseUrl(resolvedQrBaseUrl)
      persistQrSuccessBaseUrl(resolvedQrBaseUrl)
      hasLoadedFirstQr.value = true
      const tokenSetStartedAt = Date.now()
      loginToken.value = res.token
      qrDiag('get QR code done', {
        cycleId: qrLoadCycleId,
        baseUrl,
        resolvedQrBaseUrl,
        hasToken: true,
        tokenLen: String(res.token).length,
        officialUrl: officialUrl.value,
        elapsedMs: Date.now() - startedAt,
      })
      await nextTick()
      qrDiag('QR token rendered', {
        cycleId: qrLoadCycleId,
        renderWaitMs: Date.now() - tokenSetStartedAt,
        totalElapsedMs: Date.now() - qrLoadCycleStartedAt,
        attemptCount: qrAttemptStats.length,
      })
      logQrLoadSummary('success')
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
      finishQrAttempt(attemptStat, 'missing-token')
      qrDiag('get QR code missing token', {
        cycleId: qrLoadCycleId,
        baseUrl,
        resolvedQrBaseUrl,
        elapsedMs: Date.now() - startedAt,
      })
      if (retryNextDomain()) return
      hasLoadedFirstQr.value = true
      qrCodeUrlError.value = true
      logQrLoadSummary('failed')
    }
  } catch (err) {
    if (requestSeq !== qrRequestSeq) {
      finishQrAttempt(attemptStat, 'stale', { message: 'stale request ignored' })
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    finishQrAttempt(attemptStat, message.includes('timeout') ? 'timeout' : 'request-error', { message })
    console.error('[QRCode] Failed to get QR code URL:', err)
    qrDiag('get QR code failed', {
      cycleId: qrLoadCycleId,
      baseUrl,
      message,
      elapsedMs: Date.now() - startedAt,
    })
    isLoading.value = false

    if (retryNextDomain()) return
    hasLoadedFirstQr.value = true
    qrCodeUrlError.value = true
    logQrLoadSummary('failed')
  }
}

function handleReGetQrCodeUrl() {
  if (!qrCodeUrlError.value && !isOutTime.value) return

  const reloadReason = isOutTime.value ? 'manual reload after QR timeout' : 'manual reload after QR error'
  qrCodeUrlError.value = false
  isOutTime.value = false
  isScanned.value = false
  isScanCancelled.value = false
  isLoading.value = true

  clearTimers()
  startQrLoadCycle(reloadReason)
  setTimeout(() => {
    handleGetQrCodeUrl()
  }, 1500)
}

async function handleIsLoginGet() {
  const device = getDeviceConfig()
  const baseUrl = activeQrBaseUrl.value || currentBaseUrl.value
  let resolvedLoginBaseUrl = baseUrl
  qrDiag('isLogin poll start', {
    baseUrl,
    hasToken: !!loginToken.value,
    tokenLen: String(loginToken.value || '').length,
    sysMacLen: String(device.sysMac || '').length,
    sysModel: device.sysModel || '',
  })

  try {
    const res = await getIsLogin({
      token: loginToken.value,
      sysMac: device.sysMac,
      sysModel: device.sysModel,
    }, baseUrl, resolvedBaseUrl => {
      resolvedLoginBaseUrl = resolvedBaseUrl
    })
    activateResolvedBaseUrl(resolvedLoginBaseUrl)
    qrDiag('isLogin poll done', {
      baseUrl,
      resolvedLoginBaseUrl,
      uid: res?.uid ? String(res.uid) : '',
      loginStatus: res?.loginStatus,
      hasSessionId: !!res?.sessionId,
      hasSessionUrl: !!res?.urls?.session,
    })

    // 与老 im 一致：扫码登录成功仅以 uid > 0 为准
    if (res && res.uid && Number(res.uid) > 0) {
      const loginId = String(res.uid)
      clearTimers()
      const sessionBaseUrl = getBusinessSessionBaseUrl(resolvedLoginBaseUrl)
      qrDiag('login success emit', {
        uid: loginId,
        sessionBaseUrl,
        wsUrl: normalizeWsUrl(res.urls?.session || '') || inferSessionWsUrl(sessionBaseUrl),
        hasSessionId: !!res.sessionId,
      })

      emit('login-success', {
        sessionUrl: sessionBaseUrl,
        wsUrl: normalizeWsUrl(res.urls?.session || '') || inferSessionWsUrl(sessionBaseUrl),
        aesKey: API_CONFIG.aesKey,
        installCode: getOrCreateInstallCode(),
        uid: loginId,
        nickname: res.nickName || '',
        avatar: res.icon || '',
        sessionId: res.sessionId || '',
      })
    } else if (res?.loginStatus === WebLoginStatus.CANCEL_LOGIN) {
      isScanned.value = false
      isScanCancelled.value = true
      clearTimers()
      startQrLoadCycle('refresh after scan cancelled')
      cancelRefreshTimer = setTimeout(() => {
        handleGetQrCodeUrl()
      }, 1200)
    } else {
      isScanCancelled.value = false
      isScanned.value = res?.loginStatus === WebLoginStatus.SCANNED
      loginPollingTimer = setTimeout(() => {
        if (isOutTime.value || qrCodeUrlError.value) return
        handleIsLoginGet()
      }, 1500)
    }
  } catch (error) {
    qrDiag('isLogin poll failed', {
      baseUrl,
      message: error instanceof Error ? error.message : String(error),
    })
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
  if (cancelRefreshTimer) {
    clearTimeout(cancelRefreshTimer)
    cancelRefreshTimer = null
  }
}

onMounted(async () => {
  const mountedAt = Date.now()
  qrDiag('mounted', {
    initialBaseUrl: currentBaseUrl.value,
    initialDomainCount: domainList.value.length,
    hasExtraDomains: !!props.extraDomains?.length,
  })
  getDeviceConfig()
  loadLastLoginInfo()
  refreshLastLoginAvatar()

  // 登录前准备域名池：先用 OSS/预埋域名，再尝试从动态域名 API 补全。
  refreshDomainList(props.extraDomains || [])
  startQrLoadCycle('mounted initial QR')
  handleGetQrCodeUrl()

  const ossStartedAt = Date.now()
  initDomainPoolFromOss()
    .then(() => {
      const hasNewDomain = refreshDomainList(props.extraDomains || [])
      qrDiag('oss domain init done', {
        hasNewDomain,
        domainCount: domainList.value.length,
        elapsedMs: Date.now() - ossStartedAt,
        sinceMountedMs: Date.now() - mountedAt,
      })
      if (hasNewDomain) retryAfterDomainRefresh()
    })
    .catch((error) => {
      qrDiag('oss domain init failed', {
        message: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - ossStartedAt,
      })
    })
  const apiStartedAt = Date.now()
  initDomainPoolFromApi()
    .then(() => {
      const hasNewDomain = refreshDomainList(props.extraDomains || [])
      qrDiag('api domain init done', {
        hasNewDomain,
        domainCount: domainList.value.length,
        elapsedMs: Date.now() - apiStartedAt,
        sinceMountedMs: Date.now() - mountedAt,
      })
      if (hasNewDomain) retryAfterDomainRefresh()
    })
    .catch((error) => {
      qrDiag('api domain init failed', {
        message: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - apiStartedAt,
      })
    })
})

onBeforeUnmount(() => {
  clearTimers()
})
</script>

<template>
  <div class="comEcode">
    <div class="lastBox">
      <img
        :src="lastAvatarDisplaySrc"
        @error="handleLastAvatarError"
        @click="emit('show-network')"
      />
      <div v-if="lastLoginInfo.name">{{ lastLoginInfo.name }}</div>
    </div>
    <section @click="handleReGetQrCodeUrl">
      <div class="qrCodeBox">
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
          <span v-if="overlayText">{{ overlayText }}</span>
        </p>
      </div>
    </section>
    <p>{{ t('使用品牌手机版扫描二维码登录', { brand: API_CONFIG.brandId }) }}</p>
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
    color: #3369fe;
    display: block;
    line-height: 25px;
    margin-bottom: 5px;
  }

  > section {
    position: relative;

    .qrCodeBox {
      position: relative;
      width: 160px;
      height: 160px;
      margin: 0 auto;
    }

    .ecode {
      display: block;
      margin: 0 auto;
    }

    .qrCodeBox > p {
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
      object-fit: cover;
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

  .primaryBtn {
    color: #fff;
    background-color: #3369fe;
    height: 32px;
    line-height: 32px;
    text-align: center;
    font-size: 12px;
    border-radius: 4px;
    border: 1px solid #3369fe;
    cursor: pointer;
    padding: 0 28px;
    display: inline-block;

    &:hover {
      background-color: rgba(51, 105, 254, 0.9);
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
