import * as $protobuf from 'protobufjs/minimal'
import * as proto from '@/proto/generated'

const $Reader = $protobuf.Reader
const $Writer = $protobuf.Writer

type Int64Like = number | string | { low: number; high: number; unsigned?: boolean }

export interface IGroupMemberOnLineStatusListReq {
  clientInfo?: proto.IClientInfo | null
  groupId?: Int64Like | null
  uids?: Int64Like[]
}

export interface IGroupMemberOnLineStatusListResp {
  commonResult?: proto.ICommonResult | null
  userOnLineStatusList?: proto.UserOnOrOffLine[]
}

/**
 * `generated.js` 当前只覆盖 common/web proto，这里补上群成员在线状态接口的最小编解码。
 */
export const GroupMemberOnLineStatusListReq = {
  create(properties: Partial<IGroupMemberOnLineStatusListReq> = {}): IGroupMemberOnLineStatusListReq {
    return {
      clientInfo: null,
      groupId: 0,
      uids: [],
      ...properties,
    }
  },

  encode(
    message: IGroupMemberOnLineStatusListReq,
    writer: $protobuf.Writer = $Writer.create(),
  ): $protobuf.Writer {
    if (message.clientInfo != null && Object.hasOwnProperty.call(message, 'clientInfo')) {
      proto.ClientInfo.encode(message.clientInfo, writer.uint32(10).fork()).ldelim()
    }
    if (message.groupId != null && Object.hasOwnProperty.call(message, 'groupId')) {
      writer.uint32(16).int64(message.groupId as any)
    }
    if (message.uids != null && message.uids.length) {
      writer.uint32(26).fork()
      for (const uid of message.uids) {
        writer.int64(uid as any)
      }
      writer.ldelim()
    }
    return writer
  },

  decode(reader: $protobuf.Reader | Uint8Array, length?: number): IGroupMemberOnLineStatusListReq {
    const r = reader instanceof $Reader ? reader : $Reader.create(reader)
    const end = length === undefined ? r.len : r.pos + length
    const message = GroupMemberOnLineStatusListReq.create()

    while (r.pos < end) {
      const tag = r.uint32()
      switch (tag >>> 3) {
        case 1:
          message.clientInfo = proto.ClientInfo.decode(r, r.uint32())
          break
        case 2:
          message.groupId = r.int64() as Int64Like
          break
        case 3:
          if (!message.uids) message.uids = []
          if ((tag & 7) === 2) {
            const packedEnd = r.uint32() + r.pos
            while (r.pos < packedEnd) {
              message.uids.push(r.int64() as Int64Like)
            }
          } else {
            message.uids.push(r.int64() as Int64Like)
          }
          break
        default:
          r.skipType(tag & 7)
      }
    }

    return message
  },
}

export const GroupMemberOnLineStatusListResp = {
  create(properties: Partial<IGroupMemberOnLineStatusListResp> = {}): IGroupMemberOnLineStatusListResp {
    return {
      commonResult: null,
      userOnLineStatusList: [],
      ...properties,
    }
  },

  encode(
    message: IGroupMemberOnLineStatusListResp,
    writer: $protobuf.Writer = $Writer.create(),
  ): $protobuf.Writer {
    if (message.commonResult != null && Object.hasOwnProperty.call(message, 'commonResult')) {
      proto.CommonResult.encode(message.commonResult, writer.uint32(10).fork()).ldelim()
    }
    if (message.userOnLineStatusList != null && message.userOnLineStatusList.length) {
      for (const item of message.userOnLineStatusList) {
        proto.UserOnOrOffLine.encode(item, writer.uint32(18).fork()).ldelim()
      }
    }
    return writer
  },

  decode(reader: $protobuf.Reader | Uint8Array, length?: number): IGroupMemberOnLineStatusListResp {
    const r = reader instanceof $Reader ? reader : $Reader.create(reader)
    const end = length === undefined ? r.len : r.pos + length
    const message = GroupMemberOnLineStatusListResp.create()

    while (r.pos < end) {
      const tag = r.uint32()
      switch (tag >>> 3) {
        case 1:
          message.commonResult = proto.CommonResult.decode(r, r.uint32())
          break
        case 2:
          if (!message.userOnLineStatusList) message.userOnLineStatusList = []
          message.userOnLineStatusList.push(proto.UserOnOrOffLine.decode(r, r.uint32()))
          break
        default:
          r.skipType(tag & 7)
      }
    }

    return message
  },
}
