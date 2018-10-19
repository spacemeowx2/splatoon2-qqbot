import { BaseBotModule, BotMessageEvent, BotMessageType, BotModuleInitContext } from '../interface'
import ZerorpcClient from '../utils/zerorpc_client';
const privaCreateRe = /^(?:开始|创建)(.*)私房(?:\s+(.*))?$/
const privaStatusRe = /^(刷新)?私房状态$/ // TODO: add regex for getting status of privas in history.
const privaCancelRe = /^撤销$/
const privaAddPlayersRe = /^进私房\s+(.*)$/
const privaRemovePlayersRe = /^出私房\s+(.*)$/
const privaStartRe = /开始(?:比赛|对战|下一[轮局]|第(\d+)[轮局])(?:\s+(.*)\$\s+(.*))?$/
const privaEndBattleRe = /^([aA]|[bB])\s*队?又?赢了/
const privaEndRe = /(?:结束|关闭)私房$/
const privaHelpRe = /^私房说明$/
const privaRulesRe = /^(?:(?:当前)|(.*))私房规则$/
const privaStandingRe = /(所有人)?排行榜/
const privaHelpsRe = [
  privaHelpRe, privaRulesRe
]
const privaActionsRe = [
  privaCancelRe, privaAddPlayersRe, privaRemovePlayersRe,
  privaStartRe, privaEndBattleRe, privaEndRe,
  privaStandingRe
]

type PrivaTypes = {
  [typeName: string]: {
    names: {
      [lang: string]: string
    },
    args: [string, string][]
  }
}

const enum PrivaSessionStatus {
  Created,
  Waiting,
  InBattle,
  Over
}

interface PrivaPlayer {
  name: string,
  wins: number,
  loses: number,
  byes: number,
  active: boolean
}

interface PrivaBattle {
  num: number,
  team_a: string[],
  team_b: string[],
  winner: string[] | null,
  start_time?: string,
  end_time?: string
}

interface PrivaReport {
  name: string,
  status: number,
  args: (string | number)[],
  in_battle: boolean,
  standings: PrivaPlayer[],
  recent_battle: PrivaBattle | null,
  start_time: string | null,
  end_time: string | null,
  winners?: string[]
}

type PrivaSession = {
  privaId: number,
  groupId: number,
  typeName: string,
  rpcId: string,
  status: PrivaSessionStatus,
  data: string,
  report: PrivaReport
}

type PrivaError = {
  code: number,
  message: string,
  original: Error
}

export class Priva extends BaseBotModule {
  id = 'priva'
  name = '私房'
  privaTypes: PrivaTypes = {}
  language = 'zh_CN'
  privaRPC: ZerorpcClient | null = null
  restoring: Promise<void> | null = null

  init(ctx: BotModuleInitContext) {
    super.init(ctx)
    const { bus } = ctx
    if (process.env.PRIVA_HOST) {
      const host = 'tcp://' + process.env.PRIVA_HOST
      this.privaRPC = new ZerorpcClient(host)
      this.updatePrivaTypes()
    }
    bus.registerMessage([bus.groupTypeFilter, bus.atMeFilter, this.privaStatusFilter], e => this.onPrivaStatus(e))
    bus.registerMessage([bus.groupTypeFilter, bus.atMeFilter, this.privaHelpFilter.bind(this)], e => this.onPrivaHelp(e))
    bus.registerMessage([bus.groupTypeFilter, bus.atMeFilter, this.privaCreateFilter.bind(this)], e => this.onPrivaCreate(e))
    bus.registerMessage([bus.groupTypeFilter, bus.atMeFilter, this.privaActionFilter.bind(this)], e => this.onPrivaAction(e))
  }

