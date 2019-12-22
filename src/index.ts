import { CQWebSocketOption } from 'cq-websocket'
import { Splatoon2 } from './modules/splatoon2'
import { TSBot } from './tsbot'
import { AdminControl } from './modules/admin-control'
import { Dice } from './modules/dice'
import { LiveNotification } from './modules/live-notification'
import { AIChat, ChatProvider } from './modules/aichat'
import { Repeater } from './modules/repeater'
import { DingGG } from './modules/dgg'
import { Priva } from './modules/priva'
import { PictureSender } from './modules/pic-sender'
import { AtAll } from './modules/at-all'
import { PersonalData } from './modules/personal-data'
import { HorseRacing } from './modules/horse-racing'
import { GifReverse } from './modules/gif-reverse'
import { ThankRedpack } from './modules/thank-redpack'
import { Splatnet2 } from './modules/splatnet2'
import { SeTu } from './modules/setu'

async function main () {
  const access_token = process.env.CQ_ACCESS_TOKEN
  if (!access_token) {
    console.warn('WARNING: no access_token is set, will use undefined')
  }
  const host = process.env.CQ_HOST || '127.0.0.1'
  const port = process.env.CQ_PORT ? parseInt(process.env.CQ_PORT) : 6700

  console.log(`Connecting to host ${host}:${port}`)
  const opt: Partial<CQWebSocketOption> = {
    access_token,
    host,
    port
  }

  const adminControl = new AdminControl()
  const thankRedpack = new ThankRedpack()
  if (process.env.TSBOT_ADMIN) {
    adminControl.adminQQ.push(parseInt(process.env.TSBOT_ADMIN))
    thankRedpack.notifyQQ.push(parseInt(process.env.TSBOT_ADMIN))
  }
  const bot = new TSBot(opt)

  bot.blackList = JSON.parse(process.env.TSBOT_BLACKLIST || '[]')
  bot.isPro = true
  bot.registerModule(adminControl)
  bot.registerModule(new Splatnet2())
  // bot.registerModule(new HorseRacing())
  bot.registerModule(thankRedpack)
  bot.registerModule(new PersonalData())
  bot.registerModule(new AtAll())
  bot.registerModule(new PictureSender())
  bot.registerModule(new Dice())
  bot.registerModule(new Repeater())
  bot.registerModule(new Splatoon2())
  bot.registerModule(new DingGG())
  bot.registerModule(new Priva())
  bot.registerModule(new LiveNotification())
  bot.registerModule(new GifReverse())
  bot.registerModule(new SeTu())
  if (process.env.TULING123_TOKEN) {
    bot.registerModule(AIChat(ChatProvider.Tuling123, {
      apiKey: process.env.TULING123_TOKEN
    }))
  } else if (process.env.QQAI_APPID && process.env.QQAI_APPKEY) {
    bot.registerModule(AIChat(ChatProvider.QQAI, {
      appId: process.env.QQAI_APPID,
      appKey: process.env.QQAI_APPKEY
    }))
  }
  await bot.connect()
}

main().catch(e => console.error(e))
