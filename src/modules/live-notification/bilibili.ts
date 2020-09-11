import moment from 'moment'
import axios from 'axios'
import { SiteMonitor, UrlWithStringQuery, RoomInfo, RoomLivingInfo } from './types'

interface RoomInfoResponse {
  data: {
    title: string
    live_status: number
    live_time: string
  }
}
interface AnchorResponse {
  data: {
    info: {
      uname: string
      face: string
    }
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
    const { data: { data: { title, live_status, live_time } } } = await axios.get<RoomInfoResponse>(`https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${room.roomId}`, {
      headers: {
        'User-Agent': 'splatoon2-qqbot',
      }
    })
    const { data: { data: { info: { uname, face } } }} = await axios.get<AnchorResponse>(`https://api.live.bilibili.com/live_user/v1/UserInfo/get_anchor_in_room?roomid=${room.roomId}`, {
      headers: {
        'User-Agent': 'splatoon2-qqbot',
      }
    })

    return [live_status === 1, {
      title: title,
      user: uname,
      startTime: moment(`${live_time} +8`, 'YYYY-MM-DD HH:mm:ss Z').unix(),
      avatar: face
    }]
  }
  buildUrl(roomId: string) {
    return `https://live.bilibili.com/${roomId}`
  }
}
