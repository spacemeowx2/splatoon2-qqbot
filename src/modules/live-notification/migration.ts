import { BotStorage } from '../../storage'
import { RoomInfoStor, GroupStor } from './storage'
import { RoomInfo, roomUniqueKey } from './types'

export function loadFromOldVersion (stor: BotStorage): [boolean, RoomInfoStor?, GroupStor?] {
  {
    // V0
    function getJSON<T> (s: BotStorage, key: string) {
      let json: T | undefined
      const r = s.get<T | string>(key)
      if (r === undefined) {
        return undefined
      }
      if (typeof r === 'string') {
        try {
          json = JSON.parse(r)
        } catch {}
      } else {
        json = r
      }
      return json
    }

    const groups = getJSON<number[]>(stor, 'groups') || []
    if (groups.length > 0) {
      console.log('migrate from V0')

      let roomInfoStor: RoomInfoStor = {}
      let groupStor: GroupStor = {}

      for (const gid of groups) {
        const list = getJSON<RoomInfo[]>(stor.getChild(gid.toString()), 'list') || []
        for (const room of list) {
          const ruid = roomUniqueKey(room)
          roomInfoStor[ruid] = room

          groupStor[gid] = groupStor[gid] || {}
          const gd = groupStor[gid]
          gd[ruid] = {
            gid,
            roomInfoKey: ruid,
            config: {}
          }
        }
      }

      console.log('roomInfoStor', roomInfoStor)
      console.log('groupStor', groupStor)
      console.log('delete old data')

      stor.del('groups')
      console.log('delete groups')
      for (const gid of groups) {
        const k = `${gid}.list`
        console.log(`delete ${k}`)
        stor.del(k)
      }

      return [true, roomInfoStor, groupStor]
    }
  }
  return [false]
}
