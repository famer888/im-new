import * as $protobuf from "protobufjs";
import Long = require("long");
/** Properties of a ClientInfo. */
export interface IClientInfo {

    /** ClientInfo sessionId */
    sessionId?: (string|null);

    /** ClientInfo appVer */
    appVer?: (number|null);

    /** ClientInfo packageCode */
    packageCode?: (number|null);

    /** ClientInfo plat */
    plat?: (Platform|null);

    /** ClientInfo language */
    language?: (number|null);

    /** ClientInfo sysMac */
    sysMac?: (string|null);

    /** ClientInfo sysModel */
    sysModel?: (string|null);
}

/** Represents a ClientInfo. */
export class ClientInfo implements IClientInfo {

    /**
     * Constructs a new ClientInfo.
     * @param [properties] Properties to set
     */
    constructor(properties?: IClientInfo);

    /** ClientInfo sessionId. */
    public sessionId: string;

    /** ClientInfo appVer. */
    public appVer: number;

    /** ClientInfo packageCode. */
    public packageCode: number;

    /** ClientInfo plat. */
    public plat: Platform;

    /** ClientInfo language. */
    public language: number;

    /** ClientInfo sysMac. */
    public sysMac: string;

    /** ClientInfo sysModel. */
    public sysModel: string;

    /**
     * Creates a new ClientInfo instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ClientInfo instance
     */
    public static create(properties?: IClientInfo): ClientInfo;

    /**
     * Encodes the specified ClientInfo message. Does not implicitly {@link ClientInfo.verify|verify} messages.
     * @param message ClientInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IClientInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ClientInfo message, length delimited. Does not implicitly {@link ClientInfo.verify|verify} messages.
     * @param message ClientInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IClientInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ClientInfo message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ClientInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ClientInfo;

    /**
     * Decodes a ClientInfo message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ClientInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ClientInfo;

    /**
     * Verifies a ClientInfo message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ClientInfo message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ClientInfo
     */
    public static fromObject(object: { [k: string]: any }): ClientInfo;

    /**
     * Creates a plain object from a ClientInfo message. Also converts values to other types if specified.
     * @param message ClientInfo
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ClientInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ClientInfo to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ClientInfo
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Properties of a CommonResult. */
export interface ICommonResult {

    /** CommonResult errCode */
    errCode?: (number|null);

    /** CommonResult errMsg */
    errMsg?: (string|null);

    /** CommonResult flag */
    flag?: (string|null);
}

/** Represents a CommonResult. */
export class CommonResult implements ICommonResult {

    /**
     * Constructs a new CommonResult.
     * @param [properties] Properties to set
     */
    constructor(properties?: ICommonResult);

    /** CommonResult errCode. */
    public errCode: number;

    /** CommonResult errMsg. */
    public errMsg: string;

    /** CommonResult flag. */
    public flag: string;

    /**
     * Creates a new CommonResult instance using the specified properties.
     * @param [properties] Properties to set
     * @returns CommonResult instance
     */
    public static create(properties?: ICommonResult): CommonResult;

    /**
     * Encodes the specified CommonResult message. Does not implicitly {@link CommonResult.verify|verify} messages.
     * @param message CommonResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ICommonResult, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified CommonResult message, length delimited. Does not implicitly {@link CommonResult.verify|verify} messages.
     * @param message CommonResult message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ICommonResult, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a CommonResult message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns CommonResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): CommonResult;

    /**
     * Decodes a CommonResult message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns CommonResult
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): CommonResult;

    /**
     * Verifies a CommonResult message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a CommonResult message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns CommonResult
     */
    public static fromObject(object: { [k: string]: any }): CommonResult;

    /**
     * Creates a plain object from a CommonResult message. Also converts values to other types if specified.
     * @param message CommonResult
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: CommonResult, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this CommonResult to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for CommonResult
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Properties of a CommonResultResp. */
export interface ICommonResultResp {

    /** CommonResultResp commonResult */
    commonResult?: (ICommonResult|null);
}

/** Represents a CommonResultResp. */
export class CommonResultResp implements ICommonResultResp {

    /**
     * Constructs a new CommonResultResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: ICommonResultResp);

    /** CommonResultResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new CommonResultResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns CommonResultResp instance
     */
    public static create(properties?: ICommonResultResp): CommonResultResp;

    /**
     * Encodes the specified CommonResultResp message. Does not implicitly {@link CommonResultResp.verify|verify} messages.
     * @param message CommonResultResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ICommonResultResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified CommonResultResp message, length delimited. Does not implicitly {@link CommonResultResp.verify|verify} messages.
     * @param message CommonResultResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ICommonResultResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a CommonResultResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns CommonResultResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): CommonResultResp;

    /**
     * Decodes a CommonResultResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns CommonResultResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): CommonResultResp;

    /**
     * Verifies a CommonResultResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a CommonResultResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns CommonResultResp
     */
    public static fromObject(object: { [k: string]: any }): CommonResultResp;

    /**
     * Creates a plain object from a CommonResultResp message. Also converts values to other types if specified.
     * @param message CommonResultResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: CommonResultResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this CommonResultResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for CommonResultResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Properties of a CommonResultReq. */
export interface ICommonResultReq {

    /** CommonResultReq clientInfo */
    clientInfo?: (IClientInfo|null);
}

/** Represents a CommonResultReq. */
export class CommonResultReq implements ICommonResultReq {

    /**
     * Constructs a new CommonResultReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: ICommonResultReq);

    /** CommonResultReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /**
     * Creates a new CommonResultReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns CommonResultReq instance
     */
    public static create(properties?: ICommonResultReq): CommonResultReq;

    /**
     * Encodes the specified CommonResultReq message. Does not implicitly {@link CommonResultReq.verify|verify} messages.
     * @param message CommonResultReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ICommonResultReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified CommonResultReq message, length delimited. Does not implicitly {@link CommonResultReq.verify|verify} messages.
     * @param message CommonResultReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ICommonResultReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a CommonResultReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns CommonResultReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): CommonResultReq;

    /**
     * Decodes a CommonResultReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns CommonResultReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): CommonResultReq;

    /**
     * Verifies a CommonResultReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a CommonResultReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns CommonResultReq
     */
    public static fromObject(object: { [k: string]: any }): CommonResultReq;

    /**
     * Creates a plain object from a CommonResultReq message. Also converts values to other types if specified.
     * @param message CommonResultReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: CommonResultReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this CommonResultReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for CommonResultReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** AccountType enum. */
export enum AccountType {
    MOBILE = 0,
    EMAIL = 1
}

/** Represents a ValidateCode. */
export class ValidateCode implements IValidateCode {

    /**
     * Constructs a new ValidateCode.
     * @param [properties] Properties to set
     */
    constructor(properties?: IValidateCode);

    /** ValidateCode validateValue. */
    public validateValue: string;

    /** ValidateCode validateAccount. */
    public validateAccount: string;

    /** ValidateCode countryCode. */
    public countryCode: string;

    /** ValidateCode validateType. */
    public validateType: GetValidateCodeType;

    /**
     * Creates a new ValidateCode instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ValidateCode instance
     */
    public static create(properties?: IValidateCode): ValidateCode;

    /**
     * Encodes the specified ValidateCode message. Does not implicitly {@link ValidateCode.verify|verify} messages.
     * @param message ValidateCode message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IValidateCode, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ValidateCode message, length delimited. Does not implicitly {@link ValidateCode.verify|verify} messages.
     * @param message ValidateCode message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IValidateCode, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ValidateCode message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ValidateCode
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ValidateCode;

    /**
     * Decodes a ValidateCode message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ValidateCode
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ValidateCode;

    /**
     * Verifies a ValidateCode message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ValidateCode message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ValidateCode
     */
    public static fromObject(object: { [k: string]: any }): ValidateCode;

    /**
     * Creates a plain object from a ValidateCode message. Also converts values to other types if specified.
     * @param message ValidateCode
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ValidateCode, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ValidateCode to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ValidateCode
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** GetValidateCodeType enum. */
export enum GetValidateCodeType {
    REG = 0,
    LOGIN = 1,
    FIND_PASSWORD = 2,
    UPDATE_PASSWORD = 3,
    UPDATE_PHONE = 4,
    VALIDATE_PASSWORD = 6,
    FIND_GESTURE_PASSWORD = 7,
    TRADE_PASSWORD = 8,
    UPDATE_TRADE_PASSWORD = 9,
    BIND_PHONE = 10,
    BIND_EMAIL = 11,
    UPDATE_EMAIL = 12,
    VALIDATE_GOOGLE_AUTH = 13,
    UPDATE_SECURE = 14,
    CASH_OUT = 15,
    VERIFY_EMAIL = 16,
    VERIFY_PHONE = 17,
    VERIFY_TRADE_PASSWORD = 18,
    VERIFY_GOOGLE_CODE = 19,
    BIND_ACCOUNT = 20,
    VERIFY_LOGIN_PHONE = 21,
    VERIFY_LOGIN_EMAIL = 22,
    VERIFY_LOGIN_PASSWORD = 23
}

/** LoginMode enum. */
export enum LoginMode {
    HAND = 0,
    SYS_AUTO = 1
}

/** LoginType enum. */
export enum LoginType {
    SMS_CODE = 0,
    PASSWORD = 1,
    AUTH_KEY = 2,
    GOOGLE_TOKEN = 3,
    APPLE_TOKEN = 4
}

/** Gender enum. */
export enum Gender {
    SECRECY = 0,
    MALE = 1,
    FEMALE = 2
}

/** Platform enum. */
export enum Platform {
    ANDROID = 0,
    IPHONE = 1,
    UNKOWN = 2,
    MAC = 3,
    WIN = 4,
    HARMONYOS = 5
}

/** LastOnlineTimeViewType enum. */
export enum LastOnlineTimeViewType {
    ALL_SHOW = 0,
    ONLY_FRIEND = 1,
    NOT_SHOW = 2
}

/** SecurityType enum. */
export enum SecurityType {
    OLD_VERSION = 0,
    NORMAL_CHECK = 1,
    SECURITY_CHECK = 2
}

/** GroupMemberType enum. */
export enum GroupMemberType {
    HOST = 0,
    MANAGE = 1,
    MEMBER = 2
}

/** AttachWorkSpaceType enum. */
export enum AttachWorkSpaceType {
    COMMON = 0,
    CHAT = 1
}

/** AttachType enum. */
export enum AttachType {
    PIC = 0,
    AUDIO = 1,
    VIDEO = 2,
    FILE = 3,
    LOG = 4,
    EMOTICON = 5
}

/** QrCodeType enum. */
export enum QrCodeType {
    QR_USER = 0,
    QR_GROUP = 1,
    WEB_LOGIN = 2
}

/** FeedbackType enum. */
export enum FeedbackType {
    SUGGEST = 0,
    MISTAKE = 1,
    OTHER = 2
}

/** WebLoginStatus enum. */
export enum WebLoginStatus {
    NOT_SCAN = 0,
    SCANNED = 1,
    ALREADY_LOGIN = 2,
    CANCEL_LOGIN = 3
}

/** GroupReqStatus enum. */
export enum GroupReqStatus {
    CHECKING = 0,
    AGREE = 1,
    REFUSE = 2,
    EXPIRE = 3
}

/** GroupReqType enum. */
export enum GroupReqType {
    GROUP_TRANSFER = 0,
    GROUP_INVITE = 1,
    GROUP_QR_CODE = 2,
    GROUP_OWNER_CHECK_INVITE = 3,
    GROUP_OWNER_CHECK_QR_CODE = 4,
    GROUP_MEMBER_CHECK = 5,
    GROUP_OWNER_REMOVE_MEMBER = 6,
    GROUP_MEMBER_EXIT = 7,
    GROUP_SET_ADMIN = 8,
    GROUP_CANCLE_ADMIN = 9,
    GROUP_ADMIN_UPDATE = 10,
    GROUP_IS_DISABLED = 11,
    GROUP_MEMBER_SHUTUP = 12,
    GROUP_IS_DISBANDED = 13,
    GROUP_LINK = 14,
    GROUP_ALIAS = 15,
    GROUP_IS_ENABLED = 16,
    GROUP_OBSERVE_ADD = 17,
    GROUP_OBSERVE_REMOVE = 18
}

/** GroupHandleType enum. */
export enum GroupHandleType {
    GROUP_REQ = 0,
    GROUP_NAME = 1,
    GROUP_PIC = 2,
    GROUP_MEMBER_NICKNAME = 3,
    GROUP_NOTICE = 4,
    GROUP_SHUTUP = 5,
    GROUP_READ_CANCEL = 6
}

/** MsgReceiptStatus enum. */
export enum MsgReceiptStatus {
    DELIVERED = 0,
    VIEWED = 1,
    PLAYED = 2,
    PROCESSED = 3
}

/** CheckVersionFlag enum. */
export enum CheckVersionFlag {
    NOT_UP = 0,
    CAN_UP = 1,
    MUST_UP = 2
}

/** KeyPairType enum. */
export enum KeyPairType {
    KEY_USER = 0,
    KEY_GROUP = 1,
    KEY_USER_WEB = 2,
    KEY_CHANNEL = 3
}

/** AdminRightType enum. */
export enum AdminRightType {
    ALL_RIGHT = 0,
    UPDATE_DATA = 1,
    CHECK_APPLY = 2,
    PUSH_NOTICE = 3,
    SET_ADMIN = 4
}

/** SearchMapType enum. */
export enum SearchMapType {
    GAODE = 0,
    GOOGLE = 1,
    BAIDU = 2
}

/** ClearTimeType enum. */
export enum ClearTimeType {
    SIX_MONTH = 0,
    ONE_MONTH = 1,
    THIRD_MONTH = 2,
    TWELVE_MONTH = 3
}

/** InviteLinkType enum. */
export enum InviteLinkType {
    LINK_USER = 0,
    LINK_GROUP = 1
}

/** EditType enum. */
export enum EditType {
    UNMODIFIED = 0,
    MODIFIED = 1
}

/** FilterType enum. */
export enum FilterType {
    BE_DEFAULT = 0,
    BE_MEMBER = 1,
    BE_ADMIN = 2,
    NOT_ONESELF = 3,
    NOT_HOST = 4,
    NOT_ADMIN = 5
}

/** SafeSwitchType enum. */
export enum SafeSwitchType {
    EMAIL_TYPE = 0,
    PHONE_TYPE = 1,
    GOOGLE_AUTH_TYPE = 2,
    TRADE_PASSWORD_TYPE = 3
}

/** Represents a GroupAssistantMessageContent. */
export class GroupAssistantMessageContent implements IGroupAssistantMessageContent {

    /**
     * Constructs a new GroupAssistantMessageContent.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupAssistantMessageContent);

    /** GroupAssistantMessageContent content. */
    public content: Uint8Array;

    /** GroupAssistantMessageContent attachmentKey. */
    public attachmentKey: string;

    /**
     * Creates a new GroupAssistantMessageContent instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupAssistantMessageContent instance
     */
    public static create(properties?: IGroupAssistantMessageContent): GroupAssistantMessageContent;

    /**
     * Encodes the specified GroupAssistantMessageContent message. Does not implicitly {@link GroupAssistantMessageContent.verify|verify} messages.
     * @param message GroupAssistantMessageContent message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupAssistantMessageContent, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupAssistantMessageContent message, length delimited. Does not implicitly {@link GroupAssistantMessageContent.verify|verify} messages.
     * @param message GroupAssistantMessageContent message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupAssistantMessageContent, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupAssistantMessageContent message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupAssistantMessageContent
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupAssistantMessageContent;

    /**
     * Decodes a GroupAssistantMessageContent message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupAssistantMessageContent
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupAssistantMessageContent;

    /**
     * Verifies a GroupAssistantMessageContent message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupAssistantMessageContent message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupAssistantMessageContent
     */
    public static fromObject(object: { [k: string]: any }): GroupAssistantMessageContent;

    /**
     * Creates a plain object from a GroupAssistantMessageContent message. Also converts values to other types if specified.
     * @param message GroupAssistantMessageContent
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupAssistantMessageContent, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupAssistantMessageContent to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupAssistantMessageContent
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a UserBase. */
export class UserBase implements IUserBase {

    /**
     * Constructs a new UserBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUserBase);

    /** UserBase uid. */
    public uid: (number|Long);

    /** UserBase nickName. */
    public nickName: string;

    /** UserBase icon. */
    public icon: string;

    /** UserBase gender. */
    public gender: Gender;

    /** UserBase friendRelation. */
    public friendRelation?: (IFriendRelation|null);

    /** UserBase userOnOrOffline. */
    public userOnOrOffline?: (IUserOnOrOffLine|null);

    /** UserBase signature. */
    public signature: string;

    /** UserBase depict. */
    public depict: string;

    /** UserBase bfCancel. */
    public bfCancel: boolean;

    /** UserBase bfBanned. */
    public bfBanned: boolean;

    /** UserBase identify. */
    public identify: string;

    /** UserBase realName. */
    public realName: string;

    /** UserBase idNumber. */
    public idNumber: string;

    /** UserBase createTime. */
    public createTime: (number|Long);

    /** UserBase userType. */
    public userType: number;

    /**
     * Creates a new UserBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UserBase instance
     */
    public static create(properties?: IUserBase): UserBase;

    /**
     * Encodes the specified UserBase message. Does not implicitly {@link UserBase.verify|verify} messages.
     * @param message UserBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUserBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UserBase message, length delimited. Does not implicitly {@link UserBase.verify|verify} messages.
     * @param message UserBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUserBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a UserBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UserBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UserBase;

    /**
     * Decodes a UserBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UserBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UserBase;

    /**
     * Verifies a UserBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a UserBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UserBase
     */
    public static fromObject(object: { [k: string]: any }): UserBase;

    /**
     * Creates a plain object from a UserBase message. Also converts values to other types if specified.
     * @param message UserBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UserBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UserBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UserBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a UserSwitch. */
export class UserSwitch implements IUserSwitch {

    /**
     * Constructs a new UserSwitch.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUserSwitch);

    /** UserSwitch phoneValidate. */
    public phoneValidate: boolean;

    /** UserSwitch emailValidate. */
    public emailValidate: boolean;

    /**
     * Creates a new UserSwitch instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UserSwitch instance
     */
    public static create(properties?: IUserSwitch): UserSwitch;

    /**
     * Encodes the specified UserSwitch message. Does not implicitly {@link UserSwitch.verify|verify} messages.
     * @param message UserSwitch message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUserSwitch, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UserSwitch message, length delimited. Does not implicitly {@link UserSwitch.verify|verify} messages.
     * @param message UserSwitch message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUserSwitch, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a UserSwitch message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UserSwitch
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UserSwitch;

    /**
     * Decodes a UserSwitch message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UserSwitch
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UserSwitch;

    /**
     * Verifies a UserSwitch message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a UserSwitch message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UserSwitch
     */
    public static fromObject(object: { [k: string]: any }): UserSwitch;

    /**
     * Creates a plain object from a UserSwitch message. Also converts values to other types if specified.
     * @param message UserSwitch
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UserSwitch, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UserSwitch to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UserSwitch
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a FriendRelation. */
export class FriendRelation implements IFriendRelation {

    /**
     * Constructs a new FriendRelation.
     * @param [properties] Properties to set
     */
    constructor(properties?: IFriendRelation);

    /** FriendRelation bfFriend. */
    public bfFriend: boolean;

    /** FriendRelation remarkName. */
    public remarkName: string;

    /**
     * Creates a new FriendRelation instance using the specified properties.
     * @param [properties] Properties to set
     * @returns FriendRelation instance
     */
    public static create(properties?: IFriendRelation): FriendRelation;

    /**
     * Encodes the specified FriendRelation message. Does not implicitly {@link FriendRelation.verify|verify} messages.
     * @param message FriendRelation message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IFriendRelation, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified FriendRelation message, length delimited. Does not implicitly {@link FriendRelation.verify|verify} messages.
     * @param message FriendRelation message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IFriendRelation, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a FriendRelation message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns FriendRelation
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): FriendRelation;

    /**
     * Decodes a FriendRelation message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns FriendRelation
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): FriendRelation;

    /**
     * Verifies a FriendRelation message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a FriendRelation message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns FriendRelation
     */
    public static fromObject(object: { [k: string]: any }): FriendRelation;

    /**
     * Creates a plain object from a FriendRelation message. Also converts values to other types if specified.
     * @param message FriendRelation
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: FriendRelation, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this FriendRelation to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for FriendRelation
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an ArchiveInfo. */
export class ArchiveInfo implements IArchiveInfo {

    /**
     * Constructs a new ArchiveInfo.
     * @param [properties] Properties to set
     */
    constructor(properties?: IArchiveInfo);

    /** ArchiveInfo target. */
    public target: (number|Long);

    /** ArchiveInfo type. */
    public type: (number|Long);

    /** ArchiveInfo status. */
    public status: (number|Long);

    /**
     * Creates a new ArchiveInfo instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ArchiveInfo instance
     */
    public static create(properties?: IArchiveInfo): ArchiveInfo;

    /**
     * Encodes the specified ArchiveInfo message. Does not implicitly {@link ArchiveInfo.verify|verify} messages.
     * @param message ArchiveInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IArchiveInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ArchiveInfo message, length delimited. Does not implicitly {@link ArchiveInfo.verify|verify} messages.
     * @param message ArchiveInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IArchiveInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an ArchiveInfo message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ArchiveInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ArchiveInfo;

    /**
     * Decodes an ArchiveInfo message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ArchiveInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ArchiveInfo;

    /**
     * Verifies an ArchiveInfo message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an ArchiveInfo message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ArchiveInfo
     */
    public static fromObject(object: { [k: string]: any }): ArchiveInfo;

    /**
     * Creates a plain object from an ArchiveInfo message. Also converts values to other types if specified.
     * @param message ArchiveInfo
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ArchiveInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ArchiveInfo to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ArchiveInfo
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupMemberBase. */
export class GroupMemberBase implements IGroupMemberBase {

    /**
     * Constructs a new GroupMemberBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupMemberBase);

    /** GroupMemberBase user. */
    public user?: (IUserBase|null);

    /** GroupMemberBase groupId. */
    public groupId: (number|Long);

    /** GroupMemberBase type. */
    public type: GroupMemberType;

    /** GroupMemberBase groupNickName. */
    public groupNickName: string;

    /** GroupMemberBase score. */
    public score: (number|Long);

    /** GroupMemberBase right. */
    public right?: (IAdminRightBase|null);

    /** GroupMemberBase bfMyBlack. */
    public bfMyBlack: boolean;

    /** GroupMemberBase labelType. */
    public labelType: number;

    /**
     * Creates a new GroupMemberBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupMemberBase instance
     */
    public static create(properties?: IGroupMemberBase): GroupMemberBase;

    /**
     * Encodes the specified GroupMemberBase message. Does not implicitly {@link GroupMemberBase.verify|verify} messages.
     * @param message GroupMemberBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupMemberBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupMemberBase message, length delimited. Does not implicitly {@link GroupMemberBase.verify|verify} messages.
     * @param message GroupMemberBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupMemberBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupMemberBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupMemberBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupMemberBase;

    /**
     * Decodes a GroupMemberBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupMemberBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupMemberBase;

    /**
     * Verifies a GroupMemberBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupMemberBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupMemberBase
     */
    public static fromObject(object: { [k: string]: any }): GroupMemberBase;

    /**
     * Creates a plain object from a GroupMemberBase message. Also converts values to other types if specified.
     * @param message GroupMemberBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupMemberBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupMemberBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupMemberBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ContactsDetailBase. */
export class ContactsDetailBase implements IContactsDetailBase {

    /**
     * Constructs a new ContactsDetailBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsDetailBase);

    /** ContactsDetailBase userInfo. */
    public userInfo?: (IUserBase|null);

    /** ContactsDetailBase depict. */
    public depict: string;

    /** ContactsDetailBase bfStar. */
    public bfStar: boolean;

    /** ContactsDetailBase bfDisturb. */
    public bfDisturb: boolean;

    /** ContactsDetailBase bfMyBlack. */
    public bfMyBlack: boolean;

    /** ContactsDetailBase letter. */
    public letter: string;

    /** ContactsDetailBase bfTop. */
    public bfTop: boolean;

    /** ContactsDetailBase bfVerify. */
    public bfVerify: boolean;

    /** ContactsDetailBase signature. */
    public signature: string;

    /** ContactsDetailBase groupNickName. */
    public groupNickName: string;

    /** ContactsDetailBase phone. */
    public phone: string;

    /** ContactsDetailBase bfReadCancel. */
    public bfReadCancel: boolean;

    /** ContactsDetailBase msgCancelTime. */
    public msgCancelTime: number;

    /** ContactsDetailBase bfScreenshot. */
    public bfScreenshot: boolean;

    /** ContactsDetailBase commonGroupNum. */
    public commonGroupNum: number;

    /** ContactsDetailBase bfReadReceipt. */
    public bfReadReceipt: boolean;

    /** ContactsDetailBase groupShutupTime. */
    public groupShutupTime: number;

    /** ContactsDetailBase searchType. */
    public searchType: number;

    /** ContactsDetailBase addToken. */
    public addToken: string;

    /** ContactsDetailBase bfIdSearch. */
    public bfIdSearch: boolean;

    /**
     * Creates a new ContactsDetailBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsDetailBase instance
     */
    public static create(properties?: IContactsDetailBase): ContactsDetailBase;

    /**
     * Encodes the specified ContactsDetailBase message. Does not implicitly {@link ContactsDetailBase.verify|verify} messages.
     * @param message ContactsDetailBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsDetailBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsDetailBase message, length delimited. Does not implicitly {@link ContactsDetailBase.verify|verify} messages.
     * @param message ContactsDetailBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsDetailBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsDetailBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsDetailBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsDetailBase;

    /**
     * Decodes a ContactsDetailBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsDetailBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsDetailBase;

    /**
     * Verifies a ContactsDetailBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsDetailBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsDetailBase
     */
    public static fromObject(object: { [k: string]: any }): ContactsDetailBase;

    /**
     * Creates a plain object from a ContactsDetailBase message. Also converts values to other types if specified.
     * @param message ContactsDetailBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsDetailBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsDetailBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsDetailBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a MsgReceiptStatusBase. */
export class MsgReceiptStatusBase implements IMsgReceiptStatusBase {

    /**
     * Constructs a new MsgReceiptStatusBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: IMsgReceiptStatusBase);

    /** MsgReceiptStatusBase status. */
    public status: MsgReceiptStatus;

    /** MsgReceiptStatusBase time. */
    public time: (number|Long);

    /**
     * Creates a new MsgReceiptStatusBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns MsgReceiptStatusBase instance
     */
    public static create(properties?: IMsgReceiptStatusBase): MsgReceiptStatusBase;

    /**
     * Encodes the specified MsgReceiptStatusBase message. Does not implicitly {@link MsgReceiptStatusBase.verify|verify} messages.
     * @param message MsgReceiptStatusBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IMsgReceiptStatusBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified MsgReceiptStatusBase message, length delimited. Does not implicitly {@link MsgReceiptStatusBase.verify|verify} messages.
     * @param message MsgReceiptStatusBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IMsgReceiptStatusBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a MsgReceiptStatusBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns MsgReceiptStatusBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): MsgReceiptStatusBase;

    /**
     * Decodes a MsgReceiptStatusBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns MsgReceiptStatusBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): MsgReceiptStatusBase;

    /**
     * Verifies a MsgReceiptStatusBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a MsgReceiptStatusBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns MsgReceiptStatusBase
     */
    public static fromObject(object: { [k: string]: any }): MsgReceiptStatusBase;

    /**
     * Creates a plain object from a MsgReceiptStatusBase message. Also converts values to other types if specified.
     * @param message MsgReceiptStatusBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: MsgReceiptStatusBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this MsgReceiptStatusBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for MsgReceiptStatusBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a MsgReceiptBase. */
export class MsgReceiptBase implements IMsgReceiptBase {

    /**
     * Constructs a new MsgReceiptBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: IMsgReceiptBase);

    /** MsgReceiptBase targetUser. */
    public targetUser?: (IUserBase|null);

    /** MsgReceiptBase statusList. */
    public statusList: IMsgReceiptStatusBase[];

    /**
     * Creates a new MsgReceiptBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns MsgReceiptBase instance
     */
    public static create(properties?: IMsgReceiptBase): MsgReceiptBase;

