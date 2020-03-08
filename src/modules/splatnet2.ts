import { createHash, randomBytes } from 'crypto'
import { BaseBotModule, BotMessageEvent, BotModuleInitContext, BotMessageType } from '../interface'
import { CQCode, cqGetString, cqStringify, cqCode } from '../utils/cqcode'
import { TSBot } from '../tsbot'
import axios, { AxiosError } from 'axios'
import { parse } from 'url'
import { BotStorage } from '../storage'
import uuid from 'uuid'
import moment from 'moment'
import { sleep } from '../utils/helpers'
import httpsProxyAgent from 'https-proxy-agent'

const ProxyPool = process.env.PROXY_POOL
const ErrStorNotFound = '没有找到你的登录状态, 请私聊 "乌贼登录" 后再使用'
const RenewRetry = 3
let DayLimit = 20

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
  lastUsed: number
  lastCall?: number
}
function getDate () {
  return moment().format('YYYY-MM-DD')
}

interface RegisterToday {
  date: string
  times: number
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
    this.bot = bot
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
    const bot = this.bot!
    callback({
      next: () => new Promise<BotMessageEvent>((res) => session.onMsg = res),
      reply: async (msg: string) => {
        if (e.messageType === BotMessageType.Group) {
          return bot.sendGroupMessage(e.groupId!, msg)
        } else if (e.messageType === BotMessageType.Private) {
          return bot.sendPrivateMessage(e.userId, msg)
        }
        return
      }
    }).catch(e => console.error(e)).then(() => this.map.delete(key))
  }
}

interface AuthenticationParams {
  state: string
  codeVerifier: string
  codeChallenge: string
}

function stringifyParam (param: Record<string, string>) {
  return Object.keys(param).map(k => `${k}=${encodeURIComponent(param[k])}`).join('&')
}

interface RemoteApi {
  getHash (idToken: string, timestamp: string): Promise<string>
  callFlapg (idToken: string, guid: string, timestamp: string): Promise<{
    login_app: {
      f: string,
      p1: string,
      p2: string,
      p3: string
    },
    login_nso: {
      f: string,
      p1: string,
      p2: string
      p3: string
    }
  }>
}

