import { TSBot, BaseBotModule, TSBotEventBus, BotMessageType } from '../interface'
import { BotMessageEvent, BotRequestEvent, BotRequestType, BotRequestSubType } from '../tsbot'

const RequestTimeout = 30 * 60 * 1000 // 30min
const RequestTimeoutStr = '30分钟'

interface PendingRequest {
  expireAt: number
  onApprove: Function
  raw: string
}
type ExcludeExpireAt<T> = {
  [P in Exclude<keyof T, 'expireAt'>]: T[P];
}

export class AdminControl extends BaseBotModule {
  name = '管理模块'
  adminQQ: number[] = []
  requestMap: Map<number, PendingRequest> = new Map()

  init (bot: TSBot, bus: TSBotEventBus) {
    super.init(bot, bus)
    bus.registerMessage([bus.privateFilter], e => this.processRequest(e))
    bus.registerRequest([this.groupInviteFilter], e => this.onInvite(e))
  }

  onInvite (e: BotRequestEvent) {
    console.log('request.group.invite', e)
    let { flag, subType, userId, groupId, selfId } = e

    this.generateRequest({
      onApprove: () => {
        this.bot.send('set_group_add_request', {
          flag,
          sub_type: subType,
          approve: true
        })
      },
      raw: JSON.stringify(e)
    }, `QQ: ${userId} 邀请 ${selfId} 进群 ${groupId}`)
  }
  processRequest (e: BotMessageEvent): void | string {
    try {
      let { message, userId } = e

      if (!this.adminQQ.includes(userId)) {
        this.sendToAdmin(`${userId} 向我发送了:\n${message}`)
        return
      }

      if (message === 'exit') {
        return this.bot.exit()
      }
      if (message.startsWith('同意')) {
        let id = parseInt(message.substring(2))
        let res = this.requestMap.get(id)
        console.log('shit', id, res)
        if (res) {
          this.requestMap.delete(id)
          if (res.expireAt < Date.now()) {
            return '该请求已超时'
          } else {
            res.onApprove()
            return ''
          }
        } else {
          return '未找到ID, 可能已经同意或超时'
        }
      }
    } catch (e) {
      console.error('err', e)
    }
  }

  sendToAdmin (message: string) {
    for (let qq of this.adminQQ) {
      this.bot.sendPrivateMessage(qq, message)
    }
  }

  generateRequest (callbacks: ExcludeExpireAt<PendingRequest>, description: string) {
    const requestMap = this.requestMap
    let req = {
      ...callbacks,
      expireAt: Date.now() + RequestTimeout
    }
    let id: number = -1
    for (let i = 1; i < Infinity; i++) {
      if (!requestMap.has(i)) {
        id = i
        requestMap.set(i, req)
        break
      }
    }
    this.sendToAdmin(`${description} 回复 "同意${id}" 接受邀请, ${RequestTimeoutStr}超时`)
  }

  groupInviteFilter (e: BotRequestEvent) {
    return ((e.requestType === BotRequestType.Group) && (e.subType === BotRequestSubType.Invite))
  }
  help (e: BotMessageEvent) {
    if (e.messageType === BotMessageType.Private) {
      return '啊哈哈哈'
    } else {
      return ''
    }
  }
}
