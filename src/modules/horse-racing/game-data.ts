import { Character, Skill } from "./model";

/*
  技能配置说明：
    - descriptions: 发动技能时会随机从数组中选一条作为解说文本，支持嵌入变量
        ${user}: 会at使用技能的玩家

    - effects: 技能效果数组，技能启用后，该数组下的所有效果都会生效
        - type: 效果的类型
          * progress: 进度，具体值配置到value字段中
          * speed: 每个回合额外增加进度
        - targets: 作用目标，支持多目标。一般情况下配置一项即可，多目标会重复。比如说 self 和 all
          * self: 作用于自身
          * all: 作用于整个赛场
          * others: 作用于所有其他赛道目标
          * random: 随机一个目标
        - value: 将从数组中随机取一个元素作为值
        - suffix: 长度需要和和value数组的长度一致，随机到的value的下标将会对应suffix中的图标索引
*/

export const SkillData: Skill[] = [
  {
    name: "外挂！启动！",
    descriptions: ["${user} 开启了从电竞科学家卢先生手中得到的高科技产品，化身闪电侠。"],
    effects: [
      {
        type: "speed",
        targets: ["self"],
        values: [4, 5, 6],
        suffixes: ["⚡️", "⚡️⚡️", "⚡️⚡️⚡️"]
      }
    ]
  }
];

