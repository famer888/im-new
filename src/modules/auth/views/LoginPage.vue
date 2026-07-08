<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { useAuthStore, PROCESS_LOCAL_INIT_SESSION_OPTIONS } from '@/stores/useAuthStore'
import { useSettingStore } from '@/stores/useSettingStore'
import { getOrCreateInstallCode } from '@/utils/installCode'
import QRCodeLogin from '../components/QRCodeLogin.vue'
import NetworkConfig from '../components/NetworkConfig.vue'
import FileImport from '../components/FileImport.vue'
import Toast from '@/components/Toast.vue'
import {
  getCachedNetworkBenchmarkDomains,
  preloadNetworkBenchmarkDomains,
} from '../utils/networkBenchmarkDomains'
import top3Icon from '@/assets/images/system/top3.png'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const settingStore = useSettingStore()
const { locale } = useI18n()

const showNetworkConfig = ref(false)
const showFileImport = ref(false)
const isLoading = ref(false)
const isRestoring = ref(true)
const isMac = ref(false)
const isLoginWindow = ref(!isTauri())
const extraDomains = ref<string[]>([])
const networkBenchmarkDomains = ref<string[]>(getCachedNetworkBenchmarkDomains())
const qrLoginKey = ref(0)
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('error')
const LOGIN_RESTORE_STEP_TIMEOUT_MS = 10000
let networkBenchmarkPreloadPromise: Promise<string[]> | null = null

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

function loginDiag(message: string, data?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return
  console.info('[LOGIN-DIAG]', message, data || {})
}

function showToast(message: string, type: 'success' | 'error' = 'error') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

function startNetworkBenchmarkPreload() {
  if (networkBenchmarkPreloadPromise) return networkBenchmarkPreloadPromise

  // 对齐老 im 的交互：benchmark 打开前就准备候选域名，避免点进去后空窗等待 listDomain。
  networkBenchmarkPreloadPromise = preloadNetworkBenchmarkDomains()
    .then((domains) => {
      if (domains.length) networkBenchmarkDomains.value = domains
      return domains
    })
    .catch(() => networkBenchmarkDomains.value)

  return networkBenchmarkPreloadPromise
}

