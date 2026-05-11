/**
 * Login & base API endpoints using the binary protobuf+AES pipeline.
 */
import { requestProto, proto, getDeviceConfig } from './request'
import { API_CONFIG, getBaseUrl } from './config'
import { getActiveSessionId } from './sessionContext'
import * as $protobuf from 'protobufjs/minimal'
import {
  GroupMemberOnLineStatusListReq,
  GroupMemberOnLineStatusListResp,
  type IGroupMemberOnLineStatusListResp,
} from './groupOnlineStatusProto'
import { aesDecrypt, aesEncrypt, aesEncryptString } from '@/utils/crypto'
import { ungzip } from 'pako'

function getSessionIdFromStorage(): string {
  const activeSessionId = getActiveSessionId()
  if (activeSessionId) return activeSessionId

  try {
    const currentUid = localStorage.getItem('current-uid') || ''
    const accountListText = localStorage.getItem('login-account-list')
    const accountList = accountListText ? JSON.parse(accountListText) : []
    if (currentUid && Array.isArray(accountList)) {
      const current = accountList.find((item: any) => String(item?.id || '') === currentUid)
      if (current?.sessionId) return String(current.sessionId)
    }
    if (Array.isArray(accountList) && accountList.length > 0) {
      const lastWithSession = [...accountList].reverse().find((item: any) => item?.sessionId)
      if (lastWithSession?.sessionId) return String(lastWithSession.sessionId)
    }
    const browserSessionText = localStorage.getItem('browser-session')
    if (browserSessionText) {
      const browserSession = JSON.parse(browserSessionText)
      if (browserSession?.sessionId) return String(browserSession.sessionId)
    }
  } catch {
    // ignore parse errors
  }
  return ''
}

function getPlatformSysModel(): string {
  const ua = (navigator.userAgent || '').toLowerCase()
  if (ua.includes('mac')) return 'MAC'
  return 'WINDOWS'
}

function getSignedJsonClientInfo() {
  const device = getDeviceConfig()
  return {
    sessionId: getSessionIdFromStorage(),
    appVer: 168,
    packageCode: 7100,
    language: API_CONFIG.language,
    plat: 4,
    sysModel: getPlatformSysModel(),
    sysMac: device.sysMac,
  }
}

function getUint32Bytes(num: number): Uint8Array {
  const buf = new ArrayBuffer(4)
  const view = new DataView(buf)
  view.setUint32(0, num)
  return new Uint8Array(buf)
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

function getSignedJsonHeaders() {
  const client = getSignedJsonClientInfo()
  const clientStr = JSON.stringify(client)
  const timestamp = Date.now()
  const tenOrigin = `${clientStr}//${timestamp}`
  const oneOrigin = `${API_CONFIG.secretName},${timestamp}`
  return {
    'X-one': aesEncryptString(oneOrigin, API_CONFIG.headAesKey),
    'X-ten': aesEncryptString(tenOrigin, API_CONFIG.headAesKey),
    'X-ten-origin': JSON.stringify(tenOrigin),
  }
}

function encodeSignedJsonPacket(data: unknown): Uint8Array {
  const plain = new TextEncoder().encode(JSON.stringify(data))
  const encrypted = aesEncrypt(API_CONFIG.secretKey, plain)
  return concatUint8Arrays(Uint8Array.from([0xC1, 0x80]), getUint32Bytes(encrypted.length), encrypted)
}

function decodeSignedJsonPacket(buffer: ArrayBuffer): any {
  const raw = new Uint8Array(buffer)
  if (raw.byteLength < 6) {
    throw new Error(`signed json response too short: ${raw.byteLength}`)
  }

  try {
    let encrypted = raw.slice(6)
    if (raw[1] === 0xC0) {
      encrypted = ungzip(encrypted)
    }
    const plain = aesDecrypt(encrypted, API_CONFIG.secretKey)
    return JSON.parse(new TextDecoder().decode(plain))
  } catch (error) {
    const text = new TextDecoder().decode(raw)
    try {
      return JSON.parse(text)
    } catch {
      throw error
    }
  }
}

async function requestSignedJson<T>(path: string, data: Record<string, unknown>): Promise<T> {
  const base = getBaseUrl()
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      Accept: 'application/json',
      ...getSignedJsonHeaders(),
    },
    body: encodeSignedJsonPacket(data).buffer as ArrayBuffer,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return decodeSignedJsonPacket(await response.arrayBuffer()) as T
}