    /**
     * Encodes the specified MsgReceiptBase message. Does not implicitly {@link MsgReceiptBase.verify|verify} messages.
     * @param message MsgReceiptBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IMsgReceiptBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified MsgReceiptBase message, length delimited. Does not implicitly {@link MsgReceiptBase.verify|verify} messages.
     * @param message MsgReceiptBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IMsgReceiptBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a MsgReceiptBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns MsgReceiptBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): MsgReceiptBase;

    /**
     * Decodes a MsgReceiptBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns MsgReceiptBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): MsgReceiptBase;

    /**
     * Verifies a MsgReceiptBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a MsgReceiptBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns MsgReceiptBase
     */
    public static fromObject(object: { [k: string]: any }): MsgReceiptBase;

    /**
     * Creates a plain object from a MsgReceiptBase message. Also converts values to other types if specified.
     * @param message MsgReceiptBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: MsgReceiptBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this MsgReceiptBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for MsgReceiptBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a UserOnOrOffLine. */
export class UserOnOrOffLine implements IUserOnOrOffLine {

    /**
     * Constructs a new UserOnOrOffLine.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUserOnOrOffLine);

    /** UserOnOrOffLine uid. */
    public uid: (number|Long);

    /** UserOnOrOffLine online. */
    public online: boolean;

    /** UserOnOrOffLine createTime. */
    public createTime: (number|Long);

    /** UserOnOrOffLine bfShow. */
    public bfShow: boolean;

    /**
     * Creates a new UserOnOrOffLine instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UserOnOrOffLine instance
     */
    public static create(properties?: IUserOnOrOffLine): UserOnOrOffLine;

    /**
     * Encodes the specified UserOnOrOffLine message. Does not implicitly {@link UserOnOrOffLine.verify|verify} messages.
     * @param message UserOnOrOffLine message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUserOnOrOffLine, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UserOnOrOffLine message, length delimited. Does not implicitly {@link UserOnOrOffLine.verify|verify} messages.
     * @param message UserOnOrOffLine message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUserOnOrOffLine, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a UserOnOrOffLine message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UserOnOrOffLine
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UserOnOrOffLine;

    /**
     * Decodes a UserOnOrOffLine message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UserOnOrOffLine
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UserOnOrOffLine;

    /**
     * Verifies a UserOnOrOffLine message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a UserOnOrOffLine message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UserOnOrOffLine
     */
    public static fromObject(object: { [k: string]: any }): UserOnOrOffLine;

    /**
     * Creates a plain object from a UserOnOrOffLine message. Also converts values to other types if specified.
     * @param message UserOnOrOffLine
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UserOnOrOffLine, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UserOnOrOffLine to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UserOnOrOffLine
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a KeyPairBase. */
export class KeyPairBase implements IKeyPairBase {

    /**
     * Constructs a new KeyPairBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: IKeyPairBase);

    /** KeyPairBase publicKey. */
    public publicKey: string;

    /** KeyPairBase privateKey. */
    public privateKey: string;

    /** KeyPairBase msgKey. */
    public msgKey: string;

    /** KeyPairBase keyVersion. */
    public keyVersion: number;

    /**
     * Creates a new KeyPairBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns KeyPairBase instance
     */
    public static create(properties?: IKeyPairBase): KeyPairBase;

    /**
     * Encodes the specified KeyPairBase message. Does not implicitly {@link KeyPairBase.verify|verify} messages.
     * @param message KeyPairBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IKeyPairBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified KeyPairBase message, length delimited. Does not implicitly {@link KeyPairBase.verify|verify} messages.
     * @param message KeyPairBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IKeyPairBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a KeyPairBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns KeyPairBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): KeyPairBase;

    /**
     * Decodes a KeyPairBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns KeyPairBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): KeyPairBase;

    /**
     * Verifies a KeyPairBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a KeyPairBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns KeyPairBase
     */
    public static fromObject(object: { [k: string]: any }): KeyPairBase;

    /**
     * Creates a plain object from a KeyPairBase message. Also converts values to other types if specified.
     * @param message KeyPairBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: KeyPairBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this KeyPairBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for KeyPairBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an AdminRightBase. */
export class AdminRightBase implements IAdminRightBase {

    /**
     * Constructs a new AdminRightBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: IAdminRightBase);

    /** AdminRightBase bfUpdateData. */
    public bfUpdateData: boolean;

    /** AdminRightBase bfJoinCheck. */
    public bfJoinCheck: boolean;

    /** AdminRightBase bfPushNotice. */
    public bfPushNotice: boolean;

    /** AdminRightBase bfSetAdmin. */
    public bfSetAdmin: boolean;

    /** AdminRightBase bfResetQrcode. */
    public bfResetQrcode: boolean;

    /**
     * Creates a new AdminRightBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns AdminRightBase instance
     */
    public static create(properties?: IAdminRightBase): AdminRightBase;

    /**
     * Encodes the specified AdminRightBase message. Does not implicitly {@link AdminRightBase.verify|verify} messages.
     * @param message AdminRightBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IAdminRightBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified AdminRightBase message, length delimited. Does not implicitly {@link AdminRightBase.verify|verify} messages.
     * @param message AdminRightBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IAdminRightBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an AdminRightBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns AdminRightBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): AdminRightBase;

    /**
     * Decodes an AdminRightBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns AdminRightBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): AdminRightBase;

    /**
     * Verifies an AdminRightBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an AdminRightBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns AdminRightBase
     */
    public static fromObject(object: { [k: string]: any }): AdminRightBase;

    /**
     * Creates a plain object from an AdminRightBase message. Also converts values to other types if specified.
     * @param message AdminRightBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: AdminRightBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this AdminRightBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for AdminRightBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupNoticeBase. */
export class GroupNoticeBase implements IGroupNoticeBase {

    /**
     * Constructs a new GroupNoticeBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupNoticeBase);

    /** GroupNoticeBase editUser. */
    public editUser?: (IGroupMemberBase|null);

    /** GroupNoticeBase notice. */
    public notice: string;

    /** GroupNoticeBase releaseTime. */
    public releaseTime: (number|Long);

    /** GroupNoticeBase noticeId. */
    public noticeId: (number|Long);

    /** GroupNoticeBase bfRemind. */
    public bfRemind: boolean;

    /**
     * Creates a new GroupNoticeBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupNoticeBase instance
     */
    public static create(properties?: IGroupNoticeBase): GroupNoticeBase;

    /**
     * Encodes the specified GroupNoticeBase message. Does not implicitly {@link GroupNoticeBase.verify|verify} messages.
     * @param message GroupNoticeBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupNoticeBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupNoticeBase message, length delimited. Does not implicitly {@link GroupNoticeBase.verify|verify} messages.
     * @param message GroupNoticeBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupNoticeBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupNoticeBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupNoticeBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupNoticeBase;

    /**
     * Decodes a GroupNoticeBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupNoticeBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupNoticeBase;

    /**
     * Verifies a GroupNoticeBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupNoticeBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupNoticeBase
     */
    public static fromObject(object: { [k: string]: any }): GroupNoticeBase;

    /**
     * Creates a plain object from a GroupNoticeBase message. Also converts values to other types if specified.
     * @param message GroupNoticeBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupNoticeBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupNoticeBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupNoticeBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an EmoticonBase. */
export class EmoticonBase implements IEmoticonBase {

    /**
     * Constructs a new EmoticonBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: IEmoticonBase);

    /** EmoticonBase emoticonId. */
    public emoticonId: (number|Long);

    /** EmoticonBase emoticonUrl. */
    public emoticonUrl: string;

    /** EmoticonBase height. */
    public height: number;

    /** EmoticonBase width. */
    public width: number;

    /**
     * Creates a new EmoticonBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns EmoticonBase instance
     */
    public static create(properties?: IEmoticonBase): EmoticonBase;

    /**
     * Encodes the specified EmoticonBase message. Does not implicitly {@link EmoticonBase.verify|verify} messages.
     * @param message EmoticonBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IEmoticonBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified EmoticonBase message, length delimited. Does not implicitly {@link EmoticonBase.verify|verify} messages.
     * @param message EmoticonBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IEmoticonBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an EmoticonBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns EmoticonBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): EmoticonBase;

    /**
     * Decodes an EmoticonBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns EmoticonBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): EmoticonBase;

    /**
     * Verifies an EmoticonBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an EmoticonBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns EmoticonBase
     */
    public static fromObject(object: { [k: string]: any }): EmoticonBase;

    /**
     * Creates a plain object from an EmoticonBase message. Also converts values to other types if specified.
     * @param message EmoticonBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: EmoticonBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this EmoticonBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for EmoticonBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a CoinLinkBase. */
export class CoinLinkBase implements ICoinLinkBase {

    /**
     * Constructs a new CoinLinkBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: ICoinLinkBase);

    /** CoinLinkBase coinId. */
    public coinId: number;

    /** CoinLinkBase linkName. */
    public linkName: string;

    /** CoinLinkBase minCash. */
    public minCash: string;

    /** CoinLinkBase maxCash. */
    public maxCash: string;

    /** CoinLinkBase isOpenCash. */
    public isOpenCash: boolean;

    /** CoinLinkBase isOpenRecharge. */
    public isOpenRecharge: boolean;

    /** CoinLinkBase minRecharge. */
    public minRecharge: string;

    /** CoinLinkBase tagType. */
    public tagType: number;

    /** CoinLinkBase tagName. */
    public tagName: string;

    /** CoinLinkBase blockConfirm. */
    public blockConfirm: string;

    /** CoinLinkBase cashTotal. */
    public cashTotal: string;

    /** CoinLinkBase feeCoin. */
    public feeCoin: string;

    /** CoinLinkBase showDecimal. */
    public showDecimal: number;

    /**
     * Creates a new CoinLinkBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns CoinLinkBase instance
     */
    public static create(properties?: ICoinLinkBase): CoinLinkBase;

    /**
     * Encodes the specified CoinLinkBase message. Does not implicitly {@link CoinLinkBase.verify|verify} messages.
     * @param message CoinLinkBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ICoinLinkBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified CoinLinkBase message, length delimited. Does not implicitly {@link CoinLinkBase.verify|verify} messages.
     * @param message CoinLinkBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ICoinLinkBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a CoinLinkBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns CoinLinkBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): CoinLinkBase;

    /**
     * Decodes a CoinLinkBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns CoinLinkBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): CoinLinkBase;

    /**
     * Verifies a CoinLinkBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a CoinLinkBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns CoinLinkBase
     */
    public static fromObject(object: { [k: string]: any }): CoinLinkBase;

    /**
     * Creates a plain object from a CoinLinkBase message. Also converts values to other types if specified.
     * @param message CoinLinkBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: CoinLinkBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this CoinLinkBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for CoinLinkBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a CoinTypeBase. */
export class CoinTypeBase implements ICoinTypeBase {

    /**
     * Constructs a new CoinTypeBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: ICoinTypeBase);

    /** CoinTypeBase id. */
    public id: number;

    /** CoinTypeBase name. */
    public name: string;

    /** CoinTypeBase desc. */
    public desc: string;

    /** CoinTypeBase icon. */
    public icon: string;

    /** CoinTypeBase letter. */
    public letter: string;

    /** CoinTypeBase link. */
    public link: ICoinLinkBase[];

    /** CoinTypeBase minCash. */
    public minCash: string;

    /** CoinTypeBase maxCash. */
    public maxCash: string;

    /** CoinTypeBase isOpenCash. */
    public isOpenCash: boolean;

    /** CoinTypeBase isOpenRecharge. */
    public isOpenRecharge: boolean;

    /** CoinTypeBase minRecharge. */
    public minRecharge: string;

    /** CoinTypeBase tagType. */
    public tagType: number;

    /** CoinTypeBase tagName. */
    public tagName: string;

    /** CoinTypeBase blockConfirm. */
    public blockConfirm: string;

    /** CoinTypeBase cashTotal. */
    public cashTotal: string;

    /** CoinTypeBase feeCoin. */
    public feeCoin: string;

    /** CoinTypeBase showDecimal. */
    public showDecimal: number;

    /** CoinTypeBase symbol. */
    public symbol: string;

    /** CoinTypeBase alias. */
    public alias: string;

    /**
     * Creates a new CoinTypeBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns CoinTypeBase instance
     */
    public static create(properties?: ICoinTypeBase): CoinTypeBase;

    /**
     * Encodes the specified CoinTypeBase message. Does not implicitly {@link CoinTypeBase.verify|verify} messages.
     * @param message CoinTypeBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ICoinTypeBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified CoinTypeBase message, length delimited. Does not implicitly {@link CoinTypeBase.verify|verify} messages.
     * @param message CoinTypeBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ICoinTypeBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a CoinTypeBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns CoinTypeBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): CoinTypeBase;

    /**
     * Decodes a CoinTypeBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns CoinTypeBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): CoinTypeBase;

    /**
     * Verifies a CoinTypeBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a CoinTypeBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns CoinTypeBase
     */
    public static fromObject(object: { [k: string]: any }): CoinTypeBase;

    /**
     * Creates a plain object from a CoinTypeBase message. Also converts values to other types if specified.
     * @param message CoinTypeBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: CoinTypeBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this CoinTypeBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for CoinTypeBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a NewsCategoryBase. */
export class NewsCategoryBase implements INewsCategoryBase {

    /**
     * Constructs a new NewsCategoryBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: INewsCategoryBase);

    /** NewsCategoryBase categoryId. */
    public categoryId: number;

    /** NewsCategoryBase name. */
    public name: string;

    /** NewsCategoryBase sort. */
    public sort: number;

    /**
     * Creates a new NewsCategoryBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns NewsCategoryBase instance
     */
    public static create(properties?: INewsCategoryBase): NewsCategoryBase;

    /**
     * Encodes the specified NewsCategoryBase message. Does not implicitly {@link NewsCategoryBase.verify|verify} messages.
     * @param message NewsCategoryBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: INewsCategoryBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified NewsCategoryBase message, length delimited. Does not implicitly {@link NewsCategoryBase.verify|verify} messages.
     * @param message NewsCategoryBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: INewsCategoryBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a NewsCategoryBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns NewsCategoryBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): NewsCategoryBase;

    /**
     * Decodes a NewsCategoryBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns NewsCategoryBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): NewsCategoryBase;

    /**
     * Verifies a NewsCategoryBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a NewsCategoryBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns NewsCategoryBase
     */
    public static fromObject(object: { [k: string]: any }): NewsCategoryBase;

    /**
     * Creates a plain object from a NewsCategoryBase message. Also converts values to other types if specified.
     * @param message NewsCategoryBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: NewsCategoryBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this NewsCategoryBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for NewsCategoryBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a NewsBase. */
export class NewsBase implements INewsBase {

    /**
     * Constructs a new NewsBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: INewsBase);

    /** NewsBase newsId. */
    public newsId: (number|Long);

    /** NewsBase title. */
    public title: string;

    /** NewsBase pic. */
    public pic: string;

    /** NewsBase time. */
    public time: (number|Long);

    /** NewsBase detailLink. */
    public detailLink: string;

    /**
     * Creates a new NewsBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns NewsBase instance
     */
    public static create(properties?: INewsBase): NewsBase;

    /**
     * Encodes the specified NewsBase message. Does not implicitly {@link NewsBase.verify|verify} messages.
     * @param message NewsBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: INewsBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified NewsBase message, length delimited. Does not implicitly {@link NewsBase.verify|verify} messages.
     * @param message NewsBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: INewsBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a NewsBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns NewsBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): NewsBase;

    /**
     * Decodes a NewsBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns NewsBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): NewsBase;

    /**
     * Verifies a NewsBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a NewsBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns NewsBase
     */
    public static fromObject(object: { [k: string]: any }): NewsBase;

    /**
     * Creates a plain object from a NewsBase message. Also converts values to other types if specified.
     * @param message NewsBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: NewsBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this NewsBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for NewsBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a PaymentBase. */
export class PaymentBase implements IPaymentBase {

    /**
     * Constructs a new PaymentBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: IPaymentBase);

    /** PaymentBase paymentId. */
    public paymentId: number;

    /** PaymentBase paymentType. */
    public paymentType: number;

    /** PaymentBase accountName. */
    public accountName: string;

    /** PaymentBase cardNo. */
    public cardNo: string;

    /** PaymentBase bankName. */
    public bankName: string;

    /** PaymentBase subBankName. */
    public subBankName: string;

    /**
     * Creates a new PaymentBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns PaymentBase instance
     */
    public static create(properties?: IPaymentBase): PaymentBase;

    /**
     * Encodes the specified PaymentBase message. Does not implicitly {@link PaymentBase.verify|verify} messages.
     * @param message PaymentBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IPaymentBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified PaymentBase message, length delimited. Does not implicitly {@link PaymentBase.verify|verify} messages.
     * @param message PaymentBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IPaymentBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a PaymentBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns PaymentBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): PaymentBase;

    /**
     * Decodes a PaymentBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns PaymentBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): PaymentBase;

    /**
     * Verifies a PaymentBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a PaymentBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns PaymentBase
     */
    public static fromObject(object: { [k: string]: any }): PaymentBase;

    /**
     * Creates a plain object from a PaymentBase message. Also converts values to other types if specified.
     * @param message PaymentBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: PaymentBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this PaymentBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for PaymentBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a PaymentBasics. */
export class PaymentBasics implements IPaymentBasics {

    /**
     * Constructs a new PaymentBasics.
     * @param [properties] Properties to set
     */
    constructor(properties?: IPaymentBasics);

    /** PaymentBasics paymentId. */
    public paymentId: (number|Long);

    /** PaymentBasics paymentType. */
    public paymentType: number;

    /**
     * Creates a new PaymentBasics instance using the specified properties.
     * @param [properties] Properties to set
     * @returns PaymentBasics instance
     */
    public static create(properties?: IPaymentBasics): PaymentBasics;

    /**
     * Encodes the specified PaymentBasics message. Does not implicitly {@link PaymentBasics.verify|verify} messages.
     * @param message PaymentBasics message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IPaymentBasics, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified PaymentBasics message, length delimited. Does not implicitly {@link PaymentBasics.verify|verify} messages.
     * @param message PaymentBasics message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IPaymentBasics, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a PaymentBasics message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns PaymentBasics
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): PaymentBasics;

    /**
     * Decodes a PaymentBasics message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns PaymentBasics
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): PaymentBasics;

    /**
     * Verifies a PaymentBasics message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a PaymentBasics message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns PaymentBasics
     */
    public static fromObject(object: { [k: string]: any }): PaymentBasics;

    /**
     * Creates a plain object from a PaymentBasics message. Also converts values to other types if specified.
     * @param message PaymentBasics
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: PaymentBasics, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this PaymentBasics to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for PaymentBasics
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a TranslationInfo. */
export class TranslationInfo implements ITranslationInfo {

    /**
     * Constructs a new TranslationInfo.
     * @param [properties] Properties to set
     */
    constructor(properties?: ITranslationInfo);

    /** TranslationInfo autoTranslateStatus. */
    public autoTranslateStatus: number;

    /** TranslationInfo receiveLanguage. */
    public receiveLanguage: number;

    /** TranslationInfo sendLanguage. */
    public sendLanguage: number;

    /** TranslationInfo key. */
    public key: string;

    /** TranslationInfo region. */
    public region: string;

    /**
     * Creates a new TranslationInfo instance using the specified properties.
     * @param [properties] Properties to set
     * @returns TranslationInfo instance
     */
    public static create(properties?: ITranslationInfo): TranslationInfo;

    /**
     * Encodes the specified TranslationInfo message. Does not implicitly {@link TranslationInfo.verify|verify} messages.
     * @param message TranslationInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ITranslationInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified TranslationInfo message, length delimited. Does not implicitly {@link TranslationInfo.verify|verify} messages.
     * @param message TranslationInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ITranslationInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a TranslationInfo message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns TranslationInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): TranslationInfo;

    /**
     * Decodes a TranslationInfo message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns TranslationInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): TranslationInfo;

    /**
     * Verifies a TranslationInfo message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a TranslationInfo message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns TranslationInfo
     */
    public static fromObject(object: { [k: string]: any }): TranslationInfo;

    /**
     * Creates a plain object from a TranslationInfo message. Also converts values to other types if specified.
     * @param message TranslationInfo
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: TranslationInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this TranslationInfo to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for TranslationInfo
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a BotGameInfo. */
export class BotGameInfo implements IBotGameInfo {

    /**
     * Constructs a new BotGameInfo.
     * @param [properties] Properties to set
     */
    constructor(properties?: IBotGameInfo);

    /** BotGameInfo gameId. */
    public gameId: string;

    /** BotGameInfo gameName. */
    public gameName: string;

    /**
     * Creates a new BotGameInfo instance using the specified properties.
     * @param [properties] Properties to set
     * @returns BotGameInfo instance
     */
    public static create(properties?: IBotGameInfo): BotGameInfo;

    /**
     * Encodes the specified BotGameInfo message. Does not implicitly {@link BotGameInfo.verify|verify} messages.
     * @param message BotGameInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IBotGameInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified BotGameInfo message, length delimited. Does not implicitly {@link BotGameInfo.verify|verify} messages.
     * @param message BotGameInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IBotGameInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a BotGameInfo message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns BotGameInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): BotGameInfo;

    /**
     * Decodes a BotGameInfo message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns BotGameInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): BotGameInfo;

    /**
     * Verifies a BotGameInfo message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a BotGameInfo message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns BotGameInfo
     */
    public static fromObject(object: { [k: string]: any }): BotGameInfo;

    /**
     * Creates a plain object from a BotGameInfo message. Also converts values to other types if specified.
     * @param message BotGameInfo
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: BotGameInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this BotGameInfo to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for BotGameInfo
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a BotAgentInfo. */
export class BotAgentInfo implements IBotAgentInfo {

    /**
     * Constructs a new BotAgentInfo.
     * @param [properties] Properties to set
     */
    constructor(properties?: IBotAgentInfo);

    /** BotAgentInfo agentId. */
    public agentId: number;

    /** BotAgentInfo agentName. */
    public agentName: string;

    /**
     * Creates a new BotAgentInfo instance using the specified properties.
     * @param [properties] Properties to set
     * @returns BotAgentInfo instance
     */
    public static create(properties?: IBotAgentInfo): BotAgentInfo;

    /**
     * Encodes the specified BotAgentInfo message. Does not implicitly {@link BotAgentInfo.verify|verify} messages.
     * @param message BotAgentInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IBotAgentInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified BotAgentInfo message, length delimited. Does not implicitly {@link BotAgentInfo.verify|verify} messages.
     * @param message BotAgentInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IBotAgentInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a BotAgentInfo message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns BotAgentInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): BotAgentInfo;

    /**
     * Decodes a BotAgentInfo message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns BotAgentInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): BotAgentInfo;

    /**
     * Verifies a BotAgentInfo message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a BotAgentInfo message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns BotAgentInfo
     */
    public static fromObject(object: { [k: string]: any }): BotAgentInfo;

    /**
     * Creates a plain object from a BotAgentInfo message. Also converts values to other types if specified.
     * @param message BotAgentInfo
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: BotAgentInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this BotAgentInfo to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for BotAgentInfo
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an AwsConfig. */
export class AwsConfig implements IAwsConfig {

    /**
     * Constructs a new AwsConfig.
     * @param [properties] Properties to set
     */
    constructor(properties?: IAwsConfig);

    /** AwsConfig accessKey. */
    public accessKey: string;

    /** AwsConfig secretKey. */
    public secretKey: string;

    /** AwsConfig regionName. */
    public regionName: string;

    /** AwsConfig sessionId. */
    public sessionId: string;

    /**
     * Creates a new AwsConfig instance using the specified properties.
     * @param [properties] Properties to set
     * @returns AwsConfig instance
     */
    public static create(properties?: IAwsConfig): AwsConfig;

    /**
     * Encodes the specified AwsConfig message. Does not implicitly {@link AwsConfig.verify|verify} messages.
     * @param message AwsConfig message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IAwsConfig, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified AwsConfig message, length delimited. Does not implicitly {@link AwsConfig.verify|verify} messages.
     * @param message AwsConfig message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IAwsConfig, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an AwsConfig message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns AwsConfig
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): AwsConfig;

    /**
     * Decodes an AwsConfig message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns AwsConfig
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): AwsConfig;

    /**
     * Verifies an AwsConfig message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an AwsConfig message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns AwsConfig
     */
    public static fromObject(object: { [k: string]: any }): AwsConfig;

    /**
     * Creates a plain object from an AwsConfig message. Also converts values to other types if specified.
     * @param message AwsConfig
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: AwsConfig, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this AwsConfig to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for AwsConfig
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** PageSort enum. */
export enum PageSort {
    ASC = 0,
    DESC = 1
}

/** UploadChannelType enum. */
export enum UploadChannelType {
    OSS_DEFAULT = 0,
    OSS_CHAT = 1,
    OSS_LOW_RATE = 2
}

/** Represents a LinkObj. */
export class LinkObj implements ILinkObj {

    /**
     * Constructs a new LinkObj.
     * @param [properties] Properties to set
     */
    constructor(properties?: ILinkObj);

    /** LinkObj link. */
    public link: string;

    /** LinkObj location. */
    public location: number;

    /** LinkObj length. */
    public length: number;

    /**
     * Creates a new LinkObj instance using the specified properties.
     * @param [properties] Properties to set
     * @returns LinkObj instance
     */
    public static create(properties?: ILinkObj): LinkObj;

    /**
     * Encodes the specified LinkObj message. Does not implicitly {@link LinkObj.verify|verify} messages.
     * @param message LinkObj message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ILinkObj, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified LinkObj message, length delimited. Does not implicitly {@link LinkObj.verify|verify} messages.
     * @param message LinkObj message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ILinkObj, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a LinkObj message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns LinkObj
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): LinkObj;

    /**
     * Decodes a LinkObj message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns LinkObj
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): LinkObj;

    /**
     * Verifies a LinkObj message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a LinkObj message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns LinkObj
     */
    public static fromObject(object: { [k: string]: any }): LinkObj;

    /**
     * Creates a plain object from a LinkObj message. Also converts values to other types if specified.
     * @param message LinkObj
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: LinkObj, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this LinkObj to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for LinkObj
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a FeeConfig. */
export class FeeConfig implements IFeeConfig {

    /**
     * Constructs a new FeeConfig.
     * @param [properties] Properties to set
     */
    constructor(properties?: IFeeConfig);

    /** FeeConfig scenesType. */
    public scenesType: number;

    /** FeeConfig scenesName. */
    public scenesName: string;

    /** FeeConfig feeConfigs. */
    public feeConfigs: ICoinFeeConfig[];

    /**
     * Creates a new FeeConfig instance using the specified properties.
     * @param [properties] Properties to set
     * @returns FeeConfig instance
     */
    public static create(properties?: IFeeConfig): FeeConfig;

    /**
     * Encodes the specified FeeConfig message. Does not implicitly {@link FeeConfig.verify|verify} messages.
     * @param message FeeConfig message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IFeeConfig, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified FeeConfig message, length delimited. Does not implicitly {@link FeeConfig.verify|verify} messages.
     * @param message FeeConfig message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IFeeConfig, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a FeeConfig message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns FeeConfig
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): FeeConfig;

    /**
     * Decodes a FeeConfig message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns FeeConfig
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): FeeConfig;

    /**
     * Verifies a FeeConfig message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a FeeConfig message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns FeeConfig
     */
    public static fromObject(object: { [k: string]: any }): FeeConfig;

    /**
     * Creates a plain object from a FeeConfig message. Also converts values to other types if specified.
     * @param message FeeConfig
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: FeeConfig, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this FeeConfig to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for FeeConfig
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a CoinFeeConfig. */
export class CoinFeeConfig implements ICoinFeeConfig {

    /**
     * Constructs a new CoinFeeConfig.
     * @param [properties] Properties to set
     */
    constructor(properties?: ICoinFeeConfig);

    /** CoinFeeConfig coinName. */
    public coinName: string;

    /** CoinFeeConfig minFee. */
    public minFee: string;

    /** CoinFeeConfig maxFee. */
    public maxFee: string;

    /** CoinFeeConfig baseFee. */
    public baseFee: string;

    /** CoinFeeConfig feeRate. */
    public feeRate: string;

    /** CoinFeeConfig fixedFee. */
    public fixedFee: string;

    /** CoinFeeConfig mathType. */
    public mathType: number;

    /** CoinFeeConfig feeScale. */
    public feeScale: number;

    /**
     * Creates a new CoinFeeConfig instance using the specified properties.
     * @param [properties] Properties to set
     * @returns CoinFeeConfig instance
     */
    public static create(properties?: ICoinFeeConfig): CoinFeeConfig;

