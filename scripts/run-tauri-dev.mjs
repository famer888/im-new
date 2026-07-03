#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyDevBrandAssets } from './lib-dev-brand-assets.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const PROD_DEFAULT_BRAND_ID = '55'

const BRAND_PRESETS = {
  45: { packname: '45-im', officialUrl: '45chat.com' },
  55: { packname: '55-im', officialUrl: '55chat.com' },
  97: { packname: '97-im', officialUrl: '97chat.com' },
}

const devScriptByMode = {
  production: 'dev:prod',
  uat: 'dev:uat',
  test: 'dev:test',
}

function buildBrandTauriConfig(brandId) {
  const iconDir = `../resources/icons_${brandId}`
  return {
    productName: `${brandId}-im`,
    identifier: `cn.${brandId}.chat`,
    bundle: {
      icon: [
        `${iconDir}/32x32.png`,
        `${iconDir}/128x128.png`,
        `${iconDir}/256x256.png`,
        `${iconDir}/icon.icns`,
        `${iconDir}/icon.ico`,
      ],
    },
  }
}

function buildBrandViteEnv(brandId) {
  const preset = BRAND_PRESETS[brandId]
  if (!preset) return {}
  return {
    VITE_APP_BRAND_ID: brandId,
    VITE_APP_PACKNAME: preset.packname,
    VITE_APP_OFFICIAL_URL: preset.officialUrl,
  }
}

const args = process.argv.slice(2)
const enableDomainSnapshot = args.includes('--domains')

const modeFlagIndex = args.indexOf('--mode')
const viteMode = modeFlagIndex === -1 ? '' : (args[modeFlagIndex + 1] || '')

const brandFlagIndex = args.indexOf('--brand')
const brandId = brandFlagIndex === -1
  ? (viteMode === 'production' ? PROD_DEFAULT_BRAND_ID : '')
  : (args[brandFlagIndex + 1] || PROD_DEFAULT_BRAND_ID)

const passthroughArgs = args.filter((arg, index) => {
  if (arg === '--domains') return false
  if (index === modeFlagIndex || index === modeFlagIndex + 1) return false
  if (index === brandFlagIndex || index === brandFlagIndex + 1) return false
  return true
})

const runArgs = []
if (enableDomainSnapshot) runArgs.push('domains')

let restoreBrandAssets = null
if (brandId) {
  restoreBrandAssets = applyDevBrandAssets(rootDir, brandId)
}

function cleanupBrandAssets() {
  if (!restoreBrandAssets) return
  restoreBrandAssets()
  restoreBrandAssets = null
}

const tauriCliArgs = ['tauri', 'dev', ...passthroughArgs]
const devScript = devScriptByMode[viteMode]
if (devScript) {
  const tauriConfigPatch = {
    build: { beforeDevCommand: `pnpm ${devScript}` },
  }
  if (brandId) {
    Object.assign(tauriConfigPatch, buildBrandTauriConfig(brandId))
  }
  // `tauri dev -- --mode xxx` 会把参数传给 cargo，而不是 Vite；改覆盖 beforeDevCommand。
  tauriCliArgs.push('--config', JSON.stringify(tauriConfigPatch))
}

const child = spawn(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  tauriCliArgs,
  {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      ...buildBrandViteEnv(brandId),
      OCS_PROJECT_ROOT: rootDir,
      VITE_APP_RUN_ARGS: JSON.stringify(runArgs),
      VITE_DOMAIN_SNAPSHOT_WRITE: enableDomainSnapshot ? '1' : (process.env.VITE_DOMAIN_SNAPSHOT_WRITE || ''),
    },
  },
)

child.on('exit', (code, signal) => {
  cleanupBrandAssets()
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    cleanupBrandAssets()
  })
}