export interface CheckUidListResp {
  code: number
  msg?: string
  data?: {
    checkList?: Array<number | string>
  }
}

export interface GroupQrUrlFromShortLinkResp {
  commonResult?: {
    errCode?: number
    errMsg?: string
  } | null
  qrUrl?: string
  errorDesc?: string
}

export interface GroupDetailFromQrCodeResp {
  commonResult?: {
    errCode?: number
    errMsg?: string
  } | null
  groupBase?: Record<string, any> | null
  expireTime?: number | string
  bfMember?: boolean
  addToken?: string
  errorDesc?: string
}

const GroupQrUrlFromShortLinkReq = {
  create(properties?: any) {
    return properties || {}
  },
  encode(message: any, writer = $protobuf.Writer.create()) {
    if (message.clientInfo) {
      proto.ClientInfo.encode(message.clientInfo, writer.uint32(10).fork()).ldelim()
    }
    if (message.shortLink != null) {
      writer.uint32(18).string(String(message.shortLink))
    }
    return writer
  },
  decode(reader: Uint8Array) {
    return reader as any
  },
}

const GroupQrUrlFromShortLinkRespProto = {
  create(properties?: any) {
    return properties || {}
  },
  encode(_message: any, writer = $protobuf.Writer.create()) {
    return writer
  },
  decode(reader: Uint8Array): GroupQrUrlFromShortLinkResp {
    const r = $protobuf.Reader.create(reader)
    const message: GroupQrUrlFromShortLinkResp = { qrUrl: '' }
    while (r.pos < r.len) {
      const tag = r.uint32()
      switch (tag >>> 3) {
        case 1:
          message.commonResult = proto.CommonResult.decode(r, r.uint32()) as any
          break
        case 2:
          message.qrUrl = r.string()
          break
        default:
          r.skipType(tag & 7)
          break
      }
    }
    return message
  },
}

const GroupDetailFromQrCodeReq = {
  create(properties?: any) {
    return properties || {}
  },
  encode(message: any, writer = $protobuf.Writer.create()) {
    if (message.clientInfo) {
      proto.ClientInfo.encode(message.clientInfo, writer.uint32(10).fork()).ldelim()
    }
    if (message.groupId != null) {
      writer.uint32(16).int64(message.groupId)
    }
    if (message.qrCode != null) {
      writer.uint32(26).string(String(message.qrCode))
    }
    const idCode = message.IdCode ?? message.idCode
    if (idCode != null) {
      writer.uint32(34).string(String(idCode))
    }
    return writer
  },
  decode(reader: Uint8Array) {
    return reader as any
  },
}

const GroupDetailFromQrCodeRespProto = {
  create(properties?: any) {
    return properties || {}
  },
  encode(_message: any, writer = $protobuf.Writer.create()) {
    return writer
  },
  decode(reader: Uint8Array): GroupDetailFromQrCodeResp {
    const r = $protobuf.Reader.create(reader)
    const message: GroupDetailFromQrCodeResp = {
      groupBase: null,
      expireTime: 0,
      bfMember: false,
      addToken: '',
    }
    while (r.pos < r.len) {
      const tag = r.uint32()
      switch (tag >>> 3) {
        case 1:
          message.commonResult = proto.CommonResult.decode(r, r.uint32()) as any
          break
        case 2:
          message.groupBase = proto.GroupBase.decode(r, r.uint32()) as any
          break
        case 3:
          message.expireTime = r.int64() as any
          break
        case 4:
          message.bfMember = r.bool()
          break
        case 5:
          message.addToken = r.string()
          break
        default:
          r.skipType(tag & 7)
          break
      }
    }
    return message
  },
}

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
    // 与老 im 一致：登录前二维码接口不携带历史 session
    withSessionId: false,
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
    // 与老 im 一致：扫码轮询阶段不带历史 session
    withSessionId: false,
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

