import { BaseBotModule, BotMessageEvent, BotModuleInitContext, BotMessageType } from '../interface'
import { cqGetString, cqParse, CQCode, cqStringify } from '../utils/cqcode'
import axios from 'axios'
import { arrayBufferToBuffer } from '../utils/helpers'
import { spawn } from 'child_process'
import { bufferToStream } from '../utils/bufferToStream'

async function getReverse (gif: Buffer): Promise<Buffer> {
  const im = spawn('convert', [
    '-',
    '-coalesce',
    '-reverse',
    '-layers', 'OptimizePlus',
    '-'
  ])
  let stdout: Buffer[] = []
  let stderr = ''
  im.stderr.setEncoding('utf-8')
  im.stdout.on('data', i => stdout.push(i))
  im.stderr.on('data', i => stderr += i)
  if (stderr) {
    console.error(stderr)
  }
  bufferToStream(gif).pipe(im.stdin)
  const code = await new Promise<number>((resolve, reject) => {
    im.on('error', reject)
    im.on('close', resolve)
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
      console.log(groupId, 'get gif', gif, message, lastMessage, 'from')
      if (gif) {
        try {
          const gifBuf = await axios.get<Buffer>(gif, {
            responseType: 'arraybuffer'
          })
          const reversed = await getReverse(gifBuf.data)
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
