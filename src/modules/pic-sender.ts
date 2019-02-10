import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'
import axios from 'axios'

export class PictureSender extends BaseBotModule {
  id = 'pic-sender'
  name = '图片发送器'
  defaultEnable = true

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx

    bus.registerStartsWith('.pic', e => this.onMessage(e))
  }
  async onMessage (e: BotMessageEvent) {
    const re = /^https?:\/\//
    let { message } = e
    message = message.trim()
    if (re.test(message)) {
      console.log(`send pic ${message}`)
      return `[CQ:image,file=${message}]`
    }
  }
  help () {
    return '.pic 图片地址'
  }
}
