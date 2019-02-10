import { TSBot, TSBotEventBus, BotMessageEvent } from './tsbot'
import { BotStorage } from './storage'
export * from './tsbot'

export interface BotModuleInitContext {
  bot: TSBot
  bus: TSBotEventBus
  storage: BotStorage
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
  abstract id: string
  abstract name: string
  defaultEnable = true
  init (ctx: BotModuleInitContext) {
    this.bot = ctx.bot
    this.storage = ctx.storage
  }
  getDeps () {
    return {}
  }
  abstract help (e: BotMessageEvent): string
}
