import CQWebSocket, { CQEvent, CQWebSocketOption, CQRequestOptions } from 'cq-websocket'
import { BotModule } from './interface'
const DebugPrefix = 'debug '
const IsDebug = !!process.env.BOT_DEBUG

export const enum BotPostType {
  Message = 'message',
  Request = 'request',
  Any = 'any'
}
export const enum BotMessageType {
  Group = 'group',
  Private = 'private',
  Discuss = 'discuss'
}
export const enum BotRequestType {
  Friend = 'friend',
  Group = 'group',
}
export const enum BotRequestSubType {
  Add = 'add',
  Invite = 'invite',
}
export interface BotEvent {
  postType: BotPostType
  selfId: number
  time: number
}
export interface BotMessageEvent extends BotEvent {
  postType: BotPostType.Message
  groupId?: number
  message: string,
  messageId: number
  messageType: BotMessageType
  userId: number
}
export interface BotRequestEvent extends BotEvent {
  postType: BotPostType.Request
  requestType: BotRequestType
  userId: number
  comment: string
  flag: string

  subType?: BotRequestSubType
  groupId?: number
}

interface BotEventMap {
  [BotPostType.Message]: BotMessageEvent
  [BotPostType.Request]: BotRequestEvent
  [BotPostType.Any]: BotMessageEvent | BotRequestEvent
}
interface BotListenerReturnMap {
  [BotPostType.Message]: string | void
  [BotPostType.Request]: void
  [BotPostType.Any]: string | void
}

type Promisable<T> = Promise<T> | T
export type BotListener<T extends BotPostType> = (event: BotEventMap[T]) => Promisable<BotListenerReturnMap[T]>
export type MessageListener = BotListener<BotPostType.Message>
export type RequestListener = BotListener<BotPostType.Request>

export type BotFilter<T extends BotPostType> = (event: BotEventMap[T], next?: (() => boolean)) => boolean
export type MessageFilter = BotFilter<BotPostType.Message>
export type RequestFilter = BotFilter<BotPostType.Request>
export type AnyFilter = BotFilter<BotPostType.Any>
export interface FilterListener<T extends BotPostType> {
  filters: BotFilter<T>[]
  listener: BotListener<T>
}
export type MessageFilterListener = FilterListener<BotPostType.Message>
export type RequestFilterListener = FilterListener<BotPostType.Request>
export type MessageModifier = (message: string) => string
export class TSBotEventBus {
  private msgListeners: MessageFilterListener[] = []
  private reqListeners: RequestFilterListener[] = []
  msgModifier: MessageModifier[] = []
  constructor (bot: CQWebSocket, private globalFilters: BotFilter<BotPostType.Any>[] = []) {
    bot.on('message', (e, c) => this.onMessage(e, c))
    bot.on('request', (c) => this.onRequest(c))
  }
  registerAtMe (listener: MessageListener) {
    this.registerMessage(
      [this.atMeFilter],
      listener
    )
  }
  registerPrivate (listener: MessageListener) {
    this.registerMessage(
      [this.privateFilter],
      listener
    )
  }
  registerStartsWith (str: string, listener: MessageListener) {
    this.registerMessage(
      [this.startsWithFilter(str)],
      listener
    )
  }
  registerMessage (filters: MessageFilter[], listener: MessageListener) {
    this.msgListeners.push({
      filters: [...this.globalFilters, ...filters],
      listener
    })
  }
  registerRequest (filters: RequestFilter[], listener: RequestListener) {
    this.reqListeners.push({
      filters: [...this.globalFilters, ...filters],
      listener
    })
  }

  privateFilter: MessageFilter = (e) => {
    return e.messageType === BotMessageType.Private
  }
  atMeFilter: MessageFilter = (e) => {
    const atMe = `[CQ:at,qq=${e.selfId}]`
    if (e.message.includes(atMe)) {
      e.message = e.message.replace(atMe, '')
      return true
    }
    return false
  }
  startsWithFilter (str: string): MessageFilter {
    return (e) => {
      if (e.message.startsWith(str)) {
        e.message = e.message.substr(str.length)
        return true
      }
      return false
    }
  }
  cmdFilter: MessageFilter = (e, next) => {
    const atMe = `[CQ:at,qq=${e.selfId}]`
    const cmdPrefix = '.'
    if (e.message.includes(atMe)) {
      e.message = e.message.replace(atMe, '')
      return true
    }
    if (e.message.startsWith(cmdPrefix)) {
      e.message = e.message.substr(cmdPrefix.length)
      return true
    }
    return false
  }
  groupTypeFilter: MessageFilter = (e) => {
    return e.messageType === BotMessageType.Group
  }
  protected runFilter<T extends BotPostType> (e: BotEventMap[T], f: BotFilter<T>[], def = true) {
    const runner = (i: number): boolean => {
      if (i > f.length - 1) {
        return def
      }
      let ranNext = false
      const next = () => {
        ranNext = true
        return runner(i + 1)
      }
      const ret = f[i](e, next)
      if (ret && !ranNext) {
        return next()
      }
      return ret
    }

    return runner(0)
  }
  protected async onMessage (e: CQEvent, c: Record<string, any>) {
    e.stopPropagation()
    const event = CQMessage2BotEvent(c)
    if (event === undefined) return

    let ret: string | undefined | void
    try {
      for (let listener of this.msgListeners) {
        const e: BotMessageEvent = Object.assign({}, event)
        if (this.runFilter(e, listener.filters)) {
          ret = await listener.listener(e)
          if (typeof ret === 'string') {
            break
          }
        }
      }
    } catch (e) {
      console.error(e)
    }

    if (ret === '') {
      ret = undefined
    }
    if (IsDebug) {
      if (typeof ret === 'string') {
        ret = `${DebugPrefix}${ret}`
      }
    }
    return ret
  }
  protected async onBotRequest<T extends BotPostType> (event: BotEventMap[T], listeners: FilterListener<T>[]) {
    for (let listener of listeners) {
      let e: BotEventMap[T] = Object.assign({}, event)
      if (this.runFilter(e, listener.filters)) {
        await listener.listener(e)
      }
    }
  }
  protected async onRequest (c: Record<string, any>) {
    const event = CQRequest2BotEvent(c)
    if (event === undefined) return

    try {
      this.onBotRequest(event, this.reqListeners)
    } catch (e) {
      console.error(e)
    }
  }
}

