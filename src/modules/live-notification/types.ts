import { UrlWithStringQuery } from 'url'
export {
  UrlWithStringQuery
}
export interface GroupRoomConfig {
  gid: number
  roomInfoKey: string
  config: Record<string, any>
}
export interface RoomInfo {
  url: string
  host: string
  roomId: string
}
export interface RoomInfoWithGroups {
  info: RoomInfo
  config: GroupRoomConfig
}
export interface RoomLivingInfo {
  user: string
  title: string
  startTime?: number
  screenshot?: string
  avatar?: string
}
export interface SiteMonitor {
  getHost(): string[]
  parseRoom(u: UrlWithStringQuery): Promise<RoomInfo | undefined>
  getRoomInfo(room: RoomInfo): Promise<[boolean, RoomLivingInfo]>
}
export enum RoomStatus {
  NotFetched,
  Streaming,
  NotStreaming
}
export interface RoomLastInfo {
  lastTime: number
  lastLive: RoomStatus
  lastInfo?: RoomLivingInfo
}
export function roomCmp(a: RoomInfo, b: RoomInfo) {
  return (a.host === b.host) && (a.roomId === b.roomId)
}
export function roomUniqueKey(r: RoomInfo) {
  return `${r.host}/${r.roomId}`
}