class WebApi implements RemoteApi {
  req = axios.create({ headers: {
		'User-Agent':      'splatoon2-qqbot/1.0',
  } })
  async getHash (idToken: string, timestamp: string) {
    const r = await this.req.post<{hash: string}>('https://elifessler.com/s2s/api/gen2', stringifyParam({
      'naIdToken': idToken,
      'timestamp': timestamp
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return r.data.hash
  }
  async callFlapg (idToken: string, guid: string, timestamp: string) {
    const iid = randomBytes(4).toString('hex')
    const r = await this.req.get('https://flapg.com/ika2/api/login', { headers: {
			'x-token': idToken,
			'x-time':  timestamp,
			'x-guid':  guid,
			'x-hash':  await this.getHash(idToken, timestamp),
			'x-ver':   '2',
			'x-iid':   iid
    } })
    return r.data
  }
}

export class Splatnet2 extends BaseBotModule {
  private registerToday!: RegisterToday
  private urlCache = new Map<string, string>()
  private rapi: RemoteApi = new WebApi()
  private renewList: number[] = []
  private userStorage!: BotStorage<UserStorage>
  id = 'splatnet2'
  name = '乌贼战绩查询'
  defaultEnable = true
  userSession = new Map<number, UserSession>()
  sm = new SessionManager()
  req = axios.create({ headers: {
		'User-Agent':      'OnlineLounge/1.5.2 NASDKAPI Android',
		'Accept-Language': 'en-US',
		'Accept':          'application/json',
		'Content-Type':    'application/x-www-form-urlencoded',
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
    const { bus, storage } = ctx
    bus.registerMessage([bus.privateFilter], e => this.onPrivateMsg(e))
    bus.registerMessage([bus.cmdFilter], e => this.onCmdMsg(e))
    this.userStorage = storage.getChild('user')
    this.sm.registerHandler(ctx)
    this.renewList = this.storage.get<number[]>('list') || []
    this.registerToday = this.storage.get<RegisterToday>('register') || {
      date: getDate(),
      times: 0
    }

    const perHour = 60 * 60 * 1000
    const renew = async () => {
      console.log('check renew', this.renewList.length)
      try {
        let toDelete: number[] = []
        for (const userId of this.renewList) {
          try {
            const now = Math.floor(Date.now() / 1000)
            const us = this.userStorage.get(`qq${userId}`)
            if (!us) {
              toDelete.push(userId)
              continue
            }
            // 20 hours
            if (now - us.lastUsed >= 20 * 60 * 60) {
              console.log('renew', userId)
              await this.renew(userId)
            }
          } catch (e) {
            console.error('renew error', e)
            this.checkErr(userId, e)
          }
          await sleep(30 * 1000)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setTimeout(renew, perHour)
      }
    }
    renew()
  }
  private getProxyOpts () {
    if (!ProxyPool) {
      return {}
    }
    const [host, port] = ProxyPool.split(':')
    const agent = new httpsProxyAgent(`http://${ProxyPool}`)
    return {
      httpsAgent: agent,
      proxy: {
        host,
        port: parseInt(port)
      },
      timeout: 30 * 1000
    }
  }
  private is403 (e: any) {
    if (e.response) {
      const err = e as AxiosError
      return err.response!.status === 403
    }
    return false
  }
  private checkErr (userId: number, e: any) {
    if (this.is403(e)) {
      console.warn(`user ${userId} got 403. delete iksm`)
      const id = this.renewList.indexOf(userId)
      if (id === -1) return
      this.userStorage.del(`qq${userId}`)
      this.renewList.splice(id, 1)
      this.storage.set('list', this.renewList)
      // this.bot.sendPrivateMessage(userId, `QQ用户 ${userId}: 您的乌贼登录状态已经失效, 要使用战绩功能请重新登录`)
    }
  }
  private checkRegister () {
    const today = getDate()
    if (today === this.registerToday.date) {
      return this.registerToday.times < DayLimit
    } else {
      this.registerToday = {
        date: today,
        times: 0
      }
      this.storage.set('register', this.registerToday)
      return true
    }
  }
  private addRegister () {
    this.registerToday.times += 1
    this.storage.set('register', this.registerToday)
  }
  private async renew(userId: number) {
    for (let i = 1; i <= RenewRetry; i++) {
      try {
        await this.appReq.get(
          'https://app.splatoon2.nintendo.net/home',
          {
            headers: this.getUserCookie(userId),
            ...this.getProxyOpts()
          }
        )
        this.updateLastUsed(userId)
      } catch (e) {
        console.warn('renew failed times:', i, e)
        if (i === RenewRetry) {
          this.checkErr(userId, e)
        }
      }
    }
  }
  private async getBattleUrl (userId: number, index: number = 0) {
    const list = await this.getBattleList(userId)
    const firstBattleNumber = list[index].battle_number
    console.log(`user ${userId}, battle number ${firstBattleNumber}`)
    return await this.getBattleImageUrl(userId, firstBattleNumber)
  }
  private updateLastUsed (userId: number) {
    const us = this.userStorage.get(`qq${userId}`)
    if (!us) {
      throw new Error(ErrStorNotFound)
    }
    this.userStorage.set(`qq${userId}`, {
      ...us,
      lastUsed: Math.floor(Date.now() / 1000)
    })
  }
  private updateLastCall (userId: number) {
    const us = this.userStorage.get(`qq${userId}`)
    if (!us) {
      throw new Error(ErrStorNotFound)
    }
    this.userStorage.set(`qq${userId}`, {
      ...us,
      lastCall: Math.floor(Date.now() / 1000)
    })
  }
  private getUserCookie (userId: number) {
    const us = this.userStorage.get(`qq${userId}`)
    if (!us) {
      throw new Error(ErrStorNotFound)
    }
    return { 'Cookie': `iksm_session=${us.iksm}` }
  }
  private async getBattleImageUrl (userId: number, battleNumber: number) {
    const cacheKey = `${userId}.${battleNumber}`
    const cacheVal = this.urlCache.get(cacheKey)
    if (cacheVal) return cacheVal
    const r = await this.appReq.post<{ url: string }>(`https://app.splatoon2.nintendo.net/api/share/results/${battleNumber}`, '', { headers: {
      ...this.getUserCookie(userId),
      'Referer': `https://app.splatoon2.nintendo.net/results/${battleNumber}`
    } })
    this.updateLastUsed(userId)
    const url = r.data.url
    this.urlCache.set(cacheKey, url)
    return url
  }
  private async getBattleList (userId: number) {
    const r = await this.appReq.get<{ results: {
      battle_number: number
    }[] }>(`https://app.splatoon2.nintendo.net/api/results`, { headers: this.getUserCookie(userId) })
    this.updateLastUsed(userId)
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
    }>('https://accounts.nintendo.com/connect/1.0.0/api/session_token', stringifyParam(params))

    return res.data.session_token
  }
  private async getCookie (sessionToken: string, userLang: string, userId: number) {
    console.log('/connect/1.0.0/api/token', userId)
    const { data: { access_token: accessToken, id_token: idToken } } = await this.req.post<{
      access_token: string,
      id_token: string
    }>('https://accounts.nintendo.com/connect/1.0.0/api/token', stringifyParam({
      client_id: '71b963c1b7b6d119',
      session_token: sessionToken,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token'
    }))

    console.log('/2.0.0/users/me', userId)
    const { data: userInfo } = await this.req.get<{
      country: string,
      birthday: string,
      language: string
    }>('https://api.accounts.nintendo.com/2.0.0/users/me', { headers: {
      'Authorization': `Bearer ${accessToken}`
    }})

    const requestId = uuid.v4()
    const timestamp = Math.floor(Date.now() / 1000).toString()
    console.log('callflapg', userId)
    const { login_nso, login_app } = await this.rapi.callFlapg(idToken, requestId, timestamp)

    const zncaReq = axios.create({ headers: {
      'Connection':      'Keep-Alive',
      'Accept-Encoding': 'gzip',
      'User-Agent': 'com.nintendo.znca/1.5.2 (Android/7.1.2)',
      'Accept-Language': userLang,
      'Authorization': 'Bearer',
      'X-Platform': 'Android',
      'X-ProductVersion': '1.5.2',
    } })
    console.log('/v1/Account/Login', userId)
    const { data: { result: { webApiServerCredential: { accessToken: splatoonToken } }} } = await zncaReq.post<{
      result: {
        webApiServerCredential: {
          accessToken: string
        }
      }
    }>(`https://api-lp1.znc.srv.nintendo.net/v1/Account/Login`, {
      parameter: {
        'f':          login_nso.f,
        'naIdToken':  idToken,
        'timestamp':  timestamp,
        'requestId':  requestId,
        'naCountry':  userInfo.country,
        'naBirthday': userInfo.birthday,
        'language':   userInfo.language
      }
    })

    console.log('/v2/Game/GetWebServiceToken', userId)
    const { data: { result: { accessToken: splatoonAccessToken } } } = await zncaReq.post<{
      result: {
        accessToken: string,
        expiresIn: number
      }
    }>(`https://api-lp1.znc.srv.nintendo.net/v2/Game/GetWebServiceToken`, {
      parameter: {
          'id':                5741031244955648,
          'f':                 login_app.f,
          'registrationToken': login_app.p1,
          'timestamp':         login_app.p2,
          'requestId':         login_app.p3
      }
    }, {
      headers: {
        'Authorization': `Bearer ${splatoonToken}`
      }
    })

    console.log('app.splatoon2.nintendo.net', userId)
    const r = await axios.get(`https://app.splatoon2.nintendo.net/?lang=${userLang}`, { headers: {
      'X-IsAppAnalyticsOptedIn': 'false',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip,deflate',
      'X-GameWebToken': splatoonAccessToken,
      'Accept-Language': userLang,
      'X-IsAnalyticsOptedIn': 'false',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 7.1.2; Pixel Build/NJH47D; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/59.0.3071.125 Mobile Safari/537.36',
      'X-Requested-With': 'com.nintendo.znca'
    } })
    const re = /iksm_session=([a-f0-9]+);/
    let iksmSession: string = ''
    for (const h of r.headers['set-cookie'] as string[]) {
      if (re.test(h)) {
        const rr = re.exec(h)
        if (!rr) throw new Error('解析Cookie出错')
        iksmSession = rr[1]
      }
    }
    if (!iksmSession) {
      throw new Error('获取Cookie失败')
    }
    return iksmSession
  }
  async onCmdMsg (e: BotMessageEvent) {
    const { message, userId } = e
    const re = /^\s*上([\d一]*)(局|场)\s*$/
    if (re.test(message)) {
      const rr = re.exec(message)
      if (!rr) {
        return
      }
      const idxStr = rr[1]
      let idx: number
      if (idxStr === '一' || idxStr === '') {
        idx = 1
      } else {
        idx = parseInt(rr[1], 10)
      }
      try {
        if (idx > 50 || idx < 1) {
          throw new Error(`输入的数字不对: ${idx}, 取值范围 [1, 50]`)
        }
        const url = await this.getBattleUrl(e.userId, idx - 1)
        this.updateLastCall(userId)
        console.log(`battle(${idx}) url ${userId} ${url}`)
        const image = await axios.get<ArrayBuffer>(url, {
          responseType: 'arraybuffer',
          timeout: 15000
        })
        const buf = Buffer.from(new Uint8Array(image.data))
        return cqStringify([new CQCode('at', { qq: userId.toString() }), new CQCode('image', { file: `base64://${buf.toString('base64')}` })])
      } catch (e) {
        console.warn(e)
        this.checkErr(userId, e)
        if (this.is403(e)) {
          e = '登录状态已失效, 请重新登录'
        }
        return cqStringify([new CQCode('at', { qq: userId.toString() }), e.toString()])
      }
    }
  }
  async onPrivateMsg (e: BotMessageEvent) {
    const { message, userId } = e
    const msg = message.trim()
    if (msg === '乌贼登陆') {
      return '你要输入的是不是 "乌贼登录" ?'
    }
    if (msg === '乌贼退出登陆') {
      return '你要输入的是不是 "乌贼退出登录" ?'
    }
    if (msg === (process.env.SECRET_SN2 || '乌贼登录')) {
      if (!this.checkRegister()) {
        return `今日注册用户已达限制: ${this.registerToday.times}, 请明天0点再来`
      }
      try {
        if (this.getUserCookie(userId)) {
          return '你已经登录, 如需重新登录请先发送 "乌贼退出登录"'
        }
      } catch {}

      const params = this.generateAuthenticationParams()
      try {
        this.sm.beginSession(e, async ({ next, reply }) => {
          const nextMsg = async () => cqGetString((await next()).message)
          let message = await nextMsg()
          while (!message.includes('放弃机会')) {
            const url = parse(message)
            const hash = url.hash
            if (url.protocol !== 'npf71b963c1b7b6d119:' || !hash) {
              reply('网址有误, 请重新输入. 请注意网址要以 "npf71b963c1b7b6d119:" 开头. 回复"放弃机会"放弃这次登录')
              message = await nextMsg()
              continue
            }
            try {
              const loginParam = this.parseHash(hash)
              const sessionTokenCode = loginParam['session_token_code']
              console.log('get session token code', userId)
              const sessionToken = await this.getSessionToken(sessionTokenCode, params.codeVerifier)
              console.log('get cookie', userId)
              const iksm = await this.getCookie(sessionToken, 'en-US', userId)
              this.saveIksm(userId, iksm)

              this.addRegister()
              reply('登录成功')
              return
            } catch (e) {
              reply('登录出错')
              console.error(userId, 'login error', e)
            }

            break
          }
          reply('已经取消登录')
        })
        this.bot.sendPrivateMessage(userId, this.createLoginUrl(params))
        return `QQ用户 ${userId}: 请在chrome浏览器打开以上链接(请勿在QQ浏览器中打开)
  登录后右键或长按"选择此人", 然后选择"复制链接地址", 将内容回复到此完成登录.`
      } catch (e) {
        console.error(e)
        return `出错了: ${e}`
      }
    } else if (msg === '乌贼退出登录') {
      const id = this.renewList.indexOf(userId)
      if (id === -1) return '未找到你的登录信息'
      this.userStorage.del(`qq${userId}`)
      this.renewList.splice(id, 1)
      this.storage.set('list', this.renewList)
      return '退出成功'
    } else {
      let [cmd, param] = msg.split(' ', 2)
      param = (param || '').trim()
      if (cmd === 'iksm') {
        if (param && param.length > 0) {
          this.saveIksm(userId, param)
          return `iksm 保存成功`
        }
      }
    }
  }
  help (e: BotMessageEvent) {
    if (e.messageType === BotMessageType.Group) {
      return `@bot 上一场`
    } else {
      return `乌贼登录: 登录乌贼账号`
    }
    return ''
  }
  private saveIksm (userId: number, iksm: string) {
    this.userStorage.set(`qq${userId}`, {
      iksm,
      lastUsed: 0
    })
    if (!this.renewList.includes(userId)) {
      this.renewList.push(userId)
    }
    this.storage.set('list', this.renewList)
  }
}
