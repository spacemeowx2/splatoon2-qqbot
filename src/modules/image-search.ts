import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'
// @ts-ignore
import Flickr from 'flickrapi'
import { promisify } from 'util'
import { pick } from '../utils/helpers'
import axios from 'axios'

export class ImageSearch extends BaseBotModule {
  id = 'imagesearch'
  name = '图片搜索'
  defaultEnable = true
  flickr: any

  constructor (private apiKey: string) {
    super()
    this.flickr = promisify(Flickr.tokenOnly)({
      api_key: apiKey
    })
  }
  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    bus.registerMessage([bus.atMeFilter, this.searchFilter], e => this.onMsg(e))
  }
  async onMsg (e: BotMessageEvent) {
    console.log(`search image ${e.message}`)
    try {
      this.flickr = await this.flickr
    } catch {
      console.error('error when await flickr')
      return
    }
    let result = await promisify(this.flickr.photos.search)({
      text: e.message,
      extras: 'url_n'
    })
    const photo = pick<any>(result.photos.photo)
    const res = await axios.get(photo.url_n, {
      responseType: 'arraybuffer'
    })
    const buf = Buffer.from(new Uint8Array(res.data))

    console.log(`search done. size: ${buf.byteLength}`)

    return `[CQ:image,file=base64://${buf.toString('base64')}]`
  }
  searchFilter (e: BotMessageEvent) {
    if (e.message.endsWith('图片')) {
      e.message = e.message.substring(0, e.message.length - 2)
      return true
    }
    return false
  }
  help () {
    return '图片搜索: @SB {想搜的关键字}图片'
  }
}
