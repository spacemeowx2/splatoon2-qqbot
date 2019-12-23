import axios from 'axios'
import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'
import { cqCode, cql } from '../utils/cqcode'
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
  map: Map<number, number | undefined> = new Map()

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    bus.registerMessage([bus.groupTypeFilter, bus.startsWithFilter('.色图')], e => this.onMsg(e))
  }
  checkDelay(groupId: number) {
    const now = Math.floor(Date.now() / 1000)

    const time = this.map.get(groupId)
    if (now - (time || 0) >= 60) {
      this.map.set(groupId, now)
      return true
    }
    return false
  }
  async onMsg (e: BotMessageEvent) {
    console.log('SeTu', e.userId)
    if (!this.checkDelay(e.groupId!)) {
      return cql`${cqCode('at', { qq: e.userId.toString() })} 不要太频繁`
    }
    const h = new Date().getHours()
    if (h >= 0 && h <= 6) {
      try {
        const setu = await axios.get<Response>('https://api.lolicon.app/setu/?size1200=true')

        return cql`${cqCode('at', { qq: e.userId.toString() })} ${await getImage(setu.data.data[0].url)}`
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