/**
 * Update current user profile.
 * POST /user/update
 */
export async function updateUserInfo(
  data: { userParam: Record<string, unknown>; ops: proto.UserOperator[] },
  baseUrl?: string,
): Promise<proto.UpdateResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/user/update`,
    reqType: proto.UpdateReq,
    respType: proto.UpdateResp,
    data: data as Partial<proto.UpdateReq>,
  })
}

/**
 * Get contacts (friends) list.
 * POST /contacts/contactsList
 */
export async function getContactsList(
  data: { pageNum: number; pageSize: number },
  baseUrl?: string,
): Promise<proto.ContactsListResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/contacts/contactsList`,
    reqType: proto.ContactsListReq,
    respType: proto.ContactsListResp,
    data,
  })
}

/**
 * Send friend request (add contact).
 * POST /contacts/contactsRelation
 */
export async function contactsRelation(
  data: { targetUid: number; msg: string; op: number; type?: number; addToken?: string },
  baseUrl?: string,
): Promise<proto.ContactsRelationResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/contacts/contactsRelation`,
    reqType: proto.ContactsRelationReq,
    respType: proto.ContactsRelationResp,
    data,
  })
}

/**
 * Get contact detail.
 * POST /contacts/contactsDetail
 */
export async function getContactsDetail(
  data: { targetUid: number; groupId?: number; channelId?: number },
  baseUrl?: string,
): Promise<proto.ContactsDetailResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/contacts/contactsDetail`,
    reqType: proto.ContactsDetailReq,
    respType: proto.ContactsDetailResp,
    data,
  })
}

/**
 * Update contact relation config.
 * POST /contacts/updateContacts
 */
export async function updateContacts(
  data: { op: proto.ContactsOperator; param: Record<string, unknown> },
  baseUrl?: string,
): Promise<proto.UpdateContactsResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/contacts/updateContacts`,
    reqType: proto.UpdateContactsReq,
    respType: proto.UpdateContactsResp,
    data,
  })
}

/**
 * Add/remove blacklist for contact.
 * POST /contacts/updateBlackContacts
 */
export async function updateBlackContacts(
  data: { targetUid: number; op: number },
  baseUrl?: string,
): Promise<proto.UpdateBlackContactsResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/contacts/updateBlackContacts`,
    reqType: proto.UpdateBlackContactsReq,
    respType: proto.UpdateBlackContactsResp,
    data,
  })
}

/**
 * Get contacts apply list (friend requests).
 * POST /contacts/contactsApplyList
 */
export async function getContactsApplyList(
  data: { version?: number },
  baseUrl?: string,
): Promise<proto.ContactsApplyListResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/contacts/contactsApplyList`,
    reqType: proto.ContactsApplyListReq,
    respType: proto.ContactsApplyListResp,
    data,
  })
}

/**
 * Check app version.
 * POST /sys/checkVersion
 */
export async function checkVersion(baseUrl?: string): Promise<proto.CheckVersionResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/sys/checkVersion`,
    reqType: proto.CheckVersionReq,
    respType: proto.CheckVersionResp,
  })
}

/**
 * Handle contacts apply (accept/reject friend request).
 * POST /contacts/updateContactsApply
 */
export async function updateContactsApply(
  data: { applyUid: number; op: number },
  baseUrl?: string,
): Promise<proto.UpdateContactsApplyResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/contacts/updateContactsApply`,
    reqType: proto.UpdateContactsApplyReq,
    respType: proto.UpdateContactsApplyResp,
    data,
  })
}

/**
 * Search/find contacts by phone number or sign.
 * POST /contacts/findContactsList
 */
export async function findContactsList(
  data: { phoneNum?: string; findSign?: string; targetUid?: number; findType?: number },
  baseUrl?: string,
): Promise<proto.FindContactsListResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/contacts/findContactsList`,
    reqType: proto.FindContactsListReq,
    respType: proto.FindContactsListResp,
    data,
  })
}

