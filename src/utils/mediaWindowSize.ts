const DEFAULT_MEDIA_WINDOW_WIDTH = 900
const DEFAULT_MEDIA_WINDOW_HEIGHT = 600

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

export async function getMediaWindowBounds(windowApi: any) {
  const currentWindow = windowApi.getCurrentWindow()
  const position = await (
    typeof currentWindow.outerPosition === 'function'
      ? currentWindow.outerPosition()
      : currentWindow.innerPosition?.()
  )
  const size = await (
    typeof currentWindow.outerSize === 'function'
      ? currentWindow.outerSize()
      : currentWindow.innerSize?.()
  )
  const scaleFactor =
    typeof currentWindow.scaleFactor === 'function'
      ? finiteNumber(await currentWindow.scaleFactor()) || 1
      : 1
  const physicalWidth = finiteNumber(size?.width)
  const physicalHeight = finiteNumber(size?.height)

  return {
    x: typeof position?.x === 'number' ? Math.round(position.x) : null,
    y: typeof position?.y === 'number' ? Math.round(position.y) : null,
    width: physicalWidth
      ? Math.round(physicalWidth / scaleFactor)
      : DEFAULT_MEDIA_WINDOW_WIDTH,
    height: physicalHeight
      ? Math.round(physicalHeight / scaleFactor)
      : DEFAULT_MEDIA_WINDOW_HEIGHT,
  }
}
