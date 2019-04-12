import { CharacterData, SkillData } from "./game-data";
import { randomIn, sleep, shuffle, getRandomIntInclusive } from "../../utils/helpers";
import { BotMessageType } from "../../tsbot";
import { Character } from "./model";

export enum SessionStatus {
  Inactive, // 比赛未开始
  Ready, // 准备阶段
  Vote, // 选角色阶段
  BeforeGame, // 即将进入比赛
  InGame // 正在比赛
}

export class InteractionID {
  constructor(public gid: number | undefined, public userId: number) {}

  getID() {
    return this.gid ? `group_${this.gid}` : `private_${this.userId}`;
  }
}

export class TrackData {
  public progress: number = 0;
  public character: Character = new Character();
  public currentSuffix: string = "";
  public currentSpeed: number = 0;
  public players: number[] = [];
}

// 游戏配置
const GameConfig = {
  readyTime: 10000, // 准备时间
  voteTime: 60000, // 投票选角色时间
  waitingTime: 10000, // 游戏开始前等待时间
  minimumPlayers: 3, // 最小参与玩家数量，满足参与人数才会开始比赛
  maximumPlayers: 10, // 最大参与玩家数量，报名满了之后则不接受报名
  trackCount: 6, // 赛道数，请确保该数量小于角色数量，并且尽可能不要到达10个，否则可能会触发QQ气泡文本的排版问题，影响美观
  allowSkills: false, // 是否允许使用技能
  maxTrackProgress: 44, // 赛道长度，即赛道的空格数量，默认已适配手机聊天气泡和PC QQ的宽度，慎重修改
  skillCastTime: 2000, // 每回合角色使用被动技能间隔
  roundTime: 10000 // 每回合间隔时间，越小刷屏越快
};

export class RacingSession {
  private _interactionID: InteractionID;
  private _type: BotMessageType;
  private _status: SessionStatus = SessionStatus.Inactive;
  private _scheduleTimer: any = null;

  // 比赛参与者
  private _players: Map<number, any> = new Map<number, any>();

  // 技能列表
  private _skills: Map<number, number> = new Map<number, number>();

  // 赛场数据
  private _inGameData: {
    tracks: TrackData[];
  } = {
    tracks: []
  };

  constructor(interactionID: InteractionID, type: BotMessageType) {
    this._interactionID = interactionID;
    this._type = type;
  }

  public interactionID() {
    return this._interactionID;
  }

  public sessionType() {
    return this._type;
  }

  public status() {
    return this._status;
  }

  public async onAcceptMessage(message: string, userid: number) {
    if (this._status === SessionStatus.Vote) {
      console.log(`赛马游戏投票: ${message}, 用户：${userid}`);

      // 投票选角色阶段
      const matches = message.match(/(\d+)/);
      if (matches && matches[1]) {
        const order = Number.parseInt(matches[1]);

        // 投票的角色是否超出范围
        if (order > 0 && order <= GameConfig.trackCount) {
          const track = this._inGameData.tracks[order - 1];
          if (!track) {
            return;
          }

          const joinPlayers = track.players;

          if (joinPlayers.indexOf(order) < 0) {
            track.players.push(userid);
          }

          this._players.set(userid, track);
        }
      }
    } else if (this._status === SessionStatus.InGame) {
      // 输入技能
      if (GameConfig.allowSkills) {
        SkillData.map(v => {
          if (message.trim() === v.name) {
          }
        });
      }
    }
  }

