import { writeFile as writeFileAsync, readFile as readFileAsync } from 'fs'
import { promisify } from 'util'
const writeFile = promisify(writeFileAsync)
const readFile = promisify(readFileAsync)
const AutoSaveInterval = 1000 * 10

export type StorageValue = number | string
export interface KeyValue {
  [key: string]: StorageValue
}

export interface BotStorage {
  set (key: string, value: StorageValue): void
  get (key: string): any
  getChild (prefix: string): BotStorage
}

class ChildStorage implements BotStorage {
  constructor (private s: BotStorageService, private prefix: string) {
  }
  set (key: string, value: StorageValue): void {
    this.s.set(this.prefix + key, value)
    this.s.onAutoSave()
  }
  get (key: string): StorageValue {
    return this.s.get(this.prefix + key)
  }
  getChild (prefix: string): BotStorage {
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
  getChild (prefix: string): BotStorage {
    return new ChildStorage(this, prefix + '.')
  }
  set (key: string, value: StorageValue) {
    this.kv[key] = value
  }
  get (key: string): StorageValue {
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
