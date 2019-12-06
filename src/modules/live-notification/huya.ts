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
    return ['www.huya.com', 'm.huya.com']
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
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1',
        'Accept': 'text/html'
      }
    })

    const isLiving = data.includes('ISLIVE = true')
    const title = extract(/var liveRoomName = '(.*?)'/, data, 1)
    const user = extract(/var ANTHOR_NICK = '(.*?)'/, data, 1)

    console.log(data)
    if (!user || (isLiving && !title)) {
      throw new Error('Failed to parse huya room')
    }
    return [isLiving, {
      title: title || '未开播',
      user: user,
      avatar: ""
    }]
  }

  buildUrl(roomId: string) {
    return `https://www.huya.com/${roomId}`
  }
}
