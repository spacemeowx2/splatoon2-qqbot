import { BaseBotModule, BotMessageEvent, BotModuleInitContext, BotMessageType, BotPostType } from "../interface";
import { RacingSession, InteractionID, SessionStatus, TrackData } from "./horse-racing/racing-session";
import { randomIn } from "../utils/helpers";
import { cqDecode, cqEncode } from "../utils/cqcode";
import util from "util";

export class HorseRacing extends BaseBotModule {
  id = "horse-racing";
  name = "赛马游戏";

  private sessions: Map<string, RacingSession> = new Map<string, RacingSession>();

  init(ctx: BotModuleInitContext) {
    super.init(ctx);
    const { bus } = ctx;
    // bus.registerPrivate(e => this.onMessage(e));
    bus.registerMessage([bus.groupTypeFilter], e => this.onAcceptMessage(e));
    bus.registerMessage([bus.atMeFilter, bus.startsWithFilter('.sm')], e => this.onMessage(e));
  }

  createSession(interactionID: InteractionID, type: BotMessageType) {
    let session = this.sessions.get(interactionID.getID());
    if (!session) {
      session = new RacingSession(interactionID, type);
      this.sessions.set(interactionID.getID(), session);
    }

    return session;
  }

  sendToSession(session: RacingSession, text: string, atList: number[]) {
    if (text && text.length > 0) {
      if (session.sessionType() === BotMessageType.Group) {
        const atListStr =
          atList && Array.isArray(atList)
            ? atList
                .map(v => {
                  return this.bot.atStr(v);
                })
                .join(" ")
            : "";

        this.bot.sendGroupMessage(
          <number>session.interactionID().gid,

          // 判断是否需要 at 群成员
          `${atListStr}${text}`
        );
      } else if (session.sessionType() === BotMessageType.Private) {
        this.bot.sendPrivateMessage(<number>session.interactionID().userId, text);
      }
    }
  }

  onAcceptMessage(e: BotMessageEvent) {
    this.sessions.forEach((value, key) => {
      value.onAcceptMessage(e.message, e.userId);
    });
  }

  onMessage(e: BotMessageEvent) {
    if (e.messageType !== BotMessageType.Group) {
      return;
    }

    let session = this.createSession(new InteractionID(e.groupId, e.userId), e.messageType);
    if (session.status() !== SessionStatus.Inactive) {
      return `${e.messageType === BotMessageType.Group ? this.bot.atStr(e.userId) : ""} ${randomIn([
        "有一场比赛正在进行了",
        "你得先把现在的比赛完成",
        "不要再重复开始一场比赛啦",
        "马场提供不了再多的马了，先把当前比赛完成吧"
      ])}`;
    }

    session.start(
      // 玩家报名完毕回调
      async (sessionContext: RacingSession, text: string, players: Map<number, any>) => {
        const userIDs = Array.from(players.keys());
        const atUserListStr = userIDs
          .map(v => {
            return this.bot.atStr(v);
          })
          .join("、");

        text = util.format(text, atUserListStr);
        await this.sendToSession(session, text, []);
      },
      // 游戏主流程回调
      async (session: RacingSession, text: string, atList?: number[]) => {
        await this.sendToSession(session, text, atList || []);
      },
      // 游戏结束回调
      async (sessionContext: RacingSession, text: string) => {
        await this.sendToSession(session, text, []);
        this.sessions.delete(sessionContext.interactionID().getID());
      },
      // 游戏完成回调
      async (sessionContext: RacingSession, tracks: TrackData[]) => {
        this.sendToSession(
          sessionContext,
          `前三名选手分别是：
        🏆第一名：${tracks[0].character.icon}【${tracks[0].players.map(v => this.bot.atStr(v))}】
        🥈第二名：${tracks[1].character.icon}【${tracks[1].players.map(v => this.bot.atStr(v))}】
        🥉第三名：${tracks[2].character.icon}【${tracks[2].players.map(v => this.bot.atStr(v))}】
        `,
          []
        );
        this.sessions.delete(sessionContext.interactionID().getID());
      }
    );
    return ''
  }
  help() {
    return "赛马游戏: @bot .sm 开始赛马游戏";
  }
}
