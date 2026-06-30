import { useSettingStore } from '@/stores/useSettingStore'

let lastPlayAt = 0

const PLAY_COOLDOWN_MS = 350

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function ensureNotificationSoundSettingLoaded(): Promise<boolean> {
  const settingStore = useSettingStore()
  if (!settingStore.loaded) {
    await settingStore.loadSettings({ syncRemote: false })
  }
  return settingStore.settings.notificationSound
}

async function playWebNotificationSound(): Promise<boolean> {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctor) return false
    const ctx = new Ctor()
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        // 部分 WebView 在无用户手势时 resume 失败，仍尝试短音播放。
      }
    }
    const startAt = ctx.currentTime
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, startAt)
    oscillator.frequency.exponentialRampToValueAtTime(660, startAt + 0.18)
    gainNode.gain.setValueAtTime(0.0001, startAt)
    gainNode.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.2)
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)
    oscillator.start(startAt)
    oscillator.stop(startAt + 0.2)
    await new Promise<void>((resolve) => {
      oscillator.onended = () => {
        void ctx.close()
        resolve()
      }
      window.setTimeout(resolve, 240)
    })
    return true
  } catch {
    return false
  }
}

async function playSystemNotificationSound(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('system_beep')
    return true
  } catch (error) {
    console.warn('[notificationSound] system_beep failed:', error)
    return false
  }
}

export async function playNotificationSound(): Promise<boolean> {
  if (!(await ensureNotificationSoundSettingLoaded())) return false

  const now = Date.now()
  if (now - lastPlayAt < PLAY_COOLDOWN_MS) return false

  try {
    const [systemPlayed, webPlayed] = await Promise.all([
      playSystemNotificationSound(),
      playWebNotificationSound(),
    ])
    const played = systemPlayed || webPlayed
    if (played) {
      lastPlayAt = now
    }
    return played
  } catch (error) {
    console.warn('[notificationSound] play failed:', error)
    return false
  }
}
