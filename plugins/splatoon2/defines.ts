
export const StageSize = {
  w: 240,
  h: 138
}
export const CoopStageSize = {
  w: 240,
  h: 134
}

export interface S2Stage {
  id: string
  name: string
  image: string
}

export interface S2Weapon {
  id: string
  name: string
  image: string
  special: {
    id: string
    image_a: string
    image_b: string
  }
  sub: {
    id: string
    image_a: string
    image_b: string
  }
}

export interface Splatoon2Data {
  weapons: S2Weapon[]
  stages: S2Stage[]
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface RandomContext {
  weaponsTeamA: S2Weapon[]
  weaponsTeamB: S2Weapon[]
  stages: S2Stage[]
  id: number
}

export interface Stage {
  image: string
  id: string
  name: string
}

export type ModesType = 'gachi' | 'league' | 'regular'
export const ModeTranslate: Record<ModesType, string> = {
  'gachi': '单排',
  'league': '组排',
  'regular': '常规'
}

type RecordKey<T> = T extends Record<infer U, any> ? U : never
type RecordValue<T> = T extends Record<any, infer U> ? U : never

const invert = <T extends Record<any, any>>(o: T): Record<RecordValue<T>, RecordKey<T>> => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]))

export const ModeReverseTranslate = invert(ModeTranslate)

export type RulesType = 'rainmaker' | 'clam_blitz' | 'tower_control' | 'splat_zones' | 'turf_war'
export interface Rule {
  start_time: number
  end_time: number
  stage_a: Stage
  stage_b: Stage
  rule: {
    name: string
    key: RulesType
    multiline_name: string
  }
  game_mode: {
    key: string
    name: string
  }
}
export const RuleTranslate: Record<RulesType, string> = {
  'splat_zones': '区域',
  'tower_control': '塔',
  'clam_blitz': '蛤蜊',
  'rainmaker': '鱼',
  'turf_war': '涂地'
}
export const RuleReverseTranslate: Record<string, RulesType> = Object.assign(invert(RuleTranslate), {
  // 更多别称（似乎都是占啊抢啊的 2333）
  '占地': 'splat_zones',
  '抢塔': 'tower_control',
  '抢蛤': 'clam_blitz',
  '抢鱼': 'rainmaker'
}) as Record<string, RulesType>

export type StageTypes = 'league' | 'regular' | 'gachi'

export const colorMap: Record<StageTypes, string> = {
  regular: '#19d719',
  gachi: '#e3562c',
  league: '#f02d7d'
}
export interface Schedules {
  league: Rule[]
  regular: Rule[]
  gachi: Rule[]
}

export interface Schedule {
  league: Rule
  regular: Rule
  gachi: Rule
}

export interface CoopStage {
  image: string
  name: string
}
export interface CoopWeapon {
  id?: string,
  image: string,
  name: string
}

export interface CoopSchedule {
  start_time: number
  end_time: number
  stage: CoopStage
  weapons: {
    id: string
    weapon?: CoopWeapon
    coop_special_weapon?: CoopWeapon
  }[]
}

export interface CoopSchedules {
  details: CoopSchedule[]
}
