import { BaseBotModule, BotModuleInitContext, BotMessageType, BotModule, BotRequestEvent, BotMessageEvent, AnyFilter, BotRequestType, BotRequestSubType, isBotMessageEvent, MessageFilter } from '../interface'
import { BotStorage } from '../storage'

const RequestTimeout = 24 * 60 * 60 * 1000 // 1day
const RequestTimeoutStr = '1天'

interface PendingRequest {
  expireAt: number
  onApprove: () => void
  onReject: (reason: string) => void
  getDetail: () => Promise<string>
  raw: string
}
type ExcludeExpireAt<T> = {
  [P in Exclude<keyof T, 'expireAt'>]: T[P];
}

export class AdminControl extends BaseBotModule {
  id = 'admin_control'
  name = '管理模块'
  adminQQ: number[] = []
  requestMap: Map<number, PendingRequest> = new Map()
  enableStorage!: BotStorage<Record<number, boolean | undefined>>

  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus, storage } = ctx

    this.enableStorage = storage.getChild('enable')
    this.bot.setGroupEnabledHandler(this.enabledFilter)
    bus.registerMessage([bus.privateFilter, this.adminFilter], e => this.onAdmin(e))
    bus.registerMessage([bus.privateFilter], e => this.onPrivate(e))
    bus.registerRequest([this.groupInviteFilter], e => this.onInvite(e))
    bus.registerMessage([bus.atMeFilter, this.adminFilter], e => (e.message.trim() === '群号') ? `群号: ${e.groupId!}` : undefined)
    bus.registerMessage([bus.groupTypeFilter, bus.atMeFilter], e => this.onGroup(e))
  }

  async onInvite (e: BotRequestEvent) {
    console.log('request.group.invite', e)
    let { flag, subType, userId, groupId, selfId } = e

    await this.generateRequest({
      onApprove: () => {
        this.bot.send('set_group_add_request', {
          flag,
          sub_type: subType,
          approve: true
        })
      },
      onReject: (reason: string) => {
        this.bot.send('set_group_add_request', {
          flag,
          sub_type: subType,
          approve: false,
          reason
        })
      },
      getDetail: async () => {
        return JSON.stringify(await this.bot.send('_get_group_info', {
          group_id: groupId
        }), null, 2)
      },
      raw: JSON.stringify(e)
    }, `QQ: ${userId} 邀请 ${selfId} 进群 ${groupId}`)
  }
  onAdmin (e: BotMessageEvent) {
    let { message } = e
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
          return '已接受'
        }
      } else {
        return '未找到ID, 可能已经同意或超时'
      }
    } else if (message.startsWith('拒绝')) {
      const [pre, reason] = message.split(/\s+/)
      if (!reason) {
        return '请输入拒绝理由'
      }
      let id = parseInt(pre.substring(2))
      let res = this.requestMap.get(id)
      if (res) {
        this.requestMap.delete(id)
        if (res.expireAt < Date.now()) {
          return '该请求已超时'
        } else {
          res.onReject(reason)
          return '已拒绝'
        }
      } else {
        return '未找到ID, 可能已经同意或超时'
      }
    } else if (message.startsWith('详情')) {
      let id = parseInt(message.substring(2))
      let res = this.requestMap.get(id)
      if (res) {
        return res.getDetail()
      } else {
        return '未找到ID, 可能已经同意或超时'
      }
    }
  }
  async isAdmin (groupId: number, userId: number) {
    if (this.adminQQ.includes(userId)) {
      return true
    }
    let r: any = await this.bot.send('get_group_member_info', {
      group_id: groupId,
      user_id: userId
    })
    if (r.retcode === 0) {
      const role = r.data.role
      const isAdmin = role === 'owner' || role === 'admin'

      return isAdmin
    } else {
      throw new Error('获取群信息失败, 请检查群号码')
    }
  }
  async isMember (groupId: number, userId: number) {
    if (this.adminQQ.includes(userId)) {
      return true
    }
    let r: any = await this.bot.send('get_group_member_info', {
      group_id: groupId,
      user_id: userId
    })
    if (r.retcode === 0) {
      const role = r.data.role
      const isMember = role === 'owner' || role === 'admin' || role === 'member'

      return isMember
    } else {
      throw new Error('获取群信息失败, 请检查群号码')
    }
  }
  private listModules (groupId: number) {
    let out: string[] = ['ID  名称  是否开启']
    for (let m of this.bot.getModules()) {
      if (m.name === '') continue
      out.push(`${m.id}  ${m.name}  ${this.isModuleEnabled(groupId, m) ? `已开启` : `已关闭`}`)
    }
    return out.join('\n')
  }
  private setModuleEnable (groupId: number, mid: string, val: boolean) {
    let dict = this.enableStorage.get(mid)
    if (dict === undefined) {
      dict = {}
    }
    const mids = this.bot.getModules().map(i => i.id)
    if (!mids.includes(mid)) {
      return '模块ID错误, 请确定ID是全英文字符'
    }
    dict[groupId] = val
    this.enableStorage.set(mid, dict)
    return `${val ? '开启' : '关闭'} ${mid} 成功`
  }
  async onGroup (e: BotMessageEvent) {
    try {
      let { message, userId } = e
      const groupId = e.groupId!
      if (!await this.isAdmin(groupId, userId)) {
        return
      }
      const [cmd, arg1] = message.trim().split(/\s+/)
      if (cmd === '列出模块') {
        return this.listModules(groupId)
      } else if (cmd === '关闭模块') {
        return this.setModuleEnable(groupId, arg1, false)
      } else if (cmd === '开启模块') {
        return this.setModuleEnable(groupId, arg1, true)
      }
    } catch (e) {
      return
    }
  }
  async onPrivate (e: BotMessageEvent) {
    try {
      let { message, userId } = e

      if (message.startsWith('列出模块')) {
        message = message.substr(4)
        let groupId = parseInt(message.trim())

        if (!this.isMember(groupId, userId)) {
          return `你还不是该群成员`
        }

        return this.listModules(groupId)
      } else if (message.startsWith('关闭模块') || message.startsWith('开启模块')) {
        let val = message.startsWith('开启模块')
        message = message.substr(4)
        let args = message.split(/\s+/).filter(i => i.length > 0)
        let groupId = parseInt(args[0])
        let mid = args[1]
        if (await this.isAdmin(groupId, userId)) {
          return this.setModuleEnable(groupId, mid, val)
        } else {
          return '你没有权限(该群管理员权限)'
        }
      }
    } catch (e) {
      console.error('err', e)
    }
  }

  async sendToAdmin (message: string) {
    for (let qq of this.adminQQ) {
      await this.bot.sendPrivateMessage(qq, message)
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
    return this.sendToAdmin(`${description} 回复 "同意${id}" 接受邀请, ${RequestTimeoutStr}超时`)
  }

  isModuleEnabled (groupId: number, m: BotModule) {
    let dict = this.enableStorage.get(m.id)
    let ret: boolean | undefined
    if (dict === undefined) {
      ret = m.defaultEnable
    } else {
      ret = dict[groupId]
      if (ret === undefined) {
        ret = m.defaultEnable
      }
    }
    return ret
  }
  enabledFilter: MessageFilter = (e, { module: m }) => {
    if (isBotMessageEvent(e)) {
      if (e.messageType === BotMessageType.Group) {
        let r = this.isModuleEnabled(e.groupId!, m)
        return r
      }
    }
    return true
  }
  adminFilter = (e: BotMessageEvent) => {
    return this.adminQQ.includes(e.userId)
  }
  groupInviteFilter (e: BotRequestEvent) {
    return ((e.requestType === BotRequestType.Group) && (e.subType === BotRequestSubType.Invite))
  }
  help (e: BotMessageEvent) {
    if (e.messageType === BotMessageType.Private) {
      return `直接邀请机器人进群, 经过管理员审核后会加入.
以 '*' 开头的指令需要该群管理员权限 输入以下指令进行管理(不需输入花括号):
  列出模块 {QQ群号}
* 关闭模块 {QQ群号} {模块ID}
* 开启模块 {QQ群号} {模块ID}`
    } else {
      return `管理员可使用的指令:
列出模块
关闭模块 模块ID
开启模块 模块ID`
    }
  }
}
