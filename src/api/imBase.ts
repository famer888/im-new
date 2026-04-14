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
  data: { targetUid: number; msg: string; op: number; type?: number },
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