export class TSBot {
  private bot: CQWebSocket
  private modules: BotModule[] = []
  private bus: TSBotEventBus
  isPro: boolean = false

  constructor (opt?: Partial<CQWebSocketOption>) {
    let globalFilters: AnyFilter[] = []
    globalFilters.push(this.debugFilter)
    const bot = new CQWebSocket(opt)
    this.bus = new TSBotEventBus(bot, globalFilters)
    if (IsDebug) {
      this.bus.registerMessage([], e => {
        if (e.message === '') {
          return 'Debug mode is on'
        }
      })
    }

    bot.on('socket.connecting', function (wsType, attempts) {
      console.log('嘗試第 %d 次連線 _(:з」∠)_', attempts)
    }).on('socket.connect', function (wsType, sock, attempts) {
      console.log('第 %d 次連線嘗試成功 ヽ(✿ﾟ▽ﾟ)ノ', attempts)
    }).on('socket.failed', function (wsType, attempts) {
      console.log('第 %d 次連線嘗試失敗 。･ﾟ･(つд`ﾟ)･ﾟ･', attempts)
    }).on('socket.error', (type, err) => {
      console.error('socket.error', err.toString())
    })

    this.bot = bot
  }
  connect () {
    this.init()
    this.bot.connect()
  }
  registerModule (mod: BotModule) {
    this.modules.push(mod)
  }
  send<T> (method: string, params?: Record<string, any>, options?: number | CQRequestOptions) {
    return this.bot<T>(method, params, options)
  }
  sendPrivateMessage (qq: number, message: string) {
    if (IsDebug) {
      message = `${DebugPrefix}${message}`
    }
    return this.bot('send_private_msg', {
      user_id: qq,
      message,
      auto_escape: true
    })
  }
  exit () {
    this.bot.disconnect()
  }
  get isDebug () {
    return IsDebug
  }

  atStr (qq: number | string) {
    return `[CQ:at,qq=${qq}]`
  }

  protected debugFilter (e: BotEvent) {
    if (isBotMessageEvent(e)) {
      if (IsDebug) {
        if (e.message.startsWith(DebugPrefix)) {
            e.message = e.message.substr(DebugPrefix.length)
            return true
        }
        return false
      } else {
        if (e.message.startsWith(DebugPrefix)) {
          return false
        }
        return true
      }
    } else {
      return true
    }
  }
  protected helpFilter (e: BotMessageEvent) {
    const { message } = e
    const keyword = ['help', '帮助', '?', '使用说明']

    for (let k of keyword) {
      if (message.includes(k)) {
        return true
      }
    }

    return false
  }
  protected init () {
    this.bus.registerMessage([this.bus.cmdFilter, this.helpFilter], e => this.onHelp(e))
    for (let m of this.modules) {
      m.init(this, this.bus)
    }
  }
  protected onHelp (e: BotMessageEvent) {
    return this.modules.map(m => m.help(e)).filter(s => s.length > 0).join('\n\n')
  }
}

function CQMessage2BotEvent (c: Record<string, any>): BotMessageEvent | undefined {
  if (c.post_type !== 'message') {
    return
  }
  let ret: BotMessageEvent = {
    postType: c.post_type,
    groupId: c.group_id,
    message: c.message,
    messageId: c.message_id,
    messageType: c.message_type,
    // https://github.com/richardchien/coolq-http-api/blob/637fb9989c3d32a0f96f597ca7775927ba95c37a/src/cqsdk/utils/string.cpp#L91
    // we don't need raw_message
    // rawMessage: c.raw_message,
    selfId: c.self_id,
    time: c.time,
    userId: c.user_id
  }
  return ret
}
function CQRequest2BotEvent (c: Record<string, any>): BotRequestEvent | undefined {
  if (c.post_type !== 'request') {
    return
  }
  let ret: BotRequestEvent = {
    postType: c.post_type,
    selfId: c.self_id,
    time: c.time,
    requestType: c.request_type,
    userId: c.user_id,
    comment: c.comment,
    flag: c.flag,
    subType: c.sub_type,
    groupId: c.group_id
  }
  return ret
}
function isBotMessageEvent (e: BotEvent): e is BotMessageEvent {
  return e.postType === BotPostType.Message
}

function isBotRequestEvent (e: BotEvent): e is BotRequestEvent {
  return e.postType === BotPostType.Request
}
