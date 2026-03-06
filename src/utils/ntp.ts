let timeOffset = 0

export async function initNtpTime() {
  if (!(window as any).__TAURI_INTERNALS__) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const serverTime = await invoke<number>('get_ntp_time')
    if (serverTime > 0) {
      timeOffset = serverTime - Date.now()
    }
  } catch {
    timeOffset = 0
  }
}

export function getNow(): number {
  return Date.now() + timeOffset
}

export function getTimeOffset(): number {
  return timeOffset
}

export function setTimeOffset(offset: number) {
  timeOffset = offset
}
