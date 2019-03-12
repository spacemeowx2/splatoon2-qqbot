import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../../interface'
import { AdminControl } from '../admin-control'
import { parse } from 'url'
import { cqCode } from '../../utils/cqcode'
import { RoomLastInfo, RoomStatus, RoomLivingInfo, SiteMonitor, RoomInfo, roomCmp, roomUniqueKey, RoomInfoWithGroups } from './types'
import { BilibiliMonitor } from './bilibili'
import { LiveNotificationStorage } from './storage'

const MonitorInterval = 60 * 1000 // 1min

class RoomMonitor implements RoomLastInfo {
  lastTime: number = 0 // in sec
  lastLive: RoomStatus = RoomStatus.NotFetched
  lastInfo?: RoomLivingInfo
  tid: NodeJS.Timer
  monitor: SiteMonitor
  onStatusChange?: (room: RoomInfo, prev: RoomStatus, cur: RoomStatus, info: RoomLivingInfo) => void
  constructor (public room: RoomInfo, private interval: number) {
    const m = LiveMonitor.findMonitor(room.host)
    if (m) {
      this.monitor = m
      this.tid = setTimeout(() => this.request(), 0)
    } else {
      console.log('room', room)
      throw new Error('Monitor not found')
    }
  }
  async request () {
    try {
      if (this.onStatusChange) {
        const [r, info] = await this.monitor.getRoomInfo(this.room)
        const cur = r ? RoomStatus.Streaming : RoomStatus.NotStreaming
        if (this.lastLive !== cur) {
          this.onStatusChange(this.room, this.lastLive, cur, info)
        }
        this.lastLive = cur
        this.lastTime = Math.floor(Date.now() / 1000)
        this.lastInfo = info
      }
    } catch (e) {
      console.error('monitor request error', e)
    }
    this.tid = setTimeout(() => this.request(), this.interval)
  }
  stop () {
    clearTimeout(this.tid)
  }
  getRoomLastInfo (): RoomLastInfo {
    return {
      lastInfo: this.lastInfo,
      lastTime: this.lastTime,
      lastLive: this.lastLive
    }
  }
}
class LiveMonitor {
  static Monitors: SiteMonitor[] = [new BilibiliMonitor()]
  static SupportedHost: string[] = LiveMonitor.Monitors.map(i => i.getHost()).reduce((l, i) => [...l, ...i], [])

  static findMonitor(host: string) {
    return this.Monitors.find(i => i.getHost().includes(host))
  }
  static async parseRoom(url: string) {
    const u = parse(url)
    if (!u.host) return undefined
    if (!this.SupportedHost.includes(u.host)) {
      return
    }

    const monitor = this.findMonitor(u.host)
    if (monitor === undefined) {
      return
    }

    const room = await monitor.parseRoom(u)
    if (room === undefined) {
      return
    }

    return room
  }

  rooms: Map<RoomInfo, RoomMonitor> = new Map()
  constructor(private live: LiveNotification) {

  }
  setRooms (rooms: RoomInfo[]) {
    const curSet = [...this.rooms.keys()]
    const deleted = curSet.filter(a => !rooms.some(b => roomCmp(a, b)))
    const added = rooms.filter(a => !curSet.some(b => roomCmp(a, b)))

    console.log(`add ${added.length} deleted ${deleted.length}`)

    for (const i of deleted) {
      this.rooms.get(i)!.stop()
      this.rooms.delete(i)
    }
    for (const i of added) {
      const m = new RoomMonitor(i, MonitorInterval)
      m.onStatusChange = this.handleStatusChange
      this.rooms.set(i, m)
    }
  }
  getRoomLastInfo (room: RoomInfo): RoomLastInfo {
    const k = [...this.rooms.keys()].find(i => roomCmp(i, room))
    if (k === undefined) {
      throw new Error('getLastStatus room key not found')
    }
    const m = this.rooms.get(k)!
    return m.getRoomLastInfo()
  }
  private handleStatusChange = (room: RoomInfo, prev: RoomStatus, cur: RoomStatus, info: RoomLivingInfo) => {
    if (prev === RoomStatus.NotFetched) {
      return
    }
    if (cur === RoomStatus.Streaming) {
      this.live.roomStart(room, info)
    } else if (cur === RoomStatus.NotStreaming) {
      this.live.roomStop(room, info)
    }
  }
}

export class LiveNotification extends BaseBotModule {
  id = 'live-notification'
  name = '直播提醒'
  defaultEnable = true
  private admin!: AdminControl
  private monitor = new LiveMonitor(this)
  private stor!: LiveNotificationStorage

