#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const enableDomainSnapshot = args.includes('--domains')
const tauriArgs = args.filter(arg => arg !== '--domains')

const runArgs = []
if (enableDomainSnapshot) runArgs.push('domains')

const child = spawn(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['tauri', 'dev', ...tauriArgs],
  {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      OCS_PROJECT_ROOT: rootDir,
      VITE_APP_RUN_ARGS: JSON.stringify(runArgs),
      VITE_DOMAIN_SNAPSHOT_WRITE: enableDomainSnapshot ? '1' : (process.env.VITE_DOMAIN_SNAPSHOT_WRITE || ''),
    },
  },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
