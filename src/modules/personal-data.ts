import { BaseBotModule, BotMessageEvent, BotModuleInitContext, MessageListener, TSBotEventBus } from '../interface'
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
    this.registerMessageHandleError(bus, '个人档', e => this.onGet(e))
    this.registerMessageHandleError(bus, '设置个人档', e => this.onSet(e))
    this.registerMessageHandleError(bus, '追加个人档', e => this.onAppend(e))
    this.registerMessageHandleError(bus, '清空个人档', e => this.onClear(e))
  }

  private registerMessageHandleError (bus: TSBotEventBus, startWith: string, f: MessageListener) {
    bus.registerMessage([bus.atMeFilter, bus.startsWithFilter(startWith)], async e => {
      let msg: string | void
      try {
        msg = await f(e)
      } catch (e) {
        msg = e.message
      }
      if (msg) {
        return `${this.bot.atStr(e.userId)} ${msg}`
      }
    })
    bus.registerMessage([bus.privateFilter, bus.startsWithFilter(startWith)], async e => {
      let msg: string | void
      try {
        msg = await f(e)
      } catch (e) {
        msg = e.message
      }
      return msg
    })
  }
  private mergeCQCode (msg: CQMessageList) {
    const ret: CQMessageList = []
    for (let i of msg) {
      if (ret.length === 0) {
        ret.push(i)
      } else {
        const l = ret[ret.length - 1]
        if (typeof l === 'string' && typeof i === 'string') {
          ret.push(ret.pop() + i)
        } else {
          ret.push(i)
        }
      }
    }
    return ret
  }
  private async localToCQCode (msg: CQMessageList) {
    return await Promise.all(msg.map(async (i) => {
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
  }
  private async CQCodeToLocal (msg: CQMessageList, key: string) {
    const list = msg.filter(i => isCQCode(i) ? (i.type === 'image' || i.type === LocalImageType) : true)
    const imageCodes = list.filter(i => isCQCode(i)) as CQCode[]

    if (imageCodes.length > 1) {
      throw new Error(`最多只能存一张图片噢 你存了${imageCodes.length}张`)
    }
    if (imageCodes.length === 1) {
      const [imageCode] = imageCodes
      const imgUrl = imageCode.data.url
      if (imgUrl) {
        // ignore local image type which doesn't have url
        const img = await axios.get<ArrayBuffer>(imgUrl, {
          responseType: 'arraybuffer'
        })
        await this.file.write(key, arrayBufferToBuffer(img.data))
      }
    }

    return this.mergeCQCode(list.map(i => isCQCode(i) ? new CQCode(LocalImageType, { key }) : i))
  }
  private async onGet (e: BotMessageEvent) {
    let r = this.stor.get(`qq${e.userId}`)

    if (r === undefined) {
      return '你还没有设置个人档, 发送 @bot 设置个人档 + 内容 即可设置'
    }

    let msg: CQMessageList
    if (typeof r === 'string') {
      msg = [r]
    } else {
      msg = r
    }

    return cqStringify(await this.localToCQCode(msg))
  }
  private async onSet (e: BotMessageEvent) {
    const key = `qq${e.userId}`
    const saveList = await this.CQCodeToLocal(cqParse(e.message), key)

    this.stor.set(key, saveList)

    return cqStringify(['设置个人档成功: ', ...await this.localToCQCode(saveList)])
  }
  private async onAppend (e: BotMessageEvent) {
    const key = `qq${e.userId}`
    const list = cqParse(e.message.trim())

    let r = this.stor.get(`qq${e.userId}`) || []

    let msg: CQMessageList
    if (typeof r === 'string') {
      msg = [r]
    } else {
      msg = r
    }

    if (msg.length > 0) {
      msg.push('\n')
    }

    const saveList = await this.CQCodeToLocal([...msg, ...list], key)

    this.stor.set(key, saveList)

    return cqStringify(['设置个人档成功: ', ...await this.localToCQCode(saveList)])
  }
  private onClear (e: BotMessageEvent) {
    this.stor.del(`qq${e.userId}`)
    return '清除成功'
  }

  help () {
    return `个人档跨群保存, 仅支持文字或一张图片
呼出个人档: @bot 个人档
设置个人档: @bot 设置个人档 + 内容
追加个人档: @bot 追加个人档 + 内容
清空个人档: @bot 清空个人档`
  }
}
