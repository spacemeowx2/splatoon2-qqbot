import { writeFile as writeFileAsync, readFile as readFileAsync } from 'fs'
import { promisify } from 'util'
const writeFile = promisify(writeFileAsync)
const readFile = promisify(readFileAsync)
const AutoSaveInterval = 1000 * 10

export interface KeyValue {
  [key: string]: any
}

export interface BotStorage<T = any> {
  set (key: string, value: T): void
  get<U = T> (key: string): U | undefined
  del (key: string): boolean
  getChild<T> (prefix: string): BotStorage<T>
  flush(): Promise<void>
}

class ChildStorage<T> {
  constructor (private s: BotStorageService, private prefix: string) {
  }
  set (key: string, value: T): void {
    this.s.set(this.prefix + key, value)
    this.s.onAutoSave()
  }
  get<U = T> (key: string): U | undefined {
    return this.s.get(this.prefix + key)
  }
  del (key: string) {
    const r = this.s.del(this.prefix + key)
    this.s.onAutoSave()
    return r
  }
  flush () {
    return this.s.flush()
  }
  getChild<T> (prefix: string): BotStorage<T> {
    return new ChildStorage(this.s, this.prefix + prefix + '.')
  }
}

export class BotStorageService {
  private kv: KeyValue = {}
  private lastSave: number = 0
  constructor (private path: string) {
  }
  async load () {
    try {
      let s = await readFile(this.path, 'utf-8')
      this.kv = JSON.parse(s)
    } catch (e) {
      console.warn('read from file failed, when parsing')
      this.kv = {}
    }
  }
  async save () {
    this.lastSave = Date.now()
    let s = JSON.stringify(this.kv)
    await writeFile(this.path, s)
  }
  getChild<T> (prefix: string): BotStorage<T> {
    return new ChildStorage(this, prefix + '.')
  }
  set<T> (key: string, value: T) {
    this.kv[key] = value
  }
  get<T> (key: string): T | undefined {
    return this.kv[key]
  }
  del (key: string) {
    const r = delete this.kv[key]
    return r
  }
  async flush () {
    await this.save()
  }
  onAutoSave () {
    const now = Date.now()
    const dif = now - this.lastSave
    if (dif > AutoSaveInterval) {
      this.save().catch(e => console.error('auto save failed'))
    } else {
      // too quick
      setTimeout(() => this.onAutoSave(), dif)
    }
  }
}
