import { createHash, randomBytes } from 'crypto'
import { BaseBotModule, BotMessageEvent, BotModuleInitContext, BotMessageType } from '../interface'
import { cqParse, isCQCode, CQCode, cqGetString, cqStringify, cqCode } from '../utils/cqcode'
import { randomIn } from '../utils/helpers'
import { TSBotEventBus, TSBot } from '../tsbot'
import axios from 'axios'
import { parse } from 'url'
import { createInterface } from 'readline'
import { createCanvas, registerFont, Canvas, loadImage, Image, CanvasRenderingContext2D } from 'canvas'
import { BotStorageService } from '../storage'

interface UserSession {
  onMsg: (v: BotMessageEvent) => void
  // callback: SessionCallback
}
interface SessionCallbackParam {
  next(): Promise<BotMessageEvent>
  reply(message: string): Promise<void>
}
type SessionCallback = (params: SessionCallbackParam) => Promise<void>
interface UserStorage {
  iksm: string
}

class SessionManager {
  private bot: TSBot | undefined
  private map = new Map<string, UserSession>()
  private msg2key (e: BotMessageEvent) {
    if (e.messageType === BotMessageType.Group) {
      return `g${e.groupId} ${e.userId}`
    } else if (e.messageType === BotMessageType.Private) {
      return `p${e.userId}`
    }
    return `o${e.messageType} ${e.groupId} ${e.userId}`
  }
  private inSessionFilter = (e: BotMessageEvent) => {
    const key = this.msg2key(e)
    return this.map.has(key)
  }
  private onSessionMessage (e: BotMessageEvent) {
    const session = this.map.get(this.msg2key(e))!
    session.onMsg(e)
    return ''
  }
  registerHandler (ctx: BotModuleInitContext) {
    const { bus, bot } = ctx
    bus.registerMessage([this.inSessionFilter], e => this.onSessionMessage(e))
  }
  beginSession (e: BotMessageEvent, callback: SessionCallback) {
    let session: UserSession = {
      onMsg () {
        console.warn('wild session onMsg called')
      }
    }
    const key = this.msg2key(e)
    if (this.map.has(key)) {
      throw new RangeError('already in a session')
    }
    this.map.set(key, session)
    callback({
      next: () => new Promise<BotMessageEvent>((res) => session.onMsg = res),
      reply: async (msg: string) => {
        if (e.messageType === BotMessageType.Group) {
          return this.bot!.sendGroupMessage(e.groupId!, msg)
        } else if (e.messageType === BotMessageType.Private) {
          return this.bot!.sendPrivateMessage(e.userId, msg)
        }
        return
      }
    }).then(() => this.map.delete(key))
  }
}

interface AuthenticationParams {
  state: string
  codeVerifier: string
  codeChallenge: string
}