    /**
     * Encodes the specified CoinFeeConfig message. Does not implicitly {@link CoinFeeConfig.verify|verify} messages.
     * @param message CoinFeeConfig message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ICoinFeeConfig, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified CoinFeeConfig message, length delimited. Does not implicitly {@link CoinFeeConfig.verify|verify} messages.
     * @param message CoinFeeConfig message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ICoinFeeConfig, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a CoinFeeConfig message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns CoinFeeConfig
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): CoinFeeConfig;

    /**
     * Decodes a CoinFeeConfig message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns CoinFeeConfig
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): CoinFeeConfig;

    /**
     * Verifies a CoinFeeConfig message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a CoinFeeConfig message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns CoinFeeConfig
     */
    public static fromObject(object: { [k: string]: any }): CoinFeeConfig;

    /**
     * Creates a plain object from a CoinFeeConfig message. Also converts values to other types if specified.
     * @param message CoinFeeConfig
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: CoinFeeConfig, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this CoinFeeConfig to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for CoinFeeConfig
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GetTokenReq. */
export class GetTokenReq implements IGetTokenReq {

    /**
     * Constructs a new GetTokenReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGetTokenReq);

    /** GetTokenReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GetTokenReq attachWorkspaceType. */
    public attachWorkspaceType: AttachWorkSpaceType;

    /** GetTokenReq attachType. */
    public attachType: AttachType;

    /**
     * Creates a new GetTokenReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GetTokenReq instance
     */
    public static create(properties?: IGetTokenReq): GetTokenReq;

    /**
     * Encodes the specified GetTokenReq message. Does not implicitly {@link GetTokenReq.verify|verify} messages.
     * @param message GetTokenReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGetTokenReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GetTokenReq message, length delimited. Does not implicitly {@link GetTokenReq.verify|verify} messages.
     * @param message GetTokenReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGetTokenReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GetTokenReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GetTokenReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GetTokenReq;

    /**
     * Decodes a GetTokenReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GetTokenReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GetTokenReq;

    /**
     * Verifies a GetTokenReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GetTokenReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GetTokenReq
     */
    public static fromObject(object: { [k: string]: any }): GetTokenReq;

    /**
     * Creates a plain object from a GetTokenReq message. Also converts values to other types if specified.
     * @param message GetTokenReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GetTokenReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GetTokenReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GetTokenReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GetTokenResp. */
export class GetTokenResp implements IGetTokenResp {

    /**
     * Constructs a new GetTokenResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGetTokenResp);

    /** GetTokenResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GetTokenResp token. */
    public token: string;

    /** GetTokenResp fileId. */
    public fileId: string;

    /** GetTokenResp url. */
    public url: string;

    /**
     * Creates a new GetTokenResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GetTokenResp instance
     */
    public static create(properties?: IGetTokenResp): GetTokenResp;

    /**
     * Encodes the specified GetTokenResp message. Does not implicitly {@link GetTokenResp.verify|verify} messages.
     * @param message GetTokenResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGetTokenResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GetTokenResp message, length delimited. Does not implicitly {@link GetTokenResp.verify|verify} messages.
     * @param message GetTokenResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGetTokenResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GetTokenResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GetTokenResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GetTokenResp;

    /**
     * Decodes a GetTokenResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GetTokenResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GetTokenResp;

    /**
     * Verifies a GetTokenResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GetTokenResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GetTokenResp
     */
    public static fromObject(object: { [k: string]: any }): GetTokenResp;

    /**
     * Creates a plain object from a GetTokenResp message. Also converts values to other types if specified.
     * @param message GetTokenResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GetTokenResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GetTokenResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GetTokenResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an UpdateKeyPairReq. */
export class UpdateKeyPairReq implements IUpdateKeyPairReq {

    /**
     * Constructs a new UpdateKeyPairReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUpdateKeyPairReq);

    /** UpdateKeyPairReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** UpdateKeyPairReq publicKey. */
    public publicKey: string;

    /**
     * Creates a new UpdateKeyPairReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UpdateKeyPairReq instance
     */
    public static create(properties?: IUpdateKeyPairReq): UpdateKeyPairReq;

    /**
     * Encodes the specified UpdateKeyPairReq message. Does not implicitly {@link UpdateKeyPairReq.verify|verify} messages.
     * @param message UpdateKeyPairReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUpdateKeyPairReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UpdateKeyPairReq message, length delimited. Does not implicitly {@link UpdateKeyPairReq.verify|verify} messages.
     * @param message UpdateKeyPairReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUpdateKeyPairReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an UpdateKeyPairReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UpdateKeyPairReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UpdateKeyPairReq;

    /**
     * Decodes an UpdateKeyPairReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UpdateKeyPairReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UpdateKeyPairReq;

    /**
     * Verifies an UpdateKeyPairReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an UpdateKeyPairReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UpdateKeyPairReq
     */
    public static fromObject(object: { [k: string]: any }): UpdateKeyPairReq;

    /**
     * Creates a plain object from an UpdateKeyPairReq message. Also converts values to other types if specified.
     * @param message UpdateKeyPairReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UpdateKeyPairReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UpdateKeyPairReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UpdateKeyPairReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an UpdateKeyPairResp. */
export class UpdateKeyPairResp implements IUpdateKeyPairResp {

    /**
     * Constructs a new UpdateKeyPairResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUpdateKeyPairResp);

    /** UpdateKeyPairResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** UpdateKeyPairResp keyVersion. */
    public keyVersion: number;

    /**
     * Creates a new UpdateKeyPairResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UpdateKeyPairResp instance
     */
    public static create(properties?: IUpdateKeyPairResp): UpdateKeyPairResp;

    /**
     * Encodes the specified UpdateKeyPairResp message. Does not implicitly {@link UpdateKeyPairResp.verify|verify} messages.
     * @param message UpdateKeyPairResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUpdateKeyPairResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UpdateKeyPairResp message, length delimited. Does not implicitly {@link UpdateKeyPairResp.verify|verify} messages.
     * @param message UpdateKeyPairResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUpdateKeyPairResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an UpdateKeyPairResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UpdateKeyPairResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UpdateKeyPairResp;

    /**
     * Decodes an UpdateKeyPairResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UpdateKeyPairResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UpdateKeyPairResp;

    /**
     * Verifies an UpdateKeyPairResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an UpdateKeyPairResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UpdateKeyPairResp
     */
    public static fromObject(object: { [k: string]: any }): UpdateKeyPairResp;

    /**
     * Creates a plain object from an UpdateKeyPairResp message. Also converts values to other types if specified.
     * @param message UpdateKeyPairResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UpdateKeyPairResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UpdateKeyPairResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UpdateKeyPairResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GetKeyPairReq. */
export class GetKeyPairReq implements IGetKeyPairReq {

    /**
     * Constructs a new GetKeyPairReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGetKeyPairReq);

    /** GetKeyPairReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GetKeyPairReq flag. */
    public flag: KeyPairType;

    /** GetKeyPairReq targetId. */
    public targetId: (number|Long);

    /** GetKeyPairReq webKeyVersion. */
    public webKeyVersion: number;

    /** GetKeyPairReq appKeyVersion. */
    public appKeyVersion: number;

    /** GetKeyPairReq groupKeyVersion. */
    public groupKeyVersion: number;

    /** GetKeyPairReq channelKeyVersion. */
    public channelKeyVersion: number;

    /**
     * Creates a new GetKeyPairReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GetKeyPairReq instance
     */
    public static create(properties?: IGetKeyPairReq): GetKeyPairReq;

    /**
     * Encodes the specified GetKeyPairReq message. Does not implicitly {@link GetKeyPairReq.verify|verify} messages.
     * @param message GetKeyPairReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGetKeyPairReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GetKeyPairReq message, length delimited. Does not implicitly {@link GetKeyPairReq.verify|verify} messages.
     * @param message GetKeyPairReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGetKeyPairReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GetKeyPairReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GetKeyPairReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GetKeyPairReq;

    /**
     * Decodes a GetKeyPairReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GetKeyPairReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GetKeyPairReq;

    /**
     * Verifies a GetKeyPairReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GetKeyPairReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GetKeyPairReq
     */
    public static fromObject(object: { [k: string]: any }): GetKeyPairReq;

    /**
     * Creates a plain object from a GetKeyPairReq message. Also converts values to other types if specified.
     * @param message GetKeyPairReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GetKeyPairReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GetKeyPairReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GetKeyPairReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GetKeyPairResp. */
export class GetKeyPairResp implements IGetKeyPairResp {

    /**
     * Constructs a new GetKeyPairResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGetKeyPairResp);

    /** GetKeyPairResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GetKeyPairResp appKeyPair. */
    public appKeyPair?: (IKeyPairBase|null);

    /** GetKeyPairResp webKeyPair. */
    public webKeyPair?: (IKeyPairBase|null);

    /** GetKeyPairResp groupKeyPair. */
    public groupKeyPair?: (IKeyPairBase|null);

    /** GetKeyPairResp channelKeyPair. */
    public channelKeyPair?: (IKeyPairBase|null);

    /**
     * Creates a new GetKeyPairResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GetKeyPairResp instance
     */
    public static create(properties?: IGetKeyPairResp): GetKeyPairResp;

    /**
     * Encodes the specified GetKeyPairResp message. Does not implicitly {@link GetKeyPairResp.verify|verify} messages.
     * @param message GetKeyPairResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGetKeyPairResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GetKeyPairResp message, length delimited. Does not implicitly {@link GetKeyPairResp.verify|verify} messages.
     * @param message GetKeyPairResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGetKeyPairResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GetKeyPairResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GetKeyPairResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GetKeyPairResp;

    /**
     * Decodes a GetKeyPairResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GetKeyPairResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GetKeyPairResp;

    /**
     * Verifies a GetKeyPairResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GetKeyPairResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GetKeyPairResp
     */
    public static fromObject(object: { [k: string]: any }): GetKeyPairResp;

    /**
     * Creates a plain object from a GetKeyPairResp message. Also converts values to other types if specified.
     * @param message GetKeyPairResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GetKeyPairResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GetKeyPairResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GetKeyPairResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GetKeyPairListReq. */
export class GetKeyPairListReq implements IGetKeyPairListReq {

    /**
     * Constructs a new GetKeyPairListReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGetKeyPairListReq);

    /** GetKeyPairListReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GetKeyPairListReq targetId. */
    public targetId: (number|Long);

    /**
     * Creates a new GetKeyPairListReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GetKeyPairListReq instance
     */
    public static create(properties?: IGetKeyPairListReq): GetKeyPairListReq;

    /**
     * Encodes the specified GetKeyPairListReq message. Does not implicitly {@link GetKeyPairListReq.verify|verify} messages.
     * @param message GetKeyPairListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGetKeyPairListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GetKeyPairListReq message, length delimited. Does not implicitly {@link GetKeyPairListReq.verify|verify} messages.
     * @param message GetKeyPairListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGetKeyPairListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GetKeyPairListReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GetKeyPairListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GetKeyPairListReq;

    /**
     * Decodes a GetKeyPairListReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GetKeyPairListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GetKeyPairListReq;

    /**
     * Verifies a GetKeyPairListReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GetKeyPairListReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GetKeyPairListReq
     */
    public static fromObject(object: { [k: string]: any }): GetKeyPairListReq;

    /**
     * Creates a plain object from a GetKeyPairListReq message. Also converts values to other types if specified.
     * @param message GetKeyPairListReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GetKeyPairListReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GetKeyPairListReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GetKeyPairListReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GetKeyPairListResp. */
export class GetKeyPairListResp implements IGetKeyPairListResp {

    /**
     * Constructs a new GetKeyPairListResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGetKeyPairListResp);

    /** GetKeyPairListResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GetKeyPairListResp keyPairs. */
    public keyPairs: IKeyPairBase[];

    /**
     * Creates a new GetKeyPairListResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GetKeyPairListResp instance
     */
    public static create(properties?: IGetKeyPairListResp): GetKeyPairListResp;

    /**
     * Encodes the specified GetKeyPairListResp message. Does not implicitly {@link GetKeyPairListResp.verify|verify} messages.
     * @param message GetKeyPairListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGetKeyPairListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GetKeyPairListResp message, length delimited. Does not implicitly {@link GetKeyPairListResp.verify|verify} messages.
     * @param message GetKeyPairListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGetKeyPairListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GetKeyPairListResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GetKeyPairListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GetKeyPairListResp;

    /**
     * Decodes a GetKeyPairListResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GetKeyPairListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GetKeyPairListResp;

    /**
     * Verifies a GetKeyPairListResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GetKeyPairListResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GetKeyPairListResp
     */
    public static fromObject(object: { [k: string]: any }): GetKeyPairListResp;

    /**
     * Creates a plain object from a GetKeyPairListResp message. Also converts values to other types if specified.
     * @param message GetKeyPairListResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GetKeyPairListResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GetKeyPairListResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GetKeyPairListResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a CheckVersionReq. */
export class CheckVersionReq implements ICheckVersionReq {

    /**
     * Constructs a new CheckVersionReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: ICheckVersionReq);

    /** CheckVersionReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /**
     * Creates a new CheckVersionReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns CheckVersionReq instance
     */
    public static create(properties?: ICheckVersionReq): CheckVersionReq;

    /**
     * Encodes the specified CheckVersionReq message. Does not implicitly {@link CheckVersionReq.verify|verify} messages.
     * @param message CheckVersionReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ICheckVersionReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified CheckVersionReq message, length delimited. Does not implicitly {@link CheckVersionReq.verify|verify} messages.
     * @param message CheckVersionReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ICheckVersionReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a CheckVersionReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns CheckVersionReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): CheckVersionReq;

    /**
     * Decodes a CheckVersionReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns CheckVersionReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): CheckVersionReq;

    /**
     * Verifies a CheckVersionReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a CheckVersionReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns CheckVersionReq
     */
    public static fromObject(object: { [k: string]: any }): CheckVersionReq;

    /**
     * Creates a plain object from a CheckVersionReq message. Also converts values to other types if specified.
     * @param message CheckVersionReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: CheckVersionReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this CheckVersionReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for CheckVersionReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a CheckVersionResp. */
export class CheckVersionResp implements ICheckVersionResp {

    /**
     * Constructs a new CheckVersionResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: ICheckVersionResp);

    /** CheckVersionResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** CheckVersionResp flag. */
    public flag: CheckVersionFlag;

    /** CheckVersionResp title. */
    public title: string;

    /** CheckVersionResp content. */
    public content: string;

    /** CheckVersionResp url. */
    public url: string;

    /** CheckVersionResp version. */
    public version: number;

    /**
     * Creates a new CheckVersionResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns CheckVersionResp instance
     */
    public static create(properties?: ICheckVersionResp): CheckVersionResp;

    /**
     * Encodes the specified CheckVersionResp message. Does not implicitly {@link CheckVersionResp.verify|verify} messages.
     * @param message CheckVersionResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ICheckVersionResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified CheckVersionResp message, length delimited. Does not implicitly {@link CheckVersionResp.verify|verify} messages.
     * @param message CheckVersionResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ICheckVersionResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a CheckVersionResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns CheckVersionResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): CheckVersionResp;

    /**
     * Decodes a CheckVersionResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns CheckVersionResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): CheckVersionResp;

    /**
     * Verifies a CheckVersionResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a CheckVersionResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns CheckVersionResp
     */
    public static fromObject(object: { [k: string]: any }): CheckVersionResp;

    /**
     * Creates a plain object from a CheckVersionResp message. Also converts values to other types if specified.
     * @param message CheckVersionResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: CheckVersionResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this CheckVersionResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for CheckVersionResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a CreateArchiveReq. */
export class CreateArchiveReq implements ICreateArchiveReq {

    /**
     * Constructs a new CreateArchiveReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: ICreateArchiveReq);

    /** CreateArchiveReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** CreateArchiveReq ArchiveInfo. */
    public ArchiveInfo: IArchiveInfo[];

    /**
     * Creates a new CreateArchiveReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns CreateArchiveReq instance
     */
    public static create(properties?: ICreateArchiveReq): CreateArchiveReq;

    /**
     * Encodes the specified CreateArchiveReq message. Does not implicitly {@link CreateArchiveReq.verify|verify} messages.
     * @param message CreateArchiveReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ICreateArchiveReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified CreateArchiveReq message, length delimited. Does not implicitly {@link CreateArchiveReq.verify|verify} messages.
     * @param message CreateArchiveReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ICreateArchiveReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a CreateArchiveReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns CreateArchiveReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): CreateArchiveReq;

    /**
     * Decodes a CreateArchiveReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns CreateArchiveReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): CreateArchiveReq;

    /**
     * Verifies a CreateArchiveReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a CreateArchiveReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns CreateArchiveReq
     */
    public static fromObject(object: { [k: string]: any }): CreateArchiveReq;

    /**
     * Creates a plain object from a CreateArchiveReq message. Also converts values to other types if specified.
     * @param message CreateArchiveReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: CreateArchiveReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this CreateArchiveReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for CreateArchiveReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a CreateArchiveResp. */
export class CreateArchiveResp implements ICreateArchiveResp {

    /**
     * Constructs a new CreateArchiveResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: ICreateArchiveResp);

    /** CreateArchiveResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new CreateArchiveResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns CreateArchiveResp instance
     */
    public static create(properties?: ICreateArchiveResp): CreateArchiveResp;

    /**
     * Encodes the specified CreateArchiveResp message. Does not implicitly {@link CreateArchiveResp.verify|verify} messages.
     * @param message CreateArchiveResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ICreateArchiveResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified CreateArchiveResp message, length delimited. Does not implicitly {@link CreateArchiveResp.verify|verify} messages.
     * @param message CreateArchiveResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ICreateArchiveResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a CreateArchiveResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns CreateArchiveResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): CreateArchiveResp;

    /**
     * Decodes a CreateArchiveResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns CreateArchiveResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): CreateArchiveResp;

    /**
     * Verifies a CreateArchiveResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a CreateArchiveResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns CreateArchiveResp
     */
    public static fromObject(object: { [k: string]: any }): CreateArchiveResp;

    /**
     * Creates a plain object from a CreateArchiveResp message. Also converts values to other types if specified.
     * @param message CreateArchiveResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: CreateArchiveResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this CreateArchiveResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for CreateArchiveResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a RemoveArchiveReq. */
export class RemoveArchiveReq implements IRemoveArchiveReq {

    /**
     * Constructs a new RemoveArchiveReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IRemoveArchiveReq);

    /** RemoveArchiveReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** RemoveArchiveReq ArchiveInfo. */
    public ArchiveInfo: IArchiveInfo[];

    /**
     * Creates a new RemoveArchiveReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns RemoveArchiveReq instance
     */
    public static create(properties?: IRemoveArchiveReq): RemoveArchiveReq;

    /**
     * Encodes the specified RemoveArchiveReq message. Does not implicitly {@link RemoveArchiveReq.verify|verify} messages.
     * @param message RemoveArchiveReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IRemoveArchiveReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified RemoveArchiveReq message, length delimited. Does not implicitly {@link RemoveArchiveReq.verify|verify} messages.
     * @param message RemoveArchiveReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IRemoveArchiveReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a RemoveArchiveReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns RemoveArchiveReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): RemoveArchiveReq;

    /**
     * Decodes a RemoveArchiveReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns RemoveArchiveReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): RemoveArchiveReq;

    /**
     * Verifies a RemoveArchiveReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a RemoveArchiveReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns RemoveArchiveReq
     */
    public static fromObject(object: { [k: string]: any }): RemoveArchiveReq;

    /**
     * Creates a plain object from a RemoveArchiveReq message. Also converts values to other types if specified.
     * @param message RemoveArchiveReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: RemoveArchiveReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this RemoveArchiveReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for RemoveArchiveReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a RemoveArchiveResp. */
export class RemoveArchiveResp implements IRemoveArchiveResp {

    /**
     * Constructs a new RemoveArchiveResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IRemoveArchiveResp);

    /** RemoveArchiveResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new RemoveArchiveResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns RemoveArchiveResp instance
     */
    public static create(properties?: IRemoveArchiveResp): RemoveArchiveResp;

    /**
     * Encodes the specified RemoveArchiveResp message. Does not implicitly {@link RemoveArchiveResp.verify|verify} messages.
     * @param message RemoveArchiveResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IRemoveArchiveResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified RemoveArchiveResp message, length delimited. Does not implicitly {@link RemoveArchiveResp.verify|verify} messages.
     * @param message RemoveArchiveResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IRemoveArchiveResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a RemoveArchiveResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns RemoveArchiveResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): RemoveArchiveResp;

    /**
     * Decodes a RemoveArchiveResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns RemoveArchiveResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): RemoveArchiveResp;

    /**
     * Verifies a RemoveArchiveResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a RemoveArchiveResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns RemoveArchiveResp
     */
    public static fromObject(object: { [k: string]: any }): RemoveArchiveResp;

    /**
     * Creates a plain object from a RemoveArchiveResp message. Also converts values to other types if specified.
     * @param message RemoveArchiveResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: RemoveArchiveResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this RemoveArchiveResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for RemoveArchiveResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a QueryArchiveReq. */
export class QueryArchiveReq implements IQueryArchiveReq {

    /**
     * Constructs a new QueryArchiveReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IQueryArchiveReq);

    /** QueryArchiveReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /**
     * Creates a new QueryArchiveReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryArchiveReq instance
     */
    public static create(properties?: IQueryArchiveReq): QueryArchiveReq;

    /**
     * Encodes the specified QueryArchiveReq message. Does not implicitly {@link QueryArchiveReq.verify|verify} messages.
     * @param message QueryArchiveReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IQueryArchiveReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified QueryArchiveReq message, length delimited. Does not implicitly {@link QueryArchiveReq.verify|verify} messages.
     * @param message QueryArchiveReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IQueryArchiveReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a QueryArchiveReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryArchiveReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): QueryArchiveReq;

    /**
     * Decodes a QueryArchiveReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryArchiveReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): QueryArchiveReq;

    /**
     * Verifies a QueryArchiveReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a QueryArchiveReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryArchiveReq
     */
    public static fromObject(object: { [k: string]: any }): QueryArchiveReq;

    /**
     * Creates a plain object from a QueryArchiveReq message. Also converts values to other types if specified.
     * @param message QueryArchiveReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: QueryArchiveReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this QueryArchiveReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryArchiveReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a QueryArchiveResp. */
export class QueryArchiveResp implements IQueryArchiveResp {

    /**
     * Constructs a new QueryArchiveResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IQueryArchiveResp);

    /** QueryArchiveResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** QueryArchiveResp ArchiveInfo. */
    public ArchiveInfo: IArchiveInfo[];

    /**
     * Creates a new QueryArchiveResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QueryArchiveResp instance
     */
    public static create(properties?: IQueryArchiveResp): QueryArchiveResp;

    /**
     * Encodes the specified QueryArchiveResp message. Does not implicitly {@link QueryArchiveResp.verify|verify} messages.
     * @param message QueryArchiveResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IQueryArchiveResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified QueryArchiveResp message, length delimited. Does not implicitly {@link QueryArchiveResp.verify|verify} messages.
     * @param message QueryArchiveResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IQueryArchiveResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a QueryArchiveResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QueryArchiveResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): QueryArchiveResp;

    /**
     * Decodes a QueryArchiveResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QueryArchiveResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): QueryArchiveResp;

    /**
     * Verifies a QueryArchiveResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a QueryArchiveResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QueryArchiveResp
     */
    public static fromObject(object: { [k: string]: any }): QueryArchiveResp;

    /**
     * Creates a plain object from a QueryArchiveResp message. Also converts values to other types if specified.
     * @param message QueryArchiveResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: QueryArchiveResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this QueryArchiveResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QueryArchiveResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a FeedbackReq. */
export class FeedbackReq implements IFeedbackReq {

    /**
     * Constructs a new FeedbackReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IFeedbackReq);

    /** FeedbackReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** FeedbackReq type. */
    public type: FeedbackType;

    /** FeedbackReq msg. */
    public msg: string;

    /**
     * Creates a new FeedbackReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns FeedbackReq instance
     */
    public static create(properties?: IFeedbackReq): FeedbackReq;

    /**
     * Encodes the specified FeedbackReq message. Does not implicitly {@link FeedbackReq.verify|verify} messages.
     * @param message FeedbackReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IFeedbackReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified FeedbackReq message, length delimited. Does not implicitly {@link FeedbackReq.verify|verify} messages.
     * @param message FeedbackReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IFeedbackReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a FeedbackReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns FeedbackReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): FeedbackReq;

    /**
     * Decodes a FeedbackReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns FeedbackReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): FeedbackReq;

    /**
     * Verifies a FeedbackReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a FeedbackReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns FeedbackReq
     */
    public static fromObject(object: { [k: string]: any }): FeedbackReq;

    /**
     * Creates a plain object from a FeedbackReq message. Also converts values to other types if specified.
     * @param message FeedbackReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: FeedbackReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this FeedbackReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for FeedbackReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a FeedbackResp. */
export class FeedbackResp implements IFeedbackResp {

    /**
     * Constructs a new FeedbackResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IFeedbackResp);

    /** FeedbackResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new FeedbackResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns FeedbackResp instance
     */
    public static create(properties?: IFeedbackResp): FeedbackResp;

    /**
     * Encodes the specified FeedbackResp message. Does not implicitly {@link FeedbackResp.verify|verify} messages.
     * @param message FeedbackResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IFeedbackResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified FeedbackResp message, length delimited. Does not implicitly {@link FeedbackResp.verify|verify} messages.
     * @param message FeedbackResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IFeedbackResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a FeedbackResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns FeedbackResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): FeedbackResp;

    /**
     * Decodes a FeedbackResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns FeedbackResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): FeedbackResp;

    /**
     * Verifies a FeedbackResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a FeedbackResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns FeedbackResp
     */
    public static fromObject(object: { [k: string]: any }): FeedbackResp;

    /**
     * Creates a plain object from a FeedbackResp message. Also converts values to other types if specified.
     * @param message FeedbackResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: FeedbackResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this FeedbackResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for FeedbackResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GetUploadTokenReq. */
export class GetUploadTokenReq implements IGetUploadTokenReq {

    /**
     * Constructs a new GetUploadTokenReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGetUploadTokenReq);

    /** GetUploadTokenReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /**
     * Creates a new GetUploadTokenReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GetUploadTokenReq instance
     */
    public static create(properties?: IGetUploadTokenReq): GetUploadTokenReq;

    /**
     * Encodes the specified GetUploadTokenReq message. Does not implicitly {@link GetUploadTokenReq.verify|verify} messages.
     * @param message GetUploadTokenReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGetUploadTokenReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GetUploadTokenReq message, length delimited. Does not implicitly {@link GetUploadTokenReq.verify|verify} messages.
     * @param message GetUploadTokenReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGetUploadTokenReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GetUploadTokenReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GetUploadTokenReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GetUploadTokenReq;

    /**
     * Decodes a GetUploadTokenReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GetUploadTokenReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GetUploadTokenReq;

    /**
     * Verifies a GetUploadTokenReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GetUploadTokenReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GetUploadTokenReq
     */
    public static fromObject(object: { [k: string]: any }): GetUploadTokenReq;

    /**
     * Creates a plain object from a GetUploadTokenReq message. Also converts values to other types if specified.
     * @param message GetUploadTokenReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GetUploadTokenReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GetUploadTokenReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GetUploadTokenReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GetUploadTokenResp. */
export class GetUploadTokenResp implements IGetUploadTokenResp {

    /**
     * Constructs a new GetUploadTokenResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGetUploadTokenResp);

    /** GetUploadTokenResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GetUploadTokenResp securityToken. */
    public securityToken: string;

    /** GetUploadTokenResp accessKeyId. */
    public accessKeyId: string;

    /** GetUploadTokenResp accessKeySecret. */
    public accessKeySecret: string;

    /** GetUploadTokenResp expiration. */
    public expiration: (number|Long);

    /** GetUploadTokenResp ossEndpoint. */
    public ossEndpoint: string;

    /** GetUploadTokenResp ossBucket. */
    public ossBucket: string;

    /**
     * Creates a new GetUploadTokenResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GetUploadTokenResp instance
     */
    public static create(properties?: IGetUploadTokenResp): GetUploadTokenResp;

