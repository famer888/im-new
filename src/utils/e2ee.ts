/**
 * 端到端加密 key 的获取 / 注入入口（前端一侧）。
 *
 * 职责：
 * 1. 保证"当前账号 curve25519 privateKey 已经被注入 Rust `CryptoEngine`"，
 *    对应老 im `accountConfig.privateKey + fnUpdateOwnKey`；
 * 2. 在发送群消息前保证对应群 relKey 已经被 Rust 缓存，否则拉一次
 *    `/sys/getKeyPair(flag=1, groupKeyVersion=1)` + 本地派生。
 *
 * 真正的 Curve25519 DH + 群 msgKey 解密 + protobuf varint 解包都交给 Rust
 * (`src-tauri/src/crypto/mod.rs::derive_group_key`) 完成；前端只管 HTTP
 * 和本地持久化。
 */
import { getKeyPair, updateKeyPair } from '@/api/keyPair'

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

/** 账号维度持久化到 localStorage 的 key lifecycle 数据。 */
interface OwnKeyPair {
  /** 32 字节 curve25519 私钥（HEX 大写）。 */
  privateKey: string
  /** 32 字节 curve25519 公钥（HEX 大写）。 */
  publicKey: string
  /** 服务端分配的 keyVersion，UpdateKeyPair 返回。 */
  keyVersion: number
}

function ownKeyStorageKey(uid: string | number): string {
  return `e2ee-own-key:${uid}`
}

