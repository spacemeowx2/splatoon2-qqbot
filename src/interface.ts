import { TSBot, TSBotEventBus } from './tsbot'
import { BotStorage } from './storage'
import { BotFile } from './file'
export * from './tsbot'

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

export interface BotEventMap {
  [BotPostType.Message]: BotMessageEvent
  [BotPostType.Request]: BotRequestEvent
  [BotPostType.Any]: BotMessageEvent | BotRequestEvent
}
export interface BotListenerReturnMap {
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

export interface BotModuleInitContext {
  bot: TSBot
  bus: TSBotEventBus
  storage: BotStorage
  file: BotFile
  deps: Record<string, BotModule>
}
export interface BotModule {
  id: string
  name: string
  defaultEnable: boolean
  init (ctx: BotModuleInitContext): void
  getDeps (): Record<string, BotModuleFactory>
  help (e: BotMessageEvent): string
}
export type BotModuleFactory = { new (): BotModule }
export abstract class BaseBotModule implements BotModule {
  protected bot!: TSBot
  protected storage!: BotStorage
  protected file!: BotFile
  abstract id: string
  abstract name: string
  defaultEnable = true
  init (ctx: BotModuleInitContext) {
    this.bot = ctx.bot
    this.storage = ctx.storage
    this.file = ctx.file
  }
  getDeps () {
    return {}
  }
  abstract help (e: BotMessageEvent): string
}

export function isBotMessageEvent (e: BotEvent): e is BotMessageEvent {
  return e.postType === BotPostType.Message
}

export function isBotRequestEvent (e: BotEvent): e is BotRequestEvent {
  return e.postType === BotPostType.Request
}