    /**
     * Encodes the specified GetUploadTokenResp message. Does not implicitly {@link GetUploadTokenResp.verify|verify} messages.
     * @param message GetUploadTokenResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGetUploadTokenResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GetUploadTokenResp message, length delimited. Does not implicitly {@link GetUploadTokenResp.verify|verify} messages.
     * @param message GetUploadTokenResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGetUploadTokenResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GetUploadTokenResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GetUploadTokenResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GetUploadTokenResp;

    /**
     * Decodes a GetUploadTokenResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GetUploadTokenResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GetUploadTokenResp;

    /**
     * Verifies a GetUploadTokenResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GetUploadTokenResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GetUploadTokenResp
     */
    public static fromObject(object: { [k: string]: any }): GetUploadTokenResp;

    /**
     * Creates a plain object from a GetUploadTokenResp message. Also converts values to other types if specified.
     * @param message GetUploadTokenResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GetUploadTokenResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GetUploadTokenResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GetUploadTokenResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GetUploadUrlReq. */
export class GetUploadUrlReq implements IGetUploadUrlReq {

    /**
     * Constructs a new GetUploadUrlReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGetUploadUrlReq);

    /** GetUploadUrlReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GetUploadUrlReq attachWorkspaceType. */
    public attachWorkspaceType: AttachWorkSpaceType;

    /** GetUploadUrlReq attachType. */
    public attachType: AttachType;

    /** GetUploadUrlReq suffix. */
    public suffix: string;

    /**
     * Creates a new GetUploadUrlReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GetUploadUrlReq instance
     */
    public static create(properties?: IGetUploadUrlReq): GetUploadUrlReq;

    /**
     * Encodes the specified GetUploadUrlReq message. Does not implicitly {@link GetUploadUrlReq.verify|verify} messages.
     * @param message GetUploadUrlReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGetUploadUrlReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GetUploadUrlReq message, length delimited. Does not implicitly {@link GetUploadUrlReq.verify|verify} messages.
     * @param message GetUploadUrlReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGetUploadUrlReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GetUploadUrlReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GetUploadUrlReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GetUploadUrlReq;

    /**
     * Decodes a GetUploadUrlReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GetUploadUrlReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GetUploadUrlReq;

    /**
     * Verifies a GetUploadUrlReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GetUploadUrlReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GetUploadUrlReq
     */
    public static fromObject(object: { [k: string]: any }): GetUploadUrlReq;

    /**
     * Creates a plain object from a GetUploadUrlReq message. Also converts values to other types if specified.
     * @param message GetUploadUrlReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GetUploadUrlReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GetUploadUrlReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GetUploadUrlReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GetUploadUrlResp. */
export class GetUploadUrlResp implements IGetUploadUrlResp {

    /**
     * Constructs a new GetUploadUrlResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGetUploadUrlResp);

    /** GetUploadUrlResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GetUploadUrlResp fileId. */
    public fileId: string;

    /** GetUploadUrlResp url. */
    public url: string;

    /**
     * Creates a new GetUploadUrlResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GetUploadUrlResp instance
     */
    public static create(properties?: IGetUploadUrlResp): GetUploadUrlResp;

    /**
     * Encodes the specified GetUploadUrlResp message. Does not implicitly {@link GetUploadUrlResp.verify|verify} messages.
     * @param message GetUploadUrlResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGetUploadUrlResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GetUploadUrlResp message, length delimited. Does not implicitly {@link GetUploadUrlResp.verify|verify} messages.
     * @param message GetUploadUrlResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGetUploadUrlResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GetUploadUrlResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GetUploadUrlResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GetUploadUrlResp;

    /**
     * Decodes a GetUploadUrlResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GetUploadUrlResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GetUploadUrlResp;

    /**
     * Verifies a GetUploadUrlResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GetUploadUrlResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GetUploadUrlResp
     */
    public static fromObject(object: { [k: string]: any }): GetUploadUrlResp;

    /**
     * Creates a plain object from a GetUploadUrlResp message. Also converts values to other types if specified.
     * @param message GetUploadUrlResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GetUploadUrlResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GetUploadUrlResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GetUploadUrlResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an UrlInfo. */
export class UrlInfo implements IUrlInfo {

    /**
     * Constructs a new UrlInfo.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUrlInfo);

    /** UrlInfo biz. */
    public biz: string;

    /** UrlInfo session. */
    public session: string;

    /**
     * Creates a new UrlInfo instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UrlInfo instance
     */
    public static create(properties?: IUrlInfo): UrlInfo;

    /**
     * Encodes the specified UrlInfo message. Does not implicitly {@link UrlInfo.verify|verify} messages.
     * @param message UrlInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUrlInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UrlInfo message, length delimited. Does not implicitly {@link UrlInfo.verify|verify} messages.
     * @param message UrlInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUrlInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an UrlInfo message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UrlInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UrlInfo;

    /**
     * Decodes an UrlInfo message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UrlInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UrlInfo;

    /**
     * Verifies an UrlInfo message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an UrlInfo message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UrlInfo
     */
    public static fromObject(object: { [k: string]: any }): UrlInfo;

    /**
     * Creates a plain object from an UrlInfo message. Also converts values to other types if specified.
     * @param message UrlInfo
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UrlInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UrlInfo to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UrlInfo
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a QrCodeUrlReq. */
export class QrCodeUrlReq implements IQrCodeUrlReq {

    /**
     * Constructs a new QrCodeUrlReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IQrCodeUrlReq);

    /** QrCodeUrlReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /**
     * Creates a new QrCodeUrlReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QrCodeUrlReq instance
     */
    public static create(properties?: IQrCodeUrlReq): QrCodeUrlReq;

    /**
     * Encodes the specified QrCodeUrlReq message. Does not implicitly {@link QrCodeUrlReq.verify|verify} messages.
     * @param message QrCodeUrlReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IQrCodeUrlReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified QrCodeUrlReq message, length delimited. Does not implicitly {@link QrCodeUrlReq.verify|verify} messages.
     * @param message QrCodeUrlReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IQrCodeUrlReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a QrCodeUrlReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QrCodeUrlReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): QrCodeUrlReq;

    /**
     * Decodes a QrCodeUrlReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QrCodeUrlReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): QrCodeUrlReq;

    /**
     * Verifies a QrCodeUrlReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a QrCodeUrlReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QrCodeUrlReq
     */
    public static fromObject(object: { [k: string]: any }): QrCodeUrlReq;

    /**
     * Creates a plain object from a QrCodeUrlReq message. Also converts values to other types if specified.
     * @param message QrCodeUrlReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: QrCodeUrlReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this QrCodeUrlReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QrCodeUrlReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a QrCodeUrlResp. */
export class QrCodeUrlResp implements IQrCodeUrlResp {

    /**
     * Constructs a new QrCodeUrlResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IQrCodeUrlResp);

    /** QrCodeUrlResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** QrCodeUrlResp url. */
    public url: string;

    /** QrCodeUrlResp createTime. */
    public createTime: (number|Long);

    /** QrCodeUrlResp token. */
    public token: string;

    /** QrCodeUrlResp officialUrl. */
    public officialUrl: string;

    /**
     * Creates a new QrCodeUrlResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QrCodeUrlResp instance
     */
    public static create(properties?: IQrCodeUrlResp): QrCodeUrlResp;

    /**
     * Encodes the specified QrCodeUrlResp message. Does not implicitly {@link QrCodeUrlResp.verify|verify} messages.
     * @param message QrCodeUrlResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IQrCodeUrlResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified QrCodeUrlResp message, length delimited. Does not implicitly {@link QrCodeUrlResp.verify|verify} messages.
     * @param message QrCodeUrlResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IQrCodeUrlResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a QrCodeUrlResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QrCodeUrlResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): QrCodeUrlResp;

    /**
     * Decodes a QrCodeUrlResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QrCodeUrlResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): QrCodeUrlResp;

    /**
     * Verifies a QrCodeUrlResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a QrCodeUrlResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QrCodeUrlResp
     */
    public static fromObject(object: { [k: string]: any }): QrCodeUrlResp;

    /**
     * Creates a plain object from a QrCodeUrlResp message. Also converts values to other types if specified.
     * @param message QrCodeUrlResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: QrCodeUrlResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this QrCodeUrlResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for QrCodeUrlResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an IsLoginReq. */
export class IsLoginReq implements IIsLoginReq {

    /**
     * Constructs a new IsLoginReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IIsLoginReq);

    /** IsLoginReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** IsLoginReq token. */
    public token: string;

    /** IsLoginReq sysModel. */
    public sysModel: string;

    /** IsLoginReq sysMac. */
    public sysMac: string;

    /** IsLoginReq sysVersion. */
    public sysVersion: string;

    /**
     * Creates a new IsLoginReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns IsLoginReq instance
     */
    public static create(properties?: IIsLoginReq): IsLoginReq;

    /**
     * Encodes the specified IsLoginReq message. Does not implicitly {@link IsLoginReq.verify|verify} messages.
     * @param message IsLoginReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IIsLoginReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified IsLoginReq message, length delimited. Does not implicitly {@link IsLoginReq.verify|verify} messages.
     * @param message IsLoginReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IIsLoginReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an IsLoginReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns IsLoginReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): IsLoginReq;

    /**
     * Decodes an IsLoginReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns IsLoginReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): IsLoginReq;

    /**
     * Verifies an IsLoginReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an IsLoginReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns IsLoginReq
     */
    public static fromObject(object: { [k: string]: any }): IsLoginReq;

    /**
     * Creates a plain object from an IsLoginReq message. Also converts values to other types if specified.
     * @param message IsLoginReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: IsLoginReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this IsLoginReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for IsLoginReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an IsLoginResp. */
export class IsLoginResp implements IIsLoginResp {

    /**
     * Constructs a new IsLoginResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IIsLoginResp);

    /** IsLoginResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** IsLoginResp nickName. */
    public nickName: string;

    /** IsLoginResp icon. */
    public icon: string;

    /** IsLoginResp loginStatus. */
    public loginStatus: WebLoginStatus;

    /** IsLoginResp scanTime. */
    public scanTime: (number|Long);

    /** IsLoginResp sessionId. */
    public sessionId: string;

    /** IsLoginResp uid. */
    public uid: (number|Long);

    /** IsLoginResp systemTime. */
    public systemTime: (number|Long);

    /** IsLoginResp urls. */
    public urls?: (IUrlInfo|null);

    /** IsLoginResp uploadFileSize. */
    public uploadFileSize: (number|Long);

    /**
     * Creates a new IsLoginResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns IsLoginResp instance
     */
    public static create(properties?: IIsLoginResp): IsLoginResp;

    /**
     * Encodes the specified IsLoginResp message. Does not implicitly {@link IsLoginResp.verify|verify} messages.
     * @param message IsLoginResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IIsLoginResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified IsLoginResp message, length delimited. Does not implicitly {@link IsLoginResp.verify|verify} messages.
     * @param message IsLoginResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IIsLoginResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an IsLoginResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns IsLoginResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): IsLoginResp;

    /**
     * Decodes an IsLoginResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns IsLoginResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): IsLoginResp;

    /**
     * Verifies an IsLoginResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an IsLoginResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns IsLoginResp
     */
    public static fromObject(object: { [k: string]: any }): IsLoginResp;

    /**
     * Creates a plain object from an IsLoginResp message. Also converts values to other types if specified.
     * @param message IsLoginResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: IsLoginResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this IsLoginResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for IsLoginResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a LogoutReq. */
export class LogoutReq implements ILogoutReq {

    /**
     * Constructs a new LogoutReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: ILogoutReq);

    /** LogoutReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /**
     * Creates a new LogoutReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns LogoutReq instance
     */
    public static create(properties?: ILogoutReq): LogoutReq;

    /**
     * Encodes the specified LogoutReq message. Does not implicitly {@link LogoutReq.verify|verify} messages.
     * @param message LogoutReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ILogoutReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified LogoutReq message, length delimited. Does not implicitly {@link LogoutReq.verify|verify} messages.
     * @param message LogoutReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ILogoutReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a LogoutReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns LogoutReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): LogoutReq;

    /**
     * Decodes a LogoutReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns LogoutReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): LogoutReq;

    /**
     * Verifies a LogoutReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a LogoutReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns LogoutReq
     */
    public static fromObject(object: { [k: string]: any }): LogoutReq;

    /**
     * Creates a plain object from a LogoutReq message. Also converts values to other types if specified.
     * @param message LogoutReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: LogoutReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this LogoutReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for LogoutReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a LogoutResp. */
export class LogoutResp implements ILogoutResp {

    /**
     * Constructs a new LogoutResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: ILogoutResp);

    /** LogoutResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new LogoutResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns LogoutResp instance
     */
    public static create(properties?: ILogoutResp): LogoutResp;

    /**
     * Encodes the specified LogoutResp message. Does not implicitly {@link LogoutResp.verify|verify} messages.
     * @param message LogoutResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ILogoutResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified LogoutResp message, length delimited. Does not implicitly {@link LogoutResp.verify|verify} messages.
     * @param message LogoutResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ILogoutResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a LogoutResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns LogoutResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): LogoutResp;

    /**
     * Decodes a LogoutResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns LogoutResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): LogoutResp;

    /**
     * Verifies a LogoutResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a LogoutResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns LogoutResp
     */
    public static fromObject(object: { [k: string]: any }): LogoutResp;

    /**
     * Creates a plain object from a LogoutResp message. Also converts values to other types if specified.
     * @param message LogoutResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: LogoutResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this LogoutResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for LogoutResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** UserOperator enum. */
export enum UserOperator {
    IGNORE = 0,
    ALL = 1,
    NICK_NAME = 2,
    ICON = 3,
    PRIVACY = 4,
    GENDER = 5,
    SIGNATURE = 6,
    VIEW_ONLINE_TIME = 7,
    ADD_INVISIBLE = 8,
    DEL_INVISIBLE = 9,
    SET_LANG = 10
}

/** Represents a UserParam. */
export class UserParam implements IUserParam {

    /**
     * Constructs a new UserParam.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUserParam);

    /** UserParam nickName. */
    public nickName: string;

    /** UserParam icon. */
    public icon: string;

    /** UserParam privacy. */
    public privacy: number;

    /** UserParam gender. */
    public gender: Gender;

    /** UserParam signature. */
    public signature: string;

    /** UserParam viewType. */
    public viewType: LastOnlineTimeViewType;

    /** UserParam language. */
    public language: number;

    /**
     * Creates a new UserParam instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UserParam instance
     */
    public static create(properties?: IUserParam): UserParam;

    /**
     * Encodes the specified UserParam message. Does not implicitly {@link UserParam.verify|verify} messages.
     * @param message UserParam message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUserParam, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UserParam message, length delimited. Does not implicitly {@link UserParam.verify|verify} messages.
     * @param message UserParam message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUserParam, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a UserParam message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UserParam
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UserParam;

    /**
     * Decodes a UserParam message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UserParam
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UserParam;

    /**
     * Verifies a UserParam message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a UserParam message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UserParam
     */
    public static fromObject(object: { [k: string]: any }): UserParam;

    /**
     * Creates a plain object from a UserParam message. Also converts values to other types if specified.
     * @param message UserParam
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UserParam, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UserParam to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UserParam
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a UserInfoReq. */
export class UserInfoReq implements IUserInfoReq {

    /**
     * Constructs a new UserInfoReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUserInfoReq);

    /** UserInfoReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** UserInfoReq uid. */
    public uid: (number|Long);

    /**
     * Creates a new UserInfoReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UserInfoReq instance
     */
    public static create(properties?: IUserInfoReq): UserInfoReq;

    /**
     * Encodes the specified UserInfoReq message. Does not implicitly {@link UserInfoReq.verify|verify} messages.
     * @param message UserInfoReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUserInfoReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UserInfoReq message, length delimited. Does not implicitly {@link UserInfoReq.verify|verify} messages.
     * @param message UserInfoReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUserInfoReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a UserInfoReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UserInfoReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UserInfoReq;

    /**
     * Decodes a UserInfoReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UserInfoReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UserInfoReq;

    /**
     * Verifies a UserInfoReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a UserInfoReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UserInfoReq
     */
    public static fromObject(object: { [k: string]: any }): UserInfoReq;

    /**
     * Creates a plain object from a UserInfoReq message. Also converts values to other types if specified.
     * @param message UserInfoReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UserInfoReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UserInfoReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UserInfoReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a UserInfoResp. */
export class UserInfoResp implements IUserInfoResp {

    /**
     * Constructs a new UserInfoResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUserInfoResp);

    /** UserInfoResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** UserInfoResp userInfo. */
    public userInfo?: (IUserBase|null);

    /** UserInfoResp bfPassword. */
    public bfPassword: boolean;

    /** UserInfoResp privacy. */
    public privacy: number;

    /** UserInfoResp signature. */
    public signature: string;

    /** UserInfoResp viewType. */
    public viewType: number;

    /** UserInfoResp phone. */
    public phone: string;

    /** UserInfoResp translationInfo. */
    public translationInfo?: (ITranslationInfo|null);

    /**
     * Creates a new UserInfoResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UserInfoResp instance
     */
    public static create(properties?: IUserInfoResp): UserInfoResp;

    /**
     * Encodes the specified UserInfoResp message. Does not implicitly {@link UserInfoResp.verify|verify} messages.
     * @param message UserInfoResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUserInfoResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UserInfoResp message, length delimited. Does not implicitly {@link UserInfoResp.verify|verify} messages.
     * @param message UserInfoResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUserInfoResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a UserInfoResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UserInfoResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UserInfoResp;

    /**
     * Decodes a UserInfoResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UserInfoResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UserInfoResp;

    /**
     * Verifies a UserInfoResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a UserInfoResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UserInfoResp
     */
    public static fromObject(object: { [k: string]: any }): UserInfoResp;

    /**
     * Creates a plain object from a UserInfoResp message. Also converts values to other types if specified.
     * @param message UserInfoResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UserInfoResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UserInfoResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UserInfoResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an UpdateReq. */
export class UpdateReq implements IUpdateReq {

    /**
     * Constructs a new UpdateReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUpdateReq);

    /** UpdateReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** UpdateReq ops. */
    public ops: UserOperator[];

    /** UpdateReq userParam. */
    public userParam?: (IUserParam|null);

    /**
     * Creates a new UpdateReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UpdateReq instance
     */
    public static create(properties?: IUpdateReq): UpdateReq;

    /**
     * Encodes the specified UpdateReq message. Does not implicitly {@link UpdateReq.verify|verify} messages.
     * @param message UpdateReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUpdateReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UpdateReq message, length delimited. Does not implicitly {@link UpdateReq.verify|verify} messages.
     * @param message UpdateReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUpdateReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an UpdateReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UpdateReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UpdateReq;

    /**
     * Decodes an UpdateReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UpdateReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UpdateReq;

    /**
     * Verifies an UpdateReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an UpdateReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UpdateReq
     */
    public static fromObject(object: { [k: string]: any }): UpdateReq;

    /**
     * Creates a plain object from an UpdateReq message. Also converts values to other types if specified.
     * @param message UpdateReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UpdateReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UpdateReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UpdateReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an UpdateResp. */
export class UpdateResp implements IUpdateResp {

    /**
     * Constructs a new UpdateResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUpdateResp);

    /** UpdateResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new UpdateResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UpdateResp instance
     */
    public static create(properties?: IUpdateResp): UpdateResp;

    /**
     * Encodes the specified UpdateResp message. Does not implicitly {@link UpdateResp.verify|verify} messages.
     * @param message UpdateResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUpdateResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UpdateResp message, length delimited. Does not implicitly {@link UpdateResp.verify|verify} messages.
     * @param message UpdateResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUpdateResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an UpdateResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UpdateResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UpdateResp;

    /**
     * Decodes an UpdateResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UpdateResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UpdateResp;

    /**
     * Verifies an UpdateResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an UpdateResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UpdateResp
     */
    public static fromObject(object: { [k: string]: any }): UpdateResp;

    /**
     * Creates a plain object from an UpdateResp message. Also converts values to other types if specified.
     * @param message UpdateResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UpdateResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UpdateResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UpdateResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** ContactsOperator enum. */
export enum ContactsOperator {
    ADD = 0,
    DEL = 1,
    STAR = 2,
    CONTACTS_DISTURB = 3,
    REMARK = 4,
    DESCRIBE = 5,
    ADD_BLACK = 6,
    DEL_BLACK = 7,
    ADD_REQ = 8,
    DEL_REQ = 9,
    CONTACTS_TOP = 10,
    READ_CANCEL = 11,
    SCREENSHOT = 12,
    READ_CANCEL_TIME = 13
}

/** ContactsAddType enum. */
export enum ContactsAddType {
    PHONE = 0,
    CODE = 1,
    CROWD = 2,
    CARD = 3,
    REQ_MSG = 4,
    LINK = 5,
    IDENTIFY = 6
}

/** ComplaintType enum. */
export enum ComplaintType {
    BAD_MSG = 0,
    HARASS = 1,
    VIOLATION = 2
}

/** Represents a ContactsDetail. */
export class ContactsDetail implements IContactsDetail {

    /**
     * Constructs a new ContactsDetail.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsDetail);

    /** ContactsDetail userBase. */
    public userBase?: (IUserBase|null);

    /** ContactsDetail depict. */
    public depict: string;

    /** ContactsDetail signature. */
    public signature: string;

    /** ContactsDetail groupNickName. */
    public groupNickName: string;

    /**
     * Creates a new ContactsDetail instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsDetail instance
     */
    public static create(properties?: IContactsDetail): ContactsDetail;

    /**
     * Encodes the specified ContactsDetail message. Does not implicitly {@link ContactsDetail.verify|verify} messages.
     * @param message ContactsDetail message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsDetail, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsDetail message, length delimited. Does not implicitly {@link ContactsDetail.verify|verify} messages.
     * @param message ContactsDetail message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsDetail, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsDetail message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsDetail
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsDetail;

    /**
     * Decodes a ContactsDetail message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsDetail
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsDetail;

    /**
     * Verifies a ContactsDetail message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsDetail message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsDetail
     */
    public static fromObject(object: { [k: string]: any }): ContactsDetail;

    /**
     * Creates a plain object from a ContactsDetail message. Also converts values to other types if specified.
     * @param message ContactsDetail
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsDetail, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsDetail to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsDetail
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ContactsParam. */
export class ContactsParam implements IContactsParam {

    /**
     * Constructs a new ContactsParam.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsParam);

    /** ContactsParam contactsId. */
    public contactsId: (number|Long);

    /** ContactsParam noteName. */
    public noteName: string;

    /** ContactsParam depict. */
    public depict: string;

    /** ContactsParam bfStar. */
    public bfStar: boolean;

    /** ContactsParam bfDisturb. */
    public bfDisturb: boolean;

    /** ContactsParam bfTop. */
    public bfTop: boolean;

    /** ContactsParam bfReadCancel. */
    public bfReadCancel: boolean;

    /** ContactsParam msgCancelTime. */
    public msgCancelTime: number;

    /** ContactsParam bfScreenshot. */
    public bfScreenshot: boolean;

    /**
     * Creates a new ContactsParam instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsParam instance
     */
    public static create(properties?: IContactsParam): ContactsParam;

    /**
     * Encodes the specified ContactsParam message. Does not implicitly {@link ContactsParam.verify|verify} messages.
     * @param message ContactsParam message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsParam, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsParam message, length delimited. Does not implicitly {@link ContactsParam.verify|verify} messages.
     * @param message ContactsParam message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsParam, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsParam message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsParam
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsParam;

    /**
     * Decodes a ContactsParam message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsParam
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsParam;

    /**
     * Verifies a ContactsParam message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsParam message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsParam
     */
    public static fromObject(object: { [k: string]: any }): ContactsParam;

    /**
     * Creates a plain object from a ContactsParam message. Also converts values to other types if specified.
     * @param message ContactsParam
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsParam, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsParam to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsParam
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ContactsRecordBase. */
export class ContactsRecordBase implements IContactsRecordBase {

    /**
     * Constructs a new ContactsRecordBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsRecordBase);

    /** ContactsRecordBase userInfo. */
    public userInfo?: (IUserBase|null);

    /** ContactsRecordBase msg. */
    public msg: string;

    /** ContactsRecordBase bfMyBlack. */
    public bfMyBlack: boolean;

    /** ContactsRecordBase modifyTime. */
    public modifyTime: (number|Long);

    /** ContactsRecordBase type. */
    public type: ContactsAddType;

    /** ContactsRecordBase signature. */
    public signature: string;

    /** ContactsRecordBase groupName. */
    public groupName: string;

    /** ContactsRecordBase bfIdSearch. */
    public bfIdSearch: boolean;

    /** ContactsRecordBase channelName. */
    public channelName: string;

    /**
     * Creates a new ContactsRecordBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsRecordBase instance
     */
    public static create(properties?: IContactsRecordBase): ContactsRecordBase;

    /**
     * Encodes the specified ContactsRecordBase message. Does not implicitly {@link ContactsRecordBase.verify|verify} messages.
     * @param message ContactsRecordBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsRecordBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsRecordBase message, length delimited. Does not implicitly {@link ContactsRecordBase.verify|verify} messages.
     * @param message ContactsRecordBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsRecordBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsRecordBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsRecordBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsRecordBase;

    /**
     * Decodes a ContactsRecordBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsRecordBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsRecordBase;

    /**
     * Verifies a ContactsRecordBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsRecordBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsRecordBase
     */
    public static fromObject(object: { [k: string]: any }): ContactsRecordBase;

    /**
     * Creates a plain object from a ContactsRecordBase message. Also converts values to other types if specified.
     * @param message ContactsRecordBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsRecordBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsRecordBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsRecordBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ContactsListReq. */
export class ContactsListReq implements IContactsListReq {

    /**
     * Constructs a new ContactsListReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsListReq);

    /** ContactsListReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** ContactsListReq pageNum. */
    public pageNum: number;

    /** ContactsListReq pageSize. */
    public pageSize: number;

    /** ContactsListReq time. */
    public time: (number|Long);

    /**
     * Creates a new ContactsListReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsListReq instance
     */
    public static create(properties?: IContactsListReq): ContactsListReq;

    /**
     * Encodes the specified ContactsListReq message. Does not implicitly {@link ContactsListReq.verify|verify} messages.
     * @param message ContactsListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsListReq message, length delimited. Does not implicitly {@link ContactsListReq.verify|verify} messages.
     * @param message ContactsListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsListReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsListReq;

    /**
     * Decodes a ContactsListReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsListReq;

    /**
     * Verifies a ContactsListReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsListReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsListReq
     */
    public static fromObject(object: { [k: string]: any }): ContactsListReq;

    /**
     * Creates a plain object from a ContactsListReq message. Also converts values to other types if specified.
     * @param message ContactsListReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsListReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsListReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsListReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ContactsListResp. */
export class ContactsListResp implements IContactsListResp {

    /**
     * Constructs a new ContactsListResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsListResp);

    /** ContactsListResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** ContactsListResp contactsList. */
    public contactsList: IContactsDetailBase[];

    /** ContactsListResp contactsStarList. */
    public contactsStarList: IContactsDetailBase[];

    /** ContactsListResp count. */
    public count: number;

    /** ContactsListResp pageNum. */
    public pageNum: number;

    /** ContactsListResp lastUpdateTime. */
    public lastUpdateTime: (number|Long);

    /**
     * Creates a new ContactsListResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsListResp instance
     */
    public static create(properties?: IContactsListResp): ContactsListResp;

    /**
     * Encodes the specified ContactsListResp message. Does not implicitly {@link ContactsListResp.verify|verify} messages.
     * @param message ContactsListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsListResp message, length delimited. Does not implicitly {@link ContactsListResp.verify|verify} messages.
     * @param message ContactsListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsListResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsListResp;

    /**
     * Decodes a ContactsListResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsListResp;

    /**
     * Verifies a ContactsListResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsListResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsListResp
     */
    public static fromObject(object: { [k: string]: any }): ContactsListResp;

    /**
     * Creates a plain object from a ContactsListResp message. Also converts values to other types if specified.
     * @param message ContactsListResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsListResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsListResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsListResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ContactsDetailReq. */
export class ContactsDetailReq implements IContactsDetailReq {

    /**
     * Constructs a new ContactsDetailReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsDetailReq);

    /** ContactsDetailReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** ContactsDetailReq targetUid. */
    public targetUid: (number|Long);

