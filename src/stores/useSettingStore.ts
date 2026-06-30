import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUserInfo, updateUserInfo } from '@/api/imBase'
import { proto } from '@/api/request'
import { useAuthStore } from '@/stores/useAuthStore'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

const FRIEND_VERIFY_PRIVACY_MASK = 4096

/** 前端使用 camelCase；Rust / settings.json 为 snake_case */
export interface AppSettings {
  language: string
  notificationEnabled: boolean
  notificationSound: boolean
  autoStart: boolean
  closeToTray: boolean
  /** 与 im `isMessageReminderWhenMinimized` 一致 */
  messageReminderWhenMinimized: boolean
  fontSize: number
  theme: string
  /** 对应 im：账户退出时是否保留聊天记录（为 true 表示保留） */
  keepHistoryOnLogout: boolean
  /** `Enter` 或 `Ctrl+Enter` */
  sendShortcutKey: string
  /** 与 im：加我为朋友时需要验证；本地只缓存，实际以后端 privacy 为准 */
  friendVerifyRequired: boolean
}

const defaultSettings: AppSettings = {
  language: 'ch',
  notificationEnabled: true,
  notificationSound: false,
  autoStart: false,
  closeToTray: true,
  messageReminderWhenMinimized: true,
  fontSize: 14,
  theme: 'light',
  keepHistoryOnLogout: true,
  sendShortcutKey: 'Enter',
  friendVerifyRequired: true,
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
    messageReminderWhenMinimized: bool(
      r.message_reminder_when_minimized ?? r.messageReminderWhenMinimized,
      defaultSettings.messageReminderWhenMinimized,
    ),
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
    friendVerifyRequired: bool(
      r.friend_verify_required ?? r.friendVerifyRequired,
      defaultSettings.friendVerifyRequired,
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
    message_reminder_when_minimized: s.messageReminderWhenMinimized,
    font_size: s.fontSize,
    theme: s.theme,
    keep_history_on_logout: s.keepHistoryOnLogout,
    send_shortcut_key: s.sendShortcutKey,
    friend_verify_required: s.friendVerifyRequired,
  }
}

function getCurrentUid(): number | null {
  const authStore = useAuthStore()
  const uid = Number(authStore.uid)
  return Number.isFinite(uid) && uid > 0 ? uid : null
}

function isFriendVerifyRequiredFromPrivacy(privacy: unknown, fallback: boolean): boolean {
  const value = typeof privacy === 'number' ? privacy : Number(privacy)
  if (!Number.isFinite(value)) return fallback
  return (value & FRIEND_VERIFY_PRIVACY_MASK) === FRIEND_VERIFY_PRIVACY_MASK
}

function readPrivacyFromUserInfo(resp: unknown): number {
  const raw = resp as { privacy?: unknown; userInfo?: { privacy?: unknown } } | null
  const privacy = raw?.privacy ?? raw?.userInfo?.privacy ?? 0
  const value = Number(privacy)
  return Number.isFinite(value) ? value : 0
}

/** 按位更新好友验证位；保留 privacy 其它标志位。 */
function buildFriendVerifyPrivacyValue(currentPrivacy: number, enabled: boolean): number {
  const privacy = Number.isFinite(currentPrivacy) ? currentPrivacy : 0
  return enabled
    ? (privacy | FRIEND_VERIFY_PRIVACY_MASK)
    : (privacy & ~FRIEND_VERIFY_PRIVACY_MASK)
}

async function fetchCurrentPrivacy(uid: number): Promise<number> {
  const resp = await getUserInfo({ uid })
  assertCommonResultOk(resp, 'load privacy failed')
  return readPrivacyFromUserInfo(resp)
}

async function pushFriendVerifyPrivacy(uid: number, privacy: number) {
  const resp = await updateUserInfo({
    userParam: { privacy },
    ops: [proto.UserOperator.PRIVACY],
  })
  assertCommonResultOk(resp, 'update friend verify required failed')
}

/**
 * 对齐旧 im privacy.vue 的开关语义，同时兼容服务端按位 privacy：
 * - 关闭：清掉 4096 位
 * - 开启：先按位 OR 4096；若仍未生效，再补发旧 im 的纯 4096
 */
async function syncFriendVerifyPrivacyToServer(uid: number, enabled: boolean) {
  const currentPrivacy = await fetchCurrentPrivacy(uid)
  await pushFriendVerifyPrivacy(uid, buildFriendVerifyPrivacyValue(currentPrivacy, enabled))
  if (!enabled) return

  const remotePrivacy = await fetchCurrentPrivacy(uid)
  if (isFriendVerifyRequiredFromPrivacy(remotePrivacy, false)) return

  // 旧 im 开启时直接发 4096；部分环境按位更新后需要再补一次绝对值。
  await pushFriendVerifyPrivacy(uid, FRIEND_VERIFY_PRIVACY_MASK)
  const confirmedPrivacy = await fetchCurrentPrivacy(uid)
  if (!isFriendVerifyRequiredFromPrivacy(confirmedPrivacy, false)) {
    throw new Error('开启好友验证失败，请稍后重试')
  }
}