export class Splatnet2 extends BaseBotModule {
  private urlCache = new Map<string, string>()
  id = 'splatnet2'
  name = '乌贼战绩查询'
  defaultEnable = true
  userSession = new Map<number, UserSession>()
  sm = new SessionManager()
  req = axios.create({ headers: {
		'User-Agent':      'OnlineLounge/1.5.0 NASDKAPI Android',
		'Accept-Language': 'en-US',
		'Accept':          'application/json',
		'Content-Type':    'application/x-www-form-urlencoded',
		// 'Host':            'accounts.nintendo.com',
		'Connection':      'Keep-Alive',
		'Accept-Encoding': 'gzip'
  } })
  appReq = axios.create({ headers: {
		'User-Agent':      'Mozilla/5.0 (Linux; Android 7.1.2; Pixel Build/NJH47D; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/59.0.3071.125 Mobile Safari/537.36',
		'Accept-Language': 'en-US',
		'Accept':          '*/*',
		'Connection':      'Keep-Alive',
    'Accept-Encoding': 'gzip',
    'Referer': 'https://app.splatoon2.nintendo.net/home',
    'x-requested-with': 'XMLHttpRequest',
    'x-timezone-offset': '-480'
  } })

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    bus.registerMessage([bus.privateFilter], e => this.onPrivateMsg(e))
    bus.registerMessage([bus.cmdFilter], e => this.onCmdMsg(e))
    this.sm.registerHandler(ctx)
  }
  private async getBattleUrl (userId: number, index: number = 0) {
    const list = await this.getBattleList(userId)
    const firstBattleNumber = list[index].battle_number
    console.log(`user ${userId}, battle number ${firstBattleNumber}`)
    return await this.getBattleImageUrl(userId, firstBattleNumber)
  }
  private getUserCookie (userId: number) {
    const iksm = this.storage.get<string>(`qq${userId}`)
    if (!iksm) {
      throw new Error('没有找到你的iksm')
    }
    return { 'Cookie': `iksm_session=${iksm}` }
  }
  private async getBattleImageUrl (userId: number, battleNumber: number) {
    const cacheKey = `${userId}.${battleNumber}`
    const cacheVal = this.urlCache.get(cacheKey)
    if (cacheVal) return cacheVal
    const r = await this.appReq.post<{ url: string }>(`https://app.splatoon2.nintendo.net/api/share/results/${battleNumber}`, '', { headers: {
      ...this.getUserCookie(userId),
      'Referer': `https://app.splatoon2.nintendo.net/results/${battleNumber}`
    } })
    const url = r.data.url
    this.urlCache.set(cacheKey, url)
    return url
  }
  private async getBattleList (userId: number) {
    const r = await this.appReq.get<{ results: {
      battle_number: number
    }[] }>(`https://app.splatoon2.nintendo.net/api/results`, { headers: this.getUserCookie(userId) })
    const { results } = r.data
    if (results.length <= 0) throw new Error('未找到对战')
    return results
  }
  private drawBattle () {

  }
  private generateRandom (size: number) {
    return this.safeBase64(randomBytes(size).toString('base64'))
  }
  private safeBase64 (s: string) {
    return s.replace(/=/g, '').replace(/\//g, '_').replace(/\+/g, '-')
  }
  private calculateChallenge (s: string) {
    const hash = createHash('sha256')
    hash.update(s)
    return this.safeBase64(hash.digest('base64'))
  }
  private generateAuthenticationParams () {
    const state = this.generateRandom(36)
    const codeVerifier = this.generateRandom(32)
    const codeChallenge = this.calculateChallenge(codeVerifier)

    return {
      state,
      codeVerifier,
      codeChallenge
    }
  }
  private parseHash (hash: string) {
    if (hash[0] === '#') {
      hash = hash.slice(1)
    }
    let out: Record<string, string> = {}
    for (let [key, value] of hash.split('&').map(i => i.split('='))) {
      out[key] = decodeURIComponent(value)
    }
    return out
  }
  private stringifyParam (param: Record<string, string>) {
    return Object.keys(param).map(k => `${k}=${encodeURIComponent(param[k])}`).join('&')
  }
  private createLoginUrl ({ state, codeChallenge }: AuthenticationParams) {
    const params: Record<string, string> = {
      state: state,
      redirect_uri: 'npf71b963c1b7b6d119://auth',
      client_id: '71b963c1b7b6d119',
      scope: 'openid user user.birthday user.mii user.screenName',
      response_type: 'session_token_code',
      session_token_code_challenge: codeChallenge,
      session_token_code_challenge_method: 'S256',
      theme: 'login_form'
    }

    const stringParams = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&')
    const url = `https://accounts.nintendo.com/connect/1.0.0/authorize?${stringParams}`

    return url
  }
  private async getSessionToken(sessionTokenCode: string, codeVerifier: string) {
    const params: Record<string, string> = {
      client_id: '71b963c1b7b6d119',
      session_token_code: sessionTokenCode,
      session_token_code_verifier: codeVerifier
    }

    const res = await this.req.post<{
      session_token: string,
      code: string
    }>('https://accounts.nintendo.com/connect/1.0.0/api/session_token', this.stringifyParam(params))

    return res.data.session_token
  }
  private async getCookie (sessionToken: string, userLang: string) {
    const params: Record<string, string> = {
      client_id: '71b963c1b7b6d119',
      session_token: sessionToken,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token'
    }
    const res = await this.req.post<{
      access_token: string
    }>('https://accounts.nintendo.com/connect/1.0.0/api/token', this.stringifyParam(params))
    const accessToken = res.data.access_token
  }
  async onCmdMsg (e: BotMessageEvent) {
    const { message, userId } = e
    const re = /上(\d+)(局|场)/
    if (['上一场', '上一局'].includes(message)) {
      try {
        const url = await this.getBattleUrl(e.userId)
        console.log(`last battle url ${userId} ${url}`)
        return cqStringify([new CQCode('at', { qq: userId.toString() }), new CQCode('image', { file: url })])
      } catch (e) {
        console.warn(e)
        return cqStringify([new CQCode('at', { qq: userId.toString() }), e.toString()])
      }
    } else if (re.test(message)) {
      const rr = re.exec(message)
      if (!rr) {
        return
      }
      const idx = parseInt(rr[1], 10)
      try {
        const url = await this.getBattleUrl(e.userId, idx - 1)
        console.log(`battle(${idx}) url ${userId} ${url}`)
        return cqStringify([new CQCode('at', { qq: userId.toString() }), new CQCode('image', { file: url })])
      } catch (e) {
        console.warn(e)
        return cqStringify([new CQCode('at', { qq: userId.toString() }), e.toString()])
      }
    }
  }
  async onPrivateMsg (e: BotMessageEvent) {
    const { message, userId } = e
    const msg = message.trim()
    if (msg === '乌贼登录') {
      return '未完成...'
      const params = this.generateAuthenticationParams()
      this.sm.beginSession(e, async ({ next, reply }) => {
        const nextMsg = async () => cqGetString((await next()).message)
        let message = await nextMsg()
        while (!message.includes('放弃登录')) {
          const url = parse(message)
          const hash = url.hash
          if (url.protocol !== 'npf71b963c1b7b6d119:' || !hash) {
            reply('网址有误, 请重新输入. 回复"放弃机会"放弃这次登录')
            message = await nextMsg()
            continue
          }
          const loginParam = this.parseHash(hash)
          const sessionTokenCode = loginParam['session_token_code']
          await this.getSessionToken(sessionTokenCode, params.codeVerifier)
          break
        }
      })
      this.bot.sendPrivateMessage(e.userId, this.createLoginUrl(params))
      return `请在chrome浏览器打开以上链接(请勿在QQ浏览器中打开)
登录后右键或长按"选择此人", 然后选择"复制链接地址", 将内容回复到此完成登录.`
    } else {
      let [cmd, param] = msg.split(' ', 2)
      param = (param || '').trim()
      if (cmd === 'iksm') {
        if (param && param.length > 0) {
          this.storage.set(`qq${userId}`, param)
          return `iksm 保存成功`
        }
      }
    }
  }
  help (e: BotMessageEvent) {
    if (e.messageType === BotMessageType.Group) {
      return `@bot 上一场`
    } else {
      return `乌贼登录: 登录乌贼账号
乌贼状态: 返回当前QQ绑定乌贼账号的状态`
    }
    return ''
  }
  async debug () {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    })
    const params = this.generateAuthenticationParams()
    const url = this.createLoginUrl(params)
    rl.question(`${url}\n`, async (message) => {
      const url = parse(message)
      const hash = url.hash
      if (url.protocol !== 'npf71b963c1b7b6d119:' || !hash) {
        rl.write('wrong url')
        return
      }
      const loginParam = this.parseHash(hash)
      const sessionTokenCode = loginParam['session_token_code']
      console.log('session token code', sessionTokenCode)
      const sessionToken = await this.getSessionToken(sessionTokenCode, params.codeVerifier)
    })
  }
  async debug2 () {
    const s = new BotStorageService('config.json')
    await s.load()
    this.storage = s.getChild('module').getChild('splatnet2')

    await this.getBattleUrl(715746717)
  }
}

// new Splatnet2().debug2().catch(e => console.error(e))
