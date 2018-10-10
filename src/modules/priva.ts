import { BaseBotModule, BotMessageEvent, BotMessageType, BotModuleInitContext } from '../interface'
import ZerorpcClient from '../utils/zerorpc_client';
const privaRe = /^开始(.*)私房(.*)$/

type PrivaNames = { [lang: string]: string }
type PrivaTypes = { [typeName: string]: PrivaNames }

export class Priva extends BaseBotModule {
  id = 'priva'
  name = '私房'
  privaTypes: PrivaTypes = {}
  language = 'zh_CN'
  privaRPC: ZerorpcClient | null = null

  init(ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    if (process.env.PRIVA_HOST) {
      const host = 'tcp://' + process.env.PRIVA_HOST
      this.privaRPC = new ZerorpcClient(host)
      this.updatePrivaTypes()
    }
    bus.registerMessage([bus.atMeFilter,], e => this.onPriva(e))
    bus.registerMessage([bus.atMeFilter, this.privaFilter], e => this.onPriva(e))
  }

  async updatePrivaTypes() {
    if (!this.privaRPC) {
      throw new Error('No Priva RPC client.')
    }
    try {
      [this.privaTypes, ] = await this.privaRPC.invoke<PrivaTypes>('list_priva_types')
    } catch (e) {
      console.log(e)
      throw e
    }
  }

  setLanguage(lang: string) {
    this.language = lang
  }

  privaFilter(e: BotMessageEvent): boolean {
    console.log(e.message)
    return privaRe.test(e.message)
  }
  onPriva(e: BotMessageEvent) {
    const { message } = e
    return
  }
  help(e: BotMessageEvent) {
    if (e.messageType === BotMessageType.Group) {
      const privaNames = Object.values(this.privaTypes)
        .map(x => x[this.language] || x['en'])
        .join(', ')
      return `语法：@bot 开始x私房
x ∈ {${privaNames}}`
    }
    return ''
  }
}
