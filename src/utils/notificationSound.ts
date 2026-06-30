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
      await ctx.resume()
    }
    if (ctx.state !== 'running') return false
    const startAt = ctx.currentTime
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, startAt)
    oscillator.frequency.exponentialRampToValueAtTime(660, startAt + 0.12)
    gainNode.gain.setValueAtTime(0.0001, startAt)
    gainNode.gain.exponentialRampToValueAtTime(0.05, startAt + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.14)
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)
    oscillator.start(startAt)
    oscillator.stop(startAt + 0.14)
    oscillator.onended = () => {
      void ctx.close()
    }
    return true
  } catch {
    return false
  }
}

export async function playNotificationSound(): Promise<void> {
  if (!(await ensureNotificationSoundSettingLoaded())) return

  const now = Date.now()
  if (now - lastPlayAt < PLAY_COOLDOWN_MS) return

  try {
    // 对齐旧 ocs shell.beep：桌面端优先走 WebView 内合成音，比 PowerShell Console.Beep 更稳定。
    const playedInWebView = await playWebNotificationSound()
    if (!playedInWebView && isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('system_beep')
    }
    lastPlayAt = now
  } catch (error) {
    console.warn('[notificationSound] play failed:', error)
  }
}
