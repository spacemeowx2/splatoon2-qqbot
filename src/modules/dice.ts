import { BaseBotModule, TSBot, TSBotEventBus, BotMessageEvent, MessageFilter } from '../interface'
const diceRe = /^(\d+)d(\d+)$/

export class Dice extends BaseBotModule {
  name = '简单骰子'

  init (bot: TSBot, bus: TSBotEventBus) {
    super.init(bot, bus)
    bus.registerMessage([this.diceFilter], e => this.onDice(e))
  }
  diceFilter (e: BotMessageEvent): boolean {
    return diceRe.test(e.message)
  }
  onDice (e: BotMessageEvent) {
    const { message } = e
    const [_, sx, sy] = diceRe.exec(message)!
    let x = parseInt(sx)
    let y = parseInt(sy)
    let numbers: number[] = []
    let sum = 0
    if (x > 10) {
      return '太...太大惹'
    }
    for (let i = 0; i < x; i++) {
      let z = Math.floor(Math.random() * y) + 1
      numbers.push(z)
      sum += z
    }
    if (x === 1) {
      return `${sum}`
    } else {
      return `${numbers.join('+')}=${sum}`
    }
  }
  help () {
    return '骰子: xdy, x, y 均为数字, x 需小于等于 10'
  }
}
