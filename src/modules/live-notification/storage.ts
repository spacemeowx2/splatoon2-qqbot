import { BotStorage } from '../../storage'
import { RoomInfo, GroupRoomConfig, roomUniqueKey, RoomInfoWithGroups } from './types'
import { loadFromOldVersion } from './migration'

type NoUndefinedFeild<T> = {
  [P in keyof T]-?: NonNullable<T[P]>
}
export interface RoomInfoStor {
  [ruid: string]: RoomInfo
}
export interface GroupStor {
  [gid: string]: {
    [ruid: string]: GroupRoomConfig
  }
}

export class GroupList {
  constructor (private s: LiveNotificationStorage, private gid: number) {}
  private getGroupDict () {
    let { groupDict } = this.s
    return groupDict[this.gid] = groupDict[this.gid] || {}
  }
  addRoom (room: RoomInfo) {
    let { roomInfos } = this.s
    const k = roomUniqueKey(room)
    roomInfos[k] = room
    let gd = this.getGroupDict()
    gd[k] = {
      gid: this.gid,
      roomInfoKey: k,
      config: {}
    }
    this.s.groupDictUpdated = true
    this.s.save()
  }
  hasRoom (room: RoomInfo) {
    const k = roomUniqueKey(room)
    let gd = this.getGroupDict()
    return gd[k] !== undefined
  }
  delRoom (room: RoomInfo) {
    let { roomInfos } = this.s
    const k = roomUniqueKey(room)
    delete roomInfos[k]
    let gd = this.getGroupDict()
    delete gd[k]
    this.s.groupDictUpdated = true
    this.s.save()
  }
  get length () {
    let gd = this.getGroupDict()
    return Object.keys(gd).length
  }
  *[Symbol.iterator] () {
    const { roomInfos } = this.s
    const gd = this.getGroupDict()
    for (let k of Object.keys(gd)) {
      const room = roomInfos[gd[k]!.roomInfoKey]
      if (room === undefined) {
        throw new Error('room not found')
      }
      yield {
        ...room
      }
    }
  }
}

export class LiveNotificationStorage {
  roomInfos!: RoomInfoStor
  groupDict!: GroupStor
  groupDictUpdated = false
  save () {
    this.stor.set('RoomInfoStor', this.roomInfos)
    this.stor.set('GroupStor', this.groupDict)
  }
  load () {
    const [success, roomInfos, groupDict] = loadFromOldVersion(this.stor)
    if (success) {
      this.roomInfos = roomInfos!
      this.groupDict = groupDict!
      this.save()
      this.stor.flush()
    } else {
      this.roomInfos = this.stor.get<RoomInfoStor>('RoomInfoStor') || {}
      this.groupDict = this.stor.get<GroupStor>('GroupStor') || {}
    }
  }
  constructor (private stor: BotStorage) {
    this.load()
  }
  getGroupList (gid: number) {
    return new GroupList(this, gid)
  }
  getRooms () {
    return Object.values(this.roomInfos as NoUndefinedFeild<RoomInfoStor>)
  }
  getConfigByRoom (room: RoomInfo) {
    const k = roomUniqueKey(room)
    const configs: RoomInfoWithGroups[] = []
    for (let gd of Object.values(this.groupDict as NoUndefinedFeild<GroupStor>)) {
      const r = gd[k]
      if (r !== undefined) {
        configs.push({
          info: room,
          config: r
        })
      }
    }
    return configs
  }
}
