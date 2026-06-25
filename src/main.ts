import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import { router } from './router'
import { setupTauriListeners } from './plugins/tauri-events'
import { installTauriElectronBridge } from './shims/tauri-electron-bridge'
import { initDomainPool, initDomainPoolFromApi, initDomainPoolFromOss, startPolling } from '@/utils/domainPool'
import { ErrorType, sendErrToSentry } from '@/utils/sentry'
import { logRuntimePlatform } from '@/utils/runtimePlatform'
import './assets/styles/global.scss'

import en from '@/locales/en.json'
import ch from '@/locales/ch.json'
import tw from '@/locales/tw.json'
import vi from '@/locales/vi.json'
import pt from '@/locales/pt.json'

const messages = { en, ch, tw, vi, pt }
type SupportedLocale = keyof typeof messages
const BOOT_STEP_TIMEOUT_MS = 8000

installTauriElectronBridge()

if (import.meta.env.DEV) {
  const originalWarn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    const message = String(args[0] ?? '')
    if (message.includes('[TAURI]') && message.includes("Couldn't find callback id")) return
    originalWarn(...args)
  }
}

function bootDiag(message: string, data?: Record<string, unknown>) {
  void message
  void data
}

async function withBootTimeout<T>(label: string, task: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const startedAt = Date.now()
  try {
    // 首屏初始化不能无限等待 Tauri invoke，否则用户只能看到加载态。
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timeout after ${BOOT_STEP_TIMEOUT_MS}ms`))
        }, BOOT_STEP_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    bootDiag(`${label} settled`, { elapsedMs: Date.now() - startedAt })
  }
}

function isSupportedLocale(locale: unknown): locale is SupportedLocale {
  return typeof locale === 'string' && locale in messages
}

async function resolveInitialLocale(): Promise<SupportedLocale> {
  if (!(window as any).__TAURI_INTERNALS__) return 'ch'
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const settings = await withBootTimeout('resolve initial locale', invoke<Record<string, unknown>>('get_settings'))
    const language = settings?.language
    return isSupportedLocale(language) ? language : 'ch'
  } catch (error) {
    console.warn('[i18n] load initial locale failed:', error)
    return 'ch'
  }
}

function setupDevtoolsShortcut() {
  if (!(window as any).__TAURI_INTERNALS__) return

  window.addEventListener('contextmenu', (event) => {
    event.preventDefault()
  }, true)

  window.addEventListener('keydown', async (event) => {
    const isDevtoolsShortcut = event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'i'
    if (!isDevtoolsShortcut) return

    event.preventDefault()
    event.stopPropagation()

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('toggle_devtools')
    } catch (error) {
      console.warn('[devtools] toggle failed:', error)
    }
  }, true)
}

async function bootstrap() {
  bootDiag('bootstrap start', {
    isTauri: !!(window as any).__TAURI_INTERNALS__,
    mode: import.meta.env.MODE,
    env: import.meta.env.VITE_APP_ENV,
    brand: import.meta.env.VITE_APP_BRAND_ID || import.meta.env.VITE_APP_PACKNAME,
  })
  void logRuntimePlatform('app-start')
  const initialLocale = await resolveInitialLocale()
  bootDiag('initial locale resolved', { initialLocale })
  const i18n = createI18n({
    legacy: false,
    locale: initialLocale,
    fallbackLocale: 'en',
    messages,
  })

  const app = createApp(App)
  const pinia = createPinia()

  app.config.errorHandler = (error, instance, info) => {
    const rawType = (instance as any)?.$?.type
    const componentName = rawType && typeof rawType === 'object'
      ? String(rawType.name || rawType.__name || 'AnonymousComponent')
      : 'AnonymousComponent'
    void sendErrToSentry(
      ErrorType.App,
      error instanceof Error ? error : new Error(String(error)),
      [
        { key: 'vue_info', value: info },
        { key: 'vue_component', value: componentName },
      ],
    )
    console.error('[Vue error]', info, error)
  }

  app.use(pinia)
  app.use(router)
  app.use(i18n)

  const routeHash = window.location.hash || ''
  const isNotificationWindow = routeHash.startsWith('#/notification')
  if (isNotificationWindow) {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  } else {
    setupTauriListeners().catch(console.error)
  }

  app.mount('#app')
  bootDiag('app mounted')
  setupDevtoolsShortcut()

  initDomainPool().catch(() => {})
  initDomainPoolFromOss().catch(() => {})  // 先从 OSS 获取备用域名（不依赖 dev 服务器）
  initDomainPoolFromApi().catch(() => {})  // 再从 API 获取完整列表
  startPolling(300000)
}

bootstrap().catch((error) => {
  console.error('[bootstrap] failed:', error)
})
