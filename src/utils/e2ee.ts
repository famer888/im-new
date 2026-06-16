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

function e2eeDebugLog(...args: unknown[]) {
  void args
}

function e2eeDiag(message: string, data: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'warn') {
  void message
  void data
  void level
}

function imageKeyDebugLog(message: string, data: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'info') {
  const line = typeof data.debugLine === 'string' ? ` ${data.debugLine}` : ''
  const prefixedMessage = `[DEBUG-img-send] ${message}${line}`
  console[level](prefixedMessage, data)
  if (!isTauri()) return
  void tauriInvoke('image_send_log', {
    payload: {
      level,
      message: prefixedMessage,
      data,
    },
  }).catch(() => {})
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

type FriendKeyPair = { publicKey?: string; keyVersion?: number } | null
type FriendKeyCacheEntry = Record<string, string>
type FriendKeyCache = Record<string, FriendKeyCacheEntry>

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

async function loadOwnKeyFromStableStore(uid: string | number): Promise<OwnKeyPair | null> {
  if (!isTauri()) return null
  try {
    const kp = await tauriInvoke<OwnKeyPair | null>('load_own_curve_key', { uid: String(uid) })
    if (!kp?.privateKey || !kp?.publicKey || !kp?.keyVersion) return null
    return {
      privateKey: String(kp.privateKey).toUpperCase(),
      publicKey: String(kp.publicKey).toUpperCase(),
      keyVersion: Number(kp.keyVersion),
    }
  } catch (err) {
    console.warn('[e2ee] load_own_curve_key failed, fallback localStorage:', err)
    return null
  }
}

async function persistOwnKey(uid: string | number, kp: OwnKeyPair): Promise<void> {
  saveOwnKey(uid, kp)
  if (!isTauri()) return
  try {
    await tauriInvoke<void>('save_own_curve_key', {
      uid: String(uid),
      privateKey: kp.privateKey,
      publicKey: kp.publicKey,
      keyVersion: Number(kp.keyVersion || 0),
    })
  } catch (err) {
    console.warn('[e2ee] save_own_curve_key failed:', err)
  }
}

const friendKeyCacheByLogin = new Map<string, FriendKeyCache>()

function friendKeyStorageKey(uid: string | number): string {
  // 对齐旧版 im：继续沿用 `${loginId}-friend-key-objs` 作为好友公钥缓存 key。
  return `${String(uid)}-friend-key-objs`
}

function normalizeFriendCachePublicKey(value: unknown): string {
  return String(value || '').trim().toUpperCase()
}

function loadFriendKeyCache(loginUid: string | number): FriendKeyCache {
  const uid = String(loginUid || '').trim()
  if (!uid) return {}
  const memory = friendKeyCacheByLogin.get(uid)
  if (memory) return memory
  try {
    const raw = localStorage.getItem(friendKeyStorageKey(uid))
    if (!raw) {
      const empty: FriendKeyCache = {}
      friendKeyCacheByLogin.set(uid, empty)
      return empty
    }
    const parsed = JSON.parse(raw) as FriendKeyCache
    const normalized: FriendKeyCache = {}
    for (const [friendId, keyInfos] of Object.entries(parsed || {})) {
      if (!keyInfos || typeof keyInfos !== 'object') continue
      const entry: FriendKeyCacheEntry = {}
      for (const [key, value] of Object.entries(keyInfos)) {
        const publicKey = normalizeFriendCachePublicKey(value)
        if (!publicKey) continue
        entry[key] = publicKey
      }
      if (Object.keys(entry).length > 0) {
        normalized[String(friendId)] = entry
      }
    }
    friendKeyCacheByLogin.set(uid, normalized)
    return normalized
  } catch (err) {
    console.warn('[e2ee] load friend key cache failed:', err)
    const empty: FriendKeyCache = {}
    friendKeyCacheByLogin.set(uid, empty)
    return empty
  }
}

function saveFriendKeyCache(loginUid: string | number, cache: FriendKeyCache) {
  const uid = String(loginUid || '').trim()
  if (!uid) return
  friendKeyCacheByLogin.set(uid, cache)
  try {
    localStorage.setItem(friendKeyStorageKey(uid), JSON.stringify(cache))
  } catch (err) {
    console.warn('[e2ee] save friend key cache failed:', err)
  }
}

function friendCacheKey(source: 'app' | 'web', version: number): string {
  return `${source === 'app' ? 'app' : 'pc'}-${version}`
}

function upsertFriendPublicKey(
  loginUid: string | number,
  friendId: string | number,
  source: 'app' | 'web',
  keyVersion: unknown,
  publicKey: unknown,
): boolean {
  const uid = String(loginUid || '').trim()
  const fid = String(friendId || '').trim()
  const version = Number(keyVersion || 0)
  const normalizedKey = normalizeFriendCachePublicKey(publicKey)
  if (!uid || !fid || !version || !normalizedKey) return false

  const cache = loadFriendKeyCache(uid)
  const entry = { ...(cache[fid] || {}) }
  const key = friendCacheKey(source, version)
  if (entry[key] === normalizedKey) return false
  entry[key] = normalizedKey
  cache[fid] = entry
  saveFriendKeyCache(uid, cache)
  return true
}

function pickLatestFriendKeyPair(entry: FriendKeyCacheEntry | undefined, source: 'app' | 'web'): FriendKeyPair {
  if (!entry) return null
  const prefix = source === 'app' ? 'app-' : 'pc-'
  let bestVersion = 0
  let bestPublicKey = ''
  for (const [key, publicKeyRaw] of Object.entries(entry)) {
    if (!key.startsWith(prefix)) continue
    const version = Number(key.slice(prefix.length))
    const publicKey = normalizeFriendCachePublicKey(publicKeyRaw)
    if (!version || !publicKey) continue
    if (version > bestVersion) {
      bestVersion = version
      bestPublicKey = publicKey
    }
  }
  if (!bestVersion || !bestPublicKey) return null
  return { publicKey: bestPublicKey, keyVersion: bestVersion }
}

function getCachedFriendKeyPairs(loginUid: string | number, friendId: string | number): FriendKeyPairResponse {
  const entry = loadFriendKeyCache(loginUid)[String(friendId || '').trim()]
  return {
    appKeyPair: pickLatestFriendKeyPair(entry, 'app'),
    webKeyPair: pickLatestFriendKeyPair(entry, 'web'),
  }
}

function getCachedFriendKeyPairForVersion(
  loginUid: string | number,
  friendId: string | number,
  version: number,
  source?: string,
): FriendKeyPairResponse {
  const entry = loadFriendKeyCache(loginUid)[String(friendId || '').trim()]
  if (!entry || !version) {
    return {}
  }
  const result: FriendKeyPairResponse = {}
  const webPublicKey = normalizeFriendCachePublicKey(entry[friendCacheKey('web', version)])
  const appPublicKey = normalizeFriendCachePublicKey(entry[friendCacheKey('app', version)])
  if ((!source || source === 'web') && webPublicKey) {
    result.webKeyPair = {
      publicKey: webPublicKey,
      keyVersion: version,
    }
  }
  if ((!source || source === 'app') && appPublicKey) {
    result.appKeyPair = {
      publicKey: appPublicKey,
      keyVersion: version,
    }
  }
  return result
}

function persistFriendKeyPairs(
  loginUid: string | number,
  friendId: string | number,
  resp: FriendKeyPairResponse | null | undefined,
) {
  if (!resp) return
  upsertFriendPublicKey(loginUid, friendId, 'app', resp.appKeyPair?.keyVersion, resp.appKeyPair?.publicKey)
  upsertFriendPublicKey(loginUid, friendId, 'web', resp.webKeyPair?.keyVersion, resp.webKeyPair?.publicKey)
}

export function updateFriendKeyCacheFromPush(
  loginUid: string | number,
  payload: {
    uid?: string | number
    appKeyPair?: { publicKey?: string; keyVersion?: number } | null
    webKeyPair?: { publicKey?: string; keyVersion?: number } | null
  },
) {
  const friendId = String(payload?.uid || '').trim()
  if (!friendId) return
  // 对齐旧版 im：20501 推送到达后，把好友 app/web 公钥按版本写入本地缓存，
  // 后续即使接口临时返回空 key，发送链路也能继续从本地恢复。
  persistFriendKeyPairs(loginUid, friendId, {
    appKeyPair: payload?.appKeyPair || null,
    webKeyPair: payload?.webKeyPair || null,
  })
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
let pendingOwnKeyServerCheck: Promise<void> | null = null
let lastOwnKeyServerCheckAt = 0
const OWN_KEY_SERVER_CHECK_INTERVAL_MS = 5 * 60 * 1000

export async function ensureOwnKeyPair(uid: string | number): Promise<OwnKeyPair> {
  if (!isTauri()) {
    throw new Error('ensureOwnKeyPair: Tauri only')
  }
  const startedAt = Date.now()
  e2eeDiag('ensure own key start', { uid })
  const stableLoadStartedAt = Date.now()
  const stableCached = await loadOwnKeyFromStableStore(uid)
  e2eeDiag('load stable own key done', {
    uid,
    hasStableCached: !!stableCached,
    durationMs: Date.now() - stableLoadStartedAt,
  })
  const localLoadStartedAt = Date.now()
  const localCached = loadOwnKey(uid)
  e2eeDiag('load localStorage own key done', {
    uid,
    hasLocalCached: !!localCached,
    durationMs: Date.now() - localLoadStartedAt,
  })
  const cached = stableCached || localCached
  if (cached) {
    e2eeDiag('own key cache hit', {
      uid,
      source: stableCached ? 'stable-store' : 'localStorage',
      keyVersion: cached.keyVersion,
      elapsedMs: Date.now() - startedAt,
    })
    upsertFriendPublicKey(uid, uid, 'web', cached.keyVersion, cached.publicKey)
    if (stableCached && !localCached) {
      saveOwnKey(uid, cached)
    } else if (!stableCached && localCached) {
      const persistStartedAt = Date.now()
      await persistOwnKey(uid, localCached)
      e2eeDiag('persist local cached own key to stable store done', {
        uid,
        durationMs: Date.now() - persistStartedAt,
      })
    }
    e2eeDebugLog('[e2ee] ensureOwnKeyPair: cache hit', {
      uid,
      publicKeyHead: cached.publicKey.slice(0, 16),
      keyVersion: cached.keyVersion,
    })

    if (!pendingOwnKeyServerCheck && Date.now() - lastOwnKeyServerCheckAt > OWN_KEY_SERVER_CHECK_INTERVAL_MS) {
      // 发送热路径不能同步等待 /sys/getKeyPair 自检；本地私钥可用时先放行，服务端版本校验后台节流执行。
      pendingOwnKeyServerCheck = (async () => {
        lastOwnKeyServerCheckAt = Date.now()
        let selfAppKeyPair: any = null
      const serverCheckStartedAt = Date.now()
      e2eeDiag('server self key check start', { uid })
      const resp = await getKeyPair({ targetId: Number(uid), flag: 0 })
      e2eeDiag('server self key check done', {
        uid,
        durationMs: Date.now() - serverCheckStartedAt,
      })
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
        const rotateStartedAt = Date.now()
        e2eeDiag('own key cache mismatch rotate start', {
          uid,
          cachedKeyVersion: cached.keyVersion,
          serverWebKeyVersion,
        })
        const fresh = await tauriInvoke<{
          privateKeyHex: string
          publicKeyHex: string
        }>('generate_curve25519_keypair')
        e2eeDiag('generate rotated own key done', {
          uid,
          durationMs: Date.now() - rotateStartedAt,
        })
        const updateStartedAt = Date.now()
        const upd = await updateKeyPair({ publicKey: fresh.publicKeyHex })
        e2eeDiag('update rotated own key done', {
          uid,
          durationMs: Date.now() - updateStartedAt,
        })
        const keyVersion = Number((upd as any)?.keyVersion || 0)
        if (!keyVersion) {
          throw new Error('[e2ee] updateKeyPair returned empty keyVersion after cache mismatch')
        }
        const kp: OwnKeyPair = {
          privateKey: fresh.privateKeyHex,
          publicKey: fresh.publicKeyHex,
          keyVersion,
        }
        await persistOwnKey(uid, kp)
        upsertFriendPublicKey(uid, uid, 'web', kp.keyVersion, kp.publicKey)
        const injectStartedAt = Date.now()
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
        e2eeDiag('rotated own key injected and self rel_key derived', {
          uid,
          keyVersion: kp.keyVersion,
          durationMs: Date.now() - injectStartedAt,
          totalDurationMs: Date.now() - startedAt,
        })
        e2eeDebugLog('[e2ee] rotated and derived self web rel_key', {
          uid,
          keyVersion: kp.keyVersion,
          pubHead: kp.publicKey.slice(0, 16),
        })
        return
      }

        if (selfAppKeyPair?.publicKey && selfAppKeyPair?.keyVersion) {
          upsertFriendPublicKey(uid, uid, 'app', selfAppKeyPair.keyVersion, selfAppKeyPair.publicKey)
          try {
            const deriveAppStartedAt = Date.now()
            await tauriInvoke<string>('derive_friend_rel_key', {
              friendId: String(uid),
              publicKeyHex: String(selfAppKeyPair.publicKey),
              encryptedMsgKeyHex: '',
              version: Number(selfAppKeyPair.keyVersion || 1),
              source: 'app',
            })
            e2eeDiag('derive self app rel_key done', {
              uid,
              durationMs: Date.now() - deriveAppStartedAt,
            })
            e2eeDebugLog('[e2ee] derived self app rel_key (cache hit)');
          } catch (err) {
            console.error('[e2ee] derive self app rel_key failed (cache hit)', err);
            e2eeDiag('derive self app rel_key failed', {
              uid,
              message: err instanceof Error ? err.message : String(err),
            }, 'error')
          }
        }
      })()
        .catch((err) => {
          console.warn('[e2ee] own web key server check failed, using local cache:', err)
          e2eeDiag('server self key check failed, using local cache', {
            uid,
            elapsedMs: Date.now() - startedAt,
            message: err instanceof Error ? err.message : String(err),
          }, 'warn')
        })
        .finally(() => {
          pendingOwnKeyServerCheck = null
        })
    } else {
      e2eeDiag('server self key check skipped on hot path', {
        uid,
        hasPendingCheck: !!pendingOwnKeyServerCheck,
        elapsedSinceLastCheckMs: Date.now() - lastOwnKeyServerCheckAt,
      })
    }

    const injectStartedAt = Date.now()
    e2eeDiag('inject cached own private key start', { uid })
    await tauriInvoke<void>('set_curve_private_key_hex', {
      privateKeyHex: cached.privateKey,
    })
    e2eeDiag('inject cached own private key done', {
      uid,
      durationMs: Date.now() - injectStartedAt,
    })

    try {
      const deriveWebStartedAt = Date.now()
      await tauriInvoke<string>('derive_friend_rel_key', {
        friendId: String(uid),
        publicKeyHex: cached.publicKey,
        encryptedMsgKeyHex: '',
        version: Number(cached.keyVersion || 1),
        source: 'web',
      })
      e2eeDiag('derive self web rel_key done', {
        uid,
        durationMs: Date.now() - deriveWebStartedAt,
      })
      e2eeDebugLog('[e2ee] derived self web rel_key (cache hit)');
    } catch (err) {
      console.error('[e2ee] derive self web rel_key failed (cache hit)', err);
      e2eeDiag('derive self web rel_key failed', {
        uid,
        message: err instanceof Error ? err.message : String(err),
      }, 'error')
    }

    e2eeDiag('ensure own key done from cache', {
      uid,
      keyVersion: cached.keyVersion,
      totalDurationMs: Date.now() - startedAt,
    })
    return cached
  }

  if (pendingOwnKey) {
    e2eeDiag('ensure own key pending reused', { uid })
    return pendingOwnKey
  }
  pendingOwnKey = (async () => {
    e2eeDebugLog('[e2ee] ensureOwnKeyPair: no local cache, fetching from server', { uid })
    e2eeDiag('no local own key, server bootstrap start', { uid })
    let existing: {
      publicKey?: string
      keyVersion?: number
    } = {}
    let selfAppKeyPair: any = null
    try {
      const serverFetchStartedAt = Date.now()
      const resp = await getKeyPair({ targetId: Number(uid), flag: 0 })
      e2eeDiag('bootstrap getKeyPair self done', {
        uid,
        durationMs: Date.now() - serverFetchStartedAt,
      })
      const web = (resp as any)?.webKeyPair
      const app = (resp as any)?.appKeyPair
      selfAppKeyPair = app
      e2eeDebugLog('[e2ee] getKeyPair(self) resp:', {
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
      e2eeDiag('bootstrap getKeyPair self failed, generate fresh', {
        uid,
        message: err instanceof Error ? err.message : String(err),
      }, 'warn')
    }

    // 本地 curve25519 私钥已丢 → 无法复用老 publicKey，只能重签一把。
    const generateStartedAt = Date.now()
    const fresh = await tauriInvoke<{
      privateKeyHex: string
      publicKeyHex: string
    }>('generate_curve25519_keypair')
    e2eeDiag('generate fresh own key done', {
      uid,
      durationMs: Date.now() - generateStartedAt,
    })
    e2eeDebugLog('[e2ee] generated new curve25519 keypair', {
      privLen: fresh.privateKeyHex.length,
      pubLen: fresh.publicKeyHex.length,
      pubHead: fresh.publicKeyHex.slice(0, 16),
    })

    const updateStartedAt = Date.now()
    const upd = await updateKeyPair({ publicKey: fresh.publicKeyHex })
    e2eeDiag('update fresh own key done', {
      uid,
      durationMs: Date.now() - updateStartedAt,
    })
    const keyVersion = Number((upd as any)?.keyVersion || 0)
    const commonResult = (upd as any)?.commonResult
    e2eeDebugLog('[e2ee] updateKeyPair resp:', { keyVersion, commonResult })
    if (!keyVersion) {
      throw new Error('[e2ee] updateKeyPair returned empty keyVersion')
    }

    const kp: OwnKeyPair = {
      privateKey: fresh.privateKeyHex,
      publicKey: fresh.publicKeyHex,
      keyVersion,
    }
    const persistStartedAt = Date.now()
    await persistOwnKey(uid, kp)
    e2eeDiag('persist fresh own key done', {
      uid,
      durationMs: Date.now() - persistStartedAt,
    })
    upsertFriendPublicKey(uid, uid, 'web', kp.keyVersion, kp.publicKey)

    const injectStartedAt = Date.now()
    await tauriInvoke<void>('set_curve_private_key_hex', {
      privateKeyHex: kp.privateKey,
    })
    e2eeDiag('inject fresh own private key done', {
      uid,
      durationMs: Date.now() - injectStartedAt,
    })

    try {
      const deriveWebStartedAt = Date.now()
      await tauriInvoke<string>('derive_friend_rel_key', {
        friendId: String(uid),
        publicKeyHex: kp.publicKey,
        encryptedMsgKeyHex: '',
        version: Number(kp.keyVersion || 1),
        source: 'web',
      })
      e2eeDiag('derive fresh self web rel_key done', {
        uid,
        durationMs: Date.now() - deriveWebStartedAt,
      })
      e2eeDebugLog('[e2ee] derived self web rel_key');
    } catch (err) {
      console.error('[e2ee] derive self web rel_key failed', err);
      e2eeDiag('derive fresh self web rel_key failed', {
        uid,
        message: err instanceof Error ? err.message : String(err),
      }, 'error')
    }

    if (selfAppKeyPair?.publicKey && selfAppKeyPair?.keyVersion) {
      upsertFriendPublicKey(uid, uid, 'app', selfAppKeyPair.keyVersion, selfAppKeyPair.publicKey)
      try {
        const deriveAppStartedAt = Date.now()
        await tauriInvoke<string>('derive_friend_rel_key', {
          friendId: String(uid),
          publicKeyHex: String(selfAppKeyPair.publicKey),
          encryptedMsgKeyHex: '',
          version: Number(selfAppKeyPair.keyVersion || 1),
          source: 'app',
        })
        e2eeDiag('derive fresh self app rel_key done', {
          uid,
          durationMs: Date.now() - deriveAppStartedAt,
        })
        e2eeDebugLog('[e2ee] derived self app rel_key');
      } catch (err) {
        console.error('[e2ee] derive self app rel_key failed', err);
        e2eeDiag('derive fresh self app rel_key failed', {
          uid,
          message: err instanceof Error ? err.message : String(err),
        }, 'error')
      }
    }
    e2eeDebugLog('[e2ee] ensureOwnKeyPair DONE', {
      uid,
      keyVersion: kp.keyVersion,
      pubHead: kp.publicKey.slice(0, 16),
      existingOnServer: existing,
    })
    e2eeDiag('ensure own key done from fresh key', {
      uid,
      keyVersion: kp.keyVersion,
      totalDurationMs: Date.now() - startedAt,
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
const pendingChannelKeys = new Map<string, Promise<string>>()
const pendingFriendKeys = new Map<string, Promise<string>>()
const pendingFriendVersionKeys = new Map<string, Promise<string>>()

type FriendKeyPairResponse = {
  appKeyPair?: { publicKey?: string; keyVersion?: number } | null
  webKeyPair?: { publicKey?: string; keyVersion?: number } | null
}

async function requestFriendKeyPair(
  friendId: string,
  options?: {
    webKeyVersion?: number
    appKeyVersion?: number
  },
): Promise<FriendKeyPairResponse> {
  const primaryReq: {
    targetId: number
    flag: number
    webKeyVersion?: number
    appKeyVersion?: number
  } = {
    targetId: Number(friendId),
    flag: 1,
  }
  if (options?.webKeyVersion !== undefined) primaryReq.webKeyVersion = options.webKeyVersion
  if (options?.appKeyVersion !== undefined) primaryReq.appKeyVersion = options.appKeyVersion

  try {
    const primaryResp = await getKeyPair(primaryReq) as FriendKeyPairResponse
    if (primaryResp?.webKeyPair?.publicKey || primaryResp?.appKeyPair?.publicKey) {
      return primaryResp
    }
    // 对齐旧 im：单聊好友取钥匙不带 flag；flag=1 在部分新好友上会返回空 key。
    console.debug('[e2ee] requestFriendKeyPair primary returned empty keys, fallback legacy request', {
      friendId,
      options,
    })
  } catch (error) {
    console.warn('[e2ee] requestFriendKeyPair primary failed, fallback legacy request', {
      friendId,
      options,
      error: String(error),
    })
  }

  const legacyReq: {
    targetId: number
    webKeyVersion?: number
    appKeyVersion?: number
  } = {
    targetId: Number(friendId),
  }
  if (options?.webKeyVersion !== undefined) legacyReq.webKeyVersion = options.webKeyVersion
  if (options?.appKeyVersion !== undefined) legacyReq.appKeyVersion = options.appKeyVersion
  return await getKeyPair(legacyReq) as FriendKeyPairResponse
}

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
  const startedAt = Date.now()
  e2eeDiag('ensure group rel key start', { uid, groupId: gid })

  const cachedHit = await tauriInvoke<boolean>('has_group_rel_key', { groupId: gid })
  if (cachedHit) {
    e2eeDebugLog('[e2ee] ensureGroupRelKey: rust cache hit', { gid })
    e2eeDiag('ensure group rel key cache hit', {
      groupId: gid,
      totalDurationMs: Date.now() - startedAt,
    })
    return ''
  }

  const existing = pendingGroupKeys.get(gid)
  if (existing) {
    e2eeDiag('ensure group rel key pending reused', { groupId: gid })
    return existing
  }

  const task = (async () => {
    e2eeDebugLog('[e2ee] ensureGroupRelKey: start', { uid, gid })
    const ownStartedAt = Date.now()
    await ensureOwnKeyPair(uid)
    e2eeDiag('ensure group own key ready', {
      groupId: gid,
      durationMs: Date.now() - ownStartedAt,
    })

    const getKeyStartedAt = Date.now()
    const resp = await getKeyPair({
      targetId: Number(gid),
      flag: 1,
      groupKeyVersion: 1,
    })
    e2eeDiag('ensure group getKeyPair done', {
      groupId: gid,
      durationMs: Date.now() - getKeyStartedAt,
    })
    const gkp = (resp as any)?.groupKeyPair
    e2eeDebugLog('[e2ee] getKeyPair(group) resp:', {
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
      const deriveStartedAt = Date.now()
      const relKey = await tauriInvoke<string>('derive_group_rel_key', {
        groupId: gid,
        publicKeyHex: String(gkp.publicKey),
        encryptedMsgKeyHex: String(gkp.msgKey),
      })
      e2eeDiag('ensure group derive rel key done', {
        groupId: gid,
        durationMs: Date.now() - deriveStartedAt,
        totalDurationMs: Date.now() - startedAt,
      })
      e2eeDebugLog('[e2ee] ensureGroupRelKey DONE', {
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
 * 保证频道 `channelId` 的 relKey 已经被 Rust 缓存。
 *
 * 对齐老 im `fnChannelRelKeyGet`：
 *   GetKeyPair({ targetId: channelId, flag: 3, channelKeyVersion: 1 })
 *   → channelKeyPair(publicKey/msgKey) → 本地派生 relKey。
 */
export async function ensureChannelRelKey(
  uid: string | number,
  channelId: string | number,
): Promise<string> {
  if (!isTauri()) {
    throw new Error('ensureChannelRelKey: Tauri only')
  }
  const cid = String(channelId)

  const cachedHit = await tauriInvoke<boolean>('has_channel_rel_key', { channelId: cid })
  if (cachedHit) {
    e2eeDebugLog('[e2ee] ensureChannelRelKey: rust cache hit', { cid })
    return ''
  }

  const existing = pendingChannelKeys.get(cid)
  if (existing) return existing

  const task = (async () => {
    e2eeDebugLog('[e2ee] ensureChannelRelKey: start', { uid, cid })
    await ensureOwnKeyPair(uid)

    const resp = await getKeyPair({
      targetId: Number(cid),
      flag: 3,
      channelKeyVersion: 1,
    })
    const ckp = (resp as any)?.channelKeyPair
    e2eeDebugLog('[e2ee] getKeyPair(channel) resp:', {
      cid,
      hasCkp: !!ckp,
      publicKeyLen: ckp?.publicKey ? String(ckp.publicKey).length : 0,
      publicKeyHead: ckp?.publicKey ? String(ckp.publicKey).slice(0, 16) : null,
      msgKeyLen: ckp?.msgKey ? String(ckp.msgKey).length : 0,
      msgKeyHead: ckp?.msgKey ? String(ckp.msgKey).slice(0, 16) : null,
      keyVersion: ckp?.keyVersion,
    })
    if (!ckp?.publicKey || !ckp?.msgKey) {
      throw new Error(`[e2ee] getKeyPair(channel=${cid}) missing publicKey/msgKey`)
    }

    try {
      const relKey = await tauriInvoke<string>('derive_channel_rel_key', {
        channelId: cid,
        publicKeyHex: String(ckp.publicKey),
        encryptedMsgKeyHex: String(ckp.msgKey),
      })
      e2eeDebugLog('[e2ee] ensureChannelRelKey DONE', {
        cid,
        relKeyLen: relKey.length,
        relKeyHead: relKey.slice(0, 8),
      })
      return relKey
    } catch (err) {
      console.error('[e2ee] derive_channel_rel_key FAILED', {
        cid,
        err: String(err),
        publicKey: String(ckp.publicKey),
        msgKey: String(ckp.msgKey),
      })
      throw err
    }
  })().finally(() => {
    pendingChannelKeys.delete(cid)
  })

  pendingChannelKeys.set(cid, task)
  return task
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
  const startedAt = Date.now()
  e2eeDiag('ensure friend rel key start', { uid, friendId: fid, forceRefresh })
  e2eeDebugLog('[e2ee] ensureFriendRelKey: start', { uid, fid })
  const ownStartedAt = Date.now()
  await ensureOwnKeyPair(uid)
  e2eeDiag('ensure friend own key ready', {
    friendId: fid,
    durationMs: Date.now() - ownStartedAt,
  })

  if (!forceRefresh) {
    const cacheHit = await tauriInvoke<boolean>('has_friend_rel_key', { friendId: fid })
    if (cacheHit) {
      e2eeDebugLog('[e2ee] ensureFriendRelKey: rust cache hit', { fid })
      e2eeDiag('ensure friend rel key cache hit', {
        friendId: fid,
        totalDurationMs: Date.now() - startedAt,
      })
      return ''
    }
  }

  if (forceRefresh) {
    pendingFriendKeys.delete(fid)
    try {
      await tauriInvoke<void>('clear_friend_rel_key', { friendId: fid })
    } catch (err) {
      console.warn('[e2ee] clear_friend_rel_key failed', { fid, err: String(err) })
    }
  }

  const existing = pendingFriendKeys.get(fid)
  if (existing) {
    e2eeDiag('ensure friend rel key pending reused', { friendId: fid })
    return existing
  }

  const task = (async () => {
    // 对齐老 im：先用本地缓存中的最新 app/web 公钥；只有缺口时才再调接口补全。
    // 这样服务端偶发返回空 key 时，单聊发送仍可继续使用已有缓存。
    let merged = getCachedFriendKeyPairs(uid, fid)
    let web: any = merged.webKeyPair
    let app: any = merged.appKeyPair
    if (!web?.publicKey || !app?.publicKey) {
      try {
        const requestStartedAt = Date.now()
        const resp = await requestFriendKeyPair(fid, {
          webKeyVersion: -1,
          appKeyVersion: -1,
        })
        e2eeDiag('ensure friend request key pair done', {
          friendId: fid,
          durationMs: Date.now() - requestStartedAt,
        })
        persistFriendKeyPairs(uid, fid, resp)
        merged = getCachedFriendKeyPairs(uid, fid)
        web = merged.webKeyPair
        app = merged.appKeyPair
      } catch (err) {
        console.warn('[e2ee] requestFriendKeyPair(friend/latest) failed, keep cached keys', {
          fid,
          err: String(err),
          hasCachedWeb: !!web?.publicKey,
          hasCachedApp: !!app?.publicKey,
        })
      }
    }
    e2eeDebugLog('[e2ee] getKeyPair(friend) resp:', {
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
      const deriveWebStartedAt = Date.now()
      last = await tauriInvoke<string>('derive_friend_rel_key', {
        friendId: fid,
        publicKeyHex: String(web.publicKey),
        encryptedMsgKeyHex: '', // Friend chat has no msgKey, use empty string
        version: Number(web.keyVersion || 1),
        source: 'web',
      })
      e2eeDiag('ensure friend derive web rel key done', {
        friendId: fid,
        durationMs: Date.now() - deriveWebStartedAt,
      })
      e2eeDebugLog('[e2ee] derive_friend_rel_key OK(web)', { fid, len: last.length })
    }
    if (app?.publicKey) {
      const deriveAppStartedAt = Date.now()
      last = await tauriInvoke<string>('derive_friend_rel_key', {
        friendId: fid,
        publicKeyHex: String(app.publicKey),
        encryptedMsgKeyHex: '', // Friend chat has no msgKey, use empty string
        version: Number(app.keyVersion || 1),
        source: 'app',
      })
      e2eeDiag('ensure friend derive app rel key done', {
        friendId: fid,
        durationMs: Date.now() - deriveAppStartedAt,
      })
      e2eeDebugLog('[e2ee] derive_friend_rel_key OK(app)', { fid, len: last.length })
    }

    const own = loadOwnKey(uid) || await loadOwnKeyFromStableStore(uid)
    if (own?.publicKey && own?.keyVersion) {
      const deriveSelfStartedAt = Date.now()
      last = await tauriInvoke<string>('derive_friend_rel_key', {
        friendId: String(uid),
        publicKeyHex: own.publicKey,
        encryptedMsgKeyHex: '',
        version: Number(own.keyVersion || 1),
        source: 'web',
      })
      e2eeDiag('ensure friend derive self warmup done', {
        friendId: fid,
        durationMs: Date.now() - deriveSelfStartedAt,
        totalDurationMs: Date.now() - startedAt,
      })
      e2eeDebugLog('[e2ee] derive self web rel_key OK(send warmup)', { uid, len: last.length })
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
  forceRefresh = false,
): Promise<string> {
  if (!isTauri()) {
    throw new Error('ensureFriendRelKeyForVersion: Tauri only')
  }
  const fid = String(friendId)
  const ver = Number(version || 0)
  const src = String(source || '').toLowerCase()
  if (!fid || !ver) return ''
  imageKeyDebugLog('friend-key version ensure start', {
    debugLine: `fid=${fid} version=${ver} source=${src || 'empty'} forceRefresh=${String(forceRefresh)}`,
    fid,
    version: ver,
    source: src,
    forceRefresh,
  })
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

  const pendingKey = `${fid}:${ver}:${src || 'any'}`
  if (forceRefresh) {
    pendingFriendVersionKeys.delete(pendingKey)
    try {
      await tauriInvoke<void>('clear_friend_rel_key', {
        friendId: fid,
        version: ver,
        source: src || undefined,
      })
    } catch (err) {
      console.warn('[e2ee] clear_friend_rel_key(version) failed', {
        fid,
        ver,
        source: src,
        err: String(err),
      })
    }
  }

  if (!forceRefresh && (src === 'web' || src === 'app')) {
    const cacheHit = await tauriInvoke<boolean>('has_friend_rel_key', {
      friendId: fid,
      version: ver,
      source: src,
    })
    imageKeyDebugLog('friend-key version cache check', {
      debugLine: `fid=${fid} version=${ver} source=${src} cacheHit=${String(cacheHit)}`,
      fid,
      version: ver,
      source: src,
      cacheHit,
    })
    if (cacheHit) return ''
  }

  const existing = pendingFriendVersionKeys.get(pendingKey)
  if (existing) return existing

  const task = (async () => {
    await ensureOwnKeyPair(uid)
    let cached = getCachedFriendKeyPairForVersion(uid, fid, ver, src || undefined)
    let web = cached.webKeyPair
    let app = cached.appKeyPair
    // 对齐老 im：好友私聊按版本补 key 不带 flag；flag=1 是群 key，会导致 PC 私聊 webKeyPair 取空。
    const req: {
      targetId: number
      flag?: number
      webKeyVersion?: number
      appKeyVersion?: number
    } = {
      targetId: Number(fid),
    }
    if (fid === String(uid)) {
      // 对齐老 im：同账号多端消息补自己 app/web 公钥时必须走 flag=0，
      // 否则服务端可能按“好友取钥匙”分支返回空 appKeyPair，导致传输助手消息长期停留在待同步状态。
      req.flag = 0
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
    imageKeyDebugLog('friend-key version request', {
      debugLine: [
        `fid=${fid}`,
        `version=${ver}`,
        `source=${src || 'empty'}`,
        `forceRefresh=${String(forceRefresh)}`,
        `reqWebVersion=${String(req.webKeyVersion ?? '') || 'empty'}`,
        `reqAppVersion=${String(req.appKeyVersion ?? '') || 'empty'}`,
        `flag=${String(req.flag ?? '') || 'empty'}`,
        `cachedWebVersion=${Number(web?.keyVersion || 0)}`,
        `cachedWebPubLen=${String(web?.publicKey || '').length}`,
        `cachedAppVersion=${Number(app?.keyVersion || 0)}`,
        `cachedAppPubLen=${String(app?.publicKey || '').length}`,
      ].join(' '),
      fid,
      version: ver,
      source: src,
      forceRefresh,
      reqWebVersion: req.webKeyVersion,
      reqAppVersion: req.appKeyVersion,
      flag: req.flag,
      cachedWebVersion: Number(web?.keyVersion || 0),
      cachedWebPubLen: String(web?.publicKey || '').length,
      cachedAppVersion: Number(app?.keyVersion || 0),
      cachedAppPubLen: String(app?.publicKey || '').length,
    })
    if (
      forceRefresh
      || ((src === 'web' || !src) && !web?.publicKey)
      || ((src === 'app' || !src) && !app?.publicKey)
    ) {
      try {
        let resp: any
        try {
          resp = await getKeyPair(req)
        } catch (error) {
          console.warn('[e2ee] getKeyPair(friend/version) primary failed, fallback legacy request', {
            fid,
            ver,
            source: src,
            error: String(error),
          })
          const legacyReq: {
            targetId: number
            flag?: number
            webKeyVersion?: number
            appKeyVersion?: number
          } = {
            targetId: Number(fid),
          }
          if (fid === String(uid)) legacyReq.flag = 0
          if (req.webKeyVersion !== undefined) legacyReq.webKeyVersion = req.webKeyVersion
          if (req.appKeyVersion !== undefined) legacyReq.appKeyVersion = req.appKeyVersion
          resp = await getKeyPair(legacyReq)
        }
        persistFriendKeyPairs(uid, fid, resp)
        cached = getCachedFriendKeyPairForVersion(uid, fid, ver, src || undefined)
        web = cached.webKeyPair
        app = cached.appKeyPair
        imageKeyDebugLog('friend-key version getKeyPair resp', {
          debugLine: [
            `fid=${fid}`,
            `version=${ver}`,
            `source=${src || 'empty'}`,
            `respHasWeb=${String(!!resp?.webKeyPair?.publicKey)}`,
            `respWebVersion=${Number(resp?.webKeyPair?.keyVersion || 0)}`,
            `respWebPubLen=${String(resp?.webKeyPair?.publicKey || '').length}`,
            `respHasApp=${String(!!resp?.appKeyPair?.publicKey)}`,
            `respAppVersion=${Number(resp?.appKeyPair?.keyVersion || 0)}`,
            `respAppPubLen=${String(resp?.appKeyPair?.publicKey || '').length}`,
            `cachedWebVersion=${Number(web?.keyVersion || 0)}`,
            `cachedWebPubLen=${String(web?.publicKey || '').length}`,
            `cachedAppVersion=${Number(app?.keyVersion || 0)}`,
            `cachedAppPubLen=${String(app?.publicKey || '').length}`,
          ].join(' '),
          fid,
          version: ver,
          source: src,
          respHasWeb: !!resp?.webKeyPair?.publicKey,
          respWebVersion: Number(resp?.webKeyPair?.keyVersion || 0),
          respWebPubLen: String(resp?.webKeyPair?.publicKey || '').length,
          respHasApp: !!resp?.appKeyPair?.publicKey,
          respAppVersion: Number(resp?.appKeyPair?.keyVersion || 0),
          respAppPubLen: String(resp?.appKeyPair?.publicKey || '').length,
          cachedWebVersion: Number(web?.keyVersion || 0),
          cachedWebPubLen: String(web?.publicKey || '').length,
          cachedAppVersion: Number(app?.keyVersion || 0),
          cachedAppPubLen: String(app?.publicKey || '').length,
        })
      } catch (error) {
        console.warn('[e2ee] getKeyPair(friend/version) failed, keep cached keys', {
          fid,
          ver,
          source: src,
          error: String(error),
          hasCachedWeb: !!web?.publicKey,
          hasCachedApp: !!app?.publicKey,
        })
        imageKeyDebugLog('friend-key version getKeyPair failed', {
          debugLine: [
            `fid=${fid}`,
            `version=${ver}`,
            `source=${src || 'empty'}`,
            `err=${String(error)}`,
            `hasCachedWeb=${String(!!web?.publicKey)}`,
            `cachedWebVersion=${Number(web?.keyVersion || 0)}`,
            `hasCachedApp=${String(!!app?.publicKey)}`,
            `cachedAppVersion=${Number(app?.keyVersion || 0)}`,
          ].join(' '),
          fid,
          version: ver,
          source: src,
          err: String(error),
          hasCachedWeb: !!web?.publicKey,
          cachedWebVersion: Number(web?.keyVersion || 0),
          hasCachedApp: !!app?.publicKey,
          cachedAppVersion: Number(app?.keyVersion || 0),
        }, 'warn')
      }
    }
    let last = ''
    if (web?.publicKey && Number(web.keyVersion || 0) === ver) {
      last = await tauriInvoke<string>('derive_friend_rel_key', {
        friendId: fid,
        publicKeyHex: String(web.publicKey),
        encryptedMsgKeyHex: '',
        version: ver,
        source: 'web',
      })
      e2eeDebugLog('[e2ee] derive_friend_rel_key OK(web/version)', { fid, ver, len: last.length })
      imageKeyDebugLog('friend-key version derive ok', {
        debugLine: `fid=${fid} version=${ver} source=web relKeyLen=${last.length}`,
        fid,
        version: ver,
        source: 'web',
        relKeyLen: last.length,
      })
    }
    if (app?.publicKey && Number(app.keyVersion || 0) === ver) {
      last = await tauriInvoke<string>('derive_friend_rel_key', {
        friendId: fid,
        publicKeyHex: String(app.publicKey),
        encryptedMsgKeyHex: '',
        version: ver,
        source: 'app',
      })
      e2eeDebugLog('[e2ee] derive_friend_rel_key OK(app/version)', { fid, ver, len: last.length })
      imageKeyDebugLog('friend-key version derive ok', {
        debugLine: `fid=${fid} version=${ver} source=app relKeyLen=${last.length}`,
        fid,
        version: ver,
        source: 'app',
        relKeyLen: last.length,
      })
    }
    imageKeyDebugLog('friend-key version ensure done', {
      debugLine: [
        `fid=${fid}`,
        `version=${ver}`,
        `source=${src || 'empty'}`,
        `derivedLen=${last.length}`,
        `finalWebVersion=${Number(web?.keyVersion || 0)}`,
        `finalWebPubLen=${String(web?.publicKey || '').length}`,
        `finalAppVersion=${Number(app?.keyVersion || 0)}`,
        `finalAppPubLen=${String(app?.publicKey || '').length}`,
      ].join(' '),
      fid,
      version: ver,
      source: src,
      derivedLen: last.length,
      finalWebVersion: Number(web?.keyVersion || 0),
      finalWebPubLen: String(web?.publicKey || '').length,
      finalAppVersion: Number(app?.keyVersion || 0),
      finalAppPubLen: String(app?.publicKey || '').length,
    }, last ? 'info' : 'warn')
    return last
  })().finally(() => {
    pendingFriendVersionKeys.delete(pendingKey)
  })

  pendingFriendVersionKeys.set(pendingKey, task)
  return task
}

function fallbackPlainFileKey(attachmentKey: string): string {
  const raw = String(attachmentKey || '').trim()
  if (!raw) return ''
  if (raw.length <= 32 || !/^[0-9a-f]+$/i.test(raw)) return raw
  return ''
}

export function normalizeResolvedFileKey(value: unknown): string {
  return fallbackPlainFileKey(String(value || ''))
}

function friendDecryptSources(source: unknown): string[] {
  const normalized = String(source || '').toLowerCase()
  if (normalized === 'app') return ['app', 'web']
  if (normalized === 'web') return ['web', 'app']
  return ['web', 'app']
}

export async function resolvePrivateAttachmentFileKey(params: {
  uid: string | number
  senderId: string | number
  version: number
  source?: string
  attachmentKey: string
}): Promise<string> {
  const attachmentKey = String(params.attachmentKey || '').trim()
  const plain = fallbackPlainFileKey(attachmentKey)
  if (plain) return plain
  if (!isTauri() || !attachmentKey || !params.senderId || !params.version) return ''

  const decrypt = async (forceRefresh: boolean) => {
    const sources = friendDecryptSources(params.source)
    // Rust 解附件 key 会按 app/web 兜底；前端也先把两端 relKey 补入缓存，避免兜底时 KeyNotFound。
    for (const source of sources) {
      await ensureFriendRelKeyForVersion(
        params.uid,
        params.senderId,
        Number(params.version || 0),
        source,
        forceRefresh,
      ).catch(() => '')
    }
    return tauriInvoke<string>('decrypt_private_attachment_key', {
      senderId: String(params.senderId),
      version: Number(params.version || 1),
      source: sources[0] || '',
      ciphertextHex: attachmentKey,
    })
  }

  try {
    return (await decrypt(false)).trim()
  } catch {
    try {
      return (await decrypt(true)).trim()
    } catch (err) {
      console.warn('[e2ee] resolve private attachment fileKey failed', {
        senderId: String(params.senderId),
        version: params.version,
        source: params.source,
        err: String(err),
      })
      return ''
    }
  }
}
