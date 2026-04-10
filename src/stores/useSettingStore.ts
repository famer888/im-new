import { defineStore } from 'pinia'
import { ref } from 'vue'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

/** 前端使用 camelCase；Rust / settings.json 为 snake_case */
export interface AppSettings {
  language: string
  notificationEnabled: boolean
  notificationSound: boolean
  autoStart: boolean
  closeToTray: boolean
  fontSize: number
  theme: string
  /** 对应 im：账户退出时是否保留聊天记录（为 true 表示保留） */
  keepHistoryOnLogout: boolean
  /** `Enter` 或 `Ctrl+Enter` */
  sendShortcutKey: string
}

const defaultSettings: AppSettings = {
  language: 'ch',
  notificationEnabled: true,
  notificationSound: true,
  autoStart: false,
  closeToTray: true,
  fontSize: 14,
  theme: 'light',
  keepHistoryOnLogout: true,
  sendShortcutKey: 'Enter',
}

function fromRustRaw(raw: Record<string, unknown>): AppSettings {
  const r = raw as Record<string, unknown>
  const bool = (v: unknown, fallback: boolean) =>
    typeof v === 'boolean' ? v : fallback
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && !Number.isNaN(v) ? v : fallback
  const str = (v: unknown, fallback: string) =>
    typeof v === 'string' ? v : fallback

  return {
    language: str(r.language, defaultSettings.language),
    notificationEnabled: bool(
      r.notification_enabled ?? r.notificationEnabled,
      defaultSettings.notificationEnabled,
    ),
    notificationSound: bool(
      r.notification_sound ?? r.notificationSound,
      defaultSettings.notificationSound,
    ),
    autoStart: bool(r.auto_start ?? r.autoStart, defaultSettings.autoStart),
    closeToTray: bool(r.close_to_tray ?? r.closeToTray, defaultSettings.closeToTray),
    fontSize: num(r.font_size ?? r.fontSize, defaultSettings.fontSize),
    theme: str(r.theme, defaultSettings.theme),
    keepHistoryOnLogout: bool(
      r.keep_history_on_logout ?? r.keepHistoryOnLogout,
      defaultSettings.keepHistoryOnLogout,
    ),
    sendShortcutKey: str(
      r.send_shortcut_key ?? r.sendShortcutKey,
      defaultSettings.sendShortcutKey,
    ),
  }
}

function toRustPayload(s: AppSettings): Record<string, unknown> {
  return {
    language: s.language,
    notification_enabled: s.notificationEnabled,
    notification_sound: s.notificationSound,
    auto_start: s.autoStart,
    close_to_tray: s.closeToTray,
    font_size: s.fontSize,
    theme: s.theme,
    keep_history_on_logout: s.keepHistoryOnLogout,
    send_shortcut_key: s.sendShortcutKey,
  }
}

export const useSettingStore = defineStore('setting', () => {
  const settings = ref<AppSettings>({ ...defaultSettings })
  const loaded = ref(false)

  async function loadSettings() {
    if (!isTauri()) {
      loaded.value = true
      return
    }
    try {
      const result = await tauriInvoke<Record<string, unknown>>('get_settings')
      settings.value = fromRustRaw(result)
      loaded.value = true
      applyTheme(settings.value.theme)
      applyFontSize(settings.value.fontSize)
    } catch {
      settings.value = { ...defaultSettings }
    }
  }

  async function updateSettings(partial: Partial<AppSettings>) {
    const updated = { ...settings.value, ...partial }
    if (!isTauri()) {
      settings.value = updated
      if (partial.theme !== undefined) applyTheme(updated.theme)
      if (partial.fontSize !== undefined) applyFontSize(updated.fontSize)
      return
    }
    await tauriInvoke('update_settings', { settings: toRustPayload(updated) })
    settings.value = updated
    if (partial.theme !== undefined) applyTheme(updated.theme)
    if (partial.fontSize !== undefined) applyFontSize(updated.fontSize)
  }

  function applyTheme(theme: string) {
    document.documentElement.setAttribute('data-theme', theme)
  }

  function applyFontSize(size: number) {
    document.documentElement.style.fontSize = `${size}px`
  }

  return { settings, loaded, loadSettings, updateSettings }
})