/**
 * 群别名 / 关键字查群（与老 im `imGroup.groupSearch` → `/group/groupSearch` 一致）
 * POST /group/groupSearch
 */
export async function groupSearch(
  data: { fromUid: number | string; context: string },
  baseUrl?: string,
): Promise<proto.GroupOrUserResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupSearch`,
    reqType: proto.GroupOrUserReq,
    respType: proto.GroupOrUserResp,
    data: {
      fromUid: data.fromUid,
      context: data.context,
    } as any,
  })
}

/**
 * 通过群别名查群详情或 68 号查用户详情（老 im `groupOrUserDetail`）
 * POST /group/groupOrUserDetail
 */
export async function groupOrUserDetail(
  data: { fromUid: number | string; context: string },
  baseUrl?: string,
): Promise<proto.GroupOrUserResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupOrUserDetail`,
    reqType: proto.GroupOrUserReq,
    respType: proto.GroupOrUserResp,
    data: {
      fromUid: data.fromUid,
      context: data.context,
    } as any,
  })
}

/**
 * Get group list.
 * POST /group/groupContactList
 */
export async function getGroupContactList(
  baseUrl?: string,
): Promise<proto.GroupContactListResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupContactList`,
    reqType: proto.GroupContactListReq,
    respType: proto.GroupContactListResp,
  })
}

/**
 * Get group member list.
 * POST /group/groupMemberList
 */
export async function getGroupMemberList(
  data: { groupId: number | string; pageNum: number; pageSize: number; time?: number },
  baseUrl?: string,
): Promise<proto.GroupMemberListResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupMemberList`,
    reqType: proto.GroupMemberListReq,
    respType: proto.GroupMemberListResp,
    data: {
      groupId: data.groupId,
      pageNum: data.pageNum,
      pageSize: data.pageSize,
      time: data.time ?? 0,
    },
  })
}

/**
 * Get group member online statuses.
 * POST /group/groupMemberOnLineStatusList
 */
export async function groupMemberOnLineStatusList(
  data: { groupId: number | string; uids: Array<number | string> },
  baseUrl?: string,
): Promise<IGroupMemberOnLineStatusListResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupMemberOnLineStatusList`,
    reqType: GroupMemberOnLineStatusListReq,
    respType: GroupMemberOnLineStatusListResp,
    data: {
      groupId: data.groupId,
      uids: data.uids,
    },
  })
}

export async function getGroupReqList(
  data: { pageNum: number; pageSize: number },
  baseUrl?: string,
): Promise<proto.GroupReqListResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupReqList`,
    reqType: proto.GroupReqListReq,
    respType: proto.GroupReqListResp,
    data: { pageNum: data.pageNum, pageSize: data.pageSize },
  })
}

export async function groupCheckJoin(
  data: { groupReqId: number; flag: boolean },
  baseUrl?: string,
): Promise<proto.GroupCheckJoinResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupCheckJoin`,
    reqType: proto.GroupCheckJoinReq,
    respType: proto.GroupCheckJoinResp,
    data: { groupReqId: data.groupReqId, flag: data.flag },
  })
}

export async function groupUserCheckJoin(
  data: { groupReqId: number; flag: boolean },
  baseUrl?: string,
): Promise<proto.GroupCheckJoinResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupUserCheckJoin`,
    reqType: proto.GroupCheckJoinReq,
    respType: proto.GroupCheckJoinResp,
    data: { groupReqId: data.groupReqId, flag: data.flag },
  })
}

