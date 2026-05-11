import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import { router } from './router'
import { setupTauriListeners } from './plugins/tauri-events'
import { initDomainPool, initDomainPoolFromApi, initDomainPoolFromOss, startPolling } from '@/utils/domainPool'
import { ErrorType, sendErrToSentry } from '@/utils/sentry'
import './assets/styles/global.scss'

import en from '@/locales/en.json'
import ch from '@/locales/ch.json'
import tw from '@/locales/tw.json'
import vi from '@/locales/vi.json'
import pt from '@/locales/pt.json'

const messages = { en, ch, tw, vi, pt }
type SupportedLocale = keyof typeof messages

function isSupportedLocale(locale: unknown): locale is SupportedLocale {
  return typeof locale === 'string' && locale in messages
}

async function resolveInitialLocale(): Promise<SupportedLocale> {
  if (!(window as any).__TAURI_INTERNALS__) return 'ch'
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const settings = await invoke<Record<string, unknown>>('get_settings')
    const language = settings?.language
    return isSupportedLocale(language) ? language : 'ch'
  } catch (error) {
    console.warn('[i18n] load initial locale failed:', error)
    return 'ch'
  }
}

function setupDevtoolsShortcut() {
  if (!(window as any).__TAURI_INTERNALS__) return

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
  const initialLocale = await resolveInitialLocale()
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
  if (!routeHash.startsWith('#/notification')) {
    setupTauriListeners().catch(console.error)
  }

  app.mount('#app')
  setupDevtoolsShortcut()

  initDomainPool().catch(() => {})
  initDomainPoolFromOss().catch(() => {})  // 先从 OSS 获取备用域名（不依赖 dev 服务器）
  initDomainPoolFromApi().catch(() => {})  // 再从 API 获取完整列表
  startPolling(300000)
}

bootstrap().catch((error) => {
  console.error('[bootstrap] failed:', error)
})
