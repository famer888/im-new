/**
 * Domain distribution API — aligned with old im's:
 *   - getClientToken (protobuf) → /domain/clientToken
 *   - getDomainListApi (JSON + AES-hex) → /api/v4/listDomain
 */
import CryptoJS from 'crypto-js'
import { requestProto, proto, getDeviceConfig } from './request'
import { getDomainUrl, getBaseUrl, getRawBaseUrl, API_CONFIG } from './config'

/* ------------------------------------------------------------------ */
/*  AES-128-ECB hex encrypt / decrypt  (mirrors old im's encryptHex / decryptHex)  */
/* ------------------------------------------------------------------ */

function encryptHex(plainJson: string, key: string): string {
  const keyHex = CryptoJS.enc.Utf8.parse(key)
  const encrypted = CryptoJS.AES.encrypt(plainJson, keyHex, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return base64ToHex(encrypted.toString())
}

function decryptHex(hexStr: string, key: string): string {
  const keyHex = CryptoJS.enc.Utf8.parse(key)
  const decrypted = CryptoJS.AES.decrypt(hexToBase64(hexStr), keyHex, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return decrypted.toString(CryptoJS.enc.Utf8)
}

function base64ToHex(b64: string): string {
  const bin = atob(b64)
  let hex = ''
  for (let i = 0; i < bin.length; i++) {
    const byte = bin.charCodeAt(i)
    hex += (byte >> 4).toString(16)
    hex += (byte & 0x0f).toString(16)
  }
  return hex.toLowerCase()
}

function hexToBase64(hex: string): string {
  const bytes = hex.match(/.{1,2}/g) || []
  let bin = ''
  bytes.forEach(b => {
    bin += String.fromCharCode(parseInt(b, 16))
  })
  return btoa(bin)
}

/* ------------------------------------------------------------------ */
/*  MD5 sign generation  (mirrors old im's generateSign)              */
/* ------------------------------------------------------------------ */

function generateSign(data: Record<string, unknown>, appSecret: string): string {
  let unsigned = ''
  for (const key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue
    const val = data[key]
    if (val == null || String(val) === '') continue
    unsigned += `&${key}=${val}`
  }
  if (unsigned.length) unsigned = unsigned.substring(1)
  unsigned += '&key=' + appSecret
  return CryptoJS.MD5(unsigned).toString(CryptoJS.enc.Hex).toUpperCase()
}

function sortObjectByKeys<T extends Record<string, unknown>>(data: T): T {
  return Object.keys(data)
    .sort()
    .reduce((acc, key) => {
      acc[key] = data[key]
      return acc
    }, {} as Record<string, unknown>) as T
}

/* ------------------------------------------------------------------ */
/*  Client token cache                                                 */
/* ------------------------------------------------------------------ */

interface ClientTokenData {
  accessToken: string
  secretKey: string
  mchId: number
  expirationMillis: number
}

let tokenCache: ClientTokenData | null = null

async function fetchClientToken(domainBase?: string): Promise<ClientTokenData> {
  const base = domainBase || getBaseUrl()
  const res = await requestProto({
    url: `${base}/domain/clientToken`,
    reqType: proto.ClientTokenReq,
    respType: proto.ClientTokenResp,
    withSessionId: false,
  })
  const data: ClientTokenData = {
    accessToken: res.accessToken || '',
    secretKey: res.secretKey || '',
    mchId: Number(res.mchId) || 0,
    expirationMillis: Number(res.expirationMillis) || 0,
  }
  tokenCache = data
  return data
}

async function getClientTokenData(): Promise<ClientTokenData> {
  if (tokenCache && tokenCache.expirationMillis > Date.now()) {
    return tokenCache
  }
  return fetchClientToken()
}

/* ------------------------------------------------------------------ */
/*  Domain list API  (JSON + AES-hex, mirrors old im's postAxios)      */
/* ------------------------------------------------------------------ */

interface DomainDto {
  domainUrl: string
  moduleCode: string
  priority?: number
}

async function callDomainListApi(
  payload: { secretKey: string; datas: Record<string, unknown>; headers: Record<string, string> },
): Promise<{ domainDtoList?: DomainDto[] }> {
  const domainApiUrl = getDomainUrl()

  const device = getDeviceConfig()
  const clientReq = {
    sessionId: '',
    appVer: API_CONFIG.appVer,
    packageCode: API_CONFIG.packageCode,
    language: API_CONFIG.language,
    plat: API_CONFIG.plat,
    sysMac: device.sysMac,
    sysModel: device.sysModel,
  }

  const body = {
    clientReq,
    data: encryptHex(JSON.stringify(payload.datas), payload.secretKey),
  }

  const resp = await fetch(`${domainApiUrl}/api/v4/listDomain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accessToken: payload.headers.accessToken,
    },
    body: JSON.stringify(body),
  })

  const json = await resp.json()

  if (json?.code !== 200) {
    console.error('[imDomain] listDomain API error:', json)
    return {}
  }

  if (payload.secretKey && json.data) {
    const decrypted = decryptHex(json.data, payload.secretKey)
    return JSON.parse(decrypted)
  }
  return json.data || {}
}

async function callDomainReportApi(
  payload: { secretKey: string; datas: Record<string, unknown>; headers: Record<string, string> },
): Promise<void> {
  const domainApiUrl = getDomainUrl()
  const device = getDeviceConfig()
  const clientReq = {
    sessionId: '',
    appVer: API_CONFIG.appVer,
    packageCode: API_CONFIG.packageCode,
    language: API_CONFIG.language,
    plat: API_CONFIG.plat,
    sysMac: device.sysMac,
    sysModel: device.sysModel,
  }
  const body = {
    clientReq,
    data: encryptHex(JSON.stringify(payload.datas), payload.secretKey),
  }
  await fetch(`${domainApiUrl}/api/v4/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accessToken: payload.headers.accessToken,
    },
    body: JSON.stringify(body),
  })
}

