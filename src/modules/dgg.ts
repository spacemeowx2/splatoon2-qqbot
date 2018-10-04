import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'

export class DingGG extends BaseBotModule {
  id = 'dgg'
  name = '顶瓜瓜'

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    bus.registerMessage([bus.atMeFilter], e => this.onMessage(e))
  }
  onMessage (e: BotMessageEvent) {
    if (e.message.includes('顶瓜瓜')) {
      return `[CQ:image,file=https://s1.ax1x.com/2018/09/29/iliBwR.jpg]`
    }
  }
  help () {
    return ''
  }
}
