import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'
import { AdminControl } from './admin-control'
export class LiveNotification extends BaseBotModule {
  id = 'live-notification'
  name = '直播提醒'
  defaultEnable = true
  private admin!: AdminControl

  getDeps () {
    return {
      'admin': AdminControl
    }
  }
  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus, deps } = ctx
    this.admin = deps.admin as AdminControl

    bus.registerMessage([bus.atMeFilter], e => this.onMessage(e))
  }
  async onMessage (e: BotMessageEvent) {
    const { message } = e
    const splited = message.split(',')
    const cmd = splited[0]
    const groupStor = this.storage.getChild(e.groupId!.toString())

    switch (cmd) {
      case '直播提醒': {
        const url = splited[1]

        console.log('直播提醒', url)
        break
      }
    }
    console.log('LIVE', await this.admin.isAdmin(e.groupId!, e.userId))
  }
  help () {
    return '直播提醒'
  }
}
