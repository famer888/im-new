#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import CryptoJS from 'crypto-js'
import protobuf from 'protobufjs'

function parseArgs(argv) {
  const result = { mode: 'production' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--mode' && argv[i + 1]) {
      result.mode = String(argv[i + 1]).trim()
      i += 1
    }
  }
  return result
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const text = fs.readFileSync(filePath, 'utf8')
  const result = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

function loadModeEnv(rootDir, mode) {
  const env = {}
  const files = [
    '.env',
    '.env.local',
    `.env.${mode}`,
    `.env.${mode}.local`,
  ]
  for (const file of files) {
    const filePath = path.join(rootDir, file)
    Object.assign(env, parseEnvFile(filePath))
  }
  return env
}

// 打包脚本里 prod/production 都代表生产环境，这里统一成 Vite 使用的 production。
function normalizeEnvMode(mode) {
  const normalized = String(mode || '').trim()
  return normalized === 'prod' ? 'production' : normalized
}

// 将命令行 mode 和 .env 里的环境名统一成快照环境，避免 prod/test 共用 domains.json。
function normalizeSnapshotMode(mode, config) {
  const normalizedMode = normalizeEnvMode(mode).toLowerCase()
  if (normalizedMode === 'production' || normalizedMode === 'test' || normalizedMode === 'uat') {
    return normalizedMode
  }
  const normalizedEnv = normalizeEnvMode(config?.envName || '').toLowerCase()
  if (normalizedEnv === 'production' || normalizedEnv === 'test' || normalizedEnv === 'uat') {
    return normalizedEnv
  }
  return normalizedMode || 'production'
}

function resolveConfig(envMap) {
  const read = (key, fallback = '') => {
    const fromProcess = process.env[key]
    if (typeof fromProcess === 'string' && fromProcess.trim() !== '') return fromProcess.trim()
    const fromEnv = envMap[key]
    if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
    return fallback
  }

  const appVer = Number(read('VITE_APP_VERSION_CODE', '168')) || 168
  const packageCode = Number(read('VITE_APP_PACKAGE_CODE', '5520')) || 5520
  return {
    baseApi: read('VITE_APP_BASE_API', 'https://test-webbiz.68chat.co'),
    domainApi: read('VITE_APP_BASE_DOMAIN', 'https://test-domain-api.68chat.co'),
    aesKey: read('VITE_APP_AES_KEY', '1234567890123456'),
    headAesKey: read('VITE_APP_HEAD_AES_KEY', 'f58c15f54e8f7826'),
    secretName: read('VITE_APP_SECRET_NAME', 'eb2c844e110be53a0b008a9766877aea'),
    appVer,
    versionName: read('VITE_APP_VERSION_NAME', ''),
    packageCode,
    language: Number(read('VITE_APP_LANGUAGE', '2')) || 2,
    plat: Number(read('VITE_APP_PLATFORM', '4')) || 4,
    packName: read('VITE_APP_PACKNAME', read('VITE_APP_BRAND_ID', '97')),
    envName: read('VITE_APP_ENV', 'unknown'),
  }
}

// 生产构建要走强校验；mode 或 VITE_APP_ENV 任一标记为 prod 都按生产处理。
function isProductionSnapshotMode(mode, config) {
  const normalizedMode = String(mode || '').trim().toLowerCase()
  const normalizedEnv = String(config?.envName || '').trim().toLowerCase()
  return normalizedMode === 'production'
    || normalizedMode === 'prod'
    || normalizedEnv === 'production'
    || normalizedEnv === 'prod'
}

const TEST_SNAPSHOT_EXPECTED_DOMAIN_PATTERNS = [
  /test-biz/i,
  /test-webbiz/i,
  /test-gateway/i,
  /test-domain-api/i,
  /backup_url\/test/i,
  /domain_api_backup.*test/i,
  /68chat\.co/i,
]

const PROD_SNAPSHOT_BLOCKED_DOMAIN_PATTERNS = [
  /test-biz/i,
  /test-webbiz/i,
  /test-gateway/i,
  /test-domain-api/i,
  /backup_url\/test/i,
  /domain_api_backup.*test/i,
  /68chat\.co/i,
]

// 从快照里找出命中特征的域名，用于给校验失败输出具体污染来源。
function findSnapshotDomain(snapshot, patterns) {
  const domainDtoList = Array.isArray(snapshot?.domainDtoList) ? snapshot.domainDtoList : []
  for (const entry of domainDtoList) {
    const domainUrl = String(entry?.domainUrl || '').trim()
    if (!domainUrl) continue
    if (patterns.some(pattern => pattern.test(domainUrl))) {
      return domainUrl
    }
  }
  return ''
}