function assertCommonResultOk(resp: unknown, fallback: string) {
  const commonResult = (resp as any)?.commonResult
  const errCode = Number(commonResult?.errCode ?? 200)
  if (errCode !== 200 && errCode !== 0) {
    throw new Error(commonResult?.errMsg || fallback)
  }
}

export const useSettingStore = defineStore('setting', () => {
  const settings = ref<AppSettings>({ ...defaultSettings })
  const loaded = ref(false)
  // 用户主动改设置时递增；loadSettings 结束前若已变化，则放弃覆盖内存，避免后台刷新冲掉刚关闭的提示音等项。
  let settingsWriteGeneration = 0

  async function saveLocalSettings(nextSettings: AppSettings) {
    if (!isTauri()) return
    await tauriInvoke('update_settings', { settings: toRustPayload(nextSettings) })
  }

  async function readLocalSettings(): Promise<AppSettings> {
    if (!isTauri()) return { ...defaultSettings }
    const result = await tauriInvoke<Record<string, unknown>>('get_settings')
    return fromRustRaw(result)
  }

  function applyLoadedSettings(nextSettings: AppSettings) {
    settings.value = nextSettings
    applyTheme(nextSettings.theme)
    applyFontSize(nextSettings.fontSize)
  }

  function hasSettingsWriteSince(generation: number): boolean {
    return settingsWriteGeneration !== generation
  }

  async function syncFriendVerifyRequired(nextSettings: AppSettings): Promise<AppSettings> {
    const uid = getCurrentUid()
    if (!uid) return nextSettings

    try {
      const resp = await getUserInfo({ uid })
      assertCommonResultOk(resp, 'load friend verify required failed')

      const remoteFriendVerifyRequired = isFriendVerifyRequiredFromPrivacy(
        readPrivacyFromUserInfo(resp),
        nextSettings.friendVerifyRequired,
      )

      if (remoteFriendVerifyRequired === nextSettings.friendVerifyRequired) {
        return nextSettings
      }

      // 对齐旧 im：好友验证开关以本地账户设置为准，避免远端 privacy 延迟快照把刚开启的验证写回关闭。
      if (remoteFriendVerifyRequired !== settings.value.friendVerifyRequired) {
        return settings.value
      }

      return nextSettings
    } catch (error) {
      console.warn('[setting] sync friend verify required failed:', error)
      return nextSettings
    }
  }

  async function loadSettings(options?: { syncRemote?: boolean }) {
    const syncRemote = options?.syncRemote ?? true
    const loadGeneration = settingsWriteGeneration
    try {
      let nextSettings = await readLocalSettings()

      if (syncRemote) {
        nextSettings = await syncFriendVerifyRequired(nextSettings)
      }

      if (hasSettingsWriteSince(loadGeneration)) return

      // syncFriendVerifyRequired 可能耗时较长，应用前再读一次本地配置。
      if (isTauri()) {
        nextSettings = await readLocalSettings()
      }

      if (hasSettingsWriteSince(loadGeneration)) return

      applyLoadedSettings(nextSettings)
    } catch (error) {
      if (hasSettingsWriteSince(loadGeneration)) return
      // 加载失败时保留当前内存设置，避免把用户已关闭的「最小化时消息提醒」等项误重置为 default true。
      console.warn('[setting] loadSettings failed, keep current settings:', error)
      applyLoadedSettings({ ...settings.value })
    } finally {
      loaded.value = true
    }
  }

  async function updateSettings(partial: Partial<AppSettings>) {
    const updated = { ...settings.value, ...partial }

    if (partial.friendVerifyRequired !== undefined) {
      settingsWriteGeneration += 1
      const uid = getCurrentUid()
      if (uid) {
        await syncFriendVerifyPrivacyToServer(uid, partial.friendVerifyRequired)
      }
    }

    settings.value = updated
    if (partial.friendVerifyRequired === undefined) {
      settingsWriteGeneration += 1
    }
    if (partial.theme !== undefined) applyTheme(updated.theme)
    if (partial.fontSize !== undefined) applyFontSize(updated.fontSize)

    if (!isTauri()) return

    await saveLocalSettings(updated)
  }

  function applyTheme(theme: string) {
    document.documentElement.setAttribute('data-theme', theme)
  }

  function applyFontSize(size: number) {
    document.documentElement.style.fontSize = `${size}px`
  }

  return { settings, loaded, loadSettings, updateSettings }
})