    /** ContactsDetailReq groupId. */
    public groupId: (number|Long);

    /** ContactsDetailReq channelId. */
    public channelId: (number|Long);

    /**
     * Creates a new ContactsDetailReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsDetailReq instance
     */
    public static create(properties?: IContactsDetailReq): ContactsDetailReq;

    /**
     * Encodes the specified ContactsDetailReq message. Does not implicitly {@link ContactsDetailReq.verify|verify} messages.
     * @param message ContactsDetailReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsDetailReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsDetailReq message, length delimited. Does not implicitly {@link ContactsDetailReq.verify|verify} messages.
     * @param message ContactsDetailReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsDetailReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsDetailReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsDetailReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsDetailReq;

    /**
     * Decodes a ContactsDetailReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsDetailReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsDetailReq;

    /**
     * Verifies a ContactsDetailReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsDetailReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsDetailReq
     */
    public static fromObject(object: { [k: string]: any }): ContactsDetailReq;

    /**
     * Creates a plain object from a ContactsDetailReq message. Also converts values to other types if specified.
     * @param message ContactsDetailReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsDetailReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsDetailReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsDetailReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ContactsDetailResp. */
export class ContactsDetailResp implements IContactsDetailResp {

    /**
     * Constructs a new ContactsDetailResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsDetailResp);

    /** ContactsDetailResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** ContactsDetailResp contactsDetailBase. */
    public contactsDetailBase?: (IContactsDetailBase|null);

    /**
     * Creates a new ContactsDetailResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsDetailResp instance
     */
    public static create(properties?: IContactsDetailResp): ContactsDetailResp;

    /**
     * Encodes the specified ContactsDetailResp message. Does not implicitly {@link ContactsDetailResp.verify|verify} messages.
     * @param message ContactsDetailResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsDetailResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsDetailResp message, length delimited. Does not implicitly {@link ContactsDetailResp.verify|verify} messages.
     * @param message ContactsDetailResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsDetailResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsDetailResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsDetailResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsDetailResp;

    /**
     * Decodes a ContactsDetailResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsDetailResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsDetailResp;

    /**
     * Verifies a ContactsDetailResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsDetailResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsDetailResp
     */
    public static fromObject(object: { [k: string]: any }): ContactsDetailResp;

    /**
     * Creates a plain object from a ContactsDetailResp message. Also converts values to other types if specified.
     * @param message ContactsDetailResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsDetailResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsDetailResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsDetailResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an UpdateContactsApplyReq. */
export class UpdateContactsApplyReq implements IUpdateContactsApplyReq {

    /**
     * Constructs a new UpdateContactsApplyReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUpdateContactsApplyReq);

    /** UpdateContactsApplyReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** UpdateContactsApplyReq applyUid. */
    public applyUid: (number|Long);

    /** UpdateContactsApplyReq op. */
    public op: ContactsOperator;

    /**
     * Creates a new UpdateContactsApplyReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UpdateContactsApplyReq instance
     */
    public static create(properties?: IUpdateContactsApplyReq): UpdateContactsApplyReq;

    /**
     * Encodes the specified UpdateContactsApplyReq message. Does not implicitly {@link UpdateContactsApplyReq.verify|verify} messages.
     * @param message UpdateContactsApplyReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUpdateContactsApplyReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UpdateContactsApplyReq message, length delimited. Does not implicitly {@link UpdateContactsApplyReq.verify|verify} messages.
     * @param message UpdateContactsApplyReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUpdateContactsApplyReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an UpdateContactsApplyReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UpdateContactsApplyReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UpdateContactsApplyReq;

    /**
     * Decodes an UpdateContactsApplyReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UpdateContactsApplyReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UpdateContactsApplyReq;

    /**
     * Verifies an UpdateContactsApplyReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an UpdateContactsApplyReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UpdateContactsApplyReq
     */
    public static fromObject(object: { [k: string]: any }): UpdateContactsApplyReq;

    /**
     * Creates a plain object from an UpdateContactsApplyReq message. Also converts values to other types if specified.
     * @param message UpdateContactsApplyReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UpdateContactsApplyReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UpdateContactsApplyReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UpdateContactsApplyReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an UpdateContactsApplyResp. */
export class UpdateContactsApplyResp implements IUpdateContactsApplyResp {

    /**
     * Constructs a new UpdateContactsApplyResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUpdateContactsApplyResp);

    /** UpdateContactsApplyResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new UpdateContactsApplyResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UpdateContactsApplyResp instance
     */
    public static create(properties?: IUpdateContactsApplyResp): UpdateContactsApplyResp;

    /**
     * Encodes the specified UpdateContactsApplyResp message. Does not implicitly {@link UpdateContactsApplyResp.verify|verify} messages.
     * @param message UpdateContactsApplyResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUpdateContactsApplyResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UpdateContactsApplyResp message, length delimited. Does not implicitly {@link UpdateContactsApplyResp.verify|verify} messages.
     * @param message UpdateContactsApplyResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUpdateContactsApplyResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an UpdateContactsApplyResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UpdateContactsApplyResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UpdateContactsApplyResp;

    /**
     * Decodes an UpdateContactsApplyResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UpdateContactsApplyResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UpdateContactsApplyResp;

    /**
     * Verifies an UpdateContactsApplyResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an UpdateContactsApplyResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UpdateContactsApplyResp
     */
    public static fromObject(object: { [k: string]: any }): UpdateContactsApplyResp;

    /**
     * Creates a plain object from an UpdateContactsApplyResp message. Also converts values to other types if specified.
     * @param message UpdateContactsApplyResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UpdateContactsApplyResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UpdateContactsApplyResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UpdateContactsApplyResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an UpdateContactsReq. */
export class UpdateContactsReq implements IUpdateContactsReq {

    /**
     * Constructs a new UpdateContactsReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUpdateContactsReq);

    /** UpdateContactsReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** UpdateContactsReq op. */
    public op: ContactsOperator;

    /** UpdateContactsReq param. */
    public param?: (IContactsParam|null);

    /**
     * Creates a new UpdateContactsReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UpdateContactsReq instance
     */
    public static create(properties?: IUpdateContactsReq): UpdateContactsReq;

    /**
     * Encodes the specified UpdateContactsReq message. Does not implicitly {@link UpdateContactsReq.verify|verify} messages.
     * @param message UpdateContactsReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUpdateContactsReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UpdateContactsReq message, length delimited. Does not implicitly {@link UpdateContactsReq.verify|verify} messages.
     * @param message UpdateContactsReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUpdateContactsReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an UpdateContactsReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UpdateContactsReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UpdateContactsReq;

    /**
     * Decodes an UpdateContactsReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UpdateContactsReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UpdateContactsReq;

    /**
     * Verifies an UpdateContactsReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an UpdateContactsReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UpdateContactsReq
     */
    public static fromObject(object: { [k: string]: any }): UpdateContactsReq;

    /**
     * Creates a plain object from an UpdateContactsReq message. Also converts values to other types if specified.
     * @param message UpdateContactsReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UpdateContactsReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UpdateContactsReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UpdateContactsReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an UpdateContactsResp. */
export class UpdateContactsResp implements IUpdateContactsResp {

    /**
     * Constructs a new UpdateContactsResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUpdateContactsResp);

    /** UpdateContactsResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new UpdateContactsResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UpdateContactsResp instance
     */
    public static create(properties?: IUpdateContactsResp): UpdateContactsResp;

    /**
     * Encodes the specified UpdateContactsResp message. Does not implicitly {@link UpdateContactsResp.verify|verify} messages.
     * @param message UpdateContactsResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUpdateContactsResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UpdateContactsResp message, length delimited. Does not implicitly {@link UpdateContactsResp.verify|verify} messages.
     * @param message UpdateContactsResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUpdateContactsResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an UpdateContactsResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UpdateContactsResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UpdateContactsResp;

    /**
     * Decodes an UpdateContactsResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UpdateContactsResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UpdateContactsResp;

    /**
     * Verifies an UpdateContactsResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an UpdateContactsResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UpdateContactsResp
     */
    public static fromObject(object: { [k: string]: any }): UpdateContactsResp;

    /**
     * Creates a plain object from an UpdateContactsResp message. Also converts values to other types if specified.
     * @param message UpdateContactsResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UpdateContactsResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UpdateContactsResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UpdateContactsResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ContactsApplyListReq. */
export class ContactsApplyListReq implements IContactsApplyListReq {

    /**
     * Constructs a new ContactsApplyListReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsApplyListReq);

    /** ContactsApplyListReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** ContactsApplyListReq version. */
    public version: number;

    /**
     * Creates a new ContactsApplyListReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsApplyListReq instance
     */
    public static create(properties?: IContactsApplyListReq): ContactsApplyListReq;

    /**
     * Encodes the specified ContactsApplyListReq message. Does not implicitly {@link ContactsApplyListReq.verify|verify} messages.
     * @param message ContactsApplyListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsApplyListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsApplyListReq message, length delimited. Does not implicitly {@link ContactsApplyListReq.verify|verify} messages.
     * @param message ContactsApplyListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsApplyListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsApplyListReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsApplyListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsApplyListReq;

    /**
     * Decodes a ContactsApplyListReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsApplyListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsApplyListReq;

    /**
     * Verifies a ContactsApplyListReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsApplyListReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsApplyListReq
     */
    public static fromObject(object: { [k: string]: any }): ContactsApplyListReq;

    /**
     * Creates a plain object from a ContactsApplyListReq message. Also converts values to other types if specified.
     * @param message ContactsApplyListReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsApplyListReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsApplyListReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsApplyListReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ContactsApplyListResp. */
export class ContactsApplyListResp implements IContactsApplyListResp {

    /**
     * Constructs a new ContactsApplyListResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsApplyListResp);

    /** ContactsApplyListResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** ContactsApplyListResp unRecordList. */
    public unRecordList: IContactsRecordBase[];

    /** ContactsApplyListResp recordList. */
    public recordList: IContactsRecordBase[];

    /**
     * Creates a new ContactsApplyListResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsApplyListResp instance
     */
    public static create(properties?: IContactsApplyListResp): ContactsApplyListResp;

    /**
     * Encodes the specified ContactsApplyListResp message. Does not implicitly {@link ContactsApplyListResp.verify|verify} messages.
     * @param message ContactsApplyListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsApplyListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsApplyListResp message, length delimited. Does not implicitly {@link ContactsApplyListResp.verify|verify} messages.
     * @param message ContactsApplyListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsApplyListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsApplyListResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsApplyListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsApplyListResp;

    /**
     * Decodes a ContactsApplyListResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsApplyListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsApplyListResp;

    /**
     * Verifies a ContactsApplyListResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsApplyListResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsApplyListResp
     */
    public static fromObject(object: { [k: string]: any }): ContactsApplyListResp;

    /**
     * Creates a plain object from a ContactsApplyListResp message. Also converts values to other types if specified.
     * @param message ContactsApplyListResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsApplyListResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsApplyListResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsApplyListResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ContactsRelationReq. */
export class ContactsRelationReq implements IContactsRelationReq {

    /**
     * Constructs a new ContactsRelationReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsRelationReq);

    /** ContactsRelationReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** ContactsRelationReq targetUid. */
    public targetUid: (number|Long);

    /** ContactsRelationReq msg. */
    public msg: string;

    /** ContactsRelationReq type. */
    public type: ContactsAddType;

    /** ContactsRelationReq op. */
    public op: ContactsOperator;

    /** ContactsRelationReq groupId. */
    public groupId: (number|Long);

    /** ContactsRelationReq addToken. */
    public addToken: string;

    /**
     * Creates a new ContactsRelationReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsRelationReq instance
     */
    public static create(properties?: IContactsRelationReq): ContactsRelationReq;

    /**
     * Encodes the specified ContactsRelationReq message. Does not implicitly {@link ContactsRelationReq.verify|verify} messages.
     * @param message ContactsRelationReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsRelationReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsRelationReq message, length delimited. Does not implicitly {@link ContactsRelationReq.verify|verify} messages.
     * @param message ContactsRelationReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsRelationReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsRelationReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsRelationReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsRelationReq;

    /**
     * Decodes a ContactsRelationReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsRelationReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsRelationReq;

    /**
     * Verifies a ContactsRelationReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsRelationReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsRelationReq
     */
    public static fromObject(object: { [k: string]: any }): ContactsRelationReq;

    /**
     * Creates a plain object from a ContactsRelationReq message. Also converts values to other types if specified.
     * @param message ContactsRelationReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsRelationReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsRelationReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsRelationReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ContactsRelationResp. */
export class ContactsRelationResp implements IContactsRelationResp {

    /**
     * Constructs a new ContactsRelationResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsRelationResp);

    /** ContactsRelationResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new ContactsRelationResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsRelationResp instance
     */
    public static create(properties?: IContactsRelationResp): ContactsRelationResp;

    /**
     * Encodes the specified ContactsRelationResp message. Does not implicitly {@link ContactsRelationResp.verify|verify} messages.
     * @param message ContactsRelationResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsRelationResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsRelationResp message, length delimited. Does not implicitly {@link ContactsRelationResp.verify|verify} messages.
     * @param message ContactsRelationResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsRelationResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsRelationResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsRelationResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsRelationResp;

    /**
     * Decodes a ContactsRelationResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsRelationResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsRelationResp;

    /**
     * Verifies a ContactsRelationResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsRelationResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsRelationResp
     */
    public static fromObject(object: { [k: string]: any }): ContactsRelationResp;

    /**
     * Creates a plain object from a ContactsRelationResp message. Also converts values to other types if specified.
     * @param message ContactsRelationResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsRelationResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsRelationResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsRelationResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ContactsUnAuditDetailReq. */
export class ContactsUnAuditDetailReq implements IContactsUnAuditDetailReq {

    /**
     * Constructs a new ContactsUnAuditDetailReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsUnAuditDetailReq);

    /** ContactsUnAuditDetailReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** ContactsUnAuditDetailReq applyUid. */
    public applyUid: (number|Long);

    /**
     * Creates a new ContactsUnAuditDetailReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsUnAuditDetailReq instance
     */
    public static create(properties?: IContactsUnAuditDetailReq): ContactsUnAuditDetailReq;

    /**
     * Encodes the specified ContactsUnAuditDetailReq message. Does not implicitly {@link ContactsUnAuditDetailReq.verify|verify} messages.
     * @param message ContactsUnAuditDetailReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsUnAuditDetailReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsUnAuditDetailReq message, length delimited. Does not implicitly {@link ContactsUnAuditDetailReq.verify|verify} messages.
     * @param message ContactsUnAuditDetailReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsUnAuditDetailReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsUnAuditDetailReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsUnAuditDetailReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsUnAuditDetailReq;

    /**
     * Decodes a ContactsUnAuditDetailReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsUnAuditDetailReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsUnAuditDetailReq;

    /**
     * Verifies a ContactsUnAuditDetailReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsUnAuditDetailReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsUnAuditDetailReq
     */
    public static fromObject(object: { [k: string]: any }): ContactsUnAuditDetailReq;

    /**
     * Creates a plain object from a ContactsUnAuditDetailReq message. Also converts values to other types if specified.
     * @param message ContactsUnAuditDetailReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsUnAuditDetailReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsUnAuditDetailReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsUnAuditDetailReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ContactsUnAuditDetailResp. */
export class ContactsUnAuditDetailResp implements IContactsUnAuditDetailResp {

    /**
     * Constructs a new ContactsUnAuditDetailResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IContactsUnAuditDetailResp);

    /** ContactsUnAuditDetailResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** ContactsUnAuditDetailResp unAuditDetail. */
    public unAuditDetail?: (IContactsRecordBase|null);

    /**
     * Creates a new ContactsUnAuditDetailResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ContactsUnAuditDetailResp instance
     */
    public static create(properties?: IContactsUnAuditDetailResp): ContactsUnAuditDetailResp;

    /**
     * Encodes the specified ContactsUnAuditDetailResp message. Does not implicitly {@link ContactsUnAuditDetailResp.verify|verify} messages.
     * @param message ContactsUnAuditDetailResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IContactsUnAuditDetailResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ContactsUnAuditDetailResp message, length delimited. Does not implicitly {@link ContactsUnAuditDetailResp.verify|verify} messages.
     * @param message ContactsUnAuditDetailResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IContactsUnAuditDetailResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ContactsUnAuditDetailResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ContactsUnAuditDetailResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ContactsUnAuditDetailResp;

    /**
     * Decodes a ContactsUnAuditDetailResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ContactsUnAuditDetailResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ContactsUnAuditDetailResp;

    /**
     * Verifies a ContactsUnAuditDetailResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ContactsUnAuditDetailResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ContactsUnAuditDetailResp
     */
    public static fromObject(object: { [k: string]: any }): ContactsUnAuditDetailResp;

    /**
     * Creates a plain object from a ContactsUnAuditDetailResp message. Also converts values to other types if specified.
     * @param message ContactsUnAuditDetailResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ContactsUnAuditDetailResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ContactsUnAuditDetailResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ContactsUnAuditDetailResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ComplaintContactsReq. */
export class ComplaintContactsReq implements IComplaintContactsReq {

    /**
     * Constructs a new ComplaintContactsReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IComplaintContactsReq);

    /** ComplaintContactsReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** ComplaintContactsReq targetUid. */
    public targetUid: (number|Long);

    /** ComplaintContactsReq msg. */
    public msg: string;

    /** ComplaintContactsReq type. */
    public type: ComplaintType;

    /**
     * Creates a new ComplaintContactsReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ComplaintContactsReq instance
     */
    public static create(properties?: IComplaintContactsReq): ComplaintContactsReq;

    /**
     * Encodes the specified ComplaintContactsReq message. Does not implicitly {@link ComplaintContactsReq.verify|verify} messages.
     * @param message ComplaintContactsReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IComplaintContactsReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ComplaintContactsReq message, length delimited. Does not implicitly {@link ComplaintContactsReq.verify|verify} messages.
     * @param message ComplaintContactsReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IComplaintContactsReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ComplaintContactsReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ComplaintContactsReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ComplaintContactsReq;

    /**
     * Decodes a ComplaintContactsReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ComplaintContactsReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ComplaintContactsReq;

    /**
     * Verifies a ComplaintContactsReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ComplaintContactsReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ComplaintContactsReq
     */
    public static fromObject(object: { [k: string]: any }): ComplaintContactsReq;

    /**
     * Creates a plain object from a ComplaintContactsReq message. Also converts values to other types if specified.
     * @param message ComplaintContactsReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ComplaintContactsReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ComplaintContactsReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ComplaintContactsReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ComplaintContactsResp. */
export class ComplaintContactsResp implements IComplaintContactsResp {

    /**
     * Constructs a new ComplaintContactsResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IComplaintContactsResp);

    /** ComplaintContactsResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new ComplaintContactsResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ComplaintContactsResp instance
     */
    public static create(properties?: IComplaintContactsResp): ComplaintContactsResp;

    /**
     * Encodes the specified ComplaintContactsResp message. Does not implicitly {@link ComplaintContactsResp.verify|verify} messages.
     * @param message ComplaintContactsResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IComplaintContactsResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ComplaintContactsResp message, length delimited. Does not implicitly {@link ComplaintContactsResp.verify|verify} messages.
     * @param message ComplaintContactsResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IComplaintContactsResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ComplaintContactsResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ComplaintContactsResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ComplaintContactsResp;

    /**
     * Decodes a ComplaintContactsResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ComplaintContactsResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ComplaintContactsResp;

    /**
     * Verifies a ComplaintContactsResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ComplaintContactsResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ComplaintContactsResp
     */
    public static fromObject(object: { [k: string]: any }): ComplaintContactsResp;

    /**
     * Creates a plain object from a ComplaintContactsResp message. Also converts values to other types if specified.
     * @param message ComplaintContactsResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ComplaintContactsResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ComplaintContactsResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ComplaintContactsResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an UpdateBlackContactsReq. */
export class UpdateBlackContactsReq implements IUpdateBlackContactsReq {

    /**
     * Constructs a new UpdateBlackContactsReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUpdateBlackContactsReq);

    /** UpdateBlackContactsReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** UpdateBlackContactsReq targetUid. */
    public targetUid: (number|Long);

    /** UpdateBlackContactsReq op. */
    public op: ContactsOperator;

    /**
     * Creates a new UpdateBlackContactsReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UpdateBlackContactsReq instance
     */
    public static create(properties?: IUpdateBlackContactsReq): UpdateBlackContactsReq;

    /**
     * Encodes the specified UpdateBlackContactsReq message. Does not implicitly {@link UpdateBlackContactsReq.verify|verify} messages.
     * @param message UpdateBlackContactsReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUpdateBlackContactsReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UpdateBlackContactsReq message, length delimited. Does not implicitly {@link UpdateBlackContactsReq.verify|verify} messages.
     * @param message UpdateBlackContactsReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUpdateBlackContactsReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an UpdateBlackContactsReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UpdateBlackContactsReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UpdateBlackContactsReq;

    /**
     * Decodes an UpdateBlackContactsReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UpdateBlackContactsReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UpdateBlackContactsReq;

    /**
     * Verifies an UpdateBlackContactsReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an UpdateBlackContactsReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UpdateBlackContactsReq
     */
    public static fromObject(object: { [k: string]: any }): UpdateBlackContactsReq;

    /**
     * Creates a plain object from an UpdateBlackContactsReq message. Also converts values to other types if specified.
     * @param message UpdateBlackContactsReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UpdateBlackContactsReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UpdateBlackContactsReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UpdateBlackContactsReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an UpdateBlackContactsResp. */
export class UpdateBlackContactsResp implements IUpdateBlackContactsResp {

    /**
     * Constructs a new UpdateBlackContactsResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUpdateBlackContactsResp);

    /** UpdateBlackContactsResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new UpdateBlackContactsResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UpdateBlackContactsResp instance
     */
    public static create(properties?: IUpdateBlackContactsResp): UpdateBlackContactsResp;

    /**
     * Encodes the specified UpdateBlackContactsResp message. Does not implicitly {@link UpdateBlackContactsResp.verify|verify} messages.
     * @param message UpdateBlackContactsResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUpdateBlackContactsResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UpdateBlackContactsResp message, length delimited. Does not implicitly {@link UpdateBlackContactsResp.verify|verify} messages.
     * @param message UpdateBlackContactsResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUpdateBlackContactsResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an UpdateBlackContactsResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UpdateBlackContactsResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UpdateBlackContactsResp;

    /**
     * Decodes an UpdateBlackContactsResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UpdateBlackContactsResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UpdateBlackContactsResp;

    /**
     * Verifies an UpdateBlackContactsResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an UpdateBlackContactsResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UpdateBlackContactsResp
     */
    public static fromObject(object: { [k: string]: any }): UpdateBlackContactsResp;

    /**
     * Creates a plain object from an UpdateBlackContactsResp message. Also converts values to other types if specified.
     * @param message UpdateBlackContactsResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UpdateBlackContactsResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UpdateBlackContactsResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UpdateBlackContactsResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a BlackListReq. */
export class BlackListReq implements IBlackListReq {

    /**
     * Constructs a new BlackListReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IBlackListReq);

    /** BlackListReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** BlackListReq pageNum. */
    public pageNum: number;

    /** BlackListReq pageSize. */
    public pageSize: number;

    /**
     * Creates a new BlackListReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns BlackListReq instance
     */
    public static create(properties?: IBlackListReq): BlackListReq;

    /**
     * Encodes the specified BlackListReq message. Does not implicitly {@link BlackListReq.verify|verify} messages.
     * @param message BlackListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IBlackListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified BlackListReq message, length delimited. Does not implicitly {@link BlackListReq.verify|verify} messages.
     * @param message BlackListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IBlackListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a BlackListReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns BlackListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): BlackListReq;

    /**
     * Decodes a BlackListReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns BlackListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): BlackListReq;

    /**
     * Verifies a BlackListReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a BlackListReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns BlackListReq
     */
    public static fromObject(object: { [k: string]: any }): BlackListReq;

    /**
     * Creates a plain object from a BlackListReq message. Also converts values to other types if specified.
     * @param message BlackListReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: BlackListReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this BlackListReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for BlackListReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a BlackListResp. */
export class BlackListResp implements IBlackListResp {

    /**
     * Constructs a new BlackListResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IBlackListResp);

    /** BlackListResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** BlackListResp blackList. */
    public blackList: IUserBase[];

    /** BlackListResp pageNum. */
    public pageNum: number;

    /** BlackListResp count. */
    public count: number;

    /**
     * Creates a new BlackListResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns BlackListResp instance
     */
    public static create(properties?: IBlackListResp): BlackListResp;

    /**
     * Encodes the specified BlackListResp message. Does not implicitly {@link BlackListResp.verify|verify} messages.
     * @param message BlackListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IBlackListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified BlackListResp message, length delimited. Does not implicitly {@link BlackListResp.verify|verify} messages.
     * @param message BlackListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IBlackListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a BlackListResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns BlackListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): BlackListResp;

    /**
     * Decodes a BlackListResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns BlackListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): BlackListResp;

    /**
     * Verifies a BlackListResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a BlackListResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns BlackListResp
     */
    public static fromObject(object: { [k: string]: any }): BlackListResp;

    /**
     * Creates a plain object from a BlackListResp message. Also converts values to other types if specified.
     * @param message BlackListResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: BlackListResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this BlackListResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for BlackListResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** GroupOperator enum. */
export enum GroupOperator {
    GROUP_ADD = 0,
    GROUP_DEL = 1,
    TOP = 2,
    GROUP_STAR = 3,
    DISTURB = 4,
    ADDRESS = 5,
    JOIN_CHECK = 6,
    UPDATE_GROUP_NAME = 7,
    UPDATE_NICK_NAME = 8,
    UPDATE_GROUP_PIC = 9,
    JOIN_FRIEND = 10,
    SHUTUP = 11,
    NOTICE = 12,
    CLEAR_NOTICE = 13,
    ADD_ADMIN = 14,
    EDIT_ADMIN = 15,
    GROUP_READ_CANCEL_OP = 16,
    GROUP_READ_CANCEL_TIME_OP = 17
}

/** Represents a GroupReqInfo. */
export class GroupReqInfo implements IGroupReqInfo {

    /**
     * Constructs a new GroupReqInfo.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupReqInfo);

    /** GroupReqInfo groupReqId. */
    public groupReqId: (number|Long);

    /** GroupReqInfo groupId. */
    public groupId: (number|Long);

    /** GroupReqInfo groupName. */
    public groupName: string;

    /** GroupReqInfo msg. */
    public msg: string;

    /** GroupReqInfo groupReqType. */
    public groupReqType: GroupReqType;

    /** GroupReqInfo groupReqStatus. */
    public groupReqStatus: GroupReqStatus;

    /** GroupReqInfo createTime. */
    public createTime: (number|Long);

    /** GroupReqInfo pic. */
    public pic: string;

    /** GroupReqInfo bfJoinCheck. */
    public bfJoinCheck: boolean;

    /** GroupReqInfo targetUser. */
    public targetUser?: (IUserBase|null);

    /** GroupReqInfo checkUser. */
    public checkUser?: (IUserBase|null);

    /** GroupReqInfo fromUser. */
    public fromUser?: (IUserBase|null);

    /** GroupReqInfo updateTime. */
    public updateTime: (number|Long);

    /** GroupReqInfo groupHostUid. */
    public groupHostUid: (number|Long);

    /** GroupReqInfo checkUserType. */
    public checkUserType: GroupMemberType;

    /**
     * Creates a new GroupReqInfo instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupReqInfo instance
     */
    public static create(properties?: IGroupReqInfo): GroupReqInfo;

    /**
     * Encodes the specified GroupReqInfo message. Does not implicitly {@link GroupReqInfo.verify|verify} messages.
     * @param message GroupReqInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupReqInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupReqInfo message, length delimited. Does not implicitly {@link GroupReqInfo.verify|verify} messages.
     * @param message GroupReqInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupReqInfo, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupReqInfo message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupReqInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupReqInfo;

    /**
     * Decodes a GroupReqInfo message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupReqInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupReqInfo;

    /**
     * Verifies a GroupReqInfo message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupReqInfo message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupReqInfo
     */
    public static fromObject(object: { [k: string]: any }): GroupReqInfo;

