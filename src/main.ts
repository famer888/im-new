import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import { router } from './router'
import { setupTauriListeners } from './plugins/tauri-events'
import './assets/styles/global.scss'

import en from '@/locales/en.json'
import ch from '@/locales/ch.json'
import tw from '@/locales/tw.json'
import vi from '@/locales/vi.json'
import pt from '@/locales/pt.json'

const i18n = createI18n({
  legacy: false,
  locale: 'ch',
  fallbackLocale: 'en',
  messages: { en, ch, tw, vi, pt },
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(i18n)

setupTauriListeners().catch(console.error)

app.mount('#app')