// 写入或恢复快照前按目标环境校验，防止线上包混入测试域名、测试包误用线上快照。
function assertSnapshotMatchesMode(snapshot, snapshotMode, context) {
  if (snapshotMode === 'production') {
    const blockedDomain = findSnapshotDomain(snapshot, PROD_SNAPSHOT_BLOCKED_DOMAIN_PATTERNS)
    if (blockedDomain) {
      throw new Error(`production domains snapshot contains test domain (${context}): ${blockedDomain}`)
    }
    return
  }

  if (snapshotMode === 'test') {
    const expectedDomain = findSnapshotDomain(snapshot, TEST_SNAPSHOT_EXPECTED_DOMAIN_PATTERNS)
    if (!expectedDomain) {
      throw new Error(`test domains snapshot does not contain test domain (${context})`)
    }
  }
}

function getActiveSnapshotPath(rootDir) {
  return path.join(rootDir, 'scripts', 'domains.json')
}

function getBaselineSnapshotPath(rootDir, snapshotMode) {
  return path.join(rootDir, 'scripts', 'domain-snapshots', `domains.${snapshotMode}.json`)
}

function readSnapshotFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  return {
    filePath,
    snapshot: JSON.parse(text),
  }
}

// 拉取失败时恢复仓库内基准快照，让 test/prod 构建仍然使用各自固定域名池。
function restoreBaselineSnapshot(rootDir, snapshotMode) {
  const baselinePath = getBaselineSnapshotPath(rootDir, snapshotMode)
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`missing ${snapshotMode} domains baseline: ${baselinePath}`)
  }

  const { snapshot } = readSnapshotFile(baselinePath)
  // 构建前按目标环境恢复快照，避免 test/prod 共用同一个 domains.json 时互相污染。
  assertSnapshotMatchesMode(snapshot, snapshotMode, baselinePath)
  return writeSnapshotFile(rootDir, snapshot)
}

function getHeaderClientVersion(versionName, appVer) {
  const text = String(versionName || '').trim()
  if (text) return text
  const appVerText = String(appVer || '').trim()
  if (/^\d{3,}$/.test(appVerText)) {
    return `${appVerText[0]}.${appVerText[1]}.${appVerText.slice(2)}`
  }
  return appVerText || '1.0.0'
}

function generateLegacyStyleSysMac(packName) {
  const cleanPackName = String(packName || '97').trim() || '97'
  const hex = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0'))
  return `${cleanPackName}-${hex.join(':')}`
}

function uint8ArrayToWordArray(u8) {
  const words = []
  for (let i = 0; i < u8.length; i += 4) {
    words.push(
      ((u8[i] & 0xff) << 24)
      | (((u8[i + 1] ?? 0) & 0xff) << 16)
      | (((u8[i + 2] ?? 0) & 0xff) << 8)
      | ((u8[i + 3] ?? 0) & 0xff),
    )
  }
  return CryptoJS.lib.WordArray.create(words, u8.length)
}