    /**
     * Creates a plain object from a GroupReqInfo message. Also converts values to other types if specified.
     * @param message GroupReqInfo
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupReqInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupReqInfo to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupReqInfo
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupBase. */
export class GroupBase implements IGroupBase {

    /**
     * Constructs a new GroupBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupBase);

    /** GroupBase groupId. */
    public groupId: (number|Long);

    /** GroupBase hostId. */
    public hostId: (number|Long);

    /** GroupBase name. */
    public name: string;

    /** GroupBase pic. */
    public pic: string;

    /** GroupBase bfJoinCheck. */
    public bfJoinCheck: boolean;

    /** GroupBase createTime. */
    public createTime: (number|Long);

    /** GroupBase memberCount. */
    public memberCount: (number|Long);

    /** GroupBase bfJoinFriend. */
    public bfJoinFriend: boolean;

    /** GroupBase bfShutup. */
    public bfShutup: boolean;

    /** GroupBase bfGroupReadCancel. */
    public bfGroupReadCancel: boolean;

    /** GroupBase groupMsgCancelTime. */
    public groupMsgCancelTime: number;

    /** GroupBase bfBanned. */
    public bfBanned: boolean;

    /** GroupBase groupAliasName. */
    public groupAliasName: string;

    /**
     * Creates a new GroupBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupBase instance
     */
    public static create(properties?: IGroupBase): GroupBase;

    /**
     * Encodes the specified GroupBase message. Does not implicitly {@link GroupBase.verify|verify} messages.
     * @param message GroupBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupBase message, length delimited. Does not implicitly {@link GroupBase.verify|verify} messages.
     * @param message GroupBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupBase;

    /**
     * Decodes a GroupBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupBase;

    /**
     * Verifies a GroupBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupBase
     */
    public static fromObject(object: { [k: string]: any }): GroupBase;

    /**
     * Creates a plain object from a GroupBase message. Also converts values to other types if specified.
     * @param message GroupBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupParam. */
export class GroupParam implements IGroupParam {

    /**
     * Constructs a new GroupParam.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupParam);

    /** GroupParam groupId. */
    public groupId: (number|Long);

    /** GroupParam top. */
    public top: boolean;

    /** GroupParam star. */
    public star: boolean;

    /** GroupParam disturb. */
    public disturb: boolean;

    /** GroupParam address. */
    public address: boolean;

    /** GroupParam joinCheck. */
    public joinCheck: boolean;

    /** GroupParam groupName. */
    public groupName: string;

    /** GroupParam groupNickName. */
    public groupNickName: string;

    /** GroupParam pic. */
    public pic: string;

    /** GroupParam joinFriend. */
    public joinFriend: boolean;

    /** GroupParam shutup. */
    public shutup: boolean;

    /** GroupParam notice. */
    public notice: string;

    /** GroupParam bfAll. */
    public bfAll: boolean;

    /** GroupParam bfGroupReadCancel. */
    public bfGroupReadCancel: boolean;

    /** GroupParam groupMsgCancelTime. */
    public groupMsgCancelTime: number;

    /**
     * Creates a new GroupParam instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupParam instance
     */
    public static create(properties?: IGroupParam): GroupParam;

    /**
     * Encodes the specified GroupParam message. Does not implicitly {@link GroupParam.verify|verify} messages.
     * @param message GroupParam message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupParam, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupParam message, length delimited. Does not implicitly {@link GroupParam.verify|verify} messages.
     * @param message GroupParam message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupParam, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupParam message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupParam
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupParam;

    /**
     * Decodes a GroupParam message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupParam
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupParam;

    /**
     * Verifies a GroupParam message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupParam message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupParam
     */
    public static fromObject(object: { [k: string]: any }): GroupParam;

    /**
     * Creates a plain object from a GroupParam message. Also converts values to other types if specified.
     * @param message GroupParam
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupParam, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupParam to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupParam
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupContactListReq. */
export class GroupContactListReq implements IGroupContactListReq {

    /**
     * Constructs a new GroupContactListReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupContactListReq);

    /** GroupContactListReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /**
     * Creates a new GroupContactListReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupContactListReq instance
     */
    public static create(properties?: IGroupContactListReq): GroupContactListReq;

    /**
     * Encodes the specified GroupContactListReq message. Does not implicitly {@link GroupContactListReq.verify|verify} messages.
     * @param message GroupContactListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupContactListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupContactListReq message, length delimited. Does not implicitly {@link GroupContactListReq.verify|verify} messages.
     * @param message GroupContactListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupContactListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupContactListReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupContactListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupContactListReq;

    /**
     * Decodes a GroupContactListReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupContactListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupContactListReq;

    /**
     * Verifies a GroupContactListReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupContactListReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupContactListReq
     */
    public static fromObject(object: { [k: string]: any }): GroupContactListReq;

    /**
     * Creates a plain object from a GroupContactListReq message. Also converts values to other types if specified.
     * @param message GroupContactListReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupContactListReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupContactListReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupContactListReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupContactListResp. */
export class GroupContactListResp implements IGroupContactListResp {

    /**
     * Constructs a new GroupContactListResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupContactListResp);

    /** GroupContactListResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GroupContactListResp groupCount. */
    public groupCount: number;

    /** GroupContactListResp groups. */
    public groups: IGroupBase[];

    /**
     * Creates a new GroupContactListResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupContactListResp instance
     */
    public static create(properties?: IGroupContactListResp): GroupContactListResp;

    /**
     * Encodes the specified GroupContactListResp message. Does not implicitly {@link GroupContactListResp.verify|verify} messages.
     * @param message GroupContactListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupContactListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupContactListResp message, length delimited. Does not implicitly {@link GroupContactListResp.verify|verify} messages.
     * @param message GroupContactListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupContactListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupContactListResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupContactListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupContactListResp;

    /**
     * Decodes a GroupContactListResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupContactListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupContactListResp;

    /**
     * Verifies a GroupContactListResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupContactListResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupContactListResp
     */
    public static fromObject(object: { [k: string]: any }): GroupContactListResp;

    /**
     * Creates a plain object from a GroupContactListResp message. Also converts values to other types if specified.
     * @param message GroupContactListResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupContactListResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupContactListResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupContactListResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupMemberListReq. */
export class GroupMemberListReq implements IGroupMemberListReq {

    /**
     * Constructs a new GroupMemberListReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupMemberListReq);

    /** GroupMemberListReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupMemberListReq groupId. */
    public groupId: (number|Long);

    /** GroupMemberListReq pageNum. */
    public pageNum: number;

    /** GroupMemberListReq pageSize. */
    public pageSize: number;

    /** GroupMemberListReq time. */
    public time: (number|Long);

    /**
     * Creates a new GroupMemberListReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupMemberListReq instance
     */
    public static create(properties?: IGroupMemberListReq): GroupMemberListReq;

    /**
     * Encodes the specified GroupMemberListReq message. Does not implicitly {@link GroupMemberListReq.verify|verify} messages.
     * @param message GroupMemberListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupMemberListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupMemberListReq message, length delimited. Does not implicitly {@link GroupMemberListReq.verify|verify} messages.
     * @param message GroupMemberListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupMemberListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupMemberListReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupMemberListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupMemberListReq;

    /**
     * Decodes a GroupMemberListReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupMemberListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupMemberListReq;

    /**
     * Verifies a GroupMemberListReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupMemberListReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupMemberListReq
     */
    public static fromObject(object: { [k: string]: any }): GroupMemberListReq;

    /**
     * Creates a plain object from a GroupMemberListReq message. Also converts values to other types if specified.
     * @param message GroupMemberListReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupMemberListReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupMemberListReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupMemberListReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupMemberListResp. */
export class GroupMemberListResp implements IGroupMemberListResp {

    /**
     * Constructs a new GroupMemberListResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupMemberListResp);

    /** GroupMemberListResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GroupMemberListResp members. */
    public members: IGroupMemberBase[];

    /** GroupMemberListResp lastUpdateTime. */
    public lastUpdateTime: (number|Long);

    /** GroupMemberListResp groupBase. */
    public groupBase?: (IGroupBase|null);

    /**
     * Creates a new GroupMemberListResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupMemberListResp instance
     */
    public static create(properties?: IGroupMemberListResp): GroupMemberListResp;

    /**
     * Encodes the specified GroupMemberListResp message. Does not implicitly {@link GroupMemberListResp.verify|verify} messages.
     * @param message GroupMemberListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupMemberListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupMemberListResp message, length delimited. Does not implicitly {@link GroupMemberListResp.verify|verify} messages.
     * @param message GroupMemberListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupMemberListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupMemberListResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupMemberListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupMemberListResp;

    /**
     * Decodes a GroupMemberListResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupMemberListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupMemberListResp;

    /**
     * Verifies a GroupMemberListResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupMemberListResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupMemberListResp
     */
    public static fromObject(object: { [k: string]: any }): GroupMemberListResp;

    /**
     * Creates a plain object from a GroupMemberListResp message. Also converts values to other types if specified.
     * @param message GroupMemberListResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupMemberListResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupMemberListResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupMemberListResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupDetailReq. */
export class GroupDetailReq implements IGroupDetailReq {

    /**
     * Constructs a new GroupDetailReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupDetailReq);

    /** GroupDetailReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupDetailReq groupId. */
    public groupId: (number|Long);

    /**
     * Creates a new GroupDetailReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupDetailReq instance
     */
    public static create(properties?: IGroupDetailReq): GroupDetailReq;

    /**
     * Encodes the specified GroupDetailReq message. Does not implicitly {@link GroupDetailReq.verify|verify} messages.
     * @param message GroupDetailReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupDetailReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupDetailReq message, length delimited. Does not implicitly {@link GroupDetailReq.verify|verify} messages.
     * @param message GroupDetailReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupDetailReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupDetailReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupDetailReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupDetailReq;

    /**
     * Decodes a GroupDetailReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupDetailReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupDetailReq;

    /**
     * Verifies a GroupDetailReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupDetailReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupDetailReq
     */
    public static fromObject(object: { [k: string]: any }): GroupDetailReq;

    /**
     * Creates a plain object from a GroupDetailReq message. Also converts values to other types if specified.
     * @param message GroupDetailReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupDetailReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupDetailReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupDetailReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupDetailResp. */
export class GroupDetailResp implements IGroupDetailResp {

    /**
     * Constructs a new GroupDetailResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupDetailResp);

    /** GroupDetailResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GroupDetailResp group. */
    public group?: (IGroupBase|null);

    /** GroupDetailResp groupNickName. */
    public groupNickName: string;

    /** GroupDetailResp bfTop. */
    public bfTop: boolean;

    /** GroupDetailResp bfStar. */
    public bfStar: boolean;

    /** GroupDetailResp bfDisturb. */
    public bfDisturb: boolean;

    /** GroupDetailResp bfAddress. */
    public bfAddress: boolean;

    /** GroupDetailResp right. */
    public right?: (IAdminRightBase|null);

    /** GroupDetailResp groupNotice. */
    public groupNotice?: (IGroupNoticeBase|null);

    /** GroupDetailResp memberType. */
    public memberType: GroupMemberType;

    /** GroupDetailResp qrUrl. */
    public qrUrl: string;

    /** GroupDetailResp qrExpire. */
    public qrExpire: (number|Long);

    /** GroupDetailResp bfResetQrcode. */
    public bfResetQrcode: boolean;

    /**
     * Creates a new GroupDetailResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupDetailResp instance
     */
    public static create(properties?: IGroupDetailResp): GroupDetailResp;

    /**
     * Encodes the specified GroupDetailResp message. Does not implicitly {@link GroupDetailResp.verify|verify} messages.
     * @param message GroupDetailResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupDetailResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupDetailResp message, length delimited. Does not implicitly {@link GroupDetailResp.verify|verify} messages.
     * @param message GroupDetailResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupDetailResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupDetailResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupDetailResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupDetailResp;

    /**
     * Decodes a GroupDetailResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupDetailResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupDetailResp;

    /**
     * Verifies a GroupDetailResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupDetailResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupDetailResp
     */
    public static fromObject(object: { [k: string]: any }): GroupDetailResp;

    /**
     * Creates a plain object from a GroupDetailResp message. Also converts values to other types if specified.
     * @param message GroupDetailResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupDetailResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupDetailResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupDetailResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupNoticeDetailReq. */
export class GroupNoticeDetailReq implements IGroupNoticeDetailReq {

    /**
     * Constructs a new GroupNoticeDetailReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupNoticeDetailReq);

    /** GroupNoticeDetailReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupNoticeDetailReq groupId. */
    public groupId: (number|Long);

    /** GroupNoticeDetailReq noticeId. */
    public noticeId: (number|Long);

    /**
     * Creates a new GroupNoticeDetailReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupNoticeDetailReq instance
     */
    public static create(properties?: IGroupNoticeDetailReq): GroupNoticeDetailReq;

    /**
     * Encodes the specified GroupNoticeDetailReq message. Does not implicitly {@link GroupNoticeDetailReq.verify|verify} messages.
     * @param message GroupNoticeDetailReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupNoticeDetailReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupNoticeDetailReq message, length delimited. Does not implicitly {@link GroupNoticeDetailReq.verify|verify} messages.
     * @param message GroupNoticeDetailReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupNoticeDetailReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupNoticeDetailReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupNoticeDetailReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupNoticeDetailReq;

    /**
     * Decodes a GroupNoticeDetailReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupNoticeDetailReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupNoticeDetailReq;

    /**
     * Verifies a GroupNoticeDetailReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupNoticeDetailReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupNoticeDetailReq
     */
    public static fromObject(object: { [k: string]: any }): GroupNoticeDetailReq;

    /**
     * Creates a plain object from a GroupNoticeDetailReq message. Also converts values to other types if specified.
     * @param message GroupNoticeDetailReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupNoticeDetailReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupNoticeDetailReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupNoticeDetailReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupNoticeDetailResp. */
export class GroupNoticeDetailResp implements IGroupNoticeDetailResp {

    /**
     * Constructs a new GroupNoticeDetailResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupNoticeDetailResp);

    /** GroupNoticeDetailResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GroupNoticeDetailResp notice. */
    public notice?: (IGroupNoticeBase|null);

    /**
     * Creates a new GroupNoticeDetailResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupNoticeDetailResp instance
     */
    public static create(properties?: IGroupNoticeDetailResp): GroupNoticeDetailResp;

    /**
     * Encodes the specified GroupNoticeDetailResp message. Does not implicitly {@link GroupNoticeDetailResp.verify|verify} messages.
     * @param message GroupNoticeDetailResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupNoticeDetailResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupNoticeDetailResp message, length delimited. Does not implicitly {@link GroupNoticeDetailResp.verify|verify} messages.
     * @param message GroupNoticeDetailResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupNoticeDetailResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupNoticeDetailResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupNoticeDetailResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupNoticeDetailResp;

    /**
     * Decodes a GroupNoticeDetailResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupNoticeDetailResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupNoticeDetailResp;

    /**
     * Verifies a GroupNoticeDetailResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupNoticeDetailResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupNoticeDetailResp
     */
    public static fromObject(object: { [k: string]: any }): GroupNoticeDetailResp;

    /**
     * Creates a plain object from a GroupNoticeDetailResp message. Also converts values to other types if specified.
     * @param message GroupNoticeDetailResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupNoticeDetailResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupNoticeDetailResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupNoticeDetailResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupUpdateReq. */
export class GroupUpdateReq implements IGroupUpdateReq {

    /**
     * Constructs a new GroupUpdateReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupUpdateReq);

    /** GroupUpdateReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupUpdateReq op. */
    public op: GroupOperator;

    /** GroupUpdateReq groupParam. */
    public groupParam?: (IGroupParam|null);

    /**
     * Creates a new GroupUpdateReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupUpdateReq instance
     */
    public static create(properties?: IGroupUpdateReq): GroupUpdateReq;

    /**
     * Encodes the specified GroupUpdateReq message. Does not implicitly {@link GroupUpdateReq.verify|verify} messages.
     * @param message GroupUpdateReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupUpdateReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupUpdateReq message, length delimited. Does not implicitly {@link GroupUpdateReq.verify|verify} messages.
     * @param message GroupUpdateReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupUpdateReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupUpdateReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupUpdateReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupUpdateReq;

    /**
     * Decodes a GroupUpdateReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupUpdateReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupUpdateReq;

    /**
     * Verifies a GroupUpdateReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupUpdateReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupUpdateReq
     */
    public static fromObject(object: { [k: string]: any }): GroupUpdateReq;

    /**
     * Creates a plain object from a GroupUpdateReq message. Also converts values to other types if specified.
     * @param message GroupUpdateReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupUpdateReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupUpdateReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupUpdateReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupUpdateResp. */
export class GroupUpdateResp implements IGroupUpdateResp {

    /**
     * Constructs a new GroupUpdateResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupUpdateResp);

    /** GroupUpdateResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GroupUpdateResp noticeId. */
    public noticeId: (number|Long);

    /**
     * Creates a new GroupUpdateResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupUpdateResp instance
     */
    public static create(properties?: IGroupUpdateResp): GroupUpdateResp;

    /**
     * Encodes the specified GroupUpdateResp message. Does not implicitly {@link GroupUpdateResp.verify|verify} messages.
     * @param message GroupUpdateResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupUpdateResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupUpdateResp message, length delimited. Does not implicitly {@link GroupUpdateResp.verify|verify} messages.
     * @param message GroupUpdateResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupUpdateResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupUpdateResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupUpdateResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupUpdateResp;

    /**
     * Decodes a GroupUpdateResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupUpdateResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupUpdateResp;

    /**
     * Verifies a GroupUpdateResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupUpdateResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupUpdateResp
     */
    public static fromObject(object: { [k: string]: any }): GroupUpdateResp;

    /**
     * Creates a plain object from a GroupUpdateResp message. Also converts values to other types if specified.
     * @param message GroupUpdateResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupUpdateResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupUpdateResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupUpdateResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupMsgReceiptReq. */
export class GroupMsgReceiptReq implements IGroupMsgReceiptReq {

    /**
     * Constructs a new GroupMsgReceiptReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupMsgReceiptReq);

    /** GroupMsgReceiptReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupMsgReceiptReq msgId. */
    public msgId: (number|Long);

    /** GroupMsgReceiptReq groupId. */
    public groupId: (number|Long);

    /** GroupMsgReceiptReq lastTime. */
    public lastTime: (number|Long);

    /** GroupMsgReceiptReq pageSize. */
    public pageSize: number;

    /**
     * Creates a new GroupMsgReceiptReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupMsgReceiptReq instance
     */
    public static create(properties?: IGroupMsgReceiptReq): GroupMsgReceiptReq;

    /**
     * Encodes the specified GroupMsgReceiptReq message. Does not implicitly {@link GroupMsgReceiptReq.verify|verify} messages.
     * @param message GroupMsgReceiptReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupMsgReceiptReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupMsgReceiptReq message, length delimited. Does not implicitly {@link GroupMsgReceiptReq.verify|verify} messages.
     * @param message GroupMsgReceiptReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupMsgReceiptReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupMsgReceiptReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupMsgReceiptReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupMsgReceiptReq;

    /**
     * Decodes a GroupMsgReceiptReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupMsgReceiptReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupMsgReceiptReq;

    /**
     * Verifies a GroupMsgReceiptReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupMsgReceiptReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupMsgReceiptReq
     */
    public static fromObject(object: { [k: string]: any }): GroupMsgReceiptReq;

    /**
     * Creates a plain object from a GroupMsgReceiptReq message. Also converts values to other types if specified.
     * @param message GroupMsgReceiptReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupMsgReceiptReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupMsgReceiptReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupMsgReceiptReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupMsgReceiptResp. */
export class GroupMsgReceiptResp implements IGroupMsgReceiptResp {

    /**
     * Constructs a new GroupMsgReceiptResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupMsgReceiptResp);

    /** GroupMsgReceiptResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GroupMsgReceiptResp receipts. */
    public receipts: IMsgReceiptBase[];

    /** GroupMsgReceiptResp count. */
    public count: (number|Long);

    /** GroupMsgReceiptResp lastTime. */
    public lastTime: (number|Long);

    /**
     * Creates a new GroupMsgReceiptResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupMsgReceiptResp instance
     */
    public static create(properties?: IGroupMsgReceiptResp): GroupMsgReceiptResp;

    /**
     * Encodes the specified GroupMsgReceiptResp message. Does not implicitly {@link GroupMsgReceiptResp.verify|verify} messages.
     * @param message GroupMsgReceiptResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupMsgReceiptResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupMsgReceiptResp message, length delimited. Does not implicitly {@link GroupMsgReceiptResp.verify|verify} messages.
     * @param message GroupMsgReceiptResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupMsgReceiptResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupMsgReceiptResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupMsgReceiptResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupMsgReceiptResp;

    /**
     * Decodes a GroupMsgReceiptResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupMsgReceiptResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupMsgReceiptResp;

    /**
     * Verifies a GroupMsgReceiptResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupMsgReceiptResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupMsgReceiptResp
     */
    public static fromObject(object: { [k: string]: any }): GroupMsgReceiptResp;

    /**
     * Creates a plain object from a GroupMsgReceiptResp message. Also converts values to other types if specified.
     * @param message GroupMsgReceiptResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupMsgReceiptResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupMsgReceiptResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupMsgReceiptResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupReqListReq. */
export class GroupReqListReq implements IGroupReqListReq {

    /**
     * Constructs a new GroupReqListReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupReqListReq);

    /** GroupReqListReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupReqListReq pageNum. */
    public pageNum: number;

    /** GroupReqListReq pageSize. */
    public pageSize: number;

    /**
     * Creates a new GroupReqListReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupReqListReq instance
     */
    public static create(properties?: IGroupReqListReq): GroupReqListReq;

    /**
     * Encodes the specified GroupReqListReq message. Does not implicitly {@link GroupReqListReq.verify|verify} messages.
     * @param message GroupReqListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupReqListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupReqListReq message, length delimited. Does not implicitly {@link GroupReqListReq.verify|verify} messages.
     * @param message GroupReqListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupReqListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupReqListReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupReqListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupReqListReq;

    /**
     * Decodes a GroupReqListReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupReqListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupReqListReq;

    /**
     * Verifies a GroupReqListReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupReqListReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupReqListReq
     */
    public static fromObject(object: { [k: string]: any }): GroupReqListReq;

    /**
     * Creates a plain object from a GroupReqListReq message. Also converts values to other types if specified.
     * @param message GroupReqListReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupReqListReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupReqListReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupReqListReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupReqListResp. */
export class GroupReqListResp implements IGroupReqListResp {

    /**
     * Constructs a new GroupReqListResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupReqListResp);

    /** GroupReqListResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GroupReqListResp count. */
    public count: (number|Long);

    /** GroupReqListResp groupReqs. */
    public groupReqs: IGroupReqInfo[];

    /**
     * Creates a new GroupReqListResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupReqListResp instance
     */
    public static create(properties?: IGroupReqListResp): GroupReqListResp;

    /**
     * Encodes the specified GroupReqListResp message. Does not implicitly {@link GroupReqListResp.verify|verify} messages.
     * @param message GroupReqListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupReqListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupReqListResp message, length delimited. Does not implicitly {@link GroupReqListResp.verify|verify} messages.
     * @param message GroupReqListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupReqListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupReqListResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupReqListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupReqListResp;

    /**
     * Decodes a GroupReqListResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupReqListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupReqListResp;

    /**
     * Verifies a GroupReqListResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupReqListResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupReqListResp
     */
    public static fromObject(object: { [k: string]: any }): GroupReqListResp;

    /**
     * Creates a plain object from a GroupReqListResp message. Also converts values to other types if specified.
     * @param message GroupReqListResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupReqListResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupReqListResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupReqListResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupCheckJoinReq. */
export class GroupCheckJoinReq implements IGroupCheckJoinReq {

    /**
     * Constructs a new GroupCheckJoinReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupCheckJoinReq);

    /** GroupCheckJoinReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupCheckJoinReq groupReqId. */
    public groupReqId: (number|Long);

    /** GroupCheckJoinReq flag. */
    public flag: boolean;

    /**
     * Creates a new GroupCheckJoinReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupCheckJoinReq instance
     */
    public static create(properties?: IGroupCheckJoinReq): GroupCheckJoinReq;

    /**
     * Encodes the specified GroupCheckJoinReq message. Does not implicitly {@link GroupCheckJoinReq.verify|verify} messages.
     * @param message GroupCheckJoinReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupCheckJoinReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupCheckJoinReq message, length delimited. Does not implicitly {@link GroupCheckJoinReq.verify|verify} messages.
     * @param message GroupCheckJoinReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupCheckJoinReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupCheckJoinReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupCheckJoinReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupCheckJoinReq;

    /**
     * Decodes a GroupCheckJoinReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupCheckJoinReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupCheckJoinReq;

    /**
     * Verifies a GroupCheckJoinReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupCheckJoinReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupCheckJoinReq
     */
    public static fromObject(object: { [k: string]: any }): GroupCheckJoinReq;

    /**
     * Creates a plain object from a GroupCheckJoinReq message. Also converts values to other types if specified.
     * @param message GroupCheckJoinReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupCheckJoinReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupCheckJoinReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupCheckJoinReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupCheckJoinResp. */
export class GroupCheckJoinResp implements IGroupCheckJoinResp {

    /**
     * Constructs a new GroupCheckJoinResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupCheckJoinResp);

    /** GroupCheckJoinResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new GroupCheckJoinResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupCheckJoinResp instance
     */
    public static create(properties?: IGroupCheckJoinResp): GroupCheckJoinResp;

    /**
     * Encodes the specified GroupCheckJoinResp message. Does not implicitly {@link GroupCheckJoinResp.verify|verify} messages.
     * @param message GroupCheckJoinResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupCheckJoinResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupCheckJoinResp message, length delimited. Does not implicitly {@link GroupCheckJoinResp.verify|verify} messages.
     * @param message GroupCheckJoinResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupCheckJoinResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupCheckJoinResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupCheckJoinResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupCheckJoinResp;

    /**
     * Decodes a GroupCheckJoinResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupCheckJoinResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupCheckJoinResp;

    /**
     * Verifies a GroupCheckJoinResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupCheckJoinResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupCheckJoinResp
     */
    public static fromObject(object: { [k: string]: any }): GroupCheckJoinResp;

    /**
     * Creates a plain object from a GroupCheckJoinResp message. Also converts values to other types if specified.
     * @param message GroupCheckJoinResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupCheckJoinResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupCheckJoinResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupCheckJoinResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupUserCheckJoinReq. */
export class GroupUserCheckJoinReq implements IGroupUserCheckJoinReq {

    /**
     * Constructs a new GroupUserCheckJoinReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupUserCheckJoinReq);

    /** GroupUserCheckJoinReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupUserCheckJoinReq groupReqId. */
    public groupReqId: (number|Long);

    /** GroupUserCheckJoinReq flag. */
    public flag: boolean;

    /** GroupUserCheckJoinReq msg. */
    public msg: string;

    /**
     * Creates a new GroupUserCheckJoinReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupUserCheckJoinReq instance
     */
    public static create(properties?: IGroupUserCheckJoinReq): GroupUserCheckJoinReq;

    /**
     * Encodes the specified GroupUserCheckJoinReq message. Does not implicitly {@link GroupUserCheckJoinReq.verify|verify} messages.
     * @param message GroupUserCheckJoinReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupUserCheckJoinReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupUserCheckJoinReq message, length delimited. Does not implicitly {@link GroupUserCheckJoinReq.verify|verify} messages.
     * @param message GroupUserCheckJoinReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupUserCheckJoinReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupUserCheckJoinReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupUserCheckJoinReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupUserCheckJoinReq;

    /**
     * Decodes a GroupUserCheckJoinReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupUserCheckJoinReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupUserCheckJoinReq;

    /**
     * Verifies a GroupUserCheckJoinReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupUserCheckJoinReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupUserCheckJoinReq
     */
    public static fromObject(object: { [k: string]: any }): GroupUserCheckJoinReq;

