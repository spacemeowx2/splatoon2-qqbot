import { BaseBotModule, BotMessageEvent, BotModuleInitContext } from '../interface'
import { AdminControl } from './admin-control'
import { parse, UrlWithStringQuery } from 'url'
import { BotStorage } from '../storage'
import axios from 'axios'

const MonitorInterval = 60 * 1000 // 1min

interface RoomInfo {
  url: string
  host: string
  roomId: string
}
interface SiteMonitor {
  getHost(): string[]
  parseRoomId(u: UrlWithStringQuery): Promise<string | undefined>
  isRoomLive(room: RoomInfo): Promise<boolean>
  buildUrl(room: RoomInfo): string
}
class BilibiliMonitor implements SiteMonitor {
  getHost() {
    return ['live.bilibili.com']
  }
  async parseRoomId(u: UrlWithStringQuery) {
    if (u.pathname === undefined) {
      return undefined
    }
    const r = /^\/(\d+)/.exec(u.pathname)
    if (r === null) {
      return undefined
    }
    return r[1]
  }
  async isRoomLive(room: RoomInfo) {
    const { data } = await axios.get(this.buildUrl(room), {
      headers: {
        'User-Agent': 'splatoon2-qqbot',
        'Accept': 'text/html'
      }
    })
    const r = /"live_status":(\d)/.exec(data)

    return !!(r && r[1] === '1')
  }
  buildUrl(room: RoomInfo) {
    return `https://live.bilibili.com/${room.roomId}`
  }
}
enum RoomStatus {
  NotFetched,
  Streaming,
  NotStreaming
}
class RoomMonitor {
  lastTime: number = 0 // in sec
  lastLive: RoomStatus = RoomStatus.NotFetched
  tid: NodeJS.Timer
  monitor: SiteMonitor
  onStatusChange?: (room: RoomInfo, prev: RoomStatus, cur: RoomStatus) => void
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
    if (this.onStatusChange) {
      const r = await this.monitor.isRoomLive(this.room)
      const cur = r ? RoomStatus.Streaming : RoomStatus.NotStreaming
      if (this.lastLive !== cur) {
        this.onStatusChange(this.room, this.lastLive, cur)
      }
      this.lastLive = cur
    }
    this.tid = setTimeout(() => this.request(), this.interval)
  }
  stop () {
    clearTimeout(this.tid)
  }
}
class LiveMonitor {
  static Monitors: SiteMonitor[] = [new BilibiliMonitor()]
  static SupportedHost: string[] = LiveMonitor.Monitors.map(i => i.getHost()).reduce((l, i) => [...l, ...i], [])

  static findMonitor(host: string) {
    return this.Monitors.find(i => i.getHost().includes(host))
  }
  static roomCmp(a: RoomInfo, b: RoomInfo) {
    return (a.host === b.host) && (a.roomId === b.roomId)
  }
  static roomUnique(r: RoomInfo) {
    return `${r.host}/${r.roomId}`
  }
  static async parseRoom(url: string) {
    const u = parse(url)
    if (!u.host) return undefined
    if (!this.SupportedHost.includes(u.host)) {
      return undefined
    }

    const monitor = this.findMonitor(u.host)
    if (monitor === undefined) {
      return undefined
    }
    const roomId = await monitor.parseRoomId(u)
    if (roomId === undefined) {
      return undefined
    }

    const info: RoomInfo = {
      host: u.host,
      roomId,
      url
    }
    return info
  }

  rooms: Map<RoomInfo, RoomMonitor> = new Map()
  constructor(private live: LiveNotification) {

  }
  setRooms (rooms: RoomInfo[]) {
    const curSet = [...this.rooms.keys()]
    const deleted = curSet.filter(a => !rooms.some(b => LiveMonitor.roomCmp(a, b)))
    const added = rooms.filter(a => !curSet.some(b => LiveMonitor.roomCmp(a, b)))

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
  private handleStatusChange = (room: RoomInfo, prev: RoomStatus, cur: RoomStatus) => {
    if (prev === RoomStatus.NotFetched) {
      return
    }
    if (cur === RoomStatus.Streaming) {
      this.live.roomStart(room)
    } else if (cur === RoomStatus.NotStreaming) {
      this.live.roomStop(room)
    }
  }
}

export class LiveNotification extends BaseBotModule {
  id = 'live-notification'
  name = '直播提醒'
  defaultEnable = true
  private admin!: AdminControl
  private monitor = new LiveMonitor(this)
  private roomGroup: Map<RoomInfo, number[]> = new Map()

