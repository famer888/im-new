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

    let selfAppKeyPair: any = null
    try {
      const resp = await getKeyPair({ targetId: Number(uid) })
      const web = (resp as any)?.webKeyPair
      selfAppKeyPair = (resp as any)?.appKeyPair
      const serverWebPublicKey = web?.publicKey ? String(web.publicKey).toUpperCase() : ''
      const serverWebKeyVersion = Number(web?.keyVersion || 0)
      if (
        serverWebPublicKey &&
        serverWebKeyVersion &&
        (serverWebPublicKey !== cached.publicKey || serverWebKeyVersion !== cached.keyVersion)
      ) {
        console.warn('[e2ee] own web key cache mismatch, rotating local key', {
          uid,
          cachedKeyVersion: cached.keyVersion,
          serverWebKeyVersion,
          cachedPubHead: cached.publicKey.slice(0, 16),
          serverPubHead: serverWebPublicKey.slice(0, 16),
        })
        const fresh = await tauriInvoke<{
          privateKeyHex: string
          publicKeyHex: string
        }>('generate_curve25519_keypair')
        const upd = await updateKeyPair({ publicKey: fresh.publicKeyHex })
        const keyVersion = Number((upd as any)?.keyVersion || 0)
        if (!keyVersion) {
          throw new Error('[e2ee] updateKeyPair returned empty keyVersion after cache mismatch')
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
        await tauriInvoke<string>('derive_friend_rel_key', {
          friendId: String(uid),
          publicKeyHex: kp.publicKey,
          encryptedMsgKeyHex: '',
          version: Number(kp.keyVersion || 1),
          source: 'web',
        })
        console.log('[e2ee] rotated and derived self web rel_key', {
          uid,
          keyVersion: kp.keyVersion,
          pubHead: kp.publicKey.slice(0, 16),
        })
        return kp
      }
    } catch (err) {
      console.warn('[e2ee] own web key server check failed, using local cache:', err)
    }

    await tauriInvoke<void>('set_curve_private_key_hex', {
      privateKeyHex: cached.privateKey,
    })

    try {
      await tauriInvoke<string>('derive_friend_rel_key', {
        friendId: String(uid),
        publicKeyHex: cached.publicKey,
        encryptedMsgKeyHex: '',
        version: Number(cached.keyVersion || 1),
        source: 'web',
      })
      console.log('[e2ee] derived self web rel_key (cache hit)');
    } catch (err) {
      console.error('[e2ee] derive self web rel_key failed (cache hit)', err);
    }

    if (selfAppKeyPair?.publicKey && selfAppKeyPair?.keyVersion) {
      try {
        await tauriInvoke<string>('derive_friend_rel_key', {
          friendId: String(uid),
          publicKeyHex: String(selfAppKeyPair.publicKey),
          encryptedMsgKeyHex: '',
          version: Number(selfAppKeyPair.keyVersion || 1),
          source: 'app',
        })
        console.log('[e2ee] derived self app rel_key (cache hit)');
      } catch (err) {
        console.error('[e2ee] derive self app rel_key failed (cache hit)', err);
      }
    }

    return cached
  }

  if (pendingOwnKey) return pendingOwnKey
  pendingOwnKey = (async () => {
    console.log('[e2ee] ensureOwnKeyPair: no local cache, fetching from server', { uid })
    let existing: {
      publicKey?: string
      keyVersion?: number
    } = {}
    let selfAppKeyPair: any = null
    try {
      const resp = await getKeyPair({ targetId: Number(uid) })
      const web = (resp as any)?.webKeyPair
      const app = (resp as any)?.appKeyPair
      selfAppKeyPair = app
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

    try {
      await tauriInvoke<string>('derive_friend_rel_key', {
        friendId: String(uid),
        publicKeyHex: kp.publicKey,
        encryptedMsgKeyHex: '',
        version: Number(kp.keyVersion || 1),
        source: 'web',
      })
      console.log('[e2ee] derived self web rel_key');
    } catch (err) {
      console.error('[e2ee] derive self web rel_key failed', err);
    }

    if (selfAppKeyPair?.publicKey && selfAppKeyPair?.keyVersion) {
      try {
        await tauriInvoke<string>('derive_friend_rel_key', {
          friendId: String(uid),
          publicKeyHex: String(selfAppKeyPair.publicKey),
          encryptedMsgKeyHex: '',
          version: Number(selfAppKeyPair.keyVersion || 1),
          source: 'app',
        })
        console.log('[e2ee] derived self app rel_key');
      } catch (err) {
        console.error('[e2ee] derive self app rel_key failed', err);
      }
    }
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
const pendingFriendKeys = new Map<string, Promise<string>>()
const pendingFriendVersionKeys = new Map<string, Promise<string>>()

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

/**
 * 强制刷新群 relKey：清掉 Rust 侧缓存后重新向服务端 `GetKeyPair`
 * 派生。用于"解密一条群消息失败且确实可能是 key 轮换了"的兜底。
 *
 * 对齐老 im `fnMsgDecryption` 在群分支里 `_decrypt` 抛错后
 * `delete groupKeyObjs[id]` 的行为。
 */
export async function refreshGroupRelKey(
  uid: string | number,
  groupId: string | number,
): Promise<string> {
  if (!isTauri()) {
    throw new Error('refreshGroupRelKey: Tauri only')
  }
  const gid = String(groupId)
  try {
    await tauriInvoke<void>('clear_group_rel_key', { groupId: gid })
  } catch (err) {
    console.warn('[e2ee] clear_group_rel_key failed', { gid, err: String(err) })
  }
  pendingGroupKeys.delete(gid)
  return ensureGroupRelKey(uid, gid)
}

/**
 * 保证好友 `friendId` 的 relKey 已被 Rust 缓存（单聊发送/接收解密使用）。
 */
export async function ensureFriendRelKey(
  uid: string | number,
  friendId: string | number,
  forceRefresh = false,
): Promise<string> {
  if (!isTauri()) {
    throw new Error('ensureFriendRelKey: Tauri only')
  }
  const fid = String(friendId)
  console.log('[e2ee] ensureFriendRelKey: start', { uid, fid })
  await ensureOwnKeyPair(uid)
  const cacheHit = await tauriInvoke<boolean>('has_friend_rel_key', {
    friendId: fid,
    version: 1,
    source: 'web',
  })
  if (cacheHit && !forceRefresh) {
    console.log('[e2ee] ensureFriendRelKey: rust cache hit', { fid })
    return ''
  }

  const existing = pendingFriendKeys.get(fid)
  if (existing) return existing

  const task = (async () => {
    let web: any
    let app: any
    try {
      const resp = await getKeyPair({
        targetId: Number(fid),
      })
      web = (resp as any)?.webKeyPair
      app = (resp as any)?.appKeyPair
    } catch {
      // ignore and fallback below
    }
    if (!web?.publicKey && !app?.publicKey) {
      console.warn(`[e2ee] getKeyPair(friend=${fid}) missing publicKey`);
      const resp0 = await getKeyPair({
        targetId: Number(fid),
      })
      web = (resp0 as any)?.webKeyPair
      app = (resp0 as any)?.appKeyPair
    }
    console.log('[e2ee] getKeyPair(friend) resp:', {
      fid,
      webKeyVersion: web?.keyVersion,
      webPublicKeyLen: web?.publicKey ? String(web.publicKey).length : 0,
      appKeyVersion: app?.keyVersion,
      appPublicKeyLen: app?.publicKey ? String(app.publicKey).length : 0,
    })
    if (!web?.publicKey && !app?.publicKey) {
      throw new Error(`[e2ee] getKeyPair(friend=${fid}) missing publicKey`)
    }
    let last = ''
    if (web?.publicKey) {
      last = await tauriInvoke<string>('derive_friend_rel_key', {
        friendId: fid,
        publicKeyHex: String(web.publicKey),
        encryptedMsgKeyHex: '', // Friend chat has no msgKey, use empty string
        version: Number(web.keyVersion || 1),
        source: 'web',
      })
      console.log('[e2ee] derive_friend_rel_key OK(web)', { fid, len: last.length })
    }
    if (app?.publicKey) {
      last = await tauriInvoke<string>('derive_friend_rel_key', {
        friendId: fid,
        publicKeyHex: String(app.publicKey),
        encryptedMsgKeyHex: '', // Friend chat has no msgKey, use empty string
        version: Number(app.keyVersion || 1),
        source: 'app',
      })
      console.log('[e2ee] derive_friend_rel_key OK(app)', { fid, len: last.length })
    }
    return last
  })().finally(() => {
    pendingFriendKeys.delete(fid)
  })

  pendingFriendKeys.set(fid, task)
  return task
}

/**
 * 按消息携带的具体 keyVersion/source 补齐好友 relKey。
 *
 * 老 im 在收到私聊时会用 `source` 判断请求 `webKeyVersion` 或
 * `appKeyVersion`，而不是只拿最新 key。这里用于解密失败后的精准重试。
 */
export async function ensureFriendRelKeyForVersion(
  uid: string | number,
  friendId: string | number,
  version: number,
  source?: string,
): Promise<string> {
  if (!isTauri()) {
    throw new Error('ensureFriendRelKeyForVersion: Tauri only')
  }
  const fid = String(friendId)
  const ver = Number(version || 0)
  const src = String(source || '').toLowerCase()
  if (!fid || !ver) return ''
  if (fid === String(uid) && src === 'web') {
    const own = loadOwnKey(uid)
    if (!own || Number(own.keyVersion || 0) !== ver) {
      console.warn('[e2ee] skip deriving self web key for non-local version', {
        uid,
        ver,
        localVersion: own?.keyVersion,
      })
      return ''
    }
  }

  if (src === 'web' || src === 'app') {
    const cacheHit = await tauriInvoke<boolean>('has_friend_rel_key', {
      friendId: fid,
      version: ver,
      source: src,
    })
    if (cacheHit) return ''
  }

  const pendingKey = `${fid}:${ver}:${src || 'any'}`
  const existing = pendingFriendVersionKeys.get(pendingKey)
  if (existing) return existing

  const task = (async () => {
    await ensureOwnKeyPair(uid)
    const req: {
      targetId: number
      webKeyVersion?: number
      appKeyVersion?: number
    } = {
      targetId: Number(fid),
    }
    if (src === 'web') {
      req.webKeyVersion = ver
    } else if (src === 'app') {
      req.appKeyVersion = ver
    } else {
      const own = fid === String(uid) ? loadOwnKey(uid) : null
      if (fid !== String(uid) || Number(own?.keyVersion || 0) === ver) {
        req.webKeyVersion = ver
      }
      req.appKeyVersion = ver
    }
    const resp = await getKeyPair(req)
    const web = (resp as any)?.webKeyPair
    const app = (resp as any)?.appKeyPair
    let last = ''
    if (web?.publicKey && Number(web.keyVersion || 0) === ver) {
      last = await tauriInvoke<string>('derive_friend_rel_key', {
        friendId: fid,
        publicKeyHex: String(web.publicKey),
        encryptedMsgKeyHex: '',
        version: ver,
        source: 'web',
      })
      console.log('[e2ee] derive_friend_rel_key OK(web/version)', { fid, ver, len: last.length })
    }
    if (app?.publicKey && Number(app.keyVersion || 0) === ver) {
      last = await tauriInvoke<string>('derive_friend_rel_key', {
        friendId: fid,
        publicKeyHex: String(app.publicKey),
        encryptedMsgKeyHex: '',
        version: ver,
        source: 'app',
      })
      console.log('[e2ee] derive_friend_rel_key OK(app/version)', { fid, ver, len: last.length })
    }
    return last
  })().finally(() => {
    pendingFriendVersionKeys.delete(pendingKey)
  })

  pendingFriendVersionKeys.set(pendingKey, task)
  return task
}
