import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'
import { cqGetString, cqStringify } from '../utils/cqcode'
import { getImage } from '../utils/getImage'

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
    message = cqGetString(message).trim()
    if (re.test(message)) {
      console.log(`send pic ${message}`)
      return cqStringify(getImage(message))
    }
  }
  help () {
    return '.pic 图片地址'
  }
}