function loadOwnKey(uid: string | number): OwnKeyPair | null {
  try {
    const raw = localStorage.getItem(ownKeyStorageKey(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OwnKeyPair>
    if (!parsed?.privateKey || !parsed?.publicKey || !parsed?.keyVersion) return null
    return {
      privateKey: String(parsed.privateKey).toUpperCase(),
      publicKey: String(parsed.publicKey).toUpperCase(),
      keyVersion: Number(parsed.keyVersion),
    }
  } catch {
    return null
  }
}

function saveOwnKey(uid: string | number, kp: OwnKeyPair) {
  localStorage.setItem(ownKeyStorageKey(uid), JSON.stringify(kp))
}

/**
 * 确保当前账号自己的 curve25519 keypair 可用，并已经注入 Rust。
 *
 * 策略（对齐老 im `fnUpdateOwnKey`）：
 * 1. localStorage 里已经存过 → 直接 `set_curve_private_key_hex` 注入；
 * 2. 否则向服务端查一次 `GetKeyPair({ targetId: uid, flag: 0 })` 看 webKeyPair：
 *    - 服务端已有且本地丢失 privateKey，或版本对不上 →
 *      本地 `generate_curve25519_keypair` + `updateKeyPair(publicKey)`；
 *    - 服务端尚未分配过（webKeyPair=null）→ 同上，生成并上报；
 * 3. 拿到 `{privateKey, publicKey, keyVersion}` 后落盘 + 注入 Rust。
 *
 * 复用 pending Promise 以防首次登录时多处并发调用造成重复上报。
 */
let pendingOwnKey: Promise<OwnKeyPair> | null = null

export async function ensureOwnKeyPair(uid: string | number): Promise<OwnKeyPair> {
  if (!isTauri()) {
    throw new Error('ensureOwnKeyPair: Tauri only')
  }
  const cached = loadOwnKey(uid)
  if (cached) {
    console.log('[e2ee] ensureOwnKeyPair: cache hit', {
      uid,
      publicKeyHead: cached.publicKey.slice(0, 16),
      keyVersion: cached.keyVersion,
    })
    await tauriInvoke<void>('set_curve_private_key_hex', {
      privateKeyHex: cached.privateKey,
    })
    return cached
  }

  if (pendingOwnKey) return pendingOwnKey
  pendingOwnKey = (async () => {
    console.log('[e2ee] ensureOwnKeyPair: no local cache, fetching from server', { uid })
    let existing: {
      publicKey?: string
      keyVersion?: number
    } = {}
    try {
      const resp = await getKeyPair({ targetId: Number(uid), flag: 0 })
      const web = (resp as any)?.webKeyPair
      const app = (resp as any)?.appKeyPair
      console.log('[e2ee] getKeyPair(self) resp:', {
        hasWeb: !!web,
        webPubHead: web?.publicKey ? String(web.publicKey).slice(0, 16) : null,
        webKeyVersion: web?.keyVersion,
        hasApp: !!app,
        appPubHead: app?.publicKey ? String(app.publicKey).slice(0, 16) : null,
        appKeyVersion: app?.keyVersion,
      })
      if (web?.publicKey) {
        existing = { publicKey: String(web.publicKey), keyVersion: Number(web.keyVersion || 0) }
      }
    } catch (err) {
      console.warn('[e2ee] getKeyPair(self) failed, will generate fresh:', err)
    }

    // 本地 curve25519 私钥已丢 → 无法复用老 publicKey，只能重签一把。
    const fresh = await tauriInvoke<{
      privateKeyHex: string
      publicKeyHex: string
    }>('generate_curve25519_keypair')
    console.log('[e2ee] generated new curve25519 keypair', {
      privLen: fresh.privateKeyHex.length,
      pubLen: fresh.publicKeyHex.length,
      pubHead: fresh.publicKeyHex.slice(0, 16),
    })

    const upd = await updateKeyPair({ publicKey: fresh.publicKeyHex })
    const keyVersion = Number((upd as any)?.keyVersion || 0)
    const commonResult = (upd as any)?.commonResult
    console.log('[e2ee] updateKeyPair resp:', { keyVersion, commonResult })
    if (!keyVersion) {
      throw new Error('[e2ee] updateKeyPair returned empty keyVersion')
    }

    const kp: OwnKeyPair = {
      privateKey: fresh.privateKeyHex,
      publicKey: fresh.publicKeyHex,
      keyVersion,
    }
    saveOwnKey(uid, kp)

    await tauriInvoke<void>('set_curve_private_key_hex', {
      privateKeyHex: kp.privateKey,
    })
    console.log('[e2ee] ensureOwnKeyPair DONE', {
      uid,
      keyVersion: kp.keyVersion,
      pubHead: kp.publicKey.slice(0, 16),
      existingOnServer: existing,
    })

    return kp
  })().finally(() => {
    pendingOwnKey = null
  })

  return pendingOwnKey
}

// ---------------------------------------------------------------------------
// 群 relKey
// ---------------------------------------------------------------------------

const pendingGroupKeys = new Map<string, Promise<string>>()

/**
 * 保证群 `groupId` 的 relKey 已经被 Rust 缓存。拉取成功后返回 relKey
 * 本体（一般调用方可以忽略，仅靠 Rust 缓存使用）。
 *
 * 和老 im `fnGroupRelKeyGet` 一一对齐：
 *   GetKeyPair({ targetId: groupId, flag: 1, groupKeyVersion: 1 })
 *   → (publicKey, msgKey) 通过 curve25519 DH + AES-128-ECB 解出 relKey
 */
export async function ensureGroupRelKey(
  uid: string | number,
  groupId: string | number,
): Promise<string> {
  if (!isTauri()) {
    throw new Error('ensureGroupRelKey: Tauri only')
  }
  const gid = String(groupId)

  const cachedHit = await tauriInvoke<boolean>('has_group_rel_key', { groupId: gid })
  if (cachedHit) {
    console.log('[e2ee] ensureGroupRelKey: rust cache hit', { gid })
    return ''
  }

  const existing = pendingGroupKeys.get(gid)
  if (existing) return existing

  const task = (async () => {
    console.log('[e2ee] ensureGroupRelKey: start', { uid, gid })
    await ensureOwnKeyPair(uid)

    const resp = await getKeyPair({
      targetId: Number(gid),
      flag: 1,
      groupKeyVersion: 1,
    })
    const gkp = (resp as any)?.groupKeyPair
    console.log('[e2ee] getKeyPair(group) resp:', {
      gid,
      hasGkp: !!gkp,
      publicKeyLen: gkp?.publicKey ? String(gkp.publicKey).length : 0,
      publicKeyHead: gkp?.publicKey ? String(gkp.publicKey).slice(0, 16) : null,
      msgKeyLen: gkp?.msgKey ? String(gkp.msgKey).length : 0,
      msgKeyHead: gkp?.msgKey ? String(gkp.msgKey).slice(0, 16) : null,
      keyVersion: gkp?.keyVersion,
    })
    if (!gkp?.publicKey || !gkp?.msgKey) {
      throw new Error(`[e2ee] getKeyPair(group=${gid}) missing publicKey/msgKey`)
    }

    try {
      const relKey = await tauriInvoke<string>('derive_group_rel_key', {
        groupId: gid,
        publicKeyHex: String(gkp.publicKey),
        encryptedMsgKeyHex: String(gkp.msgKey),
      })
      console.log('[e2ee] ensureGroupRelKey DONE', {
        gid,
        relKeyLen: relKey.length,
        relKeyHead: relKey.slice(0, 8),
      })
      return relKey
    } catch (err) {
      console.error('[e2ee] derive_group_rel_key FAILED', {
        gid,
        err: String(err),
        publicKey: String(gkp.publicKey),
        msgKey: String(gkp.msgKey),
      })
      throw err
    }
  })().finally(() => {
    pendingGroupKeys.delete(gid)
  })

  pendingGroupKeys.set(gid, task)
  return task
}
