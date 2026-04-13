/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'qrcode.vue' {
  import type { DefineComponent } from 'vue'
  const QrcodeVue: DefineComponent<{
    value: string
    size?: number
    level?: 'L' | 'M' | 'Q' | 'H'
    background?: string
    foreground?: string
    renderAs?: 'canvas' | 'svg'
    margin?: number
  }>
  export default QrcodeVue
}

interface ImportMetaEnv {
  readonly VITE_APP_ENV: string
  readonly VITE_APP_BASE_API: string
  readonly VITE_APP_AES_KEY: string
  readonly VITE_APP_PACKNAME: string
  readonly VITE_APP_BASE_DOMAIN: string
  readonly VITE_APP_VERSION_CODE: string
  readonly VITE_APP_PACKAGE_CODE: string
  readonly VITE_APP_LANGUAGE: string
  readonly VITE_APP_PLATFORM: string
  readonly VITE_APP_SENTRY_DSN: string
  readonly VITE_APP_SECRET_NAME: string
  readonly VITE_APP_SECRET_KEY: string
  readonly VITE_APP_HEAD_AES_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
