export type CQMessageList = (string | CQCode)[]
export function validKey(s: string) {
  return /^[a-zA-Z0-9_\.-]+$/.test(s)
}
export function cqEncode(s: string) {
  return s.replace(/&/g, '&amp;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/,/g, '&#44;')
}
export function cqDecode(s: string) {
  return s.replace(/&#44;/g, ',')
    .replace(/&#93;/g, ']')
    .replace(/&#91;/g, '[')
    .replace(/&amp;/g, '&')
}
export function cqCode(type: string, data: Record<string, string>) {
  return new CQCode(type, data)
}
export class CQCode {
  constructor (
    public readonly type: string,
    public readonly data: Record<string, string>
  ) {
    CQCode.checkTypeAndData(type, data)
  }
  toString() {
    const { type, data } = this
    return `[CQ:${type},${Object.keys(data).map(k => `${k}=${cqEncode(data[k])}`)}]`
  }
  valueOf() {
    return this.toString()
  }
  static checkTypeAndData(type: string, data: Record<string, string>) {
    if (!validKey(type) || !Object.keys(data).every(k => validKey(k))) {
      throw new Error('invalid key or function')
    }
  }
  static parse(s: string) {
    const re = /\[CQ:([a-zA-Z0-9_\.-]+),?((,?[a-zA-Z0-9_\.-]+=[^,[\]]*)*)\]/
    const ary = re.exec(s)
    if (ary === null) {
      throw new Error(`CQCode is not valid`)
    }
    const type = ary[1]
    const data = ary[2].split(',')
      .map(i => i.split('='))
      .reduce(
        (data, [ k, v ]) => {
          data[k] = cqDecode(v)
          return data
        },
        {} as Record<string, string>
      )
    return new CQCode(type, data)
  }
}
export function cql(literals: TemplateStringsArray, ...placeholders: CQMessageList): string {
  let result = ''

  for (let i = 0; i < placeholders.length; i++) {
    result += literals[i]
    const v = placeholders[i]
    result += isCQCode(v) ? v.toString() : cqEncode(v)
  }

  result += cqEncode(literals[literals.length - 1])
  return result
}
export function cqParse(s: string) {
  const re = /(\[CQ[^\]]*\])/g
  return s.split(re).map(i => i[0] === '[' ? CQCode.parse(i) : cqDecode(i))
}
export function cqStringify(ary: CQMessageList) {
  return ary.map(i => typeof i === 'string' ? cqEncode(i) : i.toString()).join('')
}
export function cqGetString(s: string) {
  const re = /(\[CQ[^\]]*\])/g
  return s.split(re).map(i => i[0] === '[' ? '' : cqDecode(i)).join('')
}
export function isCQCode (s: string | CQCode): s is CQCode {
  return typeof s !== 'string'
}
