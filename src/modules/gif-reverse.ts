import { BaseBotModule, BotMessageEvent, BotModuleInitContext, BotMessageType } from '../interface'
import { cqGetString, cqParse, CQCode, cqStringify } from '../utils/cqcode'
import axios from 'axios'
import { arrayBufferToBuffer } from '../utils/helpers'
import { spawn } from 'child_process'

async function getReverse (url: string): Promise<Buffer> {
  const ffmpeg = spawn('ffmpeg', [
    '-i', url,
    '-filter_complex', '[0:v]reverse,fifo[r];[0:v]palettegen[PAL];[r][PAL] paletteuse',
    '-f', 'gif',
    'pipe:1'
  ])
  let stdout: Buffer[] = []
  let stderr = ''
  ffmpeg.stderr.setEncoding('utf-8')
  ffmpeg.stdout.on('data', i => stdout.push(i))
  ffmpeg.stderr.on('data', i => stderr += i)
  if (stderr) {
    // console.error(stderr)
  }
  const code = await new Promise<number>((resolve, reject) => {
    ffmpeg.on('error', reject)
    ffmpeg.on('close', resolve)
  })
  if (code === 0) {
    return Buffer.concat(stdout)
  } else {
    throw new Error('reverse error:' + stderr)
  }
}

async function main () {
  // return await getReverse(buffer)
}
main().catch(e => console.error(e))

export class GifReverse extends BaseBotModule {
  id = 'gif-reverse'
  name = '倒放gif'
  defaultEnable = true
  lastMessage = new Map<number, string>()

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    bus.registerMessage([bus.groupTypeFilter], e => this.onMsg(e))
  }
  private async getGif (message: string) {
    const list = cqParse(message).filter(i => typeof i !== 'string') as CQCode[]
    const img = list.filter(i => i.type === 'image').shift()
    try {
      if (img) {
        const imgUrl = img.data.url
        const resp = await axios.get<ArrayBuffer>(imgUrl, {
          responseType: 'arraybuffer',
          headers: {
            Range: 'bytes=0-5'
          }
        })
        const data = arrayBufferToBuffer(resp.data)
        console.log(data.byteLength)
        if (
          (data.readInt32BE(0) === 0x47494638) &&
            (data.readInt16BE(4) === 0x3961 || data.readInt16BE(4) === 0x3761)) {
          return imgUrl
        }
      }
    } catch (e) {
      console.error(e)
    }
    return null
  }
  private async onMsg (e: BotMessageEvent) {
    if (e.messageType !== BotMessageType.Group) {
      return
    }
    const groupId = e.groupId!
    const lastMessage = this.lastMessage.get(groupId)
    const { message } = e
    const str = cqGetString(message)

    if (str.trim() === '倒放') {
      let gif = await this.getGif(message)
      if (!gif && lastMessage) {
        gif = await this.getGif(lastMessage)
      }
      console.log('get gif', gif, message, lastMessage)
      if (gif) {
        try {
          const reversed = await getReverse(gif)
          if (reversed.byteLength > 10 * 1024 * 1024) {
            // bigger than 10MB
            return cqStringify([
              new CQCode('at', { qq: e.userId.toString() }),
              '生成的图片太大啦, 发不出去...'
            ])
          }
          return cqStringify([
            new CQCode('at', { qq: e.userId.toString() }),
            new CQCode('image', {
              file: `base64://${reversed.toString('base64')}`
            })
          ])
        } catch (e) {
          console.error(e)
        }
      } else {
        this.lastMessage.set(groupId, '')
        return '没找到要倒放的gif图...'
      }
    } else {
      this.lastMessage.set(groupId, message)
    }
  }
  help () {
    return '倒放gif: @bot 倒放, 会倒放该消息或者上一条消息的gif'
  }
}