function wordArrayToUint8Array(wordArray) {
  const words = wordArray.words
  const sigBytes = wordArray.sigBytes
  const output = new Uint8Array(sigBytes)
  for (let i = 0; i < sigBytes; i += 1) {
    output[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
  }
  return output
}

function aesEncryptBytes(key, bytes) {
  // 对齐前端 crypto.ts：加密侧使用完整 key，避免不同长度 key 被截断后和服务端不一致。
  const keyHex = CryptoJS.enc.Utf8.parse(String(key || ''))
  const encrypted = CryptoJS.AES.encrypt(uint8ArrayToWordArray(bytes), keyHex, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return wordArrayToUint8Array(encrypted.ciphertext)
}

function aesDecryptBytes(key, bytes) {
  const keyHex = CryptoJS.enc.Utf8.parse(String(key || '').slice(0, 16))
  const dataWordArray = uint8ArrayToWordArray(bytes)
  const base64 = dataWordArray.toString(CryptoJS.enc.Base64)
  const decrypted = CryptoJS.AES.decrypt(base64, keyHex, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return wordArrayToUint8Array(decrypted)
}

function aesEncryptString(plainText, key) {
  const keyHex = CryptoJS.enc.Utf8.parse(String(key || ''))
  const src = CryptoJS.enc.Utf8.parse(String(plainText || ''))
  return CryptoJS.AES.encrypt(src, keyHex, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  }).toString()
}

function base64ToHex(b64) {
  const bin = Buffer.from(String(b64 || ''), 'base64')
  return bin.toString('hex')
}

function hexToBase64(hex) {
  return Buffer.from(String(hex || '').trim(), 'hex').toString('base64')
}

function encryptHex(plainJson, key) {
  // 对齐 imDomain.ts：listDomain data 字段加密不能截断 secretKey。
  const keyHex = CryptoJS.enc.Utf8.parse(String(key || ''))
  const encrypted = CryptoJS.AES.encrypt(String(plainJson || ''), keyHex, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return base64ToHex(encrypted.toString())
}

function decryptHex(hexStr, key) {
  const keyHex = CryptoJS.enc.Utf8.parse(String(key || ''))
  const decrypted = CryptoJS.AES.decrypt(hexToBase64(hexStr), keyHex, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return decrypted.toString(CryptoJS.enc.Utf8)
}

function encodePacket(protoBytes, aesKey) {
  const encrypted = aesEncryptBytes(aesKey, protoBytes)
  const header = Uint8Array.from([0xC1, 0x80])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(encrypted.length, 0)
  return Buffer.concat([Buffer.from(header), length, Buffer.from(encrypted)])
}

function decodePacket(buffer, aesKey) {
  const raw = new Uint8Array(buffer)
  if (raw.length < 6) throw new Error('invalid protobuf response packet')
  const compressFlag = raw[1]
  const encryptedPayload = raw.slice(6)
  const payload = compressFlag === 0xC0
    ? new Uint8Array(zlib.gunzipSync(Buffer.from(encryptedPayload)))
    : encryptedPayload
  return aesDecryptBytes(aesKey, payload)
}

function generateSign(data, appSecret) {
  let unsigned = ''
  for (const key of Object.keys(data)) {
    const value = data[key]
    if (value == null || String(value) === '') continue
    unsigned += `&${key}=${value}`
  }
  if (unsigned.length) unsigned = unsigned.slice(1)
  unsigned += `&key=${appSecret}`
  return CryptoJS.MD5(unsigned).toString(CryptoJS.enc.Hex).toUpperCase()
}

async function postBinary(url, body, headers) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  })
  if (!response.ok) {
    throw new Error(`${url} failed: HTTP ${response.status}`)
  }
  return response.arrayBuffer()
}

async function postJson(url, body, headers) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${url} failed: HTTP ${response.status}, ${text.slice(0, 240)}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${url} returned invalid JSON`)
  }
}

function buildClientInfo(config) {
  return {
    sessionId: '',
    appVer: Number(config.appVer),
    packageCode: Number(config.packageCode),
    language: Number(config.language),
    plat: Number(config.plat),
    sysModel: 'WINDOWS',
    sysMac: generateLegacyStyleSysMac(config.packName),
  }
}

function buildSignClientInfo(config) {
  return {
    sessionId: '',
    appVer: String(config.appVer),
    version: getHeaderClientVersion(config.versionName, config.appVer),
    packageCode: Number(config.packageCode),
    language: Number(config.language),
    plat: Number(config.plat),
    sysModel: 'WINDOWS',
    sysMac: generateLegacyStyleSysMac(config.packName),
  }
}

function buildDomainJsonClientReq(config) {
  return {
    sessionId: '',
    appVer: String(config.appVer),
    version: getHeaderClientVersion(config.versionName, config.appVer),
    packageCode: Number(config.packageCode),
    language: Number(config.language),
    plat: Number(config.plat),
    sysModel: 'WINDOWS',
  }
}

async function fetchClientToken(root, config) {
  const clientTokenReqType = root.lookupType('ClientTokenReq')
  const clientTokenRespType = root.lookupType('ClientTokenResp')

  const reqMessage = clientTokenReqType.create({
    clientInfo: buildClientInfo(config),
  })
  const protoBytes = clientTokenReqType.encode(reqMessage).finish()
  const packet = encodePacket(protoBytes, config.aesKey)

  const timestamp = Date.now()
  const tenOrigin = `${JSON.stringify(buildSignClientInfo(config))}//${timestamp}`
  const oneOrigin = `${config.secretName},${timestamp}`

  const responseBuffer = await postBinary(
    `${config.baseApi}/domain/clientToken`,
    packet,
    {
      'Content-Type': 'application/octet-stream',
      'X-one': aesEncryptString(oneOrigin, config.headAesKey),
      'X-ten': aesEncryptString(tenOrigin, config.headAesKey),
      'X-ten-origin': JSON.stringify(tenOrigin),
    },
  )

  const decrypted = decodePacket(responseBuffer, config.aesKey)
  const response = clientTokenRespType.decode(new Uint8Array(decrypted))
  const accessToken = String(response.accessToken || '').trim()
  const secretKey = String(response.secretKey || '').trim()
  const mchId = Number(response.mchId || 0)

  if (!accessToken || !secretKey || !mchId) {
    throw new Error('clientToken response missing required fields')
  }

  return { accessToken, secretKey, mchId }
}

