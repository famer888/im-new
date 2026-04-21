import { useSettingStore } from '@/stores/useSettingStore'

let lastPlayAt = 0

const PLAY_COOLDOWN_MS = 350

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

export async function playNotificationSound(): Promise<void> {
  const settingStore = useSettingStore()
  if (!settingStore.settings.notificationSound) return

  const now = Date.now()
  if (now - lastPlayAt < PLAY_COOLDOWN_MS) return

  try {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('system_beep')
    } else {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }
      if (ctx.state !== 'running') return
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
    }
    lastPlayAt = now
  } catch (error) {
    console.warn('[notificationSound] play failed:', error)
  }
}
