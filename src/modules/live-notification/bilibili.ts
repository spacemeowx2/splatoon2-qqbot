import moment from 'moment'
import axios from 'axios'
import { SiteMonitor, UrlWithStringQuery, RoomInfo, RoomLivingInfo } from './types'

interface BilibiliAPIResponse {
  data: {
    title: string
    live_status: number
    uname: string
    live_time: string
    face: string
  }
}
export class BilibiliMonitor implements SiteMonitor {
  getHost() {
    return ['live.bilibili.com']
  }
  async parseRoom(u: UrlWithStringQuery) {
    if (u.host === undefined) {
      return
    }
    if (u.pathname === undefined) {
      return
    }
    const r = /^(\/h5)?\/(\d+)/.exec(u.pathname)
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
  async getRoomInfo (room: RoomInfo): Promise<[boolean, RoomLivingInfo]> {
    // for keyframe: `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${room.roomId}`
    const { data: { data } } = await axios.get<BilibiliAPIResponse>(`https://api.live.bilibili.com/room/v1/RoomStatic/get_room_static_info?room_id=${room.roomId}`, {
      headers: {
        'User-Agent': 'splatoon2-qqbot',
        'Accept': 'text/html'
      }
    })

    return [data.live_status === 1, {
      title: data.title,
      user: data.uname,
      startTime: moment(`${data.live_time} +8`, 'YYYY-MM-DD HH:mm:ss Z').unix(),
      avatar: data.face
    }]
  }
  buildUrl(roomId: string) {
    return `https://live.bilibili.com/${roomId}`
  }
}
