import { BaseBotModule, TSBot, TSBotEventBus, BotMessageEvent, MessageFilter } from '../interface'

export class Eval extends BaseBotModule {
  id = 'eval'
  name = 'eval(任意代码执行)'
  defaultEnable = false

  init (bot: TSBot, bus: TSBotEventBus) {
    super.init(bot, bus)
    bus.registerMessage([bus.startsWithFilter('.eval ')], e => this.onMsg(e))
  }
  onMsg (e: BotMessageEvent) {
    console.log('eval', e.message)
    try {
      return JSON.stringify(eval(e.message))
    } catch (e) {
      return 'Error: ' + e.toString()
    }
  }
  help () {
    return '代码执行: .eval <命令>'
  }
}
