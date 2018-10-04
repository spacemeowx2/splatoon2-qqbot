import { BaseBotModule, TSBot, TSBotEventBus, BotMessageEvent } from '../interface'

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

  init (bot: TSBot, bus: TSBotEventBus) {
    super.init(bot, bus)
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

    console.log(info)
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
