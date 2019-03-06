export function validKey(s: string) {
  return /^[a-zA-Z0-9_\.-]+$/.test(s)
}
export function cqEncode(s: string) {
  return s.replace(/&/g, '&amp;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/,/g, '&#44;')
}
export function cqCode(func: string, params: Record<string, string>) {
  if (!validKey(func) || !Object.keys(params).every(k => validKey(k))) {
    throw new Error('invalid key or function')
  }
  return `[CQ:${func},${Object.keys(params).map(k => `${k}=${cqEncode(params[k])}`)}]`
}
