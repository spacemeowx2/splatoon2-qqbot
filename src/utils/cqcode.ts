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
export function cqCode(func: string, params: Record<string, string>) {
  if (!validKey(func) || !Object.keys(params).every(k => validKey(k))) {
    throw new Error('invalid key or function')
  }
  return `[CQ:${func},${Object.keys(params).map(k => `${k}=${cqEncode(params[k])}`)}]`
}
export class CQTag {
  constructor (
    public readonly type: string,
    public readonly data: Record<string, string>
  ) {}
  toString() {
    return cqCode(this.type, this.data)
  }
  valueOf() {
    return this.toString()
  }
  static parse(s: string) {
    const re = /\[CQ:([a-zA-Z0-9_\.-]+),?((,?[a-zA-Z0-9_\.-]+=[^,[\]]*)*)\]/
    const ary = re.exec(s)
    if (ary === null) {
      throw new Error(`CQTag is not valid`)
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
    return new CQTag(type, data)
  }
}
export function cqParse(s: string) {
  const re = /(\[CQ[^\]]*\])/g
  return s.split(re).map(i => i[0] === '[' ? CQTag.parse(i) : cqDecode(i))
}
export function cqGetString(s: string) {
  const re = /(\[CQ[^\]]*\])/g
  return s.split(re).map(i => i[0] === '[' ? '' : cqDecode(i)).join('')
}
