import { CQWebSocketOption } from 'cq-websocket'
import { Splatoon2 } from './modules/splatoon2'
import { TSBot } from './tsbot'
import { AdminControl } from './modules/admin-control'
import { Dice } from './modules/dice'
import { Eval } from './modules/eval'
import { Tuling123 } from './modules/tuling123'
import { Repeater } from './modules/repeater'
import { DingGG } from './modules/dgg'

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
  if (process.env.TSBOT_ADMIN) {
    adminControl.adminQQ.push(parseInt(process.env.TSBOT_ADMIN))
  }
  const bot = new TSBot(opt)

  bot.isPro = true
  bot.registerModule(new Dice())
  bot.registerModule(new Repeater())
  bot.registerModule(adminControl)
  bot.registerModule(new Splatoon2())
  bot.registerModule(new DingGG())
  if (process.env.TULING123_TOKEN) {
    bot.registerModule(new Tuling123(process.env.TULING123_TOKEN))
  }
  bot.connect()
}

main().catch(e => console.error(e))
