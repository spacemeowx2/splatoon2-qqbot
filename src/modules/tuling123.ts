import { BaseBotModule, BotMessageEvent, BotMessageType, BotModuleInitContext } from '../interface'
import axios from 'axios'

export class Tuling123 extends BaseBotModule {
  id = 'tuling123'
  name = '智障对话(图灵123)'

  constructor (private apiKey: string) {
    super()
  }
  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    bus.registerMessage([bus.atMeFilter], e => this.onMessage(e))
  }
  async onMessage (e: BotMessageEvent) {
    if (e.groupId === 240906453) {
      return
    }
    const { message } = e
    const resp = await axios.post(`http://openapi.tuling123.com/openapi/api/v2`, {
      reqType: 0,
      perception: {
        inputText: {
          text: message
        }
      },
      userInfo: {
        apiKey: this.apiKey,
        userId: e.userId,
        groupId: e.groupId
      }
    })
    let results: any[] = resp.data.results
    results = results.filter(i => i.resultType === 'text').map(i => i.values.text)
    let msg = results.join('\n')
    console.log(msg)
    return `${this.bot.atStr(e.userId)} ${msg}`
  }
  help (e: BotMessageEvent) {
    if (e.messageType === BotMessageType.Group) {
      if (e.groupId === 240906453) {
        return ''
      }
      return '@bot "想说的话" (由 图灵123 提供 API )'
    }
    return ''
  }
}
