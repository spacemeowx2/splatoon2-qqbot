import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'
import { cqParse, isCQCode, CQCode } from '../utils/cqcode'
import { randomIn } from '../utils/helpers'

export class ThankRedpack extends BaseBotModule {
  id = 'thank-redpack'
  name = ''
  defaultEnable = false
  notifyQQ: number[] = []

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    bus.registerMessage([bus.privateFilter], e => this.onMsg(e))
  }
  async onMsg (e: BotMessageEvent) {
    const list = cqParse(e.message)
    const hb = list.filter(i => isCQCode(i) && i.type === 'hb') as CQCode[]
    if (hb.length > 0) {
      for (let qq of this.notifyQQ) {
        await this.bot.sendPrivateMessage(qq, `${e.userId} 给我发送了红包 [${hb.map(i => i.data.title).join(',')}]`)
      }
      return randomIn([
        '谢谢你发的红包! 我会告诉空格哒!',
        '好感+1, 好感+1...',
        '么么哒!!!',
        '感谢你的支持~',
        '我以后会更加努力哒 0v0'
      ])
    }
  }
  help () {
    return ''
  }
}
