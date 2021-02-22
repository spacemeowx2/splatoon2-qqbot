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

export function arrayBufferToBuffer (a: ArrayBuffer) {
  return Buffer.from(new Uint8Array(a))
}

export function getRandomIntInclusive (min: number, max: number) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function randomIn<T> (arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function sleep (ms: number) {
  return new Promise(res => setTimeout(res, ms))
}
