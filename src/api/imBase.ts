/**
 * Login & base API endpoints using the binary protobuf+AES pipeline.
 */
import { requestProto, proto } from './request'
import { getBaseUrl } from './config'

/**
 * Get QR code login token from the server.
 * POST /login/qrCodeUrl
 */
export async function getQrCodeUrl(baseUrl?: string): Promise<proto.QrCodeUrlResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/login/qrCodeUrl`,
    reqType: proto.QrCodeUrlReq,
    respType: proto.QrCodeUrlResp,
  })
}

/**
 * Check if the QR code has been scanned and user logged in.
 * POST /login/isLogin
 */
export async function getIsLogin(
  data: { token: string; sysMac: string; sysModel: string },
  baseUrl?: string,
): Promise<proto.IsLoginResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/login/isLogin`,
    reqType: proto.IsLoginReq,
    respType: proto.IsLoginResp,
    data: {
      token: data.token,
      sysMac: data.sysMac,
      sysModel: data.sysModel,
    },
  })
}

/**
 * Logout from the server.
 * POST /login/logout
 */
export async function logout(baseUrl?: string): Promise<proto.LogoutResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/login/logout`,
    reqType: proto.LogoutReq,
    respType: proto.LogoutResp,
  })
}

/**
 * Get user info.
 * POST /user/userInfo
 */
export async function getUserInfo(
  data: { uid: number },
  baseUrl?: string,
): Promise<proto.UserInfoResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/user/userInfo`,
    reqType: proto.UserInfoReq,
    respType: proto.UserInfoResp,
    data: { uid: data.uid },
  })
}
