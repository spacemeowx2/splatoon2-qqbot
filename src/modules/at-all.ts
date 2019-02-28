import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'
const ExpireTime = 15 * 60 * 1000
const DefaultTriggerSize = 7

interface GroupInfo {
  idTime: Map<number, number>
}
export class AtAll extends BaseBotModule {
  id = 'atall'
  name = '@全体成员'
  defaultEnable = false
  timesMap = new Map<number, GroupInfo>()

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    bus.registerMessage([bus.groupTypeFilter], e => this.onRequest(e))
    bus.registerMessage([bus.atMeFilter], e => this.onConfirm(e))
  }
  getTriggerSize (groupId: number) {
    const s = this.storage.getChild(groupId.toString())
    let t = s.get<number>('triggerSize')
    if (t === undefined) {
      t = DefaultTriggerSize
    }
    return t
  }
  getGroupInfo (groupId: number) {
    let info = this.timesMap.get(groupId)
    if (info === undefined) {
      info = { idTime: new Map() }
      this.timesMap.set(groupId, info)
    }
    this.deleteExpire(info)
    return info
  }
  deleteExpire (info: GroupInfo) {
    const now = Date.now()
    let idToDel: number[] = []
    for (let [id, time] of info.idTime) {
      if (now - time > ExpireTime) {
        idToDel.push(id)
      }
    }
    for (let i of idToDel) {
      info.idTime.delete(i)
    }
  }
  onRequest (e: BotMessageEvent) {
    const { message, userId, groupId } = e
    if (groupId === undefined) return
    if (message.trim() === '我要私房') {
      const { idTime } = this.getGroupInfo(groupId)
      idTime.set(userId, Date.now())

      if (idTime.size >= this.getTriggerSize(groupId)) {
        return `已经召唤${ idTime.size }条神龙, 发送: "@bot 确定" 即可@全体成员`
      }
    }
  }
  onConfirm (e: BotMessageEvent) {
    const { message, userId, groupId } = e
    if (groupId === undefined) return
    if (message.trim() === '确定') {
      const { idTime } = this.getGroupInfo(groupId)
      if (idTime.size >= this.getTriggerSize(groupId) && idTime.has(userId)) {
        const ret = `[CQ:at,qq=all] ${[...idTime.keys()].map(id => `[CQ:at,qq=${id}]`).join(' ')} 召唤全体成员啦`
        idTime.clear()
        return ret
      }
    }
  }
  help () {
    return `召集7个人复读: 我要私房
15分钟内有7人发言 "我要私房" 则可@全体成员`
  }
}
