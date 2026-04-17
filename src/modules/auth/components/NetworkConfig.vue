<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { getRawBaseUrl } from '@/api/config'
import { getAllDomains } from '@/utils/domainPool'

interface DomainCheckItem {
  url: string
  dnsStatus: null | -1 | 0 | 1
  qrStatus: null | -1 | 0 | 200
}

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'validDomainList', urls: string[]): void
  (e: 'close'): void
}>()

const domainList = ref<DomainCheckItem[]>([])
const isChecking = ref(false)
const isCompleted = ref(false)
const validCount = ref(0)
const cancelled = ref(false)
const checkedUrls = ref<string[]>([])

const buttonText = computed(() => {
  if (isCompleted.value && validCount.value > 0) {
    return `${t('有')}${validCount.value}${t('个可用域名')}`
  }
  return t('返回')
})

function formatUrl(url: string) {
  if (!url) return ''
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function getDnsStatusClass(status: null | -1 | 0 | 1) {
  if (status === 1) return 'success'
  if (status === 0) return 'error'
  if (status === -1) return 'checking'
  return 'pending'
}

function getQrStatusClass(status: null | -1 | 0 | 200) {
  if (status === -1) return 'checking'
  if (status === null) return 'pending'
  if (status === 200) return 'success'
  return 'error'
}

function getQrStatusText(status: null | -1 | 0 | 200) {
  if (status === -1) return '...'
  if (status === null) return '-'
  if (status === 0) return 'ERR'
  return String(status)
}

/** 检测域名 DNS 是否可达（raw fetch，无 Protobuf） */
async function checkDns(url: string): Promise<1 | 0> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    const resp = await fetch(`${url.replace(/\/$/, '')}/login/qrCodeUrl`, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    // no-cors 下 opaque response 也算通
    void resp
    return 1
  } catch {
    return 0
  }
}

/** 检测二维码接口是否返回 200 */
async function checkQrCode(url: string): Promise<200 | 0> {
  try {
    const { requestProto, proto } = await import('@/api/request')
    const res = await requestProto({
      url: `${url.replace(/\/$/, '')}/login/qrCodeUrl`,
      reqType: proto.QrCodeUrlReq,
      respType: proto.QrCodeUrlResp,
    })
    return res?.token ? 200 : 0
  } catch {
    return 0
  }
}

function collectDomainUrls(): string[] {
  const urls: string[] = []

  // 1. Tauri 域名池
  const poolDomains = getAllDomains('webBiz').map(d => d.domain)
  urls.push(...poolDomains)

  // 2. 配置中的 base URL 作为兜底
  const base = getRawBaseUrl()
  if (base && !urls.includes(base)) {
    urls.push(base)
  }

  return [...new Set(urls)]
}

async function checkDomainsFromIndex(startIndex: number) {
  for (let i = startIndex; i < domainList.value.length; i++) {
    if (cancelled.value) break

    // DNS check
    domainList.value[i] = { ...domainList.value[i], dnsStatus: -1 }
    const dnsResult = await checkDns(domainList.value[i].url)
    if (cancelled.value) break

    domainList.value[i] = { ...domainList.value[i], dnsStatus: dnsResult }

    if (dnsResult !== 1) {
      domainList.value[i] = { ...domainList.value[i], qrStatus: null }
      continue
    }

    // QR check
    domainList.value[i] = { ...domainList.value[i], qrStatus: -1 }
    const httpCode = await checkQrCode(domainList.value[i].url)
    if (cancelled.value) break

    domainList.value[i] = { ...domainList.value[i], qrStatus: httpCode }
    if (httpCode === 200) validCount.value++
  }
}