  getDeps () {
    return {
      'admin': AdminControl
    }
  }
  updateRooms() {
    const r = this.getAllRooms()
    this.monitor.setRooms([...r.keys()])
    this.roomGroup = r
  }
  init (ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus, deps } = ctx
    this.admin = deps.admin as AdminControl

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
  roomStart (room: RoomInfo) {
    console.log('start', room)
    const key = [...this.roomGroup.keys()].find(i => LiveMonitor.roomCmp(i, room))
    if (key === undefined) {
      console.log('room key not found')
      return
    }
    const gs = this.roomGroup.get(key)!
    for (const gid of gs) {
      this.bot.sendGroupMessage(gid, `${room.url} 开播啦`)
    }
  }
  roomStop (room: RoomInfo) {
    console.log('stop', room)
  }
  getAllRooms () {
    const groups = this.getJSON<number[]>(this.storage, 'groups') || []
    let cache: Map<string, RoomInfo> = new Map()
    let rooms: Map<RoomInfo, number[]> = new Map()

    for (const gid of groups) {
      const list = this.loadList(gid) || []
      for (const room of list) {
        const ruid = LiveMonitor.roomUnique(room)
        if (!cache.has(ruid)) {
          cache.set(ruid, room)
        }

        const k = cache.get(ruid)!
        let v = rooms.get(k) || []
        v.push(gid)
        rooms.set(k, v)
      }
    }

    return rooms
  }
  getJSON<T> (s: BotStorage, key: string) {
    let json: T | undefined
    try {
      json = JSON.parse(s.get(key)!)
    } catch {}
    return json
  }
  setJSON (s: BotStorage, key: string, v: any) {
    s.set(key, JSON.stringify(v))
  }
  loadList (groupId: number) {
    const groupStor = this.storage.getChild<string>(groupId.toString())
    return this.getJSON<RoomInfo[]>(groupStor, 'list')
  }
  saveList (groupId: number, list: RoomInfo[]) {
    let groups = this.getJSON<number[]>(this.storage, 'groups') || []
    if (list.length > 0) {
      if (!groups.includes(groupId)) {
        groups.push(groupId)
        this.setJSON(this.storage, 'groups', groups)
      }
    } else {
      const idx = groups.indexOf(groupId)
      if (idx !== -1) {
        groups.splice(idx, 1)
        this.setJSON(this.storage, 'groups', groups)
      }
    }
    this.updateRooms()
    const groupStor = this.storage.getChild<string>(groupId.toString())
    this.setJSON(groupStor, 'list', list)
  }
  async onMessage (e: BotMessageEvent) {
    const { message } = e
    const groupId = e.groupId!
    const splited = message.trim().split(' ')

    const cmd = splited[0]
    const groupStor = this.storage.getChild<string>(e.groupId!.toString())
    const isAdmin = this.admin.isAdmin(e.groupId!, e.userId)
    const adminCmds = ['添加', '删除']

    if (adminCmds.includes(cmd) && !isAdmin) {
      return '该命令只有管理员能使用'
    }

    let list = this.loadList(groupId) || []

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

        const r = list.find(i => LiveMonitor.roomCmp(i, room))
        if (r !== undefined) {
          return '该直播间已存在'
        }

        list.push(room)
        this.saveList(groupId, list)
        return '添加成功'
      }
      case '删除': {
        const url = splited[1]
        const room = await LiveMonitor.parseRoom(url)
        if (room === undefined) {
          return '解析地址失败'
        }

        const idx = list.findIndex(i => LiveMonitor.roomCmp(i, room))
        if (idx === -1) {
          return '该直播间不存在'
        }

        list.splice(idx, 1)
        this.saveList(groupId, list)

        return '删除成功'
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
直播提醒 配置           显示该群的直播提醒配置`
  }
  help () {
    return `直播提醒
输入 "@bot 直播提醒 命令" 查看详细帮助`
  }
}
