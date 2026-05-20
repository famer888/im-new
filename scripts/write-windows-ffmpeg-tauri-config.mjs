import fs from 'node:fs'
import path from 'node:path'

const [outPath, baseConfigPath, ffmpegPath] = process.argv.slice(2)

if (!outPath || !ffmpegPath) {
  console.error('Usage: write-windows-ffmpeg-tauri-config.mjs <out> <base-config-or-empty> <ffmpeg.exe>')
  process.exit(1)
}

const config = baseConfigPath
  ? JSON.parse(fs.readFileSync(baseConfigPath, 'utf8'))
  : {}

config.bundle = config.bundle || {}
config.bundle.windows = config.bundle.windows || {}
config.bundle.windows.nsis = config.bundle.windows.nsis || {}
config.bundle.windows.nsis.compression = config.bundle.windows.nsis.compression || 'zlib'

if (!config.bundle.resources) {
  config.bundle.resources = {
    [ffmpegPath]: 'ffmpeg.exe',
  }
} else if (Array.isArray(config.bundle.resources)) {
  if (!config.bundle.resources.includes(ffmpegPath)) {
    config.bundle.resources.push(ffmpegPath)
  }
} else {
  config.bundle.resources[ffmpegPath] = 'ffmpeg.exe'
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`)
