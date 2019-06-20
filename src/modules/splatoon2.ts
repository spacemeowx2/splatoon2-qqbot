import { BaseBotModule, BotMessageEvent, BotMessageType, BotModuleInitContext } from '../interface'
import axios from 'axios'
import { createCanvas, registerFont, Canvas, loadImage, Image, CanvasRenderingContext2D } from 'canvas'
import path from 'path'
import moment from 'moment'
import { stat as statAsync, readFile as readFileAsync, writeFileSync } from 'fs'
import { promisify } from 'util'
import { shuffle, randomIn } from '../utils/helpers'
import { CQCode, cqStringify, CQMessageList } from '../utils/cqcode'
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

const StageSize = {
  w: 240,
  h: 138
}
const CoopStageSize = {
  w: 240,
  h: 134
}

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
  stages: S2Stage[]
  id: number
}

interface Stage {
  image: string
  id: string
  name: string
}

type RulesType = 'rainmaker' | 'clam_blitz' | 'tower_control' | 'splat_zones' | 'turf_war'
interface Rule {
  start_time: number
  end_time: number
  stage_a: Stage
  stage_b: Stage
  rule: {
    name: string
    key: RulesType
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

const RuleTranslate: Record<RulesType, string> = {
  'splat_zones': '区域',
  'tower_control': '塔',
  'clam_blitz': '蛤蜊',
  'rainmaker': '鱼',
  'turf_war': '涂地'
}

export class Splatoon2 extends BaseBotModule {
  stageCache: Schedules | null = null
  stageCacheMsg: Map<number, CQMessageList> = new Map()
  coopCache: CoopSchedules | null = null
  cacheImg: Map<string, Buffer> = new Map()
  groupRandom: Map<number, RandomContext> = new Map()
  id = 'splatoon2'
  name = 'Splatoon2'

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bot, bus } = ctx

    bus.registerMessage([bus.cmdFilter], e => this.onStage(e))
    bus.registerMessage([bus.cmdFilter], e => this.onRandom(e))

    if (!bot.isDebug) {
      console.log('preparing images...')
      this.getCurrentCoop()
      this.getCurrentStage(0)
      this.getCurrentStage(1)
    }
  }
  private async onStage (e: BotMessageEvent) {
    const { message } = e
    const atCode = e.groupId ? new CQCode('at', { qq: e.userId.toString() }) : ''
    if (message.includes('工')) {
      try {
        return cqStringify([atCode, ...await this.getCurrentCoop()])
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
      // 一次查询N张图
      let picCount = message.split('图').length - 1
      let result: CQMessageList = []
      picCount = Math.min(2, picCount)
      for (let i = 0; i < picCount; i++) {
        result.push(...await this.getCurrentStage(idx + i))
      }
      try {
        return cqStringify([atCode, ...result])
      } catch (e) {
        console.error(e)
        return `获取地图时出错, 请稍后再试`
      }
    }
  }
  private async onRandom (e: BotMessageEvent) {
    if (e.message.trim() === '随机武器') {
      if (!e.groupId) {
        return '随机武器不支持私聊~'
      }
      let rctx = this.groupRandom.get(e.groupId!)
      if (rctx === undefined) {
        rctx = {
          weaponsTeamA: [],
          weaponsTeamB: [],
          stages: [],
          id: 1
        }
        this.groupRandom.set(e.groupId!, rctx)
      }
      const buffer = await this.drawRandomWeapon(rctx)
      return cqStringify(this.getCQImage(buffer))
    }
  }

  private getURL (image: string): string {
    return `https://splatoon2.ink/assets/splatnet${image}`
  }
  private async drawBackground (ctx: CanvasRenderingContext2D, rect: Rect, color: string, linesColor: string = 'rgba(0,0,0,0.1)') {
    const patW = 60, patH = 60
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
  private drawVerticalMiddleText (ctx: CanvasRenderingContext2D, text: string, rect: Rect) {
    ctx.save()
    const {x, y, w, h} = rect
    const textToFill = text.split('').join('\n')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    const m = ctx.measureText(textToFill)
    const drawHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent

    ctx.fillText(textToFill, x + w / 2, y + (h - drawHeight) / 2)
    ctx.restore()
  }
  private async drawMode (ctx: CanvasRenderingContext2D, stageType: StageTypes, rule: Rule, x: number, y: number) {
    ctx.save()
    const ruleName = RuleTranslate[rule.rule.key]
    const ruleWidth = 55
    ctx.fillStyle = '#FFF'
    this.drawVerticalMiddleText(ctx, ruleName, {
      x: x + 5,
      y: y + 5,
      w: ruleWidth,
      h: StageSize.h
    })

    const r1 = await this.drawImage(ctx, rule.stage_a.image, {
      x: x + 5 + ruleWidth,
      y: y + 5,
      ...StageSize
    }, 5)
    const r2 = await this.drawImage(ctx, rule.stage_b.image, {
      x: x + 5 + ruleWidth + StageSize.w + 10,
      y: y + 5,
      ...StageSize
    }, 5)
    await this.drawRuleIcon(ctx, stageType, {
      x: r1.x,
      y: r1.y,
      w: r2.x + r2.w - r1.x,
      h: r1.h
    }, 0.6)
    ctx.restore()
    return {
      x: x + 5,
      y: r1.y,
      w: r2.x + r2.w - 5,
      h: r1.h
    }
  }
  private getTime (d: Date) {
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
    const [canvas, ctx] = this.getCanvas(560, 495)
    const timeStart = new Date(s.regular.start_time * 1000)
    const timeEnd = new Date(s.regular.end_time * 1000)
    const difEnd = moment.unix(s.regular.end_time).diff(moment())
    const timeRange = `${this.getTime(timeStart)} - ${this.getTime(timeEnd)}`

    ctx.font = '40px HaiPai, Roboto'
    await this.drawBackground(ctx, {
      x: 0,
      y: 0,
      w: canvas.width,
      h: canvas.height
    }, '#444')

    let r: Rect
    r = await this.drawMode(ctx, 'regular', s.regular, 0, 5)
    r = await this.drawMode(ctx, 'gachi', s.gachi, 0, r.y + r.h + 10)
    r = await this.drawMode(ctx, 'league', s.league, 0, r.y + r.h + 10)
    const textY = r.y + r.h + 5
    ctx.font = '28px Paintball'
    ctx.fillStyle = '#FFF'
    ctx.fillText(`${timeRange}`, 50, textY)

    return canvas.toBuffer('image/png')
  }
  private async drawWeapons (ctx: CanvasRenderingContext2D, s: CoopSchedule, rect: Rect) {
    const { x, y, w, h } = rect
    const weaponPadding = 5
    const calcSize = Math.min(rect.w, rect.h)
    const weaponSize = (Math.min(calcSize) - weaponPadding * 3) / 2
    const weaponUnit = weaponPadding + weaponSize + weaponPadding
    const xy = [
      [weaponPadding, weaponPadding],
      [weaponUnit, weaponPadding],
      [weaponPadding, weaponUnit],
      [weaponUnit, weaponUnit]
    ]
    const [offsetX, offsetY] = [
      calcSize < w ? (w - calcSize) / 2 : 0,
      calcSize < h ? (h - calcSize) / 2 : 0,
    ]
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
        x: x + offsetX + xy[i][0],
        y: y + offsetY + xy[i][1],
        w: weaponSize,
        h: weaponSize
      })
    }
    return rect
  }
  private async drawCoopLine (ctx: CanvasRenderingContext2D, s: CoopSchedule, x: number, y: number): Promise<Rect> {
    const textHeight = 30
    ctx.fillText(
      `${moment.unix(s.start_time).format('MM-DD HH:mm')} - ${moment.unix(s.end_time).format('MM-DD HH:mm')}`,
      x + 5, y
    )

    const weaponRect: Rect = {
      x: x + 5 + CoopStageSize.w + 5,
      y: y + textHeight,
      w: CoopStageSize.h,
      h: CoopStageSize.h
    }

    await this.drawImage(ctx, s.stage.image, {
      x: x + 5,
      y: y + textHeight,
      ...CoopStageSize
    }, 5)

    const r = await this.drawWeapons(ctx, s, weaponRect)
    return {
      x,
      y,
      w: r.x + r.w - x,
      h: textHeight + 5 + CoopStageSize.h,
    }
  }
  private difTimeToStr (dif: number) {
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
    const [canvas, ctx] = this.getCanvas(395, 390)
    const details = s.details
    const { start_time, end_time } = details[0]
    let time = ''
    let dif: number

    ctx.font = '24px Paintball'
    await this.drawBackground(ctx, {
      x: 0, y: 0,
      w: canvas.width, h: canvas.height
    }, '#ee612b')

    if (start_time > now) {
      dif = moment.unix(start_time).diff(moment())
      time = '离开始还有'
    } else {
      dif = moment.unix(end_time).diff(moment())
      time = '离结束还有'
    }

    time = `${time} ${this.difTimeToStr(dif)}`

    ctx.fillText(`${time}`, 5, 5)
    let r: Rect
    r = await this.drawCoopLine(ctx, details[0], 5, 5 + 25 + 10)
    r = await this.drawCoopLine(ctx, details[1], 5, r.y + r.h + 5)

    return canvas.toBuffer('image/png')
  }
  private async drawWeapon (ctx: CanvasRenderingContext2D, w: S2Weapon, x: number, y: number, b: boolean): Promise<Rect> {
    await this.drawImage(ctx, w.image, { x, y, w: 130, h: 130})
    let sub = w.sub.image_a
    let special = w.special.image_a
    if (b) {
      sub = w.sub.image_b
      special = w.special.image_b
    }
    await this.drawImage(ctx, sub, { x: x + 130 + 10, y, w: 60, h: 60 })
    const r = await this.drawImage(ctx, special, { x: x + 130 + 10, y: y + 60 + 10, w: 60, h: 60 })
    return {
      x, y,
      w: r.x + r.w - x,
      h: r.y + r.h - y
    }
  }
  private async drawTeam (ctx: CanvasRenderingContext2D, team: {
    weapons: S2Weapon[]
    color: string
    title: string
    isBeta: boolean
  }, x: number, y: number) {
    ctx.save()
    let curTop = y + 10
    const titleHeight = 60
    const rect: Rect = {
      x, y,
      w: 240, h: 10 + titleHeight + team.weapons.length * 140 + 10 + 10
    }
    this.drawBackground(ctx, rect, team.color)

    ctx.fillStyle = '#FFF'
    ctx.fillText(team.title, x + 10, curTop)
    curTop += titleHeight

    this.roundPath(ctx, ({ x, y, w, h }) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
      ctx.fillRect(x, y, w, h)
    }, {
      x: x + 10,
      y: curTop,
      w: rect.w - 20,
      h: rect.h - (curTop - y) - 10
    }, 5)

    curTop += 10
    for (let w of team.weapons) {
      const r = await this.drawWeapon(ctx, w, x + 20, curTop, team.isBeta)
      curTop += r.h + 10
    }

    ctx.restore()
  }
  private drawRandomHeader (ctx: CanvasRenderingContext2D, stage: S2Stage, id: number) {
    ctx.save()

    const headerHeight = 176
    const headerRect: Rect = {
      x: 0, y: 0,
      w: 490, h: headerHeight
    }

    const Rules: RulesType[] = ['splat_zones', 'tower_control', 'rainmaker']
    const randomRule = RuleTranslate[randomIn(Rules)]
    this.drawBackground(ctx, headerRect, '#444')
    ctx.fillStyle = '#FFF'
    ctx.fillText(`#${id}\n\n模式:${randomRule}`, 20, 20)

    this.drawImage(ctx, stage.image, { x: 236, y: 20, ...StageSize }, 5)

    ctx.restore()
    return headerRect
  }
  async drawRandomWeapon (rctx: RandomContext) {
    const [canvas, ctx] = this.getCanvas(490, 836)
    const { weapons } = splatoon2Data

    ctx.font = '36px HaiPai'
    if (rctx.stages.length === 0) {
      rctx.stages = shuffle(splatoon2Data.stages)
    }
    if (rctx.weaponsTeamA.length < 4) {
      rctx.weaponsTeamA = [...rctx.weaponsTeamA, ...shuffle(weapons)]
    }
    if (rctx.weaponsTeamB.length < 4) {
      rctx.weaponsTeamB = [...rctx.weaponsTeamB, ...shuffle(weapons)]
    }

    const { h: headerHeight } = this.drawRandomHeader(ctx, rctx.stages.shift()!, rctx.id++)
    const teamTop = headerHeight + 10
    await this.drawTeam(ctx, {
      weapons: rctx.weaponsTeamA.splice(0, 4),
      color: '#de447d',
      title: 'Alpha',
      isBeta: false
    }, 0, teamTop)

    await this.drawTeam(ctx, {
      weapons: rctx.weaponsTeamB.splice(0, 4),
      color: '#65d244',
      title: 'Bravo',
      isBeta: true
    }, 250, teamTop)

    return canvas.toBuffer('image/png')
  }
  // image: "/image/xxxx.png"
  private async drawImage(ctx: CanvasRenderingContext2D, image: string, rect: Rect, r = 0) {
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
  private async drawRuleIcon(ctx: CanvasRenderingContext2D, type: StageTypes, rect: Rect, r: number = 1) {
    const imgPath = path.join(dataPath, `/images/stage_types/${type}.png`)
    const img = await loadImage(await readFile(imgPath))
    const imgW = img.width * r
    const imgH = img.height * r
    const drawRect: Rect = {
      x: rect.x + (rect.w - imgW) / 2,
      y: rect.y + (rect.h - imgH) / 2,
      w: imgW,
      h: imgH
    }
    ctx.drawImage(img, drawRect.x, drawRect.y, drawRect.w, drawRect.h)
    return drawRect
  }
  private roundPath (ctx: CanvasRenderingContext2D, cb: (rect: Rect) => void, rect: Rect, r: number) {
    const { x, y, w, h } = rect
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
    cb(rect)
    ctx.restore()
  }
  private async getImage (url: string) {
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
  private async getCurrentCoop (): Promise<CQCode[]> {
    const now = Math.floor(Date.now() / 1000)
    let coopCache = this.coopCache
    if (!coopCache || coopCache.details[0].end_time < now) {
      console.log('splatoon2 coop cache not hit')
      coopCache = (await axios.get<CoopSchedules>('https://splatoon2.ink/data/coop-schedules.json')).data
      this.coopCache = coopCache
    }

    console.log('coop start drawing')

    const startTime = Date.now()
    const buffer = await this.drawCoopSchedule(coopCache)
    let msg = this.getCQImage(buffer)

    console.log(`drawing done, spend ${Date.now() - startTime}ms`)
    return msg
  }
  private getCQImage (buffer: Buffer) {
    return [new CQCode('image', {
      file: `base64://${buffer.toString('base64')}`
    })]
  }
  private async getCurrentStage (idx: number = 0) {
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

    let msg: CQMessageList = []
    if (this.bot.isPro) {
      const buffer = await this.drawSchedule({ regular, gachi, league })
      msg = this.getCQImage(buffer)
    } else {
      msg = [(
        `涂地: ${regular.stage_a.name}, ${regular.stage_b.name}\n` +
        `单排(${RuleTranslate[gachi.rule.key]}): ${gachi.stage_a.name}, ${gachi.stage_b.name}\n` +
        `组排(${RuleTranslate[league.rule.key]}): ${league.stage_a.name}, ${league.stage_b.name}`
      )]
    }

    console.log(`drawing done, spend ${Date.now() - startTime}ms`)
    this.stageCacheMsg.set(idx, msg)
    return msg
  }
  private getCanvas (width: number, height: number): [Canvas, CanvasRenderingContext2D] {
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d Context not found')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#FFF'
    ctx.font = '18px HaiPai, Paintball, Roboto'
    ctx.textBaseline = 'top'
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

async function main () {
  const sp2 = new Splatoon2()

  // const s = (await axios.get<Schedules>('https://splatoon2.ink/data/schedules.json')).data
  // const buf = await sp2.drawSchedule({
  //   regular: s.regular[0],
  //   gachi: s.gachi[0],
  //   league: s.league[0]
  // })

  // const s = (await axios.get<CoopSchedules>('https://splatoon2.ink/data/coop-schedules.json')).data
  // const buf = await sp2.drawCoopSchedule(s)

  const rctx = {
    weaponsTeamA: [],
    weaponsTeamB: [],
    stages: [],
    id: 1
  }
  const buf = await sp2.drawRandomWeapon(rctx)

  writeFileSync('pic.png', buf)
}
// main().catch(e => console.error(e))
