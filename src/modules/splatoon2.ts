import { BaseBotModule, BotMessageEvent, BotMessageType, BotModuleInitContext } from '../interface'
import axios from 'axios'
import { createCanvas, registerFont, Canvas, loadImage, Image, CanvasRenderingContext2D } from 'canvas'
import path from 'path'
import moment from 'moment'
import { stat as statAsync, readFile as readFileAsync } from 'fs'
import { promisify } from 'util'
import { shuffle } from '../utils/helpers'
const stat = promisify(statAsync)
const readFile = promisify(readFileAsync)
const dataPath = path.resolve(__dirname, '..', '..', 'data')
const splatoon2Data: Splatoon2Data = require(path.join(dataPath, 'splatoon2-data.json'))

registerFont(path.join(__dirname, '../../fonts/DroidSansFallback.ttf'), {
  family: 'Roboto'
})
registerFont(path.join(__dirname, '../../fonts/Paintball_Beta_4a.otf'), {
  family: 'Paintball'
})
registerFont(path.join(__dirname, '../../fonts/HaiPaiQiangDiaoGunShiJian-2.otf'), {
  family: 'HaiPai'
})

const STAGE_STYLE = 0

export interface S2Stage {
  id: string
  name: string
  image: string
}

export interface S2Weapon {
  id: string
  name: string
  image: string
  special: {
    id: string
    image_a: string
    image_b: string
  }
  sub: {
    id: string
    image_a: string
    image_b: string
  }
}

export interface Splatoon2Data {
  weapons: S2Weapon[]
  stages: S2Stage[]
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface RandomContext {
  weaponsTeamA: S2Weapon[]
  weaponsTeamB: S2Weapon[]
  id: number
}

interface Stage {
  image: string
  id: string
  name: string
}

interface Rule {
  start_time: number
  end_time: number
  stage_a: Stage
  stage_b: Stage
  rule: {
    name: string
    key: 'rainmaker' | 'clam_blitz' | 'tower_control' | 'splat_zones' | 'turf_war'
    multiline_name: string
  }
  game_mode: {
    key: string
    name: string
  }
}

type StageTypes = 'league' | 'regular' | 'gachi'

const colorMap: Record<StageTypes, string> = {
  regular: '#19d719',
  gachi: '#e3562c',
  league: '#f02d7d'
}
interface Schedules {
  league: Rule[]
  regular: Rule[]
  gachi: Rule[]
}

interface Schedule {
  league: Rule
  regular: Rule
  gachi: Rule
}

interface CoopStage {
  image: string
  name: string
}
interface CoopWeapon {
  id?: string,
  image: string,
  name: string
}

interface CoopSchedule {
  start_time: number
  end_time: number
  stage: CoopStage
  weapons: {
    id: string
    weapon?: CoopWeapon
    coop_special_weapon?: CoopWeapon
  }[]
}

interface CoopSchedules {
  details: CoopSchedule[]
}

const RuleTranslate = {
  'splat_zones': '区域',
  'tower_control': '塔',
  'clam_blitz': '蛤蜊',
  'rainmaker': '鱼',
  'turf_war': '涂地'
}

export class Splatoon2 extends BaseBotModule {
  stageCache: Schedules | null = null
  stageCacheMsg: Map<number, string> = new Map()
  coopCache: CoopSchedules | null = null
  cacheImg: Map<string, Buffer> = new Map()
  groupRandom: Map<number, RandomContext> = new Map()
  id = 'splatoon2'
  name = 'Splatoon2'

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bot, bus } = ctx

    bus.registerMessage([bus.atMeFilter], e => this.onStage(e))
    bus.registerMessage([bus.groupTypeFilter], e => this.onRandom(e))