async function fetchDomainSnapshot(config, tokenData) {
  const reqTime = String(Date.now())
  const listDomainReq = {
    mchId: tokenData.mchId,
    reqTime,
    sign: '',
    moduleCode: '',
    deviceIp: '',
    deviceNo: '',
  }
  listDomainReq.sign = generateSign(listDomainReq, tokenData.secretKey)

  const body = {
    clientReq: buildDomainJsonClientReq(config),
    data: encryptHex(JSON.stringify(listDomainReq), tokenData.secretKey),
  }

  const response = await postJson(
    `${config.domainApi}/api/v4/listDomain`,
    JSON.stringify(body),
    {
      'Content-Type': 'application/json',
      accessToken: tokenData.accessToken,
    },
  )

  if (Number(response.code) !== 200) {
    throw new Error(`listDomain business code ${response.code}: ${response.msg || response.message || 'unknown'}`)
  }
  if (!response.data) {
    throw new Error('listDomain missing data field')
  }

  const decryptedText = decryptHex(String(response.data || ''), tokenData.secretKey)
  if (!decryptedText) throw new Error('listDomain decrypted payload empty')

  let payload
  try {
    payload = JSON.parse(decryptedText)
  } catch {
    throw new Error('listDomain decrypted payload is not valid JSON')
  }

  const domainDtoList = Array.isArray(payload?.domainDtoList) ? payload.domainDtoList : []
  if (!domainDtoList.length) {
    throw new Error('listDomain returned empty domainDtoList')
  }

  return {
    domainDtoList,
  }
}

function writeSnapshotFile(rootDir, snapshot) {
  const filePath = getActiveSnapshotPath(rootDir)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  return filePath
}

async function main() {
  const { mode } = parseArgs(process.argv.slice(2))
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const rootDir = path.resolve(scriptDir, '..')
  const envMode = normalizeEnvMode(mode)
  const envMap = loadModeEnv(rootDir, envMode)
  const config = resolveConfig(envMap)
  const snapshotMode = normalizeSnapshotMode(mode, config)

  if (String(process.env.DOMAIN_SNAPSHOT_PREFETCH || '1') === '0') {
    const filePath = restoreBaselineSnapshot(rootDir, snapshotMode)
    console.log('[domains] skip prefetch, restored baseline domains snapshot', {
      mode,
      snapshotMode,
      filePath,
    })
    return
  }

  try {
    const root = await protobuf.load([
      path.join(rootDir, 'proto', 'common.proto'),
      path.join(rootDir, 'proto', 'domain_url.proto'),
    ])
    const tokenData = await fetchClientToken(root, config)
    let snapshot
    try {
      snapshot = await fetchDomainSnapshot(config, tokenData)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('business code 10013')) throw error
      // listDomain 偶发 10013（解密失败）时，重拉 clientToken 再试一次，避免瞬时节点不一致导致快照漏更。
      console.warn('[domains] listDomain returned 10013, retry with refreshed clientToken once')
      const retryTokenData = await fetchClientToken(root, config)
      snapshot = await fetchDomainSnapshot(config, retryTokenData)
    }
    // 写入前按目标环境校验，避免接口异常返回其它环境域名后污染打包输入。
    assertSnapshotMatchesMode(snapshot, snapshotMode, mode)
    const filePath = writeSnapshotFile(rootDir, snapshot)

    console.log('[domains] snapshot updated before build', {
      mode,
      snapshotMode,
      env: config.envName,
      total: snapshot.domainDtoList.length,
      baseApi: config.baseApi,
      domainApi: config.domainApi,
      filePath,
    })
  } catch (error) {
    try {
      const filePath = restoreBaselineSnapshot(rootDir, snapshotMode)
      console.warn('[domains] snapshot prefetch failed, restored baseline domains snapshot', {
        mode,
        snapshotMode,
        message: error instanceof Error ? error.message : String(error),
        filePath,
      })
      return
    } catch (validationError) {
      const fallbackMessage = validationError instanceof Error ? validationError.message : String(validationError)
      if (isProductionSnapshotMode(mode, config) || snapshotMode === 'test') {
        console.error('[domains] snapshot prefetch failed and no safe baseline is available', {
          mode,
          snapshotMode,
          prefetchMessage: error instanceof Error ? error.message : String(error),
          fallbackMessage,
        })
        process.exitCode = 1
        return
      }
    }
    // 构建前快照拉取失败时保留旧文件，避免因为外部网络抖动阻塞打包。
    console.warn('[domains] snapshot prefetch failed, keep previous domains.json', {
      mode,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

main().catch((error) => {
  console.warn('[domains] snapshot prefetch unexpected failure', error)
})
