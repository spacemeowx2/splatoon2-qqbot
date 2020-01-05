import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'

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
  async onMsg (e: BotMessageEvent) {
    return '亏我这么信任你们. 这个功能永久下线了.'
  }
  help () {
    return ''
  }
}