    if (!bot.isDebug) {
      console.log('preparing images...')
      this.getCurrentCoop()
      this.getCurrentStage(0)
      this.getCurrentStage(1)
    }
  }
  async onStage (e: BotMessageEvent) {
    const { message } = e
    const { atStr } = this.bot
    if (message.includes('工')) {
      try {
        return `${atStr(e.userId)} ${await this.getCurrentCoop()}`
      } catch (e) {
        console.error(e)
        return `获取地图时出错, 请稍后再试`
      }
    } else if (message.includes('图')) {
      let idx = 0
      if (message.includes('下')) {
        let count = message.split('下').length - 1
        if (count == 1) {
          let [_, suffix] = message.split('下')
          idx = parseInt(suffix)
          if (idx <= 0 || isNaN(idx)) {
            idx = 1
          }
        } else {
          idx = count
        }
      }
      try {
        return `${atStr(e.userId)} ${await this.getCurrentStage(idx)}`
      } catch (e) {
        console.error(e)
        return `获取地图时出错, 请稍后再试`
      }
    }
  }
  async onRandom (e: BotMessageEvent) {
    let rctx = this.groupRandom.get(e.groupId!)
    if (rctx === undefined) {
      rctx = {
        weaponsTeamA: [],
        weaponsTeamB: [],
        id: 1
      }
      this.groupRandom.set(e.groupId!, rctx)
    }
    if (e.message.includes('.随机武器')) {
      const base64 = await this.drawRandomWeapon(rctx)
      return `[CQ:image,file=base64://${base64}]`
    }
  }

  getURL (image: string): string {
    return `https://splatoon2.ink/assets/splatnet${image}`
  }
  async drawRuleBackground (ctx: CanvasRenderingContext2D, rect: Rect, color: string) {
    const patW = 30, patH = 30
    const { x, y, w, h } = rect
    const patCanvas = new Canvas(patW, patH)
    const patCtx = patCanvas.getContext('2d')

    patCtx.fillStyle = color
    patCtx.fillRect(0, 0, patW, patH)

    patCtx.fillStyle = 'rgba(0,0,0,0.1)'

    patCtx.beginPath()
    patCtx.moveTo(0, 0)
    patCtx.lineTo(patW / 2, 0)
    patCtx.lineTo(patW, patH / 2)
    patCtx.lineTo(patW, patH)
    patCtx.closePath()
    patCtx.fill()

    patCtx.beginPath()
    patCtx.moveTo(0, patH / 2)
    patCtx.lineTo(patW / 2, patH)
    patCtx.lineTo(0, patH)
    patCtx.closePath()
    patCtx.fill()

    this.roundPath(ctx, () => {
      const pat = ctx.createPattern(patCanvas)
      ctx.fillStyle = pat
      ctx.fillRect(x, y, w, h)
    }, rect, 10)
  }
  async drawFirstRule (ctx: CanvasRenderingContext2D, stageType: StageTypes, rule: Rule, ruleName: string, x: number, y: number, t1: string, t2: string) {
    const w = 271
    const h = 105
    const marginLeft = 15
    const rect: Rect = {
      x,
      y,
      w,
      h
    }
    ctx.save()
    this.drawRuleBackground(ctx, rect, colorMap[stageType])
    ctx.fillStyle = '#FFF'
    ctx.fillText(ruleName, marginLeft + x + 10, y + 5)

    ctx.font = '14px Paintball'
    ctx.fillText(t1, marginLeft + x + 80, y + 10)
    {
      ctx.save()
      ctx.translate(marginLeft + x + 5, y + 30)
      ctx.rotate(Math.PI / 2)
      ctx.fillText(t2, 0, 0)
      ctx.restore()
    }

    const r1 = await this.drawImage(ctx, rule.stage_a.image, {
      x: marginLeft + 5 + x,
      y: y + 33,
      w: 120,
      h: 69
    }, 5)
    const r2 = await this.drawImage(ctx, rule.stage_b.image, {
      x: marginLeft + 5 + x + 120 + 5,
      y: y + 33,
      w: 120,
      h: 69
    }, 5)
    await this.drawRuleIcon(ctx, stageType, {
      x: r1.x,
      y: r1.y,
      w: r2.x + r2.w - r1.x,
      h: r1.h
    })
    ctx.restore()
    return rect
  }
  async drawRule (ctx: CanvasRenderingContext2D, stageType: StageTypes, rule: Rule, ruleName: string, x: number, y: number) {
    ctx.save()
    const w = 132, h = 185
    const rect: Rect = { x, y, w, h }
    this.drawRuleBackground(ctx, rect, colorMap[stageType])
    ctx.fillStyle = '#FFF'
    ctx.fillText(ruleName, x + 8, y + 5)

    this.roundPath(ctx, () => {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillRect(x, y + 30, w, h - 30)
    }, rect, 10)
    const r1 = await this.drawImage(ctx, rule.stage_a.image, {
      x: x + 5,
      y: y + 35,
      w: 120,
      h: 69
    }, 5)
    const r2 = await this.drawImage(ctx, rule.stage_b.image, {
      x: x + 5,
      y: y + 35 + 75,
      w: 120,
      h: 69
    }, 5)
    await this.drawRuleIcon(ctx, stageType, {
      x: r1.x,
      y: r1.y,
      w: r1.w,
      h: r2.y + r2.h - r1.y
    })
    ctx.restore()
  }
  getTime (d: Date) {
    let h = d.getHours().toString()
    if (h.length === 1) {
      h = `0${h}`
    }
    let m = d.getMinutes().toString()
    if (m.length === 1) {
      m = `0${m}`
    }
    return `${h}:${m}`
  }
  async drawSchedule (s: Schedule) {
    let w: number, h: number
    if (STAGE_STYLE) {
      w = 415
      h = 220
    } else {
      w = 280
      h = 305
    }
    const [canvas, ctx] = this.getCanvas(w, h)
    const timeStart = new Date(s.regular.start_time * 1000)
    const timeEnd = new Date(s.regular.end_time * 1000)
    const dif = moment.unix(s.regular.end_time).diff(moment())

    if (STAGE_STYLE) {
      const ruleWidth = 132
      const ruleHeight = 185
      const ruleTop = 5
      await this.drawRule(ctx, 'regular', s.regular, '涂地', 5, ruleTop),
      await this.drawRule(ctx, 'gachi', s.gachi, `单排(${RuleTranslate[s.gachi.rule.key]})`, 5 + (5 + ruleWidth), ruleTop),
      await this.drawRule(ctx, 'league', s.league, `组排(${RuleTranslate[s.league.rule.key]})`, 5 + (5 + ruleWidth) * 2, ruleTop)

      ctx.font = '14px Paintball, Roboto'
      ctx.fillText(`北京时间: ${this.getTime(timeStart)} - ${this.getTime(timeEnd)}`, 15, 5 + ruleHeight + 5)
      ctx.fillText(`剩余时间: ${this.difTimeToStr(dif)}`, 245, 5 + ruleHeight + 5)
    } else {
      const ruleWidth = 132
      const ruleHeight = 185
      const t1 = `北京时间: ${this.getTime(timeStart)} - ${this.getTime(timeEnd)}`
      const t2 = this.difTimeToStr(dif)
      const {y, h} = await this.drawFirstRule(ctx, 'regular', s.regular, '涂地', 5, 5, t1, t2)
      await this.drawRule(ctx, 'gachi', s.gachi, `单排(${RuleTranslate[s.gachi.rule.key]})`, 5, y + h + 5),
      await this.drawRule(ctx, 'league', s.league, `组排(${RuleTranslate[s.league.rule.key]})`, 5 + (5 + ruleWidth), y + h + 5)
    }

    return canvas.toBuffer('image/png').toString('base64')
  }
  async drawCoopLine (ctx: CanvasRenderingContext2D, s: CoopSchedule, top: number) {
    const xy = [
      [0, 0],
      [33, 0],
      [0, 33],
      [33, 33]
    ]
    ctx.fillText(`${moment.unix(s.start_time).format('MM-DD HH:mm')} - ${moment.unix(s.end_time).format('MM-DD HH:mm')}`, 5, top)

    await this.drawImage(ctx, s.stage.image, {
      x: 5,
      y: top + 25,
      w: 120,
      h: 67
    }, 5)

    let weaponXY = [5 + 120 + 5, top + 25]
    for (let i = 0; i < 4; i++) {
      let w = s.weapons[i].weapon
      if (!w) {
        w = s.weapons[i].coop_special_weapon
      }
      if (!w) {
        console.error(s.weapons[i])
        throw new Error()
      }
      await this.drawImage(ctx, w.image, {
        x: weaponXY[0] + xy[i][0],
        y: weaponXY[1] + xy[i][1],
        w: 30,
        h: 30
      })
    }
  }
  difTimeToStr (dif: number) {
    let diff = Math.floor(dif / 1000 / 60) // minutes
    const minutes = diff % 60
    diff -= minutes
    diff = ~~(diff / 60)
    const hours = diff % 24
    diff -= hours
    diff = ~~(diff / 24)
    const days = diff
    const hideZero = (n: number, post: string) => n === 0 ? '' : n.toString() + post
    const ary = [hideZero(days, 'd'), hideZero(hours, 'h'), hideZero(minutes, 'm')]

    return ary.filter(i => i.length > 0).join(' ')
  }
  async drawCoopSchedule (s: CoopSchedules) {
    const now = Math.floor(Date.now() / 1000)
    const [canvas, ctx] = this.getCanvas(217, 225)
    const details = s.details
    const { start_time, end_time } = details[0]
    let time = ''
    let dif: number
    if (start_time > now) {
      dif = moment.unix(start_time).diff(moment())
      time = '离开始还有'
    } else {
      dif = moment.unix(end_time).diff(moment())
      time = '离结束还有'
    }

    time = `${time} ${this.difTimeToStr(dif)}`

    ctx.fillText(`${time}`, 5, 5)
    await this.drawCoopLine(ctx, details[0], 5 + 25)
    await this.drawCoopLine(ctx, details[1], 5 + 25 + 25 + 67 + 5)

    return canvas.toBuffer('image/png').toString('base64')
  }
  async drawWeapon (ctx: CanvasRenderingContext2D, w: S2Weapon, x: number, y: number) {
    await this.drawImage(ctx, w.image, { x, y, w: 65, h: 65})
    await this.drawImage(ctx, w.sub.image_a, { x: x + 70, y, w: 30, h: 30 })
    await this.drawImage(ctx, w.special.image_a, { x: x + 70, y: y + 30 + 5, w: 30, h: 30 })
  }
  async drawRandomWeapon (rctx: RandomContext) {
    const [canvas, ctx] = this.getCanvas(232, 310, '#bfbfbf')
    const { weapons } = splatoon2Data

    if (rctx.weaponsTeamA.length < 4) {
      rctx.weaponsTeamA = [...rctx.weaponsTeamA, ...shuffle(weapons)]
    }
    if (rctx.weaponsTeamB.length < 4) {
      rctx.weaponsTeamB = [...rctx.weaponsTeamB, ...shuffle(weapons)]
    }

    for (let i = 0; i < 4; i++) {
      const w = rctx.weaponsTeamA.shift()!
      await this.drawWeapon(ctx, w, 5, 5 + i * 70 + 25)
    }

    for (let i = 0; i < 4; i++) {
      const w = rctx.weaponsTeamB.shift()!
      await this.drawWeapon(ctx, w, 5 + 100 + 20, 5 + i * 70 + 25)
    }

    ctx.fillStyle = '#FFF'
    ctx.fillRect(115, 20, 5, 10000)
    ctx.fillRect(0, 0, 10000, 25)

    ctx.fillStyle = '#000'
    ctx.fillText(`ID: ${rctx.id++}`, 5, 2)

    return canvas.toBuffer('image/png').toString('base64')
  }
  // image: "/image/xxxx.png"
  async drawImage(ctx: CanvasRenderingContext2D, image: string, rect: Rect, r = 0) {
    const { x, y, w, h } = rect
    const dataFile = path.join(dataPath, image)
    let img: Image

    try {
      await stat(dataFile)
      img = await loadImage(await readFile(dataFile))
    } catch {
      img = await loadImage(await this.getImage(this.getURL(image)))
    }

    this.roundPath(ctx, () => {
      ctx.drawImage(img, x, y, w, h)
    }, rect, r)
    return rect
  }
  async drawRuleIcon(ctx: CanvasRenderingContext2D, type: StageTypes, rect: Rect) {
    const imgPath = path.join(dataPath, `/images/stage_types/${type}.png`)
    const img = await loadImage(await readFile(imgPath))
    const drawRect: Rect = {
      x: rect.x + (rect.w - img.width) / 2,
      y: rect.y + (rect.h - img.height) / 2,
      w: img.width,
      h: img.height
    }
    ctx.drawImage(img, drawRect.x, drawRect.y)
    return drawRect
  }
  private roundPath (ctx: CanvasRenderingContext2D, cb: Function, { x, y, w, h }: Rect, r: number) {
    ctx.save()
    if (r > 0) {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y, x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + w, y, r)
      ctx.closePath()
      ctx.clip()
    }
    cb()
    ctx.restore()
  }
  async getImage (url: string) {
    if (this.cacheImg.has(url)) {
      return this.cacheImg.get(url)!
    } else {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer'
      })
      const buf = Buffer.from(new Uint8Array(res.data))
      const contentLength = parseInt(res.headers['content-length'])
      if (contentLength != buf.byteLength) {
        console.log(`expecting ${contentLength}, got ${buf.byteLength}(${res.data.byteLength}), status ${res.status} ${res.statusText}, url ${url}`)
        console.log(res.headers)
        throw new Error('Wrong content length')
      }
      this.cacheImg.set(url, buf)
      return buf
    }
  }
  async getCurrentCoop (): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    let coopCache = this.coopCache
    if (!coopCache || coopCache.details[0].end_time < now) {
      console.log('splatoon2 coop cache not hit')
      coopCache = (await axios.get<CoopSchedules>('https://splatoon2.ink/data/coop-schedules.json')).data
      this.coopCache = coopCache
    }

    console.log('coop start drawing')

    const startTime = Date.now()
    const base64 = await this.drawCoopSchedule(coopCache)
    let msg = `[CQ:image,file=base64://${base64}]`

    console.log(`drawing done, spend ${Date.now() - startTime}ms`)
    return msg
  }
  async getCurrentStage (idx: number = 0) {
    const now = Date.now()
    let cache = this.stageCache
    if (!cache || cache.league[0].end_time < Math.floor(now / 1000)) {
      console.log('splatoon2 cache not hit')
      cache = (await axios.get<Schedules>('https://splatoon2.ink/data/schedules.json')).data
      this.stageCache = cache
      this.stageCacheMsg.clear()
    }
    if (this.stageCacheMsg.has(idx)) {
      return this.stageCacheMsg.get(idx)!
    }

    console.log('msg not found in cache, start drawing')
    const startTime = Date.now()
    const regular = cache.regular[idx]
    const gachi = cache.gachi[idx]
    const league = cache.league[idx]

    let msg = ''
    if (this.bot.isPro) {
      const base64 = await this.drawSchedule({ regular, gachi, league })
      msg = `[CQ:image,file=base64://${base64}]`
    } else {
      msg = (
        `涂地: ${regular.stage_a.name}, ${regular.stage_b.name}\n` +
        `单排(${RuleTranslate[gachi.rule.key]}): ${gachi.stage_a.name}, ${gachi.stage_b.name}\n` +
        `组排(${RuleTranslate[league.rule.key]}): ${league.stage_a.name}, ${league.stage_b.name}`
      )
    }

    console.log(`drawing done, spend ${Date.now() - startTime}ms`)
    this.stageCacheMsg.set(idx, msg)
    return msg
  }
  protected getCanvas (width: number, height: number, bg: string = '#FFF'): [Canvas, CanvasRenderingContext2D] {
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d Context not found')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000'
    ctx.font = '18px HaiPai, Roboto'
    ctx.textBaseline = 'top';
    return [canvas, ctx]
  }
  help (e: BotMessageEvent) {
    if (e.messageType === BotMessageType.Group) {
      return `当前地图: @bot 图
下张地图: @bot 下张图
打工图: @bot 打工
随机武器: .随机武器 (无需@)`
    }
    return ''
  }
}
