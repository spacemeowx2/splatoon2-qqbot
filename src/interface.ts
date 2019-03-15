import { TSBot, TSBotEventBus, BotMessageEvent } from './tsbot'
import { BotStorage } from './storage'
import { BotFile } from './file'
export * from './tsbot'

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
