import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const host = process.env.TAURI_DEV_HOST

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      // 默认监听全部本地地址，避免 localhost/127.0.0.1/::1 解析差异导致代理请求偶发失败。
      host: host || true,
      hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
      watch: { ignored: ['**/src-tauri/**'] },
      proxy: {
        '/api': {
          target: env.VITE_APP_BASE_API || 'https://test-webbiz.68chat.co',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
          secure: false,
        },
        '/domain-api': {
          target: env.VITE_APP_BASE_DOMAIN || 'http://test-domain-api.68chat.co',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/domain-api/, ''),
          secure: false,
        },
        
        // 频道接口对齐老 IM，走 gateway 域名；该代理仅用于浏览器开发模式规避跨域。
        '/open-chat-api': {
          target: env.VITE_APP_OPEN_CHAT_DOMAIN || 'https://test-gateway.68chat.co',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/open-chat-api/, ''),
          secure: false,
        },
      },
    },
    build: {
      target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
      minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
      rollupOptions: {
        output: {
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router', 'pinia'],
            'i18n': ['vue-i18n'],
            'proto': ['protobufjs'],
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use "@/assets/styles/variables.scss" as *;`,
          api: 'modern',
        },
      },
    },
  }
})
