const LEGACY_CHANNEL_GRADIENT_COLORS = [
  ['#ff516a', '#ff885e'],
  ['#ffa85c', '#ffcd6a'],
  ['#665fff', '#82b1ff'],
  ['#54cb68', '#a0de7e'],
  ['#4acccd', '#00fcfd'],
  ['#2a9ef1', '#72d5fd'],
  ['#d669ed', '#e0a2f3'],
] as const

export function resolveChannelAvatarBackground(
  id: string | number | null | undefined,
  logoColor?: string | null,
): string {
  // 对齐旧 im text-avatar 与 TextAvatar：文字头像颜色优先按 channelId 取渐变，logoColor 仅作兜底。
  return legacyGradientByChannelId(id) || String(logoColor || '').trim() || '#3369fe'
}

export function legacyGradientByChannelId(id: string | number | null | undefined): string | null {
  if (id === undefined || id === null || id === '') return null
  const raw = String(id)
  const numeric = Number(raw)
  const seed = Number.isFinite(numeric)
    ? Math.abs(Math.trunc(numeric))
    : [...raw].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const color = LEGACY_CHANNEL_GRADIENT_COLORS[seed % LEGACY_CHANNEL_GRADIENT_COLORS.length]
  return `linear-gradient(to top, ${color[0]}, ${color[1]})`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function parseAvatarBackground(background: string): {
  type: 'solid'
  color: string
} | {
  type: 'gradient'
  from: string
  to: string
} {
  const solid = String(background || '').trim()
  if (/^#[0-9a-f]{3,8}$/i.test(solid)) {
    return { type: 'solid', color: solid }
  }

  const match = solid.match(/linear-gradient\([^,]+,\s*([^,]+),\s*([^)]+)\)/i)
  if (match) {
    return {
      type: 'gradient',
      from: match[1].trim(),
      to: match[2].trim(),
    }
  }

  return { type: 'solid', color: solid || '#3369fe' }
}

export function buildChannelTextAvatarDataUrl(options: {
  name: string
  id?: string | number | null
  logoColor?: string | null
  size?: number
}): string {
  const size = Math.max(32, Number(options.size || 88))
  const initial = String(options.name || '?').trim().charAt(0).toUpperCase() || '?'
  const background = parseAvatarBackground(resolveChannelAvatarBackground(options.id, options.logoColor))
  const fontSize = Math.max(Math.round(size * 0.4), 12)

  const fill = background.type === 'solid'
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${escapeXml(background.color)}" />`
    : `<defs>
        <linearGradient id="channelAvatarGradient" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="${escapeXml(background.from)}" />
          <stop offset="100%" stop-color="${escapeXml(background.to)}" />
        </linearGradient>
      </defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#channelAvatarGradient)" />`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${fill}
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-size="${fontSize}" font-family="sans-serif" font-weight="500">${escapeXml(initial)}</text>
  </svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function isChannelImageAvatar(value: unknown): boolean {
  const raw = String(value || '').trim()
  if (!raw) return false
  if (/^data:image\//i.test(raw)) return true
  return /^(https?:|asset:|tauri:|blob:)/i.test(raw)
}
