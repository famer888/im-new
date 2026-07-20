const AT_LIST_KEYBOARD_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Enter'])

export function shouldCaptureAtListKeyboard(key: string, selectableCount: number): boolean {
  return selectableCount > 0 && AT_LIST_KEYBOARD_KEYS.has(key)
}
