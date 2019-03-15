import CQWebSocket, { CQEvent, CQWebSocketOption, CQRequestOptions } from 'cq-websocket'
import { BotModule, BotModuleInitContext } from './interface'
import { BotStorageService } from './storage'
import { BotFileService } from './file'
import { cqGetString, cqParse, CQMessageList } from './utils/cqcode'
const DebugPrefix = 'debug '
const IsDebug = !!process.env.BOT_DEBUG
const ConfigPath = process.env.BOT_CONFIG_PATH || './config.json'

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

export type BotFilterContext = {
  abort: (r: boolean) => void
  module: BotModule
}
export type BotFilter<T extends BotPostType> = (event: BotEventMap[T], ctx: BotFilterContext) => boolean
export type MessageFilter = BotFilter<BotPostType.Message>
export type RequestFilter = BotFilter<BotPostType.Request>
export type AnyFilter = BotFilter<BotPostType.Any>
export interface FilterListener<T extends BotPostType> {
  filters: BotFilter<T>[]
  listener: BotListener<T>
  module: BotModule
}
export type MessageFilterListener = FilterListener<BotPostType.Message>
export type RequestFilterListener = FilterListener<BotPostType.Request>
export type MessageModifier = (message: string) => string

export class TSBotEventBus {
  constructor (public bus: BotEventBus, private module: BotModule) {
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
    this.bus.registerMessage(this.module, filters, listener)
  }
  registerRequest (filters: RequestFilter[], listener: RequestListener) {
    this.bus.registerRequest(this.module, filters, listener)
  }

  privateFilter: MessageFilter = (e) => {
    return e.messageType === BotMessageType.Private
  }
  atMeFilter: MessageFilter = (e) => {
    const atMe = `[CQ:at,qq=${e.selfId}]`
    if (e.message.includes(atMe)) {
      e.message = e.message.replace(atMe, '').trim()
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
  cmdFilter: MessageFilter = (e, abort) => {
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
}
class BotEventBus {
  private msgListeners: MessageFilterListener[] = []
  private reqListeners: RequestFilterListener[] = []
  msgModifier: MessageModifier[] = []
  constructor (bot: CQWebSocket, public globalFilters: BotFilter<BotPostType.Any>[] = []) {
    bot.on('message', (e, c) => this.onMessage(e, c))
    bot.on('request', (c) => this.onRequest(c))
  }
  registerMessage (m: BotModule, filters: MessageFilter[], listener: MessageListener) {
    this.msgListeners.push({
      filters,
      listener,
      module: m
    })
  }
  registerRequest (m: BotModule, filters: RequestFilter[], listener: RequestListener) {
    this.reqListeners.push({
      filters,
      listener,
      module: m
    })
  }

  protected runFilter<T extends BotPostType> (e: BotEventMap[T], listener: FilterListener<T>, def = true) {
    const { filters, module } = listener
    const allFilters: AnyFilter[] = [...this.globalFilters, ...filters] as any
    for (let f of allFilters) {
      let isAbort = false
      let abortResult: boolean
      const abort = (r: boolean) => {
        isAbort = true
        abortResult = r
      }
      const ctx = {
        abort,
        module
      }
      const ret = f(e, ctx)
      if (isAbort) {
        return abortResult!
      }
      if (ret === false) {
        return ret
      }
    }
    return def
  }
  protected async onMessage (e: CQEvent, c: Record<string, any>) {
    e.stopPropagation()
    const event = CQMessage2BotEvent(c)
    if (event === undefined) return

    let ret: string | undefined | void
    try {
      for (let listener of this.msgListeners) {
        const e: BotMessageEvent = Object.assign({}, event)
        if (this.runFilter(e, listener)) {
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
      if (this.runFilter(e, listener)) {
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

export class TSBot implements BotModule {
  private bot: CQWebSocket
  private modules: BotModule[] = [this]
  private bus: BotEventBus
  private storage: BotStorageService = new BotStorageService(ConfigPath)
  private file = new BotFileService(process.env.BOT_FILE_ROOT || './storage/')
  isPro: boolean = false
  id = 'core'
  name = '核心模块'
  defaultEnable = true

  constructor (opt?: Partial<CQWebSocketOption>) {
    let globalFilters: AnyFilter[] = []
    globalFilters.push(this.debugFilter)
    const bot = new CQWebSocket(opt)
    this.bus = new BotEventBus(bot, globalFilters)

    bot.on('socket.connecting', (wsType, attempts) => {
      console.log('嘗試第 %d 次連線 _(:з」∠)_', attempts)
    }).on('socket.connect', (wsType, sock, attempts) => {
      console.log('第 %d 次連線嘗試成功 ヽ(✿ﾟ▽ﾟ)ノ', attempts)
    }).on('socket.failed', (wsType, attempts) => {
      console.log('第 %d 次連線嘗試失敗 。･ﾟ･(つд`ﾟ)･ﾟ･', attempts)
    }).on('socket.error', (type, err) => {
      console.error('socket.error', err.toString())
    })

    this.bot = bot
  }
  async connect () {
    await this.storage.load()
    this.initModules()
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
  sendGroupMessage (gid: number, message: string) {
    if (IsDebug) {
      message = `${DebugPrefix}${message}`
    }
    return this.bot('send_group_msg', {
      group_id: gid,
      message,
      auto_escape: true
    })
  }
  getModules (): BotModule[] {
    return this.modules
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

  getDeps () {
    return {}
  }
  init (ctx: BotModuleInitContext) {
    const { bus } = ctx
    if (IsDebug) {
      bus.registerMessage([], e => {
        if (e.message === '') {
          return 'Debug mode is on'
        }
      })
    }
    bus.registerMessage([bus.cmdFilter, this.helpFilter], e => this.onHelp(e))
  }
  help () {
    return ''
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
    const msg = cqGetString(e.message)
    const keyword = ['help', '帮助', '?', '使用说明']

    for (let k of keyword) {
      if (msg.includes(k)) {
        return true
      }
    }

    return false
  }
  protected initModules () {
    const moduleFile = this.file.getChild('module')
    const moduleStorage = this.storage.getChild('module')
    for (let m of this.modules) {
      const depsType = m.getDeps()
      let deps: Record<string, BotModule> = {}

      for (let [k, v] of Object.entries(depsType)) {
        const r = this.modules.find((module) => module instanceof v)
        if (r) {
          deps[k] = r
        }
      }

      const ctx = {
        bot: this,
        bus: new TSBotEventBus(this.bus, m),
        storage: moduleStorage.getChild(m.id),
        file: moduleFile.getChild(m.id),
        deps
      }
      m.init(ctx)
    }
    const myBus = new TSBotEventBus(this.bus, this)
    myBus.registerPrivate(e => this.onHelp(e))
  }
  protected onHelp (e: BotMessageEvent) {
    return this.modules.map(m => {
      const h = m.help(e)
      if (h.length > 0) {
        return `${m.name}:\n${m.help(e)}`
      }
    }).filter(s => s).join('\n\n')
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
export function isBotMessageEvent (e: BotEvent): e is BotMessageEvent {
  return e.postType === BotPostType.Message
}

export function isBotRequestEvent (e: BotEvent): e is BotRequestEvent {
  return e.postType === BotPostType.Request
}
