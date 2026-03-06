import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

export interface AppSettings {
  language: string
  notificationEnabled: boolean
  notificationSound: boolean
  autoStart: boolean
  closeToTray: boolean
  fontSize: number
  theme: string
}

const defaultSettings: AppSettings = {
  language: 'ch',
  notificationEnabled: true,
  notificationSound: true,
  autoStart: false,
  closeToTray: true,
  fontSize: 14,
  theme: 'light',
}

export const useSettingStore = defineStore('setting', () => {
  const settings = ref<AppSettings>({ ...defaultSettings })
  const loaded = ref(false)

  async function loadSettings() {
    try {
      const result = await invoke<AppSettings>('get_settings')
      settings.value = result
      loaded.value = true
      applyTheme(result.theme)
      applyFontSize(result.fontSize)
    } catch {
      settings.value = { ...defaultSettings }
    }
  }

  async function updateSettings(partial: Partial<AppSettings>) {
    const updated = { ...settings.value, ...partial }
    await invoke('update_settings', { settings: updated })
    settings.value = updated
    if (partial.theme) applyTheme(partial.theme)
    if (partial.fontSize) applyFontSize(partial.fontSize)
  }

  function applyTheme(theme: string) {
    document.documentElement.setAttribute('data-theme', theme)
  }

  function applyFontSize(size: number) {
    document.documentElement.style.fontSize = size + 'px'
  }

  return { settings, loaded, loadSettings, updateSettings }
})