/* ------------------------------------------------------------------ */
/*  Public: getDynamicDomainList                                       */
/* ------------------------------------------------------------------ */

export async function getDynamicDomainList(moduleCode = 'webBiz'): Promise<string[]> {
  try {
    const { mchId, secretKey, accessToken } = await getClientTokenData()

    const reqTime = String(Date.now())
    const listDomainReq: Record<string, unknown> = {
      mchId,
      reqTime,
      sign: '',
      moduleCode,
      deviceIp: '',
      deviceNo: '',
    }
    listDomainReq.sign = generateSign(listDomainReq, secretKey)

    const res = await callDomainListApi({
      secretKey,
      datas: listDomainReq,
      headers: { accessToken },
    })

    let domainDtoList = res?.domainDtoList || []

    domainDtoList.sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity))

    const urls = [
      ...new Set(
        domainDtoList
          .filter(item => item.moduleCode === moduleCode)
          .map(item => item.domainUrl),
      ),
    ]
    return urls
  } catch (err) {
    console.error('[imDomain] getDynamicDomainList failed:', err)
    return []
  }
}

/**
 * Collect all available domain URLs for a module.
 * 1. Dynamic API domains
 * 2. Fallback to raw base URL
 */
export async function collectAllDomainUrls(moduleCode = 'webBiz'): Promise<string[]> {
  const urls: string[] = []

  const dynamicDomains = await getDynamicDomainList(moduleCode)
  urls.push(...dynamicDomains)

  const base = getRawBaseUrl()
  if (base && !urls.includes(base)) {
    urls.push(base)
  }

  return [...new Set(urls)]
}

export async function reportErrorDomain(options: {
  domainUrl: string
  errorPath?: string
  errorDesc?: string
  httpStatus?: number
  moduleCode?: string
}): Promise<void> {
  const domainUrl = String(options.domainUrl || '').trim()
  if (!domainUrl) return
  const httpStatus = Number(options.httpStatus || 0)
  if ([429, 403, 502, 504].includes(httpStatus)) return

  try {
    const { mchId, secretKey, accessToken } = await getClientTokenData()
    const reqTime = Date.now()
    let reportReq: Record<string, unknown> = {
      deviceIp: '',
      deviceNo: '',
      deviceType: 'pc',
      domainSource: 0,
      domainUrl,
      errorDesc: String(options.errorDesc || ''),
      errorType: 0,
      errorPath: String(options.errorPath || domainUrl),
      httpStatus,
      mchId,
      moduleCode: options.moduleCode || 'ossEndpoint',
      reqTime,
      responseType: 0,
      sign: '',
    }
    reportReq = sortObjectByKeys(reportReq)
    reportReq.sign = generateSign(reportReq, secretKey)
    // 对齐老 im：上传探活/上传失败的动态 OSS 域名上报到 domain/report，让服务端域名池轮换剔除。
    await callDomainReportApi({
      secretKey,
      datas: reportReq,
      headers: { accessToken },
    })
  } catch (err) {
    console.warn('[imDomain] reportErrorDomain failed:', err)
  }
}