    /**
     * Creates a plain object from a GroupUserCheckJoinReq message. Also converts values to other types if specified.
     * @param message GroupUserCheckJoinReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupUserCheckJoinReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupUserCheckJoinReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupUserCheckJoinReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupUserCheckJoinResp. */
export class GroupUserCheckJoinResp implements IGroupUserCheckJoinResp {

    /**
     * Constructs a new GroupUserCheckJoinResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupUserCheckJoinResp);

    /** GroupUserCheckJoinResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new GroupUserCheckJoinResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupUserCheckJoinResp instance
     */
    public static create(properties?: IGroupUserCheckJoinResp): GroupUserCheckJoinResp;

    /**
     * Encodes the specified GroupUserCheckJoinResp message. Does not implicitly {@link GroupUserCheckJoinResp.verify|verify} messages.
     * @param message GroupUserCheckJoinResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupUserCheckJoinResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupUserCheckJoinResp message, length delimited. Does not implicitly {@link GroupUserCheckJoinResp.verify|verify} messages.
     * @param message GroupUserCheckJoinResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupUserCheckJoinResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupUserCheckJoinResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupUserCheckJoinResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupUserCheckJoinResp;

    /**
     * Decodes a GroupUserCheckJoinResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupUserCheckJoinResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupUserCheckJoinResp;

    /**
     * Verifies a GroupUserCheckJoinResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupUserCheckJoinResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupUserCheckJoinResp
     */
    public static fromObject(object: { [k: string]: any }): GroupUserCheckJoinResp;

    /**
     * Creates a plain object from a GroupUserCheckJoinResp message. Also converts values to other types if specified.
     * @param message GroupUserCheckJoinResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupUserCheckJoinResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupUserCheckJoinResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupUserCheckJoinResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupExitReq. */
export class GroupExitReq implements IGroupExitReq {

    /**
     * Constructs a new GroupExitReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupExitReq);

    /** GroupExitReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupExitReq groupId. */
    public groupId: (number|Long);

    /**
     * Creates a new GroupExitReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupExitReq instance
     */
    public static create(properties?: IGroupExitReq): GroupExitReq;

    /**
     * Encodes the specified GroupExitReq message. Does not implicitly {@link GroupExitReq.verify|verify} messages.
     * @param message GroupExitReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupExitReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupExitReq message, length delimited. Does not implicitly {@link GroupExitReq.verify|verify} messages.
     * @param message GroupExitReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupExitReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupExitReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupExitReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupExitReq;

    /**
     * Decodes a GroupExitReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupExitReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupExitReq;

    /**
     * Verifies a GroupExitReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupExitReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupExitReq
     */
    public static fromObject(object: { [k: string]: any }): GroupExitReq;

    /**
     * Creates a plain object from a GroupExitReq message. Also converts values to other types if specified.
     * @param message GroupExitReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupExitReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupExitReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupExitReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupExitResp. */
export class GroupExitResp implements IGroupExitResp {

    /**
     * Constructs a new GroupExitResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupExitResp);

    /** GroupExitResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new GroupExitResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupExitResp instance
     */
    public static create(properties?: IGroupExitResp): GroupExitResp;

    /**
     * Encodes the specified GroupExitResp message. Does not implicitly {@link GroupExitResp.verify|verify} messages.
     * @param message GroupExitResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupExitResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupExitResp message, length delimited. Does not implicitly {@link GroupExitResp.verify|verify} messages.
     * @param message GroupExitResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupExitResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupExitResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupExitResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupExitResp;

    /**
     * Decodes a GroupExitResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupExitResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupExitResp;

    /**
     * Verifies a GroupExitResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupExitResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupExitResp
     */
    public static fromObject(object: { [k: string]: any }): GroupExitResp;

    /**
     * Creates a plain object from a GroupExitResp message. Also converts values to other types if specified.
     * @param message GroupExitResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupExitResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupExitResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupExitResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a DelGroupReqRecordReq. */
export class DelGroupReqRecordReq implements IDelGroupReqRecordReq {

    /**
     * Constructs a new DelGroupReqRecordReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IDelGroupReqRecordReq);

    /** DelGroupReqRecordReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** DelGroupReqRecordReq groupReqId. */
    public groupReqId: (number|Long);

    /**
     * Creates a new DelGroupReqRecordReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns DelGroupReqRecordReq instance
     */
    public static create(properties?: IDelGroupReqRecordReq): DelGroupReqRecordReq;

    /**
     * Encodes the specified DelGroupReqRecordReq message. Does not implicitly {@link DelGroupReqRecordReq.verify|verify} messages.
     * @param message DelGroupReqRecordReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IDelGroupReqRecordReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified DelGroupReqRecordReq message, length delimited. Does not implicitly {@link DelGroupReqRecordReq.verify|verify} messages.
     * @param message DelGroupReqRecordReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IDelGroupReqRecordReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a DelGroupReqRecordReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns DelGroupReqRecordReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): DelGroupReqRecordReq;

    /**
     * Decodes a DelGroupReqRecordReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns DelGroupReqRecordReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): DelGroupReqRecordReq;

    /**
     * Verifies a DelGroupReqRecordReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a DelGroupReqRecordReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns DelGroupReqRecordReq
     */
    public static fromObject(object: { [k: string]: any }): DelGroupReqRecordReq;

    /**
     * Creates a plain object from a DelGroupReqRecordReq message. Also converts values to other types if specified.
     * @param message DelGroupReqRecordReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: DelGroupReqRecordReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this DelGroupReqRecordReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for DelGroupReqRecordReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a DelGroupReqRecordResp. */
export class DelGroupReqRecordResp implements IDelGroupReqRecordResp {

    /**
     * Constructs a new DelGroupReqRecordResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IDelGroupReqRecordResp);

    /** DelGroupReqRecordResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new DelGroupReqRecordResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns DelGroupReqRecordResp instance
     */
    public static create(properties?: IDelGroupReqRecordResp): DelGroupReqRecordResp;

    /**
     * Encodes the specified DelGroupReqRecordResp message. Does not implicitly {@link DelGroupReqRecordResp.verify|verify} messages.
     * @param message DelGroupReqRecordResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IDelGroupReqRecordResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified DelGroupReqRecordResp message, length delimited. Does not implicitly {@link DelGroupReqRecordResp.verify|verify} messages.
     * @param message DelGroupReqRecordResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IDelGroupReqRecordResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a DelGroupReqRecordResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns DelGroupReqRecordResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): DelGroupReqRecordResp;

    /**
     * Decodes a DelGroupReqRecordResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns DelGroupReqRecordResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): DelGroupReqRecordResp;

    /**
     * Verifies a DelGroupReqRecordResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a DelGroupReqRecordResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns DelGroupReqRecordResp
     */
    public static fromObject(object: { [k: string]: any }): DelGroupReqRecordResp;

    /**
     * Creates a plain object from a DelGroupReqRecordResp message. Also converts values to other types if specified.
     * @param message DelGroupReqRecordResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: DelGroupReqRecordResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this DelGroupReqRecordResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for DelGroupReqRecordResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupMemberReq. */
export class GroupMemberReq implements IGroupMemberReq {

    /**
     * Constructs a new GroupMemberReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupMemberReq);

    /** GroupMemberReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupMemberReq op. */
    public op: GroupOperator;

    /** GroupMemberReq groupId. */
    public groupId: (number|Long);

    /** GroupMemberReq members. */
    public members: (number|Long)[];

    /**
     * Creates a new GroupMemberReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupMemberReq instance
     */
    public static create(properties?: IGroupMemberReq): GroupMemberReq;

    /**
     * Encodes the specified GroupMemberReq message. Does not implicitly {@link GroupMemberReq.verify|verify} messages.
     * @param message GroupMemberReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupMemberReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupMemberReq message, length delimited. Does not implicitly {@link GroupMemberReq.verify|verify} messages.
     * @param message GroupMemberReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupMemberReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupMemberReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupMemberReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupMemberReq;

    /**
     * Decodes a GroupMemberReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupMemberReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupMemberReq;

    /**
     * Verifies a GroupMemberReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupMemberReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupMemberReq
     */
    public static fromObject(object: { [k: string]: any }): GroupMemberReq;

    /**
     * Creates a plain object from a GroupMemberReq message. Also converts values to other types if specified.
     * @param message GroupMemberReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupMemberReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupMemberReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupMemberReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupMemberResp. */
export class GroupMemberResp implements IGroupMemberResp {

    /**
     * Constructs a new GroupMemberResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupMemberResp);

    /** GroupMemberResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GroupMemberResp notFriendUids. */
    public notFriendUids: (number|Long)[];

    /** GroupMemberResp needCheckUids. */
    public needCheckUids: (number|Long)[];

    /**
     * Creates a new GroupMemberResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupMemberResp instance
     */
    public static create(properties?: IGroupMemberResp): GroupMemberResp;

    /**
     * Encodes the specified GroupMemberResp message. Does not implicitly {@link GroupMemberResp.verify|verify} messages.
     * @param message GroupMemberResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupMemberResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupMemberResp message, length delimited. Does not implicitly {@link GroupMemberResp.verify|verify} messages.
     * @param message GroupMemberResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupMemberResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupMemberResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupMemberResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupMemberResp;

    /**
     * Decodes a GroupMemberResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupMemberResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupMemberResp;

    /**
     * Verifies a GroupMemberResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupMemberResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupMemberResp
     */
    public static fromObject(object: { [k: string]: any }): GroupMemberResp;

    /**
     * Creates a plain object from a GroupMemberResp message. Also converts values to other types if specified.
     * @param message GroupMemberResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupMemberResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupMemberResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupMemberResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupCreateReq. */
export class GroupCreateReq implements IGroupCreateReq {

    /**
     * Constructs a new GroupCreateReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupCreateReq);

    /** GroupCreateReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupCreateReq members. */
    public members: (number|Long)[];

    /** GroupCreateReq groupName. */
    public groupName: string;

    /** GroupCreateReq pic. */
    public pic: string;

    /**
     * Creates a new GroupCreateReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupCreateReq instance
     */
    public static create(properties?: IGroupCreateReq): GroupCreateReq;

    /**
     * Encodes the specified GroupCreateReq message. Does not implicitly {@link GroupCreateReq.verify|verify} messages.
     * @param message GroupCreateReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupCreateReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupCreateReq message, length delimited. Does not implicitly {@link GroupCreateReq.verify|verify} messages.
     * @param message GroupCreateReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupCreateReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupCreateReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupCreateReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupCreateReq;

    /**
     * Decodes a GroupCreateReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupCreateReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupCreateReq;

    /**
     * Verifies a GroupCreateReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupCreateReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupCreateReq
     */
    public static fromObject(object: { [k: string]: any }): GroupCreateReq;

    /**
     * Creates a plain object from a GroupCreateReq message. Also converts values to other types if specified.
     * @param message GroupCreateReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupCreateReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupCreateReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupCreateReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupCreateResp. */
export class GroupCreateResp implements IGroupCreateResp {

    /**
     * Constructs a new GroupCreateResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupCreateResp);

    /** GroupCreateResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GroupCreateResp groupBase. */
    public groupBase?: (IGroupBase|null);

    /** GroupCreateResp notFriendUids. */
    public notFriendUids: (number|Long)[];

    /** GroupCreateResp bfSuccess. */
    public bfSuccess: boolean;

    /** GroupCreateResp memberUids. */
    public memberUids: (number|Long)[];

    /** GroupCreateResp needCheckUids. */
    public needCheckUids: (number|Long)[];

    /**
     * Creates a new GroupCreateResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupCreateResp instance
     */
    public static create(properties?: IGroupCreateResp): GroupCreateResp;

    /**
     * Encodes the specified GroupCreateResp message. Does not implicitly {@link GroupCreateResp.verify|verify} messages.
     * @param message GroupCreateResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupCreateResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupCreateResp message, length delimited. Does not implicitly {@link GroupCreateResp.verify|verify} messages.
     * @param message GroupCreateResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupCreateResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupCreateResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupCreateResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupCreateResp;

    /**
     * Decodes a GroupCreateResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupCreateResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupCreateResp;

    /**
     * Verifies a GroupCreateResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupCreateResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupCreateResp
     */
    public static fromObject(object: { [k: string]: any }): GroupCreateResp;

    /**
     * Creates a plain object from a GroupCreateResp message. Also converts values to other types if specified.
     * @param message GroupCreateResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupCreateResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupCreateResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupCreateResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupAdminListReq. */
export class GroupAdminListReq implements IGroupAdminListReq {

    /**
     * Constructs a new GroupAdminListReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupAdminListReq);

    /** GroupAdminListReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupAdminListReq groupId. */
    public groupId: (number|Long);

    /**
     * Creates a new GroupAdminListReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupAdminListReq instance
     */
    public static create(properties?: IGroupAdminListReq): GroupAdminListReq;

    /**
     * Encodes the specified GroupAdminListReq message. Does not implicitly {@link GroupAdminListReq.verify|verify} messages.
     * @param message GroupAdminListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupAdminListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupAdminListReq message, length delimited. Does not implicitly {@link GroupAdminListReq.verify|verify} messages.
     * @param message GroupAdminListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupAdminListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupAdminListReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupAdminListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupAdminListReq;

    /**
     * Decodes a GroupAdminListReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupAdminListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupAdminListReq;

    /**
     * Verifies a GroupAdminListReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupAdminListReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupAdminListReq
     */
    public static fromObject(object: { [k: string]: any }): GroupAdminListReq;

    /**
     * Creates a plain object from a GroupAdminListReq message. Also converts values to other types if specified.
     * @param message GroupAdminListReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupAdminListReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupAdminListReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupAdminListReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupAdminListResp. */
export class GroupAdminListResp implements IGroupAdminListResp {

    /**
     * Constructs a new GroupAdminListResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupAdminListResp);

    /** GroupAdminListResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GroupAdminListResp hostUser. */
    public hostUser?: (IGroupMemberBase|null);

    /** GroupAdminListResp adminList. */
    public adminList: IGroupMemberBase[];

    /** GroupAdminListResp currUserRight. */
    public currUserRight?: (IAdminRightBase|null);

    /** GroupAdminListResp adminNumMax. */
    public adminNumMax: number;

    /**
     * Creates a new GroupAdminListResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupAdminListResp instance
     */
    public static create(properties?: IGroupAdminListResp): GroupAdminListResp;

    /**
     * Encodes the specified GroupAdminListResp message. Does not implicitly {@link GroupAdminListResp.verify|verify} messages.
     * @param message GroupAdminListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupAdminListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupAdminListResp message, length delimited. Does not implicitly {@link GroupAdminListResp.verify|verify} messages.
     * @param message GroupAdminListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupAdminListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupAdminListResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupAdminListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupAdminListResp;

    /**
     * Decodes a GroupAdminListResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupAdminListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupAdminListResp;

    /**
     * Verifies a GroupAdminListResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupAdminListResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupAdminListResp
     */
    public static fromObject(object: { [k: string]: any }): GroupAdminListResp;

    /**
     * Creates a plain object from a GroupAdminListResp message. Also converts values to other types if specified.
     * @param message GroupAdminListResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupAdminListResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupAdminListResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupAdminListResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a FriendCommonGroupListReq. */
export class FriendCommonGroupListReq implements IFriendCommonGroupListReq {

    /**
     * Constructs a new FriendCommonGroupListReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IFriendCommonGroupListReq);

    /** FriendCommonGroupListReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** FriendCommonGroupListReq contactsId. */
    public contactsId: (number|Long);

    /** FriendCommonGroupListReq pageNum. */
    public pageNum: number;

    /** FriendCommonGroupListReq pageSize. */
    public pageSize: number;

    /**
     * Creates a new FriendCommonGroupListReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns FriendCommonGroupListReq instance
     */
    public static create(properties?: IFriendCommonGroupListReq): FriendCommonGroupListReq;

    /**
     * Encodes the specified FriendCommonGroupListReq message. Does not implicitly {@link FriendCommonGroupListReq.verify|verify} messages.
     * @param message FriendCommonGroupListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IFriendCommonGroupListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified FriendCommonGroupListReq message, length delimited. Does not implicitly {@link FriendCommonGroupListReq.verify|verify} messages.
     * @param message FriendCommonGroupListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IFriendCommonGroupListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a FriendCommonGroupListReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns FriendCommonGroupListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): FriendCommonGroupListReq;

    /**
     * Decodes a FriendCommonGroupListReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns FriendCommonGroupListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): FriendCommonGroupListReq;

    /**
     * Verifies a FriendCommonGroupListReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a FriendCommonGroupListReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns FriendCommonGroupListReq
     */
    public static fromObject(object: { [k: string]: any }): FriendCommonGroupListReq;

    /**
     * Creates a plain object from a FriendCommonGroupListReq message. Also converts values to other types if specified.
     * @param message FriendCommonGroupListReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: FriendCommonGroupListReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this FriendCommonGroupListReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for FriendCommonGroupListReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a FriendCommonGroupListResp. */
export class FriendCommonGroupListResp implements IFriendCommonGroupListResp {

    /**
     * Constructs a new FriendCommonGroupListResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IFriendCommonGroupListResp);

    /** FriendCommonGroupListResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** FriendCommonGroupListResp groups. */
    public groups: IGroupBase[];

    /** FriendCommonGroupListResp count. */
    public count: number;

    /**
     * Creates a new FriendCommonGroupListResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns FriendCommonGroupListResp instance
     */
    public static create(properties?: IFriendCommonGroupListResp): FriendCommonGroupListResp;

    /**
     * Encodes the specified FriendCommonGroupListResp message. Does not implicitly {@link FriendCommonGroupListResp.verify|verify} messages.
     * @param message FriendCommonGroupListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IFriendCommonGroupListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified FriendCommonGroupListResp message, length delimited. Does not implicitly {@link FriendCommonGroupListResp.verify|verify} messages.
     * @param message FriendCommonGroupListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IFriendCommonGroupListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a FriendCommonGroupListResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns FriendCommonGroupListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): FriendCommonGroupListResp;

    /**
     * Decodes a FriendCommonGroupListResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns FriendCommonGroupListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): FriendCommonGroupListResp;

    /**
     * Verifies a FriendCommonGroupListResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a FriendCommonGroupListResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns FriendCommonGroupListResp
     */
    public static fromObject(object: { [k: string]: any }): FriendCommonGroupListResp;

    /**
     * Creates a plain object from a FriendCommonGroupListResp message. Also converts values to other types if specified.
     * @param message FriendCommonGroupListResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: FriendCommonGroupListResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this FriendCommonGroupListResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for FriendCommonGroupListResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupRemoveAdminReq. */
export class GroupRemoveAdminReq implements IGroupRemoveAdminReq {

    /**
     * Constructs a new GroupRemoveAdminReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupRemoveAdminReq);

    /** GroupRemoveAdminReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupRemoveAdminReq groupId. */
    public groupId: (number|Long);

    /** GroupRemoveAdminReq adminUid. */
    public adminUid: (number|Long);

    /**
     * Creates a new GroupRemoveAdminReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupRemoveAdminReq instance
     */
    public static create(properties?: IGroupRemoveAdminReq): GroupRemoveAdminReq;

    /**
     * Encodes the specified GroupRemoveAdminReq message. Does not implicitly {@link GroupRemoveAdminReq.verify|verify} messages.
     * @param message GroupRemoveAdminReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupRemoveAdminReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupRemoveAdminReq message, length delimited. Does not implicitly {@link GroupRemoveAdminReq.verify|verify} messages.
     * @param message GroupRemoveAdminReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupRemoveAdminReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupRemoveAdminReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupRemoveAdminReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupRemoveAdminReq;

    /**
     * Decodes a GroupRemoveAdminReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupRemoveAdminReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupRemoveAdminReq;

    /**
     * Verifies a GroupRemoveAdminReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupRemoveAdminReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupRemoveAdminReq
     */
    public static fromObject(object: { [k: string]: any }): GroupRemoveAdminReq;

    /**
     * Creates a plain object from a GroupRemoveAdminReq message. Also converts values to other types if specified.
     * @param message GroupRemoveAdminReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupRemoveAdminReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupRemoveAdminReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupRemoveAdminReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupRemoveAdminResp. */
export class GroupRemoveAdminResp implements IGroupRemoveAdminResp {

    /**
     * Constructs a new GroupRemoveAdminResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupRemoveAdminResp);

    /** GroupRemoveAdminResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new GroupRemoveAdminResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupRemoveAdminResp instance
     */
    public static create(properties?: IGroupRemoveAdminResp): GroupRemoveAdminResp;

    /**
     * Encodes the specified GroupRemoveAdminResp message. Does not implicitly {@link GroupRemoveAdminResp.verify|verify} messages.
     * @param message GroupRemoveAdminResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupRemoveAdminResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupRemoveAdminResp message, length delimited. Does not implicitly {@link GroupRemoveAdminResp.verify|verify} messages.
     * @param message GroupRemoveAdminResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupRemoveAdminResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupRemoveAdminResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupRemoveAdminResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupRemoveAdminResp;

    /**
     * Decodes a GroupRemoveAdminResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupRemoveAdminResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupRemoveAdminResp;

    /**
     * Verifies a GroupRemoveAdminResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupRemoveAdminResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupRemoveAdminResp
     */
    public static fromObject(object: { [k: string]: any }): GroupRemoveAdminResp;

    /**
     * Creates a plain object from a GroupRemoveAdminResp message. Also converts values to other types if specified.
     * @param message GroupRemoveAdminResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupRemoveAdminResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupRemoveAdminResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupRemoveAdminResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupEditAdminRightReq. */
export class GroupEditAdminRightReq implements IGroupEditAdminRightReq {

    /**
     * Constructs a new GroupEditAdminRightReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupEditAdminRightReq);

    /** GroupEditAdminRightReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupEditAdminRightReq groupId. */
    public groupId: (number|Long);

    /** GroupEditAdminRightReq targetUid. */
    public targetUid: (number|Long);

    /** GroupEditAdminRightReq rightParam. */
    public rightParam?: (IAdminRightBase|null);

    /** GroupEditAdminRightReq op. */
    public op: GroupOperator;

    /**
     * Creates a new GroupEditAdminRightReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupEditAdminRightReq instance
     */
    public static create(properties?: IGroupEditAdminRightReq): GroupEditAdminRightReq;

    /**
     * Encodes the specified GroupEditAdminRightReq message. Does not implicitly {@link GroupEditAdminRightReq.verify|verify} messages.
     * @param message GroupEditAdminRightReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupEditAdminRightReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupEditAdminRightReq message, length delimited. Does not implicitly {@link GroupEditAdminRightReq.verify|verify} messages.
     * @param message GroupEditAdminRightReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupEditAdminRightReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupEditAdminRightReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupEditAdminRightReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupEditAdminRightReq;

    /**
     * Decodes a GroupEditAdminRightReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupEditAdminRightReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupEditAdminRightReq;

    /**
     * Verifies a GroupEditAdminRightReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupEditAdminRightReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupEditAdminRightReq
     */
    public static fromObject(object: { [k: string]: any }): GroupEditAdminRightReq;

    /**
     * Creates a plain object from a GroupEditAdminRightReq message. Also converts values to other types if specified.
     * @param message GroupEditAdminRightReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupEditAdminRightReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupEditAdminRightReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupEditAdminRightReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupEditAdminRightResp. */
export class GroupEditAdminRightResp implements IGroupEditAdminRightResp {

    /**
     * Constructs a new GroupEditAdminRightResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupEditAdminRightResp);

    /** GroupEditAdminRightResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new GroupEditAdminRightResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupEditAdminRightResp instance
     */
    public static create(properties?: IGroupEditAdminRightResp): GroupEditAdminRightResp;

    /**
     * Encodes the specified GroupEditAdminRightResp message. Does not implicitly {@link GroupEditAdminRightResp.verify|verify} messages.
     * @param message GroupEditAdminRightResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupEditAdminRightResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupEditAdminRightResp message, length delimited. Does not implicitly {@link GroupEditAdminRightResp.verify|verify} messages.
     * @param message GroupEditAdminRightResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupEditAdminRightResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupEditAdminRightResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupEditAdminRightResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupEditAdminRightResp;

    /**
     * Decodes a GroupEditAdminRightResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupEditAdminRightResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupEditAdminRightResp;

    /**
     * Verifies a GroupEditAdminRightResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupEditAdminRightResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupEditAdminRightResp
     */
    public static fromObject(object: { [k: string]: any }): GroupEditAdminRightResp;

    /**
     * Creates a plain object from a GroupEditAdminRightResp message. Also converts values to other types if specified.
     * @param message GroupEditAdminRightResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupEditAdminRightResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupEditAdminRightResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupEditAdminRightResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupTransferReq. */
export class GroupTransferReq implements IGroupTransferReq {

    /**
     * Constructs a new GroupTransferReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupTransferReq);

    /** GroupTransferReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupTransferReq groupId. */
    public groupId: (number|Long);

    /** GroupTransferReq transferUid. */
    public transferUid: (number|Long);

    /**
     * Creates a new GroupTransferReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupTransferReq instance
     */
    public static create(properties?: IGroupTransferReq): GroupTransferReq;

    /**
     * Encodes the specified GroupTransferReq message. Does not implicitly {@link GroupTransferReq.verify|verify} messages.
     * @param message GroupTransferReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupTransferReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupTransferReq message, length delimited. Does not implicitly {@link GroupTransferReq.verify|verify} messages.
     * @param message GroupTransferReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupTransferReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupTransferReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupTransferReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupTransferReq;

    /**
     * Decodes a GroupTransferReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupTransferReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupTransferReq;

    /**
     * Verifies a GroupTransferReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupTransferReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupTransferReq
     */
    public static fromObject(object: { [k: string]: any }): GroupTransferReq;

    /**
     * Creates a plain object from a GroupTransferReq message. Also converts values to other types if specified.
     * @param message GroupTransferReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupTransferReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupTransferReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupTransferReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupTransferResp. */
export class GroupTransferResp implements IGroupTransferResp {

    /**
     * Constructs a new GroupTransferResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupTransferResp);

    /** GroupTransferResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new GroupTransferResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupTransferResp instance
     */
    public static create(properties?: IGroupTransferResp): GroupTransferResp;

    /**
     * Encodes the specified GroupTransferResp message. Does not implicitly {@link GroupTransferResp.verify|verify} messages.
     * @param message GroupTransferResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupTransferResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupTransferResp message, length delimited. Does not implicitly {@link GroupTransferResp.verify|verify} messages.
     * @param message GroupTransferResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupTransferResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupTransferResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupTransferResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupTransferResp;

    /**
     * Decodes a GroupTransferResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupTransferResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupTransferResp;

    /**
     * Verifies a GroupTransferResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupTransferResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupTransferResp
     */
    public static fromObject(object: { [k: string]: any }): GroupTransferResp;

    /**
     * Creates a plain object from a GroupTransferResp message. Also converts values to other types if specified.
     * @param message GroupTransferResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupTransferResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupTransferResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupTransferResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a SearchGroupMemberReq. */
export class SearchGroupMemberReq implements ISearchGroupMemberReq {

    /**
     * Constructs a new SearchGroupMemberReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: ISearchGroupMemberReq);

    /** SearchGroupMemberReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** SearchGroupMemberReq groupId. */
    public groupId: (number|Long);

    /** SearchGroupMemberReq keyword. */
    public keyword: string;

    /** SearchGroupMemberReq pageNum. */
    public pageNum: number;

    /** SearchGroupMemberReq pageSize. */
    public pageSize: number;

    /** SearchGroupMemberReq filterType. */
    public filterType: number;

    /**
     * Creates a new SearchGroupMemberReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns SearchGroupMemberReq instance
     */
    public static create(properties?: ISearchGroupMemberReq): SearchGroupMemberReq;

    /**
     * Encodes the specified SearchGroupMemberReq message. Does not implicitly {@link SearchGroupMemberReq.verify|verify} messages.
     * @param message SearchGroupMemberReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ISearchGroupMemberReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified SearchGroupMemberReq message, length delimited. Does not implicitly {@link SearchGroupMemberReq.verify|verify} messages.
     * @param message SearchGroupMemberReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ISearchGroupMemberReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a SearchGroupMemberReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns SearchGroupMemberReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): SearchGroupMemberReq;

    /**
     * Decodes a SearchGroupMemberReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns SearchGroupMemberReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): SearchGroupMemberReq;

    /**
     * Verifies a SearchGroupMemberReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a SearchGroupMemberReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns SearchGroupMemberReq
     */
    public static fromObject(object: { [k: string]: any }): SearchGroupMemberReq;

