import { TSBot, TSBotEventBus, BotMessageEvent } from './tsbot'
export * from './tsbot'

export interface BotModule {
  id: string
  name: string
  defaultEnable: boolean
  init (bot: TSBot, bus: TSBotEventBus): void
  getDeps (): Record<string, BotModuleFactory>
  setDeps (deps: Record<string, BotModule>): void
  help (e: BotMessageEvent): string
}
export type BotModuleFactory = { new (): BotModule }
export abstract class BaseBotModule implements BotModule {
  protected bot!: TSBot
  abstract id: string
  abstract name: string
  defaultEnable = true
  init (bot: TSBot, bus: TSBotEventBus) {
    this.bot = bot
  }
  getDeps () {
    return {}
  }
  setDeps (deps: Record<string, BotModule>) {
    // do nothing
  }
  abstract help (e: BotMessageEvent): string
}
