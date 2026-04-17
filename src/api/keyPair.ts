/**
 * 端到端加密密钥相关的 HTTP 接口。
 *
 * 与老 im 一一对齐：
 * - GET /sys/getKeyPair     → 取当前用户 / 群 / 频道 / 好友的 keyPair
 * - POST /sys/updateKeyPair → 把客户端本地生成的 curve25519 publicKey 上报给服务端
 *
 * 参考：`im/src/api/imBase.js` 与 `im/src/utils/e2ee/index.js`。
 */
import { requestProto, proto } from './request'
import { getBaseUrl } from './config'

/**
 * 拉取 keyPair。
 * - `flag=0`：获取当前账号自身的 app/web keyPair（targetId 填自己的 uid）
 * - `flag=1`：获取指定群/频道/好友的密钥包；按 targetId 类型区分：
 *   - 群聊：groupKeyVersion=1 且 targetId=groupId
 *   - 好友：传 webKeyVersion / appKeyVersion 和对端 uid
 *   - 频道：channelKeyVersion=1 且 targetId=channelId
 */
export async function getKeyPair(
  data: {
    targetId: number | string
    flag?: number
    webKeyVersion?: number
    appKeyVersion?: number
    groupKeyVersion?: number
    channelKeyVersion?: number
  },
  baseUrl?: string,
): Promise<proto.GetKeyPairResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/sys/getKeyPair`,
    reqType: proto.GetKeyPairReq,
    respType: proto.GetKeyPairResp,
    data: {
      targetId: Number(data.targetId),
      flag: data.flag ?? 0,
      webKeyVersion: data.webKeyVersion ?? 0,
      appKeyVersion: data.appKeyVersion ?? 0,
      groupKeyVersion: data.groupKeyVersion ?? 0,
      channelKeyVersion: data.channelKeyVersion ?? 0,
    },
  })
}

/**
 * 上报客户端新生成的 curve25519 publicKey。服务端会记为当前账号的
 * `webKeyPair.publicKey` 并返回新的 keyVersion。对应老 im 中的
 * `UpdateKeyPair({ publicKey })`。
 *
 * 注意：当前 proto 里 `UpdateKeyPairReq` 只定义了 `clientInfo` + `publicKey`
 * 两个字段，老 im 的 `desc` 描述文本已不在协议中，这里直接忽略。
 */
export async function updateKeyPair(
  data: { publicKey: string },
  baseUrl?: string,
): Promise<proto.UpdateKeyPairResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/sys/updateKeyPair`,
    reqType: proto.UpdateKeyPairReq,
    respType: proto.UpdateKeyPairResp,
    data: { publicKey: data.publicKey },
  })
}