  public async start(
    onPlayers: (sessionContext: RacingSession, text: string, playerList: Map<number, any>) => Promise<void>,
    schedule: (sessionContext: RacingSession, text: string, atList?: number[]) => Promise<void>,
    onEnd: (sessionContext: RacingSession, text: string) => Promise<void>,
    onFinished: (sessionContext: RacingSession, tracks: TrackData[]) => Promise<void>
  ) {
    if (this._status !== SessionStatus.Inactive) {
      return;
    }

    // =======================================================================================
    // ○ 准备阶段
    // =======================================================================================

    this._status = SessionStatus.Ready;
    await schedule(this, randomIn(["赛马游戏准备开始了！", "一场空前盛况的比赛即将开始！"]));

    await sleep(1000);
    await schedule(
      this,
      `各位玩家请做好准备！${GameConfig.readyTime /
        1000}秒后赛场将会生成！\n届时请通过直接输入数字编号选择你看好的角色！`
    );
    await sleep(GameConfig.readyTime);

    // =======================================================================================
    // ○ 投票选人阶段
    // =======================================================================================
    this.generatePlayground();

    let playerInfos = "";
    this._inGameData.tracks.map((v: any, index: number) => {
      playerInfos += `${index + 1} - ${v.character.icon}【${v.character.name}】\n`;
    });

    await schedule(
      this,
      `赛场生成了，赛场信息如下：

${this.renderPlayground()}

角色列表：
${playerInfos}

请各位玩家输入对应数字编号与比赛的角色签订契约！\n你有${GameConfig.voteTime / 1000}秒的时间做出抉择。`
    );

    this._status = SessionStatus.Vote;
    await sleep(GameConfig.voteTime);
    this._status = SessionStatus.BeforeGame;

    // 游戏人数为 0
    if (this._players.size === 0) {
      await onEnd(
        this,
        randomIn([
          `非常遗憾，居然没人愿意参加这场比赛。比赛赞助商亏到破产，游戏结束了！`,
          "什么情况，这破群居然没有一个人参加比赛？破群药丸！游戏结束！",
          "不敢相信，居然没有人愿意参加比赛，让人惋惜。赞助商们以后不会再注入资金了。游戏结束！"
        ])
      );
      return;
    }

    // 游戏人数
    if (this._players.size < GameConfig.minimumPlayers) {
      await onEnd(
        this,
        randomIn([
          `呃，怎么回事，居然只有${this._players.size}人报名参加比赛。庄家们非常失望，撤销了比赛。游戏结束！`,
          `天呐！什么情况，居然只有${this._players.size}人参加比赛？破群药丸！庄家们亏到破产，撤销了本轮竞技。`,
          `不敢相信，居然只有${
            this._players.size
          }人愿意参加比赛，让人惋惜。\n赞助商们以后不会愿意再注入资金了，游戏结束。`
        ])
      );
      return;
    }

    await onPlayers(
      this,
      `本次共有 ${this._players.size} 名召唤师参加了比赛。他们是：\n\n%s，\n\n为他们喝彩吧！`,
      this._players
    );
    await sleep(3000);

    // =======================================================================================
    //  ○ 游戏等待开始阶段
    // =======================================================================================

    // 是否允许使用技能
    if (GameConfig.allowSkills) {
      const skills = shuffle(SkillData)
        .splice(0, 4)
        .map(v => {
          return `${v.name}`;
        });

      await schedule(
        this,
        `倒计时${GameConfig.waitingTime / 1000}秒，比赛即将开始！开始后每个参与的选手可以通过输入以下技能干涉比赛：
${skills.join("\n")}

每个技能只能使用一次，在游戏过程中随时发送对应的文本即可。重复输入无效。`
      );

      await sleep(GameConfig.waitingTime);
    }

    // =======================================================================================
    //  ○ 主游戏流程
    // =======================================================================================
    await schedule(this, `比赛开始！！！`);
    await sleep(GameConfig.waitingTime);

    const handleRound = async () => {
      for (let i = 0; i < this._inGameData.tracks.length; ++i) {
        const track = this._inGameData.tracks[i];

        // 随机增加 2%-6% 基础进度
        track.progress += getRandomIntInclusive(2, 6) + track.currentSpeed;

        const character = track.character;
        if (Math.random() <= 0.3 && character.skills && character.skills.length > 0) {
          const skill = randomIn(character.skills);

          // 处理解说文本
          let description = randomIn(skill.descriptions);
          description = description
            .replace("${char_name}", character.name)
            .replace("${char_icon}", character.icon)
            .replace("${skill_name}", skill.name);

          // 执行效果
          skill.effects.map((effect, index) => {
            const value = randomIn(effect.values);

            switch (effect.type) {
              case "speed": {
                track.currentSpeed += value;
              }
              case "progress": {
                track.progress += value;
              }
            }
          });

          await schedule(this, description);

          await sleep(GameConfig.skillCastTime);
        }
      }
    };

    let round = 0;

    // 开始回合流程

    while (true) {
      round++;
      if (round > 100) {
        return;
      }

      // 处理回合数据
      await handleRound();

      // 更新赛场
      await schedule(this, this.renderPlayground());

      // 核算战绩
      const sortedTracks = new Array<TrackData>().concat(this._inGameData.tracks);
      sortedTracks.sort((a: TrackData, b: TrackData) => {
        if (a.progress > b.progress) {
          return -1;
        }
        if (a.progress < b.progress) {
          return 1;
        }
        return 0;
      });

      // 第一名超过100之后则比赛结束
      if (sortedTracks[0].progress >= 100) {
        await schedule(this, `有选手率先到达终点，比赛结束了。`);
        await onFinished(this, sortedTracks);
        break;
      }

      await sleep(GameConfig.roundTime);
    }
  }

  public generatePlayground() {
    // 打乱所有角色
    const characters = shuffle(CharacterData);

    // 生成赛场数据
    this._inGameData.tracks = [];
    for (let i = 0; i < GameConfig.trackCount; ++i) {
      this._inGameData.tracks.push({
        character: characters[i],
        currentSuffix: "",
        currentSpeed: 0,
        players: [],
        progress: 0
      });
    }
  }

  public renderPlayground() {
    let ground = "";
    for (let i = 0; i < this._inGameData.tracks.length; ++i) {
      const trackData = this._inGameData.tracks[i];

      const step = GameConfig.maxTrackProgress / 100;

      let trackLength = GameConfig.maxTrackProgress - Number.parseInt((step * trackData.progress).toFixed(0));
      if (trackLength < 0) {
        trackLength = 0;
      }

      if (trackData.character) {
        ground += `|${i + 1}${" ".repeat(trackLength)}${trackData.character.icon}${trackData.currentSuffix}\n`;
      }
    }

    return ground;
  }
}
