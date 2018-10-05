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
  get (key: string): T | undefined
  getChild<T> (prefix: string): BotStorage<T>
}

class ChildStorage<T> {
  constructor (private s: BotStorageService, private prefix: string) {
  }
  set (key: string, value: T): void {
    this.s.set(this.prefix + key, value)
    this.s.onAutoSave()
  }
  get (key: string): T | undefined {
    return this.s.get(this.prefix + key)
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
    let s = await readFile(this.path, 'utf-8')
    try {
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
