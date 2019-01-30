import { createHash } from 'crypto'
import { BaseBotModule, BotMessageEvent, BotMessageType, BotModuleInitContext } from '../interface'
import axios from 'axios'

export enum ChatProvider {
  Tuling123,
  QQAI
}
interface Tuling123Auth {
  apiKey: string
}
interface QQAIAuth {
  appId: string
  appKey: string
}
interface ProviderAuthMap {
  [ChatProvider.Tuling123]: Tuling123Auth
  [ChatProvider.QQAI]: QQAIAuth
}

interface ChatBackend {
  onMessage (e: BotMessageEvent): Promise<string>
}

class Tuling123 implements ChatBackend {
  constructor (private apiKey: string) {}
  async onMessage(e: BotMessageEvent) {
    const { message } = e
    const resp = await axios.post(`http://openapi.tuling123.com/openapi/api/v2`, {
      reqType: 0,
      perception: {
        inputText: {
          text: message
        }
      },
      userInfo: {
        apiKey: this.apiKey,
        userId: e.userId,
        groupId: e.groupId
      }
    })
    let results: any[] = resp.data.results
    results = results.filter(i => i.resultType === 'text').map(i => i.values.text)
    let msg = results.join('\n')
    console.log(msg)
    return msg
  }
}

interface QQAIResp {
  ret: number
  msg: string
  data: {
    session: string
    answer: string
  }
}
class QQAI implements ChatBackend {
  constructor (private appId: number, private appKey: string) {}
  async onMessage (e: BotMessageEvent) {
    const { message } = e
    const req = this.getSignedData({
      session: this.md5(`${e.groupId}.${e.userId}`).substr(0, 16),
      question: message
    })
    const config = {
      headers: {
        'Contnet-Type': 'application/x-www-form-urlencoded'
      }
    }
    const resp = await axios.post<QQAIResp>(
      `https://api.ai.qq.com/fcgi-bin/nlp/nlp_textchat`,
      this.querystring(req),
      config
    )
    const { data } = resp
    if (data.ret !== 0) {
      console.error(data)
      return `错误: ${data.msg}`
    }
    let msg = data.data.answer
    console.log(msg)
    return msg
  }
  private randomString () {
    let s = ''
    for (let i = 0; i < 4; i++) {
      s += Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
    }
    return s
  }
  private getSignedData (data: Record<string, any>) {
    const ts = Math.floor(Date.now() / 1000)
    const nonce = this.randomString()

    data = {
      ...data,
      app_id: this.appId,
      time_stamp: ts,
      nonce_str: nonce,
    }
    const signStr = `${this.querystring(data)}&app_key=${this.appKey}`
    console.log('sign', signStr)

    return {
      ...data,
      sign: this.md5(signStr)
    }
  }
  private querystring (data: Record<string, string>) {
    return Object.keys(data).sort().map(k => `${k}=${encodeURIComponent(data[k])}`).join('&')
  }
  private md5 (s: string) {
    return createHash('md5').update(s).digest("hex").toUpperCase()
  }
}

export function AIChat<T extends ChatProvider>(provider: T, auth: ProviderAuthMap[T]) {
  return new AIChatCls(provider, auth as any)
}

class AIChatCls extends BaseBotModule {
  id = 'aichat'
  name: string
  backend: ChatBackend

  constructor (private provider: ChatProvider, private auth: Record<string, string>) {
    super()
    this.name = `智障对话(${this.getProvider()})`
    this.backend = this.getBackend()
  }
  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    bus.registerMessage([bus.atMeFilter], e => this.onMessage(e))
  }
  async onMessage (e: BotMessageEvent) {
    return `${this.bot.atStr(e.userId)} ${await this.backend.onMessage(e)}`
  }
  help (e: BotMessageEvent) {
    if (e.messageType === BotMessageType.Group) {
      return `@bot "想说的话" (由 ${this.getProvider()} 提供 API )`
    }
    return ''
  }
  private getProvider (): string {
    switch (this.provider) {
      case ChatProvider.Tuling123:
        return '图灵123'
      case ChatProvider.QQAI:
        return '腾讯AI'
    }
  }
  private getBackend (): ChatBackend {
    switch (this.provider) {
      case ChatProvider.Tuling123:
        return new Tuling123(this.auth.apiKey)
      case ChatProvider.QQAI:
        return new QQAI(parseInt(this.auth.appId), this.auth.appKey)
    }
  }
}