export const CharacterData: Array<Character> = [
  {
    name: "蔡徐坤",
    icon: "👨",
    skills: [
      {
        name: "鸡你太美",
        descriptions: [
          "${char_icon}${char_name}的脚下不断滑动，口中大呼「鸡你太美」，获得了速度加成。",
          "${char_icon}练习生${char_name}乔丹附体，通过强大的运球技巧凌波微步狂奔了起来。",
          "${char_icon}练习生${char_name}不断运转手中的篮球持续做功，把动能转换为热能，并燃烧起火，获得了强大推进力。"
        ],
        effects: [
          {
            type: "speed",
            targets: ["self"],
            values: [2, 4, 7, 9],
            suffixes: ["💰", "💰💰", "💰💰💰"]
          }
        ]
      }
    ]
  },
  {
    name: "马花藤",
    icon: "🐴",
    skills: [
      {
        name: "没钱玩你麻痹",
        descriptions: [
          "${char_icon}成为了尊贵的心悦会员，系统赠送他额外的速度加成，无人能敌！",
          "${char_icon}突然斗气化马，速度得到了大幅度提升。"
        ],
        effects: [
          {
            type: "speed",
            targets: ["self"],
            values: [2, 4, 7, 12, 14],
            suffixes: ["💰", "💰💰", "💰💰💰"]
          }
        ]
      },
      {
        name: "没钱玩你麻痹",
        descriptions: ["${char_icon}狂吼一声${skill_name}，瞬间获得力量，一下子狂奔到了前面。"],
        effects: [
          {
            type: "progress",
            targets: ["self"],
            values: [3, 5, 7, 12],
            suffixes: ["💰", "💰💰", "💰💰💰"]
          }
        ]
      }
    ]
  },
  {
    name: "死亡巴士",
    icon: "🚌",
    skills: [
      {
        name: "汽车人",
        descriptions: [
          "${char_icon}突然变身了成了擎天柱，行驶速度变快了。",
          "${char_icon}的司机换成了武汉的公交车老司机，完全不顾乘客死活，飙到了280.",
          "${char_icon}化为灵车，直接在赛道上飘了起来。"
        ],
        effects: [
          {
            type: "speed",
            targets: ["self"],
            values: [3, 6, 8, 10],
            suffixes: ["⚡️️", "⚡️️⚡️️", "⚡️️⚡️️⚡️️"]
          }
        ]
      }
    ]
  },
  {
    name: "自行车",
    icon: "🚲",
    skills: [
      {
        name: "ofo",
        descriptions: [
          "${char_icon} 车身冒出一阵黄灿灿的光芒，仔细一看隐约可见 ${skill_name} 几个字母，原来是……小黄车！虽然押金都不退，但是这一刻它灵魂附体，狂奔了起来。",
          "${char_icon} 化为ofo, 把用户的押金购买了精良的德国工艺，速度飞快。"
        ],
        effects: [
          {
            type: "speed",
            targets: ["self"],
            values: [8, 9, 12, 18],
            suffixes: ["⚡️️", "⚡️️⚡️️", "⚡️️⚡️️⚡️️"]
          }
        ]
      },
      {
        name: "损坏的摩拜单车",
        descriptions: ["${char_icon}“滴滴” 咔嚓扫码解锁！……等等，好像扫到了一辆损坏的摩拜单车。自己速度变慢了。"],
        effects: [
          {
            type: "speed",
            targets: ["self"],
            values: [-1, -2, -3],
            suffixes: ["🔧", "🔧🔧", "🔧🔧🔧"]
          }
        ]
      }
    ]
  },
  {
    name: "香港记者",
    icon: "🐸",
    skills: [
      {
        name: "跑得快",
        descriptions: ["${char_icon}口中念念有词，什么西方...什么跑得快...什么人生经验，这种速度，是钦定的感觉。"],
        effects: [
          {
            type: "speed",
            targets: ["self"],
            values: [5, 9, 12, 14],
            suffixes: ["⚡️️", "⚡️️⚡️️", "⚡️️⚡️️⚡️️"]
          }
        ]
      },
      {
        name: "人生经验",
        descriptions: ["${char_icon}给大家传授了一些人生经验，全场都倒退了。"],
        effects: [
          {
            type: "progress",
            targets: ["others"],
            values: [-3, -4, -5],
            suffixes: ["⚡️️", "⚡️️⚡️️", "⚡️️⚡️️⚡️️"]
          }
        ]
      }
    ]
  },
  {
    name: "和谐号",
    icon: "🚄",
    skills: [
      {
        name: "飙车",
        descriptions: [
          "${char_icon} 和谐号动车组是我国铁路全面实施自主创新战略取得的重大成果，标志着我国铁路客运装备的技术水平达到了世界先进水平，此时它的速度飙到了380，刹不住车了。"
        ],
        effects: [
          {
            type: "speed",
            targets: ["self"],
            values: [4, 6, 9],
            suffixes: ["⚡️️", "⚡️️⚡️️", "⚡️️⚡️️⚡️️"]
          }
        ]
      },
      {
        name: "遇见复兴号",
        descriptions: [
          "${char_icon} ${char_name}在飙车过程中突然被一辆路过的复兴号超车了，司机很不爽，一脚油门下去，速度快的差点飞了起来。"
        ],
        effects: [
          {
            type: "progress",
            targets: ["self"],
            values: [4, 7, 8],
            suffixes: ["⚡️️", "⚡️️⚡️️", "⚡️️⚡️️⚡️️"]
          }
        ]
      }
    ]
  },
  {
    name: "单身狗",
    icon: "🐶",
    skills: [
      {
        name: "舔狗",
        descriptions: [
          "${char_icon}用出了舔狗十三式，突然狂奔了十公里。正所谓舔狗舔到最后，应有尽有。",
          "${char_icon}化为备胎形态，直接在赛道上滚了起来！"
        ],
        effects: [
          {
            type: "progress",
            targets: ["self"],
            values: [5, 6, 9, 18],
            suffixes: []
          }
        ]
      },
      {
        name: "补丁",
        descriptions: ["${char_icon} 在这个版本成为了宠儿！最强的是什么？就是补丁！还有谁！！"],
        effects: [
          {
            type: "speed",
            targets: ["self"],
            values: [10, 12, 16],
            suffixes: []
          }
        ]
      },
      {
        name: "单身狗",
        descriptions: [
          "${char_icon}化为狂怒的单身狗，释放出大范围FFFF之火🔥🔥🔥，场上无一幸免，全部都被烧伤，速度。",
          "${char_icon}化为云备胎形态，开启了舔狗模式，使用了传说中的禁术三连——「在吗？吃了吗？睡了吗？」，对场上造成了成吨的伤害。"
        ],
        effects: [
          {
            type: "progress",
            targets: ["others"],
            values: [-3, -6],
            suffixes: []
          }
        ]
      }
    ]
  }
];
