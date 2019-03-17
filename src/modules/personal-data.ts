import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'
import { cqStringify, CQMessageList, isCQCode, CQCode, cqParse } from '../utils/cqcode'
import { BotStorage } from '../storage'
import axios from 'axios'
import { arrayBufferToBuffer } from '../utils/helpers'
const LocalImageType = 'local_image_type'

export class PersonalData extends BaseBotModule {
  id = 'personal-data'
  name = '个人档'
  stor!: BotStorage<string | CQMessageList>

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus, storage } = ctx
    this.stor = storage
    bus.registerMessage([bus.atMeFilter, bus.startsWithFilter('个人档')], e => this.onGet(e))
    bus.registerMessage([bus.atMeFilter, bus.startsWithFilter('设置个人档')], e => this.onSet(e))
    bus.registerMessage([bus.atMeFilter, bus.startsWithFilter('清空个人档')], e => this.onClear(e))
  }

  private reply(e: BotMessageEvent, ...s: CQMessageList) {
    return `${this.bot.atStr(e.userId)} ${cqStringify(s)}`
  }
  private async onGet (e: BotMessageEvent) {
    let r = this.stor.get(`qq${e.userId}`)

    if (r === undefined) {
      return this.reply(e, '你还没有设置个人档, 发送 @bot 设置个人档 + 内容 即可设置')
    }

    let msg: CQMessageList
    if (typeof r === 'string') {
      msg = [r]
    } else {
      msg = r
    }

    msg = await Promise.all(msg.map(async (i) => {
      if (isCQCode(i)) {
        if (i.type !== LocalImageType) {
          throw new Error('illegal cqcode')
        }
        return new CQCode('image', {
          file: `base64://${ (await this.file.read(i.data['key'])).toString('base64') }`
        })
      } else {
        return i
      }
    }))

    return this.reply(e, ...msg)
  }
  private async onSet (e: BotMessageEvent) {
    const key = `qq${e.userId}`
    const list = cqParse(e.message).filter(i => isCQCode(i) ? i.type === 'image' : true)
    const picCount = list.filter(i => isCQCode(i) && i.type === 'image').length

    if (picCount > 1) {
      return this.reply(e, `最多只能存一张图片噢 你发了${picCount}张`)
    }

    const imageCode = list.find(i => isCQCode(i)) as CQCode | undefined
    if (imageCode !== undefined) {
      const imgUrl = imageCode.data.url
      const img = await axios.get<ArrayBuffer>(imgUrl, {
        responseType: 'arraybuffer'
      })
      await this.file.write(key, arrayBufferToBuffer(img.data))
    }

    const saveList = list.map(i => isCQCode(i) ? new CQCode(LocalImageType, { key }) : i)

    this.stor.set(key, saveList)

    return this.reply(e, '设置个人档成功: ', ...list)
  }
  private onClear (e: BotMessageEvent) {
    this.stor.del(`qq${e.userId}`)
    return this.reply(e, '清除成功')
  }

  help () {
    return `个人档跨群保存, 仅支持文字或一张图片
呼出个人档: @bot 个人档
设置个人档: @bot 设置个人档 + 内容
清空个人档: @bot 清空个人档`
  }
}
