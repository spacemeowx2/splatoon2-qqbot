export class Character {
  public name: string = "";
  public icon: string = "";
  public skills?: Skill[] = [];
}

export class Effect {
  public type: "speed" | "progress" = "speed";
  public targets: ("self" | "all" | "random")[] = ["self"];
  public values: number[] = [];
  public suffixes: string[] = [];
}

export class Skill {
  public name: string = "";
  public descriptions: string[] = [];
  public effects: Effect[] = [];
}
