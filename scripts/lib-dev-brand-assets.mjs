import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FRONTEND_ICON_TARGETS = [
  'src/assets/images/common/confirm-app-icon.png',
  'src/assets/images/common/defalut-icon.png',
  'src/assets/images/logo/dock.png',
  'src/assets/images/logo/logo.png',
  'src/assets/images/login/dock.png',
]

export function applyDevBrandAssets(rootDir, brandId) {
  const iconSourceDir = path.join(rootDir, 'resources', `icons_${brandId}`)
  const appIconSource = path.join(iconSourceDir, 'icon.png')
  const brandLogoSource = path.join(iconSourceDir, 'logo.png')
  // 应用内展示优先 logo.png；桌面/安装包仍走 icon.png（45 可分离桌面与站内图）。
  const inappIconSource = fs.existsSync(brandLogoSource) ? brandLogoSource : appIconSource
  const trayIconSource = path.join(iconSourceDir, '24x24.png')
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), `ocs-dev-brand-${brandId}-`))
  const backedUp = []

  if (!fs.existsSync(appIconSource)) {
    throw new Error(`Missing brand icon source: ${appIconSource}`)
  }

  for (const relPath of FRONTEND_ICON_TARGETS) {
    const target = path.join(rootDir, relPath)
    if (!fs.existsSync(target)) {
      throw new Error(`Missing branded frontend icon target: ${target}`)
    }
    const backupPath = path.join(backupDir, relPath)
    fs.mkdirSync(path.dirname(backupPath), { recursive: true })
    fs.copyFileSync(target, backupPath)
    fs.copyFileSync(inappIconSource, target)
    backedUp.push({ target, backupPath })
  }

  const trayTarget = path.join(rootDir, 'src-tauri/icons/tray.png')
  if (!fs.existsSync(trayTarget)) {
    throw new Error(`Missing tray icon target: ${trayTarget}`)
  }
  const trayBackupPath = path.join(backupDir, 'src-tauri/icons/tray.png')
  fs.mkdirSync(path.dirname(trayBackupPath), { recursive: true })
  fs.copyFileSync(trayTarget, trayBackupPath)
  fs.copyFileSync(fs.existsSync(trayIconSource) ? trayIconSource : appIconSource, trayTarget)
  backedUp.push({ target: trayTarget, backupPath: trayBackupPath })

  return () => {
    for (const { target, backupPath } of backedUp) {
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, target)
      }
    }
    fs.rmSync(backupDir, { recursive: true, force: true })
  }
}
