import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'
import { isCQCode, cqParse } from '../utils/cqcode'

interface RepeatInfo {
  lastMessage: string,
  repeatTime: number,
  sent: boolean
}

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms))

export class Repeater extends BaseBotModule {
  id = 'repeater'
  map: Map<number, RepeatInfo> = new Map()
  name = '复读机'
  defaultEnable = false

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    bus.registerMessage([bus.groupTypeFilter], e => this.onMsg(e))
  }
  onMsg (e: BotMessageEvent) {
    this.onMessage(e)
    return
  }
  async onMessage (e: BotMessageEvent) {
    const randomTimes = Math.floor(Math.random() * 4 + 3)
    const groupId = e.groupId!
    const { message } = e
    const list = cqParse(message)

    const blackType = ['at', 'share', 'music', 'anonymous', 'record']
    if (list.some(i => isCQCode(i) && blackType.includes(i.type)) ) {
      return
    }

    if (Math.floor(Math.random() * 100) === 50) {
      console.log('lucky repeat', message)
      this.bot.send('send_msg', {
        message_type: 'group',
        group_id: groupId,
        message
      })
      return
    }

    let info = this.map.get(groupId)
    if (!info) {
      info = {
        lastMessage: '',
        repeatTime: 0,
        sent: true
      }
      this.map.set(groupId, info)
    }

    if (message == info.lastMessage) {
      info.repeatTime++
    } else {
      info.repeatTime = 0
      info.lastMessage = message
      info.sent = false
    }

    if (!info.sent) {
      if (info.repeatTime > randomTimes) {
        const randomSleep = (Math.random() * 5 + 5) * 1000
        info.repeatTime = 0
        const { lastMessage } = info

        await sleep(randomSleep)
        if (!info.sent && lastMessage === info.lastMessage) {
          this.bot.send('send_msg', {
            message_type: 'group',
            group_id: groupId,
            message: info.lastMessage
          })
          info.sent = true
        }
      }
    }
  }
  help () {
    return ''
  }
}