export async function groupJoin(
  data: {
    groupId: number | string
    msg: string
    reqType: number
    addToken?: string
    fromUid?: number | string
  },
  baseUrl?: string,
): Promise<proto.GroupJoinResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupJoin`,
    reqType: proto.GroupJoinReq,
    respType: proto.GroupJoinResp,
    data: {
      groupId: data.groupId,
      msg: data.msg,
      reqType: data.reqType,
      addToken: data.addToken || '',
      fromUid: data.fromUid ?? 0,
    } as any,
  })
}

export async function disableGroup(
  data: { groupId: number | string },
  baseUrl?: string,
): Promise<proto.DisableGroupResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/disableGroup`,
    reqType: proto.DisableGroupReq,
    respType: proto.DisableGroupResp,
    data: { groupId: data.groupId },
  })
}

export async function groupExit(
  data: { groupId: number | string },
  baseUrl?: string,
): Promise<proto.GroupExitResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupExit`,
    reqType: proto.GroupExitReq,
    respType: proto.GroupExitResp,
    data: { groupId: data.groupId },
  })
}

export async function groupMember(
  data: { op: number; groupId: number | string; members: (number | string)[] },
  baseUrl?: string,
): Promise<proto.GroupMemberResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupMember`,
    reqType: proto.GroupMemberReq,
    respType: proto.GroupMemberResp,
    data: {
      op: data.op,
      groupId: data.groupId,
      members: data.members,
    },
  })
}

export async function groupUpdate(
  data: { op: number; groupParam: Record<string, unknown> },
  baseUrl?: string,
): Promise<proto.GroupUpdateResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupUpdate`,
    reqType: proto.GroupUpdateReq,
    respType: proto.GroupUpdateResp,
    data: { op: data.op, groupParam: data.groupParam },
  })
}

export async function getGroupDetail(
  data: { groupId: number | string },
  baseUrl?: string,
): Promise<proto.GroupDetailResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupDetail`,
    reqType: proto.GroupDetailReq,
    respType: proto.GroupDetailResp,
    data: { groupId: data.groupId },
  })
}

export async function groupQrCode(
  data: { groupId: number | string; force?: boolean },
  baseUrl?: string,
): Promise<proto.IGroupQrCodeResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupQrCode`,
    reqType: proto.GroupQrCodeReq,
    respType: proto.GroupQrCodeResp,
    data: { groupId: data.groupId, force: data.force ?? false },
  })
}

export async function groupQrUrlFromShortLink(
  data: { shortLink: string },
  baseUrl?: string,
): Promise<GroupQrUrlFromShortLinkResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupQrUrlFromShortLink`,
    reqType: GroupQrUrlFromShortLinkReq,
    respType: GroupQrUrlFromShortLinkRespProto,
    data: { shortLink: data.shortLink },
  })
}

export async function queryGroupLink(
  data: { qrCode: string; IdCode: string; groupId?: number | string },
  baseUrl?: string,
): Promise<GroupDetailFromQrCodeResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/group/groupDetailFromQrCode`,
    reqType: GroupDetailFromQrCodeReq,
    respType: GroupDetailFromQrCodeRespProto,
    data: {
      groupId: data.groupId ?? 0,
      qrCode: data.qrCode,
      IdCode: data.IdCode,
    },
  })
}

export async function checkUidList(
  data: { groupId: number | string },
): Promise<CheckUidListResp> {
  return requestSignedJson<CheckUidListResp>('/group/groupReq/checkUidList', {
    groupId: data.groupId,
  })
}

export async function getUploadToken(baseUrl?: string): Promise<proto.GetUploadTokenResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/sys/getUploadToken`,
    reqType: proto.GetUploadTokenReq,
    respType: proto.GetUploadTokenResp,
  })
}

export async function getUploadUrl(
  data: { attachType: number; attachWorkspaceType: number; fileSize: number; suffix: string },
  baseUrl?: string,
): Promise<proto.GetUploadUrlResp> {
  const base = baseUrl || getBaseUrl()
  return requestProto({
    url: `${base}/sys/getUploadUrl`,
    reqType: proto.GetUploadUrlReq,
    respType: proto.GetUploadUrlResp,
    data: data as Partial<proto.GetUploadUrlReq>,
  })
}
