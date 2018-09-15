export function shuffle<T> (ary: T[]) {
  return ary.sort((a, b) => Math.random() - 0.5)
}
export function exclude<T> (ary: T[], exc: T[]) {
  return ary.filter(i => !exc.includes(i))
}
