import axios from 'axios'
import { SiteMonitor, UrlWithStringQuery, RoomInfo, RoomLivingInfo } from './types'

function extract(re: RegExp, str: string, index: number) {
  const r = re.exec(str)
  if (r === null) {
    return
  }
  return r[index]
}

export class HuyaMonitor implements SiteMonitor {
  getHost() {
    return ['huya.com']
  }
  async parseRoom(u: UrlWithStringQuery) {
    if (u.host === undefined) {
      return
    }
    if (u.pathname === undefined) {
      return
    }
    const r = /^(www|m\.huya\.com)?\/([a-zA-Z0-9_]+)/.exec(u.pathname)
    if (r === null) {
      return
    }
    const roomId = r[2]
    const url = this.buildUrl(roomId)

    const info: RoomInfo = {
      host: u.host,
      roomId,
      url
    }

    return info
  }
  async getRoomInfo(room: RoomInfo): Promise<[boolean, RoomLivingInfo]> {
    const { data } = await axios.get<string>(`https://m.huya.com/${room.roomId}`, {
      headers: {
        'User-Agent': 'qqbot',
        'Accept': 'text/html'
      }
    })

    const title = extract(/var liveRoomName = '(.*?)'/, data, 1)
    const user = extract(/var ANTHOR_NICK = '(.*?)'/, data, 1)
    if (!title || !user) {
      throw new Error('Failed to parse huya room')
    }
    return [data.includes('ISLIVE = true'), {
      title: title,
      user: user,
      avatar: ""
    }]
  }

  buildUrl(roomId: string) {
    return `https://www.douyu.com/${roomId}`
  }
}