async function fetchDomainList() {
  isChecking.value = true
  cancelled.value = false
  isCompleted.value = false
  validCount.value = 0
  checkedUrls.value = []
  domainList.value = []

  const urls = collectDomainUrls().filter(u => !checkedUrls.value.includes(u))
  checkedUrls.value = [...urls]

  domainList.value = urls.map(url => ({ url, dnsStatus: null, qrStatus: null }))
  await checkDomainsFromIndex(0)

  isChecking.value = false
  isCompleted.value = true
}

function handleButtonClick() {
  cancelled.value = true

  const validDomainList = domainList.value
    .filter(item => item.dnsStatus === 1 && item.qrStatus === 200)
    .map(item => item.url)

  if (validDomainList.length) {
    emit('validDomainList', validDomainList)
  }

  emit('close')
}

onMounted(() => {
  fetchDomainList()
})

onBeforeUnmount(() => {
  cancelled.value = true
})
</script>

<template>
  <div class="network-overlay">
    <div class="network-panel">
      <div class="panel-header">
        <span class="header-text">Network benchmark</span>
      </div>
      <div class="domain-list">
        <div
          v-for="(item, index) in domainList"
          :key="index"
          class="domain-item"
          :class="{ valid: item.dnsStatus === 1 && item.qrStatus === 200 }"
        >
          <span class="domain-url">{{ formatUrl(item.url) }}</span>
          <span class="status-cell">
            <span class="status-dot" :class="getDnsStatusClass(item.dnsStatus)" />
          </span>
          <span class="status-cell code-status" :class="getQrStatusClass(item.qrStatus)">
            <span class="status-text">{{ getQrStatusText(item.qrStatus) }}</span>
          </span>
        </div>
        <div v-if="!domainList.length" class="empty-tip">
          <span class="empty-text">{{ t('暂无域名') }}</span>
        </div>
      </div>
      <button
        class="action-btn"
        :class="{ loading: isChecking }"
        @click="handleButtonClick"
      >
        <span v-if="isChecking" class="loading-icon" />
        <span class="btn-text">{{ buttonText }}</span>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.network-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: #2a2a2a;
  display: flex;
  flex-direction: column;
  z-index: 1000;
}

.network-panel {
  background-color: #2a2a2a;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 16px 20px;
  border-bottom: 1px solid #3a3a3a;
  display: flex;
  font-weight: 900;
  justify-content: center;
  align-items: center;

  .header-text {
    font-size: 17px;
    font-weight: 700;
    color: #ffffff;
    text-align: center;
  }
}

.domain-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }
}

.domain-item {
  display: flex;
  align-items: center;
  padding: 10px 20px;
  transition: background-color 0.2s;

  &:hover { background-color: #333333; }

  &.valid .domain-url { color: #5be87a; }
}

.domain-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8px;
  font-size: 13px;
  color: #c0c0c0;
}

.status-cell {
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;

  &.code-status {
    width: auto;
    min-width: 36px;
    margin-left: 8px;

    .status-text { font-size: 11px; font-weight: 500; color: #666666; }
    &.pending .status-text { color: #666666; }
    &.checking .status-text { color: #e6c44a; animation: pulse 1s ease-in-out infinite; }
    &.success .status-text { color: #5be87a; }
    &.error .status-text { color: #e85b5b; }
  }
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #555555;

  &.pending { background-color: #555555; }
  &.checking { background-color: #e6c44a; animation: pulse 1s ease-in-out infinite; }
  &.success { background-color: #5be87a; }
  &.error { background-color: #e85b5b; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.empty-tip {
  text-align: center;
  padding: 24px 20px;

  .empty-text { font-size: 13px; color: #888888; }
}

.action-btn {
  margin: 16px 20px 20px;
  padding: 12px 16px;
  border: none;
  border-radius: 0;
  background-color: #3369fe;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background-color 0.2s, opacity 0.2s;

  &:hover { background-color: #2554d9; }
  &:active { opacity: 0.9; }
  &.loading { background-color: #505050; }

  .btn-text { font-size: 14px; font-weight: 500; color: #ffffff; }
}

.loading-icon {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
