import { invoke } from '@tauri-apps/api/core'

export type SidebarOpenType = 'none' | 'inner' | 'outer'

function isTauri(): boolean {
  return Boolean((window as any).__TAURI_INTERNALS__)
}

export async function toggleSidebarWithWindow(visible: boolean): Promise<SidebarOpenType> {
  if (!isTauri()) return visible ? 'inner' : 'none'
  try {
    const type = await invoke<string>('toggle_side_bar', { visible })
    if (type === 'outer' || type === 'inner' || type === 'none') {
      return type
    }
    return visible ? 'inner' : 'none'
  } catch {
    return visible ? 'inner' : 'none'
  }
}