  getDeps () {
    return {
      'admin': AdminControl
    }
  }
  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus, deps } = ctx
    this.admin = deps.admin as AdminControl
    this.stor = new LiveNotificationStorage(this.storage)

    bus.registerMessage([bus.atMeFilter, this.cmdFilter], e => this.onMessage(e))
    this.updateRooms()
  }
  cmdFilter (e: BotMessageEvent) {
    const [ cmd, ...rest ] = e.message.split(' ')
    if (cmd !== '直播提醒') {
      return false
    }
    e.message = rest.join(' ')
    return true
  }
  updateRooms () {
    this.monitor.setRooms(this.stor.getRooms())
  }
  makeStartMessageByConfig ({ info: room, config: { config } }: RoomInfoWithGroups, info: RoomLivingInfo) {
    const { title, user, avatar } = info
    let msgs: string[] = []
    if (process.env.DISABLE_SHARE === '1') {
      msgs.push(`直播提醒:
标题: ${title}
UP主: ${user}
${room.url}`)
    } else {
      msgs.push(cqCode('share', {
        url: room.url,
        title: `直播提醒: ${title}`,
        content: `UP主: ${user}`,
        image: avatar || ''
      }))
    }
    if (config['atall']) {
      msgs.push(cqCode('at', { qq: 'all' }))
    }
    return msgs
  }
  makeStopMessageByConfig ({ info: room, config: { config } }: RoomInfoWithGroups, info: RoomLivingInfo) {
    if (!config['stop']) {
      return []
    }
    const { title, user } = info
    let msgs: string[] = []
      msgs.push(`停止直播:
标题: ${title}
UP主: ${user}
${room.url}`)
    return msgs
  }
  roomStart (room: RoomInfo, info: RoomLivingInfo) {
    console.log('start', room)
    const gs = this.stor.getConfigByRoom(room)
    console.log(`roomStart notify ${gs.map(i => i.config.gid).join(',')}`)
    for (const group of gs) {
      for (const message of this.makeStartMessageByConfig(group, info)) {
        this.bot.send('send_group_msg', {
          group_id: group.config.gid,
          message
        })
      }
    }
  }
  roomStop (room: RoomInfo, info: RoomLivingInfo) {
    console.log('stop', room)
    const gs = this.stor.getConfigByRoom(room)
    console.log(`roomStop notify ${gs.map(i => i.config.gid).join(',')}`)
    for (const group of gs) {
      for (const message of this.makeStopMessageByConfig(group, info)) {
        this.bot.send('send_group_msg', {
          group_id: group.config.gid,
          message
        })
      }
    }
  }
  async onMessage (e: BotMessageEvent) {
    const { message } = e
    const groupId = e.groupId!
    const splited = message.trim().split(' ')

    const cmd = splited[0]
    const isAdmin = await this.admin.isAdmin(e.groupId!, e.userId)
    const adminCmds = ['添加', '删除']

    if (adminCmds.includes(cmd) && !isAdmin) {
      return '该命令只有管理员能使用'
    }

    const list = this.stor.getGroupList(groupId)

    switch (cmd) {
      case '': {
        console.log('a ')
        return
      }
      case '添加': {
        const url = splited[1]
        const room = await LiveMonitor.parseRoom(url)
        if (room === undefined) {
          return '解析地址失败'
        }

        if (list.hasRoom(room)) {
          return '该直播间已存在'
        }

        list.addRoom(room)
        this.updateRooms()

        return '添加成功'
      }
      case '删除': {
        const url = splited[1]
        const room = await LiveMonitor.parseRoom(url)
        if (room === undefined) {
          return '解析地址失败'
        }

        if (!list.hasRoom(room)) {
          return '该直播间不存在'
        }

        list.delRoom(room)
        this.updateRooms()

        return '删除成功'
      }
      case '配置': {
        if (list.length === 0) {
          return '该群无直播提醒配置'
        } else {
          return [...list].map((i, no) => `${no + 1}. ${i.url}`).join('\n')
        }
      }
      case '状态': {
        if (list.length === 0) {
          return '该群无直播提醒配置'
        } else {
          return [...list].map((i, no) => {
            const { lastInfo, lastTime, lastLive } = this.monitor.getRoomLastInfo(i)
            let prefix = `${no + 1}. ${i.url}`
            const fetchTime = ((lastTime === 0) || (lastLive === RoomStatus.NotFetched))
              ? ''
              : `上次获取: ${Math.floor(Date.now() / 1000 - lastTime)}秒前`
            if (lastLive === RoomStatus.Streaming && lastInfo) {
              return `${prefix} 直播中 标题: ${lastInfo.title} UP主: ${lastInfo.user} ${fetchTime}`
            } else if (lastLive === RoomStatus.NotFetched) {
              return `${prefix} 未获取`
            } else if (lastInfo) {
              return `${prefix} 未开播 UP主: ${lastInfo.user} ${fetchTime}`
            } else {
              return `${prefix} 未开播 ${fetchTime}`
            }
          }).join('\n')
        }
      }
      default: {
        return this.detailHelp()
      }
    }
  }
  detailHelp () {
    return `所有指令均需要 @bot, 以下说明中省略 @
管理员指令:
直播提醒 添加 [直播间地址]  将该直播间添加到提醒列表
直播提醒 删除 [直播间地址]  将该直播间从提醒列表移除
* 目前仅支持b站直播

普通指令:
直播提醒 配置           显示该群的直播提醒配置
直播提醒 状态           显示该群监控列表的当前状态`
  }
  help () {
    return `直播提醒
输入 "@bot 直播提醒 命令" 查看详细帮助`
  }
}
