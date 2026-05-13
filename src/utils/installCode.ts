const INSTALL_CODE_KEY = 'device-install-code'

function generateInstallCode(): string {
  const firstDigit = Math.floor(Math.random() * 9) + 1
  const remainingDigits = Math.floor(Math.random() * 1_000_000_000)
  return `${firstDigit}${String(remainingDigits).padStart(10, '0')}`
}

export function getOrCreateInstallCode(): string {
  const cached = String(localStorage.getItem(INSTALL_CODE_KEY) || '').trim()
  if (cached) return cached

  const next = generateInstallCode()
  localStorage.setItem(INSTALL_CODE_KEY, next)
  return next
}