async function withRestoreTimeout<T>(label: string, task: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const startedAt = Date.now()
  try {
    // 登录窗口初始化不能无限等 Tauri invoke，否则会一直停在首屏转圈。
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timeout after ${LOGIN_RESTORE_STEP_TIMEOUT_MS}ms`))
        }, LOGIN_RESTORE_STEP_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    loginDiag(`${label} settled`, { elapsedMs: Date.now() - startedAt })
  }
}

onMounted(async () => {
  isMac.value = navigator.platform.toLowerCase().includes('mac')
  void startNetworkBenchmarkPreload()
  loginDiag('mounted', {
    isTauri: isTauri(),
    route: route.fullPath,
    autoLogin: route.query.autoLogin,
  })
  try {
    await withRestoreTimeout('load settings', settingStore.loadSettings())
    locale.value = settingStore.settings.language
    loginDiag('settings loaded', { language: settingStore.settings.language })

    if (isTauri()) {
      isLoginWindow.value = getCurrentWindow().label === 'login'
      loginDiag('window label resolved', { isLoginWindow: isLoginWindow.value })
      if (!isLoginWindow.value) {
        await withRestoreTimeout(
          'init session for main window',
          authStore.initSession(PROCESS_LOCAL_INIT_SESSION_OPTIONS),
        )
        if (authStore.uid) {
          loginDiag('main window session restored, route home', { uid: authStore.uid })
          await router.replace('/home')
        } else {
          loginDiag('main window has no session, show login window')
          await withRestoreTimeout('show login window', invoke('show_login_window'))
        }
        return
      }
    }

    const autoLoginAllowed = route.query.autoLogin !== '0'
    await withRestoreTimeout('init login session', authStore.initSession(
      isTauri()
        ? {
            restoreSession: autoLoginAllowed,
            autoLogin: autoLoginAllowed,
            fallbackToCachedAccount: false,
          }
        : undefined,
    ))
    loginDiag('login session init done', {
      hasUid: !!authStore.uid,
      autoLoginAllowed,
    })
    if (authStore.uid && autoLoginAllowed) {
      if (isTauri()) {
        loginDiag('cached session found, invoke login', { uid: authStore.uid })
        await withRestoreTimeout('invoke login with cached session', invoke('login', {
          request: {
            uid: authStore.uid,
            nickname: authStore.nickname,
            avatar: authStore.avatar,
            source_id: authStore.session?.sourceId || null,
            session_url: '',
            ws_url: '',
            aes_key: '',
            install_code: getOrCreateInstallCode(),
            session_id: authStore.session?.sessionId || '',
          },
        }))
        return
      }
      await router.replace('/home')
      return
    }
  } catch (error) {
    console.warn('[auth] restore previous session failed:', error)
    loginDiag('restore failed, show QR login', {
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    isRestoring.value = false
    loginDiag('restore finished', { isRestoring: isRestoring.value })
  }
})

function handleValidDomainList(urls: string[]) {
  if (!urls.length) return
  const existing = new Set(extraDomains.value)
  const merged = [...extraDomains.value, ...urls.filter(u => !existing.has(u))]
  extraDomains.value = merged
}

function handleShowNetwork() {
  networkBenchmarkDomains.value = [
    ...new Set([
      ...networkBenchmarkDomains.value,
      ...getCachedNetworkBenchmarkDomains(),
    ]),
  ]
  void startNetworkBenchmarkPreload()
  showNetworkConfig.value = true
}

async function handleLoginSuccess(session: {
  sessionUrl: string
  wsUrl: string
  aesKey: string
  installCode: string
  uid?: string
  nickname?: string
  avatar?: string
  sessionId?: string
}) {
  isLoading.value = true
  try {
    await authStore.login(session)
    if (!isTauri()) {
      await router.push('/home')
    }
  } catch (e) {
    console.error('Login failed:', e)
    showToast(e instanceof Error ? e.message : String(e), 'error')
    qrLoginKey.value += 1
  } finally {
    isLoading.value = false
  }
}

function handleLoginError(message: string) {
  showToast(message, 'error')
}

async function handleClose() {
  try {
    const win = getCurrentWindow()
    await win.minimize()
    await win.hide()
  } catch {
    window.close()
  }
}

function startWindowDrag(e: MouseEvent) {
  if (e.button !== 0) return
  getCurrentWindow().startDragging().catch((err) => {
    console.warn('[window] start dragging failed:', err)
  })
}
</script>

<template>
  <div class="loginRegistContainer">
    <div class="drag" @mousedown="startWindowDrag"></div>
    <img
      v-if="!isMac"
      :src="top3Icon"
      class="close"
      @click="handleClose"
    />

    <NetworkConfig
      v-if="showNetworkConfig"
      :preloaded-domains="networkBenchmarkDomains"
      @valid-domain-list="handleValidDomainList"
      @close="showNetworkConfig = false"
    />
    <!-- 对齐老 im：网络检测只是覆盖层，返回时不能卸载并重建二维码登录组件。 -->
    <QRCodeLogin
      v-if="isLoginWindow && !isRestoring"
      :key="qrLoginKey"
      :loading="isLoading"
      :extra-domains="extraDomains"
      @login-success="handleLoginSuccess"
      @login-error="handleLoginError"
      @show-network="handleShowNetwork"
      @show-import="showFileImport = true"
    />

    <FileImport
      :visible="showFileImport"
      @close="showFileImport = false"
    />

    <Toast
      :visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
      @update:visible="toastVisible = $event"
    />
  </div>
</template>

<style lang="scss" scoped>
.loginRegistContainer {
  position: absolute;
  left: 0;
  top: 0;
  height: 420px;
  width: 300px;

  .drag {
    width: 270px;
    position: absolute;
    left: 0;
    top: 0;
    height: 30px;
    z-index: 2;
    user-select: none;
  }

  .close {
    position: absolute;
    right: 10px;
    top: 10px;
    z-index: 1;
    cursor: pointer;
    width: 20px;
    height: 20px;
  }
}
</style>
