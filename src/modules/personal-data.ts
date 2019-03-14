import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'
import { cqGetString } from '../utils/cqcode'

export class PersonalData extends BaseBotModule {
  id = 'personal-data'
  name = '个人档'

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    bus.registerMessage([bus.atMeFilter, bus.startsWithFilter('个人档')], e => this.onGet(e))
    bus.registerMessage([bus.atMeFilter, bus.startsWithFilter('设置个人档')], e => this.onSet(e))
    bus.registerMessage([bus.atMeFilter, bus.startsWithFilter('清空个人档')], e => this.onClear(e))
  }

  private onGet (e: BotMessageEvent) {
    const r = this.storage.get<string>(`qq${e.userId}`)
    if (r === undefined) {
      return `${this.bot.atStr(e.userId)} 你还没有设置个人档, 发送 @bot 设置个人档 + 内容即可设置`
    }

    return `${this.bot.atStr(e.userId)} ${r}`
  }
  private onSet (e: BotMessageEvent) {
    const msg = cqGetString(e.message).trim()
    this.storage.set(`qq${e.userId}`, msg)

    return `${this.bot.atStr(e.userId)} 设置个人档成功: ${msg}`
  }
  private onClear (e: BotMessageEvent) {
    this.storage.del(`qq${e.userId}`)
    return `${this.bot.atStr(e.userId)} 清除成功`
  }

  help () {
    return `个人档跨群保存, 仅支持文字
呼出个人档: @bot 个人档
设置个人档: @bot 设置个人档 + 内容
清空个人档: @bot 清空个人档`
  }
}
