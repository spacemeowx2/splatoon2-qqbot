import moment from 'moment'
import axios from 'axios'
import { SiteMonitor, UrlWithStringQuery, RoomInfo, RoomLivingInfo } from './types'

interface DouyuAPIResponse {
  data: {
    room_id: string;
    room_name: string;
    room_status: string;
    owner_name: string;
    start_time: string;
  }
}
export class DouyuMonitor implements SiteMonitor {
  getHost() {
    return ['www.douyu.com']
  }
  async parseRoom(u: UrlWithStringQuery) {
    if (u.host === undefined) {
      return
    }
    if (u.pathname === undefined) {
      return
    }
    const r = /^(www\.douyu\.com)?\/([a-zA-Z0-9_]+)/.exec(u.pathname)
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
    const { data: { data } } = await axios.get<DouyuAPIResponse>(`https://open.douyucdn.cn/api/RoomApi/room/${room.roomId}`, {
      headers: {
        'User-Agent': 'qqbot',
        'Accept': 'text/html'
      }
    })

    return [data.room_status === "1", {
      title: data.room_name,
      user: data.owner_name,
      startTime: moment(`${data.start_time} +8`, 'YYYY-MM-DD HH:mm:ss Z').unix(),
      avatar: ""
    }]
  }

  buildUrl(roomId: string) {
    return `https://www.douyu.com/${roomId}`
  }
}
