export function shuffle<T> (ary: T[]) {
  let r = [...ary]
  let i = r.length
  while (i) {
    const j = Math.floor(Math.random() * i--);
    [r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

export function exclude<T> (ary: T[], exc: T[]) {
  return ary.filter(i => !exc.includes(i))
}

export function pick<T> (ary: T[]) {
  return ary[Math.floor(ary.length * Math.random())]
}