  async updatePrivaTypes() {
    if (!this.privaRPC) {
      throw new Error('No Priva RPC client.')
    }
    try {
      [this.privaTypes] = await this.privaRPC.invoke<PrivaTypes>('list_priva_types')
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  setLanguage(lang: string) {
    this.language = lang
  }

  parseError(error: Error): PrivaError {
    const s = error.message.indexOf(':')
    if (s > 0) {
      return {
        code: parseInt(error.message.substr(0, s)),
        message: error.message.substr(s + 1),
        original: error
      }
    } else {
      return {
        code: -1,
        message: error.message,
        original: error
      }
    }
  }

  privaStatusFilter(e: BotMessageEvent): boolean {
    return privaStatusRe.test(e.message)
  }

  reportStanding(priva: PrivaSession, allPlayers = true): string {
    const { report } = priva
    const standings = allPlayers ? report.standings : report.standings.filter(x => x.active)
    let players = standings.map((player, i) =>
      `${i + 1}\t${player.name}${player.active ? '' : '*'}\t${player.wins}\t${player.loses}\t${player.byes}`)
      .join('\n')
    const ret = `排行榜：\n名次\t玩家 ID\t胜场\t负场\t轮空\n${players}`
    return ret
  }

  reportStatus(priva: PrivaSession, allPlayers = false): string {
    const { report } = priva
    let ret = `私房类型：${report.name} ${report.args.map(x=>x.toString()).join(' ')}`
    ret += `\n开始时间：${report.start_time}`
    let status = '刚开房'
    if (report.status === 0) {
      status = '准备开始'
    } else if (report.status === -2) {
      status = '已结束'
    } else {
      status = `第 ${report.status} 轮`
      status += `对战${report.in_battle ? '中' : '后'}`
    }
    ret += `\n状态：${status}\n`
    if (report.status === -1 || report.status === 0) {
      ret += `玩家：${report.standings.filter(x => x.active).map(x => x.name).join(', ')}`
      return ret
    }
    if (report.recent_battle) {
      ret += `A队：${report.recent_battle.team_a.join(', ')}\nvs`
      ret += `\nB队：${report.recent_battle.team_b.join(', ')}\n`
    }
    if (report.winners) {
      ret += `获胜者：${report.winners.join(', ')}\n`
    }
    ret += this.reportStanding(priva, allPlayers || report.status === -2)
    return ret
  }

  async onPrivaStatus(e: BotMessageEvent) {
    const priva = this.getSession(e.groupId!)
    if (this.restoring) {
      await this.restoring
    }
    if (priva === null || priva.status === PrivaSessionStatus.Over) {
      return '当前无私房'
    }
    const match = privaStatusRe.exec(e.message)
    if (match![1] !== undefined) {
      await this.updateAndSave(priva)
    }
    return this.reportStatus(priva)
  }

  privaCreateFilter(e: BotMessageEvent): boolean {
    return this.privaRPC !== null && privaCreateRe.test(e.message)
  }

  getPrivaTypeNames() {
    return Object.values(this.privaTypes)
      .map(x => x.names[this.language] || x.names['en'])
      .join(', ')
  }

  createSession(groupId: number, typeName: string, rpcId: string): PrivaSession {
    const storage = this.storage.getChild<any>(groupId.toString())
    const n = parseInt(storage.get('n') || '0') + 1
    storage.set('n', n)
    const session = {
      privaId: n,
      groupId: groupId,
      typeName,
      rpcId,
      status: PrivaSessionStatus.Created,
      data: '{}'
    } as PrivaSession
    storage.set(session.privaId.toString(), session)
    return session
  }

  async tryRestore(groupId: number, priva: PrivaSession) {
    if (this.privaRPC && priva.status !== PrivaSessionStatus.Over) {
      const [privas] = await this.privaRPC.invoke<{ [pid: number]: string }>('list_privas')
      if (!(priva.rpcId in privas)) {
        await this.privaRPC.invoke('restore_priva', priva.typeName, priva.rpcId, priva.data)
        await this.updateAndSave(priva)
        console.log(`${priva.rpcId} 恢复成功`)
        this.restoring = null
      }
    }
  }

  getSession(groupId: number, n: number | null = null): PrivaSession | null {
    const storage = this.storage.getChild<any>(groupId!.toString())
    const ns = storage.get('n')
    if (ns === undefined) {
      return null
    }
    if (n === null) {
      n = ns
    }
    if (n! > ns) {
      return null
    }
    const priva = storage.get(ns.toString()) as PrivaSession
    this.restoring = this.tryRestore(groupId, priva)
    return priva
  }

  async startPriva(groupId: number, typeName: string, ...args: any[]): Promise<PrivaSession> {
    const [rpcId] = await this.privaRPC!.invoke<string>('create_priva', typeName, ...args)
    const session = this.createSession(groupId, typeName, rpcId)
    return session
  }

  parseArg(typeName: string, value: string | undefined): any {
    if (!value) {
      return null
    }
    if (typeName === 'int') {
      return parseInt(value) || null
    } else if (typeName === 'str') {
      return value
    }
  }

  async onPrivaCreate(e: BotMessageEvent) {
    const { groupId, message } = e
    const priva = this.getSession(groupId!)
    if (priva && priva.status !== PrivaSessionStatus.Over) {
      return '本群已经在私房了'
    }
    const match = privaCreateRe.exec(message)!
    const privaName = match[1]
    if (privaName === '') {
      return `请指定私房类型：{${this.getPrivaTypeNames()}}`
    }
    const privaTypeName = Object.keys(this.privaTypes)
      .find(typeName => Object
        .values(this.privaTypes[typeName].names)
        .some(name => name === privaName)
      )
    if (!privaTypeName) {
      return '未知私房类型'
    }
    const privaType = this.privaTypes[privaTypeName]
    const argNames = privaType.args.map(x => x[0]).join(', ')
    if (!match[2] && argNames.length > 0) {
      return `请提供参数：${argNames}`
    }
    const inputArgs = match[2] ? match[2].split(/\s+/) : []
    const args = privaType.args.map((x, i) => {
      const value = this.parseArg(x[1], inputArgs[i])
      return value
    })
    if (args.some(x => x === null)) {
      return `请提供参数：${argNames}`
    }
    try {
      const priva = await this.startPriva(groupId!, privaTypeName, ...args)
      await this.updateAndSave(priva)
    } catch (e) {
      return this.returnError(e)
    }
    return '开私房啦！请告诉我参与者 ID 名单。（语法：@bot 进私房 [玩家 ID]）'
  }

  privaHelpFilter(e: BotMessageEvent): boolean {
    return privaHelpsRe.some(x => x.test(e.message))
  }

  privaActionFilter(e: BotMessageEvent): boolean {
    if (!this.privaRPC) {
      return false
    }
    const priva = this.getSession(e.groupId!)
    return priva !== null && priva.status !== PrivaSessionStatus.Over
      && privaActionsRe.some(x => x.test(e.message))
  }

  async updateAndSave(priva: PrivaSession) {
    const rpc = this.privaRPC!
    const { rpcId } = priva;
    [priva.data] = await rpc.invoke<string>('run_action', rpcId, 'dump_json');
    [priva.report] = await rpc.invoke<PrivaReport>('run_action', rpcId, 'report', this.language)
    if (priva.report.status === -1) {
      priva.status = PrivaSessionStatus.Created
    } else if (priva.report.status === -2) {
      priva.status = PrivaSessionStatus.Over
    } else if (priva.report.in_battle) {
      priva.status = PrivaSessionStatus.InBattle
    } else {
      priva.status = PrivaSessionStatus.Waiting
    }
    const storage = this.storage.getChild<any>(priva.groupId.toString())
    storage.set(priva.privaId.toString(), priva)
  }

  returnError(e: PrivaError) {
    if (e.code === -1) {
      return '未知方法'
    } else if (e.code === 1) {
      return '私房已经开始了'
    } else if (e.code === 2) {
      return '私房正在进行对战'
    } else if (e.code === 3) {
      const player = /(.*) is already in this Priva/.exec(e.message)
      return `${player && player[1]} 已在私房中`
    } else if (e.code === 4) {
      return '人数超过上限'
    } else if (e.code === 5) {
      const player = /(.*) is not in this Priva/.exec(e.message)
      return `${player && player[1]} 不在私房中`
    } else if (e.code === 6) {
      return '私房不在进行中'
    } else if (e.code === 7) {
      return '玩家人数不足'
    } else if (e.code === 8) {
      return '玩家组合无效'
    } else if (e.code === 9) {
      return '私房不在对战中'
    } else if (e.code === 10) {
      // `winner` should be 'a' or 'b'
    } else if (e.code === 11) {
      return '无可撤销操作'
    } else if (e.code === 12) {
      const parameters = e.message.split(':')[1].trim()
      return `无效的参数：${parameters}`
    }
    console.error(e.original)
    return '出错了！'
  }

  async onPrivaHelp(e: BotMessageEvent) {
    if (this.restoring) {
      await this.restoring
    }
    let match: RegExpExecArray | null = null
    if (match = privaHelpRe.exec(e.message)) {
      return this.onHelp()
    } else if (match = privaRulesRe.exec(e.message)) {
      let typeName = undefined
      if (match[1]) {
        typeName = Object.keys(this.privaTypes)
          .find(typeName => Object
            .values(this.privaTypes[typeName].names)
            .some(name => name === match![1])
          )
      } else {
        const priva = await this.getSession(e.groupId!)
        if (priva) {
          typeName = priva.typeName
        }
      }
      if (typeName === undefined) {
        return `请指定私房名称：${this.getPrivaTypeNames()}`
      }
      if (!this.privaRPC) {
        return `不可用`
      }
      const [rules] = await this.privaRPC.invoke<string>('show_rules', typeName, this.language)
      return rules.trim()
    }
  }

  async onPrivaAction(e: BotMessageEvent) {
    if (this.restoring) {
      await this.restoring
    }
    const { groupId } = e
    const priva = this.getSession(groupId!)!
    const { status, rpcId, report } = priva
    const rpc = this.privaRPC!
    let match = null
    let returned = false
    try {
      if (privaCancelRe.test(e.message)) {
        await rpc.invoke('run_action', rpcId, 'undo')
        return '撤销成功！'
      } else if (match = privaAddPlayersRe.exec(e.message)) {
        const players = match[1].split(/，\s*|,\s*|\s+/)
        await rpc.invoke('run_action', rpcId, 'add_players', players)
        await this.updateAndSave(priva)
        return '添加成功！'
      } else if (match = privaRemovePlayersRe.exec(e.message)) {
        const players = match[1].split(/，\s*|,\s*|\s+/)
        await rpc.invoke('run_action', rpcId, 'remove_players', players)
        await this.updateAndSave(priva)
        return '删除成功！'
      } else if (match = privaEndBattleRe.exec(e.message)) {
        const winner = match[1]
        const [result] = await rpc.invoke<any[]>('run_action', rpcId, 'end_battle', winner)
        await this.updateAndSave(priva)
        if (result.length > 5) {
          const winners = result[5]
          this.bot.send('send_msg', {
            message_type: 'group',
            group_id: groupId,
            message: '记录完毕！'
          })
          return `${winners.join(', ')} 获得胜利！\n${this.reportStanding(priva)}`
        }
        this.bot.send('send_msg', {
          message_type: 'group',
          group_id: groupId,
          message: '记录完毕！'
        })
        returned = true
      }
      if (match = privaStandingRe.exec(e.message)) {
        this.bot.send('send_msg', {
          message_type: 'group',
          group_id: groupId,
          message: this.reportStanding(priva, match[1] !== undefined)
        })
        returned = true
      }
      if (match = privaStartRe.exec(e.message)) {
        if (match[1] !== undefined) {
          const turn = parseInt(match[1])
          if (!(turn === 1 && report.status <= 0 || report.status === turn - 1)) {
            return `现在是第${report.status}轮~`
          }
        }
        if (status === PrivaSessionStatus.Created) {
          await rpc.invoke('run_action', rpcId, 'start')
          await this.updateAndSave(priva)
        }
        let team_a = null
        let team_b = null
        if (match[2] !== undefined) {
          team_a = match[2].split(/，\s*|,\s*|\s+/)
        }
        if (match[3] !== undefined) {
          team_b = match[3].split(/，\s*|,\s*|\s+/)
        }
        const [result] = await rpc.invoke<any[]>('run_action', rpcId, 'start_battle', team_a, team_b)
        await this.updateAndSave(priva)
        let ret = `第${result[3]}轮开始：\nA队：${result[4].join(', ')}\nvs\nB队：${result[5].join(', ')}`
        if (result[6].length > 0) {
          ret += `\n观战：${result[6].join(', ')}`
        }
        return ret
      } else if (match = privaEndRe.exec(e.message)) {
        await rpc.invoke('run_action', rpcId, 'end')
        await this.updateAndSave(priva)
        return '私房结束~'
      }
    } catch (e) {
      const err = this.parseError(e)
      return this.returnError(err)
    }
    return returned ? '' : undefined
  }

  onHelp(): string {
    return `私房模块：
语法：@bot 命令
命令列表：
[开始|创建]x私房 [参数列表]
撤销
(刷新)私房状态
进私房 [玩家列表]
出私房 [玩家列表]
开始[比赛|对战|下一[轮|局]|第n[轮|局]] ([A队玩家列表] : [B队玩家列表])
[A队|B队]赢了
(所有人)排行榜
[结束|关闭]私房
私房说明
(x)私房规则`
  }

  help(e: BotMessageEvent) {
    if (e.messageType === BotMessageType.Group) {
      return this.privaRPC !== null ? `语法：
@bot 开始x私房 [参数列表]
x ∈ {${this.getPrivaTypeNames()}}
@bot 私房说明` : '不可用'
    }
    return ''
  }
}
