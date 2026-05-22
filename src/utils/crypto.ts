/**
 * AES-128-ECB encryption/decryption module.
 * Compatible with OCS protocol: CryptoJS AES ECB PKCS7.
 */
import CryptoJS from 'crypto-js'

/**
 * Custom u8array encoder for CryptoJS WordArray <-> Uint8Array/Int8Array conversion.
 * Mirrors the OCS CryptoJS.enc.u8array implementation.
 */
function wordArrayToUint8Array(wordArray: CryptoJS.lib.WordArray): Uint8Array {
  const words = wordArray.words
  const sigBytes = wordArray.sigBytes
  const u8 = new Uint8Array(sigBytes)
  for (let i = 0; i < sigBytes; i++) {
    u8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
  }
  return u8
}

function uint8ArrayToWordArray(u8: Uint8Array | Int8Array): CryptoJS.lib.WordArray {
  const words: number[] = []
  for (let i = 0; i < u8.length; i += 4) {
    words.push(
      ((u8[i] & 0xff) << 24) |
      ((u8[i + 1] & 0xff) << 16) |
      ((u8[i + 2] & 0xff) << 8) |
      (u8[i + 3] & 0xff)
    )
  }
  return CryptoJS.lib.WordArray.create(words, u8.length)
}

/**
 * AES-128-ECB encrypt a Uint8Array with a string key.
 * @param key - 16-char string key
 * @param data - plaintext bytes
 * @returns ciphertext as Uint8Array
 */
export function aesEncrypt(key: string, data: Uint8Array): Uint8Array {
  const keyHex = CryptoJS.enc.Utf8.parse(key)
  const dataWordArray = uint8ArrayToWordArray(data)
  const encrypted = CryptoJS.AES.encrypt(dataWordArray, keyHex, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return wordArrayToUint8Array(encrypted.ciphertext)
}

/**
 * AES-128-ECB decrypt a Uint8Array with a string key.
 * @param data - ciphertext bytes
 * @param key - 16-char string key (only first 16 chars used)
 * @returns plaintext as Uint8Array
 */
export function aesDecrypt(data: Uint8Array | Int8Array, key: string): Uint8Array {
  const keyHex = CryptoJS.enc.Utf8.parse(key.slice(0, 16))
  const dataWordArray = uint8ArrayToWordArray(data)
  const base64Str = dataWordArray.toString(CryptoJS.enc.Base64)
  const decrypted = CryptoJS.AES.decrypt(base64Str, keyHex, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return wordArrayToUint8Array(decrypted)
}

/**
 * AES-128-ECB encrypt a UTF-8 string (for API header signing etc.)
 * Mirrors old im `encrypt()` and returns base64 text for header signing.
 */
export function aesEncryptString(plaintext: string, key: string): string {
  const keyHex = CryptoJS.enc.Utf8.parse(key)
  const src = CryptoJS.enc.Utf8.parse(plaintext)
  const encrypted = CryptoJS.AES.encrypt(src, keyHex, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return encrypted.toString()
}
