import axios from 'axios'
import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'
import { cqStringify, cqCode } from '../utils/cqcode'
import { getImage } from '../utils/getImage'

interface Response {
  code: number
  data: {
    url: string
  }[]
}

export class SeTu extends BaseBotModule {
  id = 'SeTu'
  name = ''
  defaultEnable = true

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    bus.registerMessage([bus.startsWithFilter('.色图')], e => this.onMsg(e))
  }
  async onMsg (e: BotMessageEvent) {
    console.log('SeTu', e.userId)
    const h = new Date().getHours()
    if (h >= 0 && h <= 6) {
      try {
        const setu = await axios.get<Response>('https://api.lolicon.app/setu/?size1200=true')

        return cqStringify([await getImage(setu.data.data[0].url)])
      } catch (e) {
        return 'Error: ' + e.toString()
      }
    } else {
      return '现在还不是色图时间'
    }
  }
  help () {
    return ''
  }
}
