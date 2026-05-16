export enum MessageType {
  Text = 0,
  Image = 1,
  Audio = 2,
  Video = 3,
  Location = 4,
  NameCard = 5,
  System = 6,
  File = 7,
  Notice = 8,
  DynamicImage = 9,
  RedPacket = 10,
  Html = 11,
  SetImage = 12,
  ChatTransfer = 13,
  ChatTransferResult = 14,
  RedPacketResult = 15,
  Html2 = 16,
  MediasCaption = 17,
  AnimatedGame = 18,
}

export enum ConversationType {
  Friend = 0,
  Group = 1,
  Channel = 2,
}

export enum MessageStatus {
  Sending = 0,
  Sent = 1,
  Delivered = 2,
  Read = 3,
  Failed = -1,
}

export function isHiddenMessageType(msgType: number): boolean {
  return (
    msgType === MessageType.RedPacket ||
    msgType === MessageType.RedPacketResult ||
    msgType === MessageType.ChatTransfer ||
    msgType === MessageType.ChatTransferResult
  )
}

export interface TextContent {
  text: string
}

export interface ImageContent {
  url: string
  thumbnailUrl: string
  width: number
  height: number
  size: number
}

export interface AudioContent {
  url: string
  duration: number
  size: number
}

export interface VideoContent {
  url: string
  thumbnailUrl: string
  duration: number
  width: number
  height: number
  size: number
}

export interface FileContent {
  url: string
  name: string
  size: number
  ext: string
}

export interface NameCardContent {
  uid: string
  nickname: string
  avatar: string
}

export function getMessageComponentName(msgType: number): string {
  const map: Record<number, string> = {
    [MessageType.Text]: 'TextMessage',
    [MessageType.Image]: 'ImageMessage',
    [MessageType.Audio]: 'AudioMessage',
    [MessageType.Video]: 'VideoMessage',
    [MessageType.NameCard]: 'BusinessCardMessage',
    [MessageType.File]: 'FileMessage',
    [MessageType.Notice]: 'NoticeMessage',
    [MessageType.DynamicImage]: 'ImageMessage',
    [MessageType.SetImage]: 'DiceMessage',
    [MessageType.Html2]: 'RichTextMessage',
    [MessageType.AnimatedGame]: 'PokerMessage',
  }
  return map[msgType] ?? 'TextMessage'
}
