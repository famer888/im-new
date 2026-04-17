<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import QRCodeLogin from '../components/QRCodeLogin.vue'
import NetworkConfig from '../components/NetworkConfig.vue'
import FileImport from '../components/FileImport.vue'
import top3Icon from '@/assets/images/system/top3.png'

const router = useRouter()
const authStore = useAuthStore()

const showNetworkConfig = ref(false)
const showFileImport = ref(false)
const isLoading = ref(false)
const isMac = ref(false)
const extraDomains = ref<string[]>([])

onMounted(() => {
  isMac.value = navigator.platform.toLowerCase().includes('mac')
})

function handleValidDomainList(urls: string[]) {
  if (!urls.length) return
  const existing = new Set(extraDomains.value)
  const merged = [...extraDomains.value, ...urls.filter(u => !existing.has(u))]
  extraDomains.value = merged
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
    router.push('/home')
  } catch (e) {
    console.error('Login failed:', e)
  } finally {
    isLoading.value = false
  }
}

async function handleClose() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  } catch {
    window.close()
  }
}
</script>

<template>
  <div class="loginRegistContainer">
    <div class="drag" data-tauri-drag-region></div>
    <img
      v-if="!isMac"
      :src="top3Icon"
      class="close"
      @click="handleClose"
    />

    <NetworkConfig
      v-if="showNetworkConfig"
      @valid-domain-list="handleValidDomainList"
      @close="showNetworkConfig = false"
    />
    <QRCodeLogin
      v-else
      :loading="isLoading"
      :extra-domains="extraDomains"
      @login-success="handleLoginSuccess"
      @show-network="showNetworkConfig = true"
      @show-import="showFileImport = true"
    />

    <FileImport
      :visible="showFileImport"
      @close="showFileImport = false"
      @imported="router.push('/home')"
    />
  </div>
</template>

<style lang="scss" scoped>
.loginRegistContainer {
  position: absolute;
  left: 0;
  top: 0;
  height: 400px;
  width: 300px;

  .drag {
    width: 270px;
    position: absolute;
    left: 0;
    top: 0;
    height: 30px;
    -webkit-app-region: drag;
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