    /**
     * Creates a plain object from a SearchGroupMemberReq message. Also converts values to other types if specified.
     * @param message SearchGroupMemberReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: SearchGroupMemberReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this SearchGroupMemberReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for SearchGroupMemberReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a SearchGroupMemberResp. */
export class SearchGroupMemberResp implements ISearchGroupMemberResp {

    /**
     * Constructs a new SearchGroupMemberResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: ISearchGroupMemberResp);

    /** SearchGroupMemberResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** SearchGroupMemberResp memberList. */
    public memberList: IGroupMemberBase[];

    /** SearchGroupMemberResp count. */
    public count: number;

    /**
     * Creates a new SearchGroupMemberResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns SearchGroupMemberResp instance
     */
    public static create(properties?: ISearchGroupMemberResp): SearchGroupMemberResp;

    /**
     * Encodes the specified SearchGroupMemberResp message. Does not implicitly {@link SearchGroupMemberResp.verify|verify} messages.
     * @param message SearchGroupMemberResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: ISearchGroupMemberResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified SearchGroupMemberResp message, length delimited. Does not implicitly {@link SearchGroupMemberResp.verify|verify} messages.
     * @param message SearchGroupMemberResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: ISearchGroupMemberResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a SearchGroupMemberResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns SearchGroupMemberResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): SearchGroupMemberResp;

    /**
     * Decodes a SearchGroupMemberResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns SearchGroupMemberResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): SearchGroupMemberResp;

    /**
     * Verifies a SearchGroupMemberResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a SearchGroupMemberResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns SearchGroupMemberResp
     */
    public static fromObject(object: { [k: string]: any }): SearchGroupMemberResp;

    /**
     * Creates a plain object from a SearchGroupMemberResp message. Also converts values to other types if specified.
     * @param message SearchGroupMemberResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: SearchGroupMemberResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this SearchGroupMemberResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for SearchGroupMemberResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a WebGroupBindBotReq. */
export class WebGroupBindBotReq implements IWebGroupBindBotReq {

    /**
     * Constructs a new WebGroupBindBotReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IWebGroupBindBotReq);

    /** WebGroupBindBotReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** WebGroupBindBotReq groupId. */
    public groupId: (number|Long);

    /** WebGroupBindBotReq superUid. */
    public superUid: string;

    /**
     * Creates a new WebGroupBindBotReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns WebGroupBindBotReq instance
     */
    public static create(properties?: IWebGroupBindBotReq): WebGroupBindBotReq;

    /**
     * Encodes the specified WebGroupBindBotReq message. Does not implicitly {@link WebGroupBindBotReq.verify|verify} messages.
     * @param message WebGroupBindBotReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IWebGroupBindBotReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified WebGroupBindBotReq message, length delimited. Does not implicitly {@link WebGroupBindBotReq.verify|verify} messages.
     * @param message WebGroupBindBotReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IWebGroupBindBotReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a WebGroupBindBotReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns WebGroupBindBotReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): WebGroupBindBotReq;

    /**
     * Decodes a WebGroupBindBotReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns WebGroupBindBotReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): WebGroupBindBotReq;

    /**
     * Verifies a WebGroupBindBotReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a WebGroupBindBotReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns WebGroupBindBotReq
     */
    public static fromObject(object: { [k: string]: any }): WebGroupBindBotReq;

    /**
     * Creates a plain object from a WebGroupBindBotReq message. Also converts values to other types if specified.
     * @param message WebGroupBindBotReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: WebGroupBindBotReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this WebGroupBindBotReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for WebGroupBindBotReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupGameBindBotReq. */
export class GroupGameBindBotReq implements IGroupGameBindBotReq {

    /**
     * Constructs a new GroupGameBindBotReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupGameBindBotReq);

    /** GroupGameBindBotReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupGameBindBotReq groupId. */
    public groupId: (number|Long);

    /** GroupGameBindBotReq gameInfo. */
    public gameInfo?: (IBotGameInfo|null);

    /** GroupGameBindBotReq agentId. */
    public agentId: number;

    /**
     * Creates a new GroupGameBindBotReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupGameBindBotReq instance
     */
    public static create(properties?: IGroupGameBindBotReq): GroupGameBindBotReq;

    /**
     * Encodes the specified GroupGameBindBotReq message. Does not implicitly {@link GroupGameBindBotReq.verify|verify} messages.
     * @param message GroupGameBindBotReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupGameBindBotReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupGameBindBotReq message, length delimited. Does not implicitly {@link GroupGameBindBotReq.verify|verify} messages.
     * @param message GroupGameBindBotReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupGameBindBotReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupGameBindBotReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupGameBindBotReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupGameBindBotReq;

    /**
     * Decodes a GroupGameBindBotReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupGameBindBotReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupGameBindBotReq;

    /**
     * Verifies a GroupGameBindBotReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupGameBindBotReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupGameBindBotReq
     */
    public static fromObject(object: { [k: string]: any }): GroupGameBindBotReq;

    /**
     * Creates a plain object from a GroupGameBindBotReq message. Also converts values to other types if specified.
     * @param message GroupGameBindBotReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupGameBindBotReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupGameBindBotReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupGameBindBotReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupGameBindBotResp. */
export class GroupGameBindBotResp implements IGroupGameBindBotResp {

    /**
     * Constructs a new GroupGameBindBotResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupGameBindBotResp);

    /** GroupGameBindBotResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new GroupGameBindBotResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupGameBindBotResp instance
     */
    public static create(properties?: IGroupGameBindBotResp): GroupGameBindBotResp;

    /**
     * Encodes the specified GroupGameBindBotResp message. Does not implicitly {@link GroupGameBindBotResp.verify|verify} messages.
     * @param message GroupGameBindBotResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupGameBindBotResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupGameBindBotResp message, length delimited. Does not implicitly {@link GroupGameBindBotResp.verify|verify} messages.
     * @param message GroupGameBindBotResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupGameBindBotResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupGameBindBotResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupGameBindBotResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupGameBindBotResp;

    /**
     * Decodes a GroupGameBindBotResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupGameBindBotResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupGameBindBotResp;

    /**
     * Verifies a GroupGameBindBotResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupGameBindBotResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupGameBindBotResp
     */
    public static fromObject(object: { [k: string]: any }): GroupGameBindBotResp;

    /**
     * Creates a plain object from a GroupGameBindBotResp message. Also converts values to other types if specified.
     * @param message GroupGameBindBotResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupGameBindBotResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupGameBindBotResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupGameBindBotResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a WebGroupBindBotResp. */
export class WebGroupBindBotResp implements IWebGroupBindBotResp {

    /**
     * Constructs a new WebGroupBindBotResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IWebGroupBindBotResp);

    /** WebGroupBindBotResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new WebGroupBindBotResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns WebGroupBindBotResp instance
     */
    public static create(properties?: IWebGroupBindBotResp): WebGroupBindBotResp;

    /**
     * Encodes the specified WebGroupBindBotResp message. Does not implicitly {@link WebGroupBindBotResp.verify|verify} messages.
     * @param message WebGroupBindBotResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IWebGroupBindBotResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified WebGroupBindBotResp message, length delimited. Does not implicitly {@link WebGroupBindBotResp.verify|verify} messages.
     * @param message WebGroupBindBotResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IWebGroupBindBotResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a WebGroupBindBotResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns WebGroupBindBotResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): WebGroupBindBotResp;

    /**
     * Decodes a WebGroupBindBotResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns WebGroupBindBotResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): WebGroupBindBotResp;

    /**
     * Verifies a WebGroupBindBotResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a WebGroupBindBotResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns WebGroupBindBotResp
     */
    public static fromObject(object: { [k: string]: any }): WebGroupBindBotResp;

    /**
     * Creates a plain object from a WebGroupBindBotResp message. Also converts values to other types if specified.
     * @param message WebGroupBindBotResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: WebGroupBindBotResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this WebGroupBindBotResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for WebGroupBindBotResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an UploadLogReq. */
export class UploadLogReq implements IUploadLogReq {

    /**
     * Constructs a new UploadLogReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUploadLogReq);

    /** UploadLogReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** UploadLogReq content. */
    public content: string;

    /**
     * Creates a new UploadLogReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UploadLogReq instance
     */
    public static create(properties?: IUploadLogReq): UploadLogReq;

    /**
     * Encodes the specified UploadLogReq message. Does not implicitly {@link UploadLogReq.verify|verify} messages.
     * @param message UploadLogReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUploadLogReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UploadLogReq message, length delimited. Does not implicitly {@link UploadLogReq.verify|verify} messages.
     * @param message UploadLogReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUploadLogReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an UploadLogReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UploadLogReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UploadLogReq;

    /**
     * Decodes an UploadLogReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UploadLogReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UploadLogReq;

    /**
     * Verifies an UploadLogReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an UploadLogReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UploadLogReq
     */
    public static fromObject(object: { [k: string]: any }): UploadLogReq;

    /**
     * Creates a plain object from an UploadLogReq message. Also converts values to other types if specified.
     * @param message UploadLogReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UploadLogReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UploadLogReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UploadLogReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents an UploadLogResp. */
export class UploadLogResp implements IUploadLogResp {

    /**
     * Constructs a new UploadLogResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IUploadLogResp);

    /** UploadLogResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new UploadLogResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns UploadLogResp instance
     */
    public static create(properties?: IUploadLogResp): UploadLogResp;

    /**
     * Encodes the specified UploadLogResp message. Does not implicitly {@link UploadLogResp.verify|verify} messages.
     * @param message UploadLogResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IUploadLogResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified UploadLogResp message, length delimited. Does not implicitly {@link UploadLogResp.verify|verify} messages.
     * @param message UploadLogResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IUploadLogResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an UploadLogResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns UploadLogResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): UploadLogResp;

    /**
     * Decodes an UploadLogResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns UploadLogResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): UploadLogResp;

    /**
     * Verifies an UploadLogResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an UploadLogResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns UploadLogResp
     */
    public static fromObject(object: { [k: string]: any }): UploadLogResp;

    /**
     * Creates a plain object from an UploadLogResp message. Also converts values to other types if specified.
     * @param message UploadLogResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: UploadLogResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this UploadLogResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for UploadLogResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** GroupOrUserType enum. */
export enum GroupOrUserType {
    GROUP = 0,
    USER = 1
}

/** Represents a GroupOrUserReq. */
export class GroupOrUserReq implements IGroupOrUserReq {

    /**
     * Constructs a new GroupOrUserReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupOrUserReq);

    /** GroupOrUserReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupOrUserReq fromUid. */
    public fromUid: (number|Long);

    /** GroupOrUserReq context. */
    public context: string;

    /**
     * Creates a new GroupOrUserReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupOrUserReq instance
     */
    public static create(properties?: IGroupOrUserReq): GroupOrUserReq;

    /**
     * Encodes the specified GroupOrUserReq message. Does not implicitly {@link GroupOrUserReq.verify|verify} messages.
     * @param message GroupOrUserReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupOrUserReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupOrUserReq message, length delimited. Does not implicitly {@link GroupOrUserReq.verify|verify} messages.
     * @param message GroupOrUserReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupOrUserReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupOrUserReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupOrUserReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupOrUserReq;

    /**
     * Decodes a GroupOrUserReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupOrUserReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupOrUserReq;

    /**
     * Verifies a GroupOrUserReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupOrUserReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupOrUserReq
     */
    public static fromObject(object: { [k: string]: any }): GroupOrUserReq;

    /**
     * Creates a plain object from a GroupOrUserReq message. Also converts values to other types if specified.
     * @param message GroupOrUserReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupOrUserReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupOrUserReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupOrUserReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupOrUserResp. */
export class GroupOrUserResp implements IGroupOrUserResp {

    /**
     * Constructs a new GroupOrUserResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupOrUserResp);

    /** GroupOrUserResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** GroupOrUserResp groupDetail. */
    public groupDetail?: (IGroupDetailBase|null);

    /** GroupOrUserResp targetUser. */
    public targetUser?: (IContactsDetailBase|null);

    /** GroupOrUserResp groupOrUserType. */
    public groupOrUserType: GroupOrUserType;

    /**
     * Creates a new GroupOrUserResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupOrUserResp instance
     */
    public static create(properties?: IGroupOrUserResp): GroupOrUserResp;

    /**
     * Encodes the specified GroupOrUserResp message. Does not implicitly {@link GroupOrUserResp.verify|verify} messages.
     * @param message GroupOrUserResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupOrUserResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupOrUserResp message, length delimited. Does not implicitly {@link GroupOrUserResp.verify|verify} messages.
     * @param message GroupOrUserResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupOrUserResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupOrUserResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupOrUserResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupOrUserResp;

    /**
     * Decodes a GroupOrUserResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupOrUserResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupOrUserResp;

    /**
     * Verifies a GroupOrUserResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupOrUserResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupOrUserResp
     */
    public static fromObject(object: { [k: string]: any }): GroupOrUserResp;

    /**
     * Creates a plain object from a GroupOrUserResp message. Also converts values to other types if specified.
     * @param message GroupOrUserResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupOrUserResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupOrUserResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupOrUserResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupDetailBase. */
export class GroupDetailBase implements IGroupDetailBase {

    /**
     * Constructs a new GroupDetailBase.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupDetailBase);

    /** GroupDetailBase groupBase. */
    public groupBase?: (IGroupBase|null);

    /** GroupDetailBase addToken. */
    public addToken: string;

    /**
     * Creates a new GroupDetailBase instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupDetailBase instance
     */
    public static create(properties?: IGroupDetailBase): GroupDetailBase;

    /**
     * Encodes the specified GroupDetailBase message. Does not implicitly {@link GroupDetailBase.verify|verify} messages.
     * @param message GroupDetailBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupDetailBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupDetailBase message, length delimited. Does not implicitly {@link GroupDetailBase.verify|verify} messages.
     * @param message GroupDetailBase message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupDetailBase, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupDetailBase message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupDetailBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupDetailBase;

    /**
     * Decodes a GroupDetailBase message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupDetailBase
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupDetailBase;

    /**
     * Verifies a GroupDetailBase message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupDetailBase message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupDetailBase
     */
    public static fromObject(object: { [k: string]: any }): GroupDetailBase;

    /**
     * Creates a plain object from a GroupDetailBase message. Also converts values to other types if specified.
     * @param message GroupDetailBase
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupDetailBase, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupDetailBase to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupDetailBase
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupJoinReq. */
export class GroupJoinReq implements IGroupJoinReq {

    /**
     * Constructs a new GroupJoinReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupJoinReq);

    /** GroupJoinReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** GroupJoinReq groupId. */
    public groupId: (number|Long);

    /** GroupJoinReq msg. */
    public msg: string;

    /** GroupJoinReq reqType. */
    public reqType: GroupReqType;

    /** GroupJoinReq addToken. */
    public addToken: string;

    /** GroupJoinReq fromUid. */
    public fromUid: (number|Long);

    /**
     * Creates a new GroupJoinReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupJoinReq instance
     */
    public static create(properties?: IGroupJoinReq): GroupJoinReq;

    /**
     * Encodes the specified GroupJoinReq message. Does not implicitly {@link GroupJoinReq.verify|verify} messages.
     * @param message GroupJoinReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupJoinReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupJoinReq message, length delimited. Does not implicitly {@link GroupJoinReq.verify|verify} messages.
     * @param message GroupJoinReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupJoinReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupJoinReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupJoinReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupJoinReq;

    /**
     * Decodes a GroupJoinReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupJoinReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupJoinReq;

    /**
     * Verifies a GroupJoinReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupJoinReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupJoinReq
     */
    public static fromObject(object: { [k: string]: any }): GroupJoinReq;

    /**
     * Creates a plain object from a GroupJoinReq message. Also converts values to other types if specified.
     * @param message GroupJoinReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupJoinReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupJoinReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupJoinReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a GroupJoinResp. */
export class GroupJoinResp implements IGroupJoinResp {

    /**
     * Constructs a new GroupJoinResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IGroupJoinResp);

    /** GroupJoinResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new GroupJoinResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns GroupJoinResp instance
     */
    public static create(properties?: IGroupJoinResp): GroupJoinResp;

    /**
     * Encodes the specified GroupJoinResp message. Does not implicitly {@link GroupJoinResp.verify|verify} messages.
     * @param message GroupJoinResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IGroupJoinResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified GroupJoinResp message, length delimited. Does not implicitly {@link GroupJoinResp.verify|verify} messages.
     * @param message GroupJoinResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IGroupJoinResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a GroupJoinResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns GroupJoinResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupJoinResp;

    /**
     * Decodes a GroupJoinResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns GroupJoinResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupJoinResp;

    /**
     * Verifies a GroupJoinResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a GroupJoinResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns GroupJoinResp
     */
    public static fromObject(object: { [k: string]: any }): GroupJoinResp;

    /**
     * Creates a plain object from a GroupJoinResp message. Also converts values to other types if specified.
     * @param message GroupJoinResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: GroupJoinResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this GroupJoinResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for GroupJoinResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ClientTokenReq. */
export class ClientTokenReq implements IClientTokenReq {

    /**
     * Constructs a new ClientTokenReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IClientTokenReq);

    /** ClientTokenReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /**
     * Creates a new ClientTokenReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ClientTokenReq instance
     */
    public static create(properties?: IClientTokenReq): ClientTokenReq;

    /**
     * Encodes the specified ClientTokenReq message. Does not implicitly {@link ClientTokenReq.verify|verify} messages.
     * @param message ClientTokenReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IClientTokenReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ClientTokenReq message, length delimited. Does not implicitly {@link ClientTokenReq.verify|verify} messages.
     * @param message ClientTokenReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IClientTokenReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ClientTokenReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ClientTokenReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ClientTokenReq;

    /**
     * Decodes a ClientTokenReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ClientTokenReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ClientTokenReq;

    /**
     * Verifies a ClientTokenReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ClientTokenReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ClientTokenReq
     */
    public static fromObject(object: { [k: string]: any }): ClientTokenReq;

    /**
     * Creates a plain object from a ClientTokenReq message. Also converts values to other types if specified.
     * @param message ClientTokenReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ClientTokenReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ClientTokenReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ClientTokenReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a ClientTokenResp. */
export class ClientTokenResp implements IClientTokenResp {

    /**
     * Constructs a new ClientTokenResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IClientTokenResp);

    /** ClientTokenResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** ClientTokenResp accessToken. */
    public accessToken: string;

    /** ClientTokenResp secretKey. */
    public secretKey: string;

    /** ClientTokenResp expirationMillis. */
    public expirationMillis: (number|Long);

    /** ClientTokenResp mchId. */
    public mchId: number;

    /**
     * Creates a new ClientTokenResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ClientTokenResp instance
     */
    public static create(properties?: IClientTokenResp): ClientTokenResp;

    /**
     * Encodes the specified ClientTokenResp message. Does not implicitly {@link ClientTokenResp.verify|verify} messages.
     * @param message ClientTokenResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IClientTokenResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ClientTokenResp message, length delimited. Does not implicitly {@link ClientTokenResp.verify|verify} messages.
     * @param message ClientTokenResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IClientTokenResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ClientTokenResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ClientTokenResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ClientTokenResp;

    /**
     * Decodes a ClientTokenResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ClientTokenResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ClientTokenResp;

    /**
     * Verifies a ClientTokenResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ClientTokenResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ClientTokenResp
     */
    public static fromObject(object: { [k: string]: any }): ClientTokenResp;

    /**
     * Creates a plain object from a ClientTokenResp message. Also converts values to other types if specified.
     * @param message ClientTokenResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ClientTokenResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ClientTokenResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for ClientTokenResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a FindContactsListReq. */
export class FindContactsListReq implements IFindContactsListReq {

    /**
     * Constructs a new FindContactsListReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IFindContactsListReq);

    /** FindContactsListReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** FindContactsListReq phoneNum. */
    public phoneNum: string;

    /** FindContactsListReq findSign. */
    public findSign: string;

    /** FindContactsListReq targetUid. */
    public targetUid: (number|Long);

    /** FindContactsListReq findType. */
    public findType: (number|Long);

    /**
     * Creates a new FindContactsListReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns FindContactsListReq instance
     */
    public static create(properties?: IFindContactsListReq): FindContactsListReq;

    /**
     * Encodes the specified FindContactsListReq message. Does not implicitly {@link FindContactsListReq.verify|verify} messages.
     * @param message FindContactsListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IFindContactsListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified FindContactsListReq message, length delimited. Does not implicitly {@link FindContactsListReq.verify|verify} messages.
     * @param message FindContactsListReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IFindContactsListReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a FindContactsListReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns FindContactsListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): FindContactsListReq;

    /**
     * Decodes a FindContactsListReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns FindContactsListReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): FindContactsListReq;

    /**
     * Verifies a FindContactsListReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a FindContactsListReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns FindContactsListReq
     */
    public static fromObject(object: { [k: string]: any }): FindContactsListReq;

    /**
     * Creates a plain object from a FindContactsListReq message. Also converts values to other types if specified.
     * @param message FindContactsListReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: FindContactsListReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this FindContactsListReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for FindContactsListReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a FindContactsListResp. */
export class FindContactsListResp implements IFindContactsListResp {

    /**
     * Constructs a new FindContactsListResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IFindContactsListResp);

    /** FindContactsListResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /** FindContactsListResp detailList. */
    public detailList: IContactsDetailBase[];

    /**
     * Creates a new FindContactsListResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns FindContactsListResp instance
     */
    public static create(properties?: IFindContactsListResp): FindContactsListResp;

    /**
     * Encodes the specified FindContactsListResp message. Does not implicitly {@link FindContactsListResp.verify|verify} messages.
     * @param message FindContactsListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IFindContactsListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified FindContactsListResp message, length delimited. Does not implicitly {@link FindContactsListResp.verify|verify} messages.
     * @param message FindContactsListResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IFindContactsListResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a FindContactsListResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns FindContactsListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): FindContactsListResp;

    /**
     * Decodes a FindContactsListResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns FindContactsListResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): FindContactsListResp;

    /**
     * Verifies a FindContactsListResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a FindContactsListResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns FindContactsListResp
     */
    public static fromObject(object: { [k: string]: any }): FindContactsListResp;

    /**
     * Creates a plain object from a FindContactsListResp message. Also converts values to other types if specified.
     * @param message FindContactsListResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: FindContactsListResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this FindContactsListResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for FindContactsListResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a DisableGroupReq. */
export class DisableGroupReq implements IDisableGroupReq {

    /**
     * Constructs a new DisableGroupReq.
     * @param [properties] Properties to set
     */
    constructor(properties?: IDisableGroupReq);

    /** DisableGroupReq clientInfo. */
    public clientInfo?: (IClientInfo|null);

    /** DisableGroupReq groupId. */
    public groupId: (number|Long);

    /**
     * Creates a new DisableGroupReq instance using the specified properties.
     * @param [properties] Properties to set
     * @returns DisableGroupReq instance
     */
    public static create(properties?: IDisableGroupReq): DisableGroupReq;

    /**
     * Encodes the specified DisableGroupReq message. Does not implicitly {@link DisableGroupReq.verify|verify} messages.
     * @param message DisableGroupReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IDisableGroupReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified DisableGroupReq message, length delimited. Does not implicitly {@link DisableGroupReq.verify|verify} messages.
     * @param message DisableGroupReq message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IDisableGroupReq, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a DisableGroupReq message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns DisableGroupReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): DisableGroupReq;

    /**
     * Decodes a DisableGroupReq message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns DisableGroupReq
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): DisableGroupReq;

    /**
     * Verifies a DisableGroupReq message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a DisableGroupReq message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns DisableGroupReq
     */
    public static fromObject(object: { [k: string]: any }): DisableGroupReq;

    /**
     * Creates a plain object from a DisableGroupReq message. Also converts values to other types if specified.
     * @param message DisableGroupReq
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: DisableGroupReq, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this DisableGroupReq to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for DisableGroupReq
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Represents a DisableGroupResp. */
export class DisableGroupResp implements IDisableGroupResp {

    /**
     * Constructs a new DisableGroupResp.
     * @param [properties] Properties to set
     */
    constructor(properties?: IDisableGroupResp);

    /** DisableGroupResp commonResult. */
    public commonResult?: (ICommonResult|null);

    /**
     * Creates a new DisableGroupResp instance using the specified properties.
     * @param [properties] Properties to set
     * @returns DisableGroupResp instance
     */
    public static create(properties?: IDisableGroupResp): DisableGroupResp;

    /**
     * Encodes the specified DisableGroupResp message. Does not implicitly {@link DisableGroupResp.verify|verify} messages.
     * @param message DisableGroupResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IDisableGroupResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified DisableGroupResp message, length delimited. Does not implicitly {@link DisableGroupResp.verify|verify} messages.
     * @param message DisableGroupResp message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IDisableGroupResp, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a DisableGroupResp message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns DisableGroupResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): DisableGroupResp;

    /**
     * Decodes a DisableGroupResp message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns DisableGroupResp
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): DisableGroupResp;

    /**
     * Verifies a DisableGroupResp message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a DisableGroupResp message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns DisableGroupResp
     */
    public static fromObject(object: { [k: string]: any }): DisableGroupResp;

    /**
     * Creates a plain object from a DisableGroupResp message. Also converts values to other types if specified.
     * @param message DisableGroupResp
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: DisableGroupResp, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this DisableGroupResp to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for DisableGroupResp
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Properties of a GroupQrCodeReq. */
export interface IGroupQrCodeReq {
    clientInfo?: (IClientInfo|null);
    groupId?: (number|Long|null);
    force?: (boolean|null);
}

/** Represents a GroupQrCodeReq. */
export class GroupQrCodeReq implements IGroupQrCodeReq {
    constructor(properties?: IGroupQrCodeReq);
    public clientInfo: (IClientInfo|null);
    public groupId: (number|Long);
    public force: boolean;
    public static create(properties?: IGroupQrCodeReq): GroupQrCodeReq;
    public static encode(message: IGroupQrCodeReq, writer?: $protobuf.Writer): $protobuf.Writer;
    public static encodeDelimited(message: IGroupQrCodeReq, writer?: $protobuf.Writer): $protobuf.Writer;
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupQrCodeReq;
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupQrCodeReq;
    public static verify(message: { [k: string]: any }): (string|null);
    public static fromObject(object: { [k: string]: any }): GroupQrCodeReq;
    public static toObject(message: GroupQrCodeReq, options?: $protobuf.IConversionOptions): { [k: string]: any };
    public toJSON(): { [k: string]: any };
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

/** Properties of a GroupQrCodeResp. */
export interface IGroupQrCodeResp {
    commonResult?: (ICommonResult|null);
    qrUrl?: (string|null);
    qrExpire?: (number|Long|null);
    bfResetQrcode?: (boolean|null);
    shortLink?: (string|null);
}

/** Represents a GroupQrCodeResp. */
export class GroupQrCodeResp implements IGroupQrCodeResp {
    constructor(properties?: IGroupQrCodeResp);
    public commonResult: (ICommonResult|null);
    public qrUrl: string;
    public qrExpire: (number|Long);
    public bfResetQrcode: boolean;
    public shortLink: string;
    public static create(properties?: IGroupQrCodeResp): GroupQrCodeResp;
    public static encode(message: IGroupQrCodeResp, writer?: $protobuf.Writer): $protobuf.Writer;
    public static encodeDelimited(message: IGroupQrCodeResp, writer?: $protobuf.Writer): $protobuf.Writer;
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): GroupQrCodeResp;
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): GroupQrCodeResp;
    public static verify(message: { [k: string]: any }): (string|null);
    public static fromObject(object: { [k: string]: any }): GroupQrCodeResp;
    public static toObject(message: GroupQrCodeResp, options?: $protobuf.IConversionOptions): { [k: string]: any };
    public toJSON(): { [k: string]: any };
    public static getTypeUrl(typeUrlPrefix?: string): string;
}
