import { mkdirp, readFile, writeFile, remove } from 'fs-extra'
import { resolve, join } from 'path'

export interface BotFile {
  write (key: string, file: Buffer): Promise<void>
  read (key: string): Promise<Buffer>
  delete (key: string): Promise<void>
  getChild (prefix: string): BotFile
}
class ChildFile implements BotFile {
  private root: string
  private ensureRoot: () => Promise<void>

  constructor (parent: string, prefix: string) {
    this.root = resolve(parent, prefix)
    this.ensureRoot = () => mkdirp(this.root)
  }
  async write (key: string, file: Buffer): Promise<void> {
    await this.ensureRoot()
    return writeFile(join(this.root, key), file)
  }
  async read (key: string): Promise<Buffer> {
    await this.ensureRoot()
    return readFile(join(this.root, key))
  }
  async delete (key: string): Promise<void> {
    await this.ensureRoot()
    return remove(join(this.root, key))
  }
  getChild (prefix: string): BotFile {
    return new ChildFile(this.root, prefix)
  }
}
export class BotFileService {
  root: string
  constructor (root: string) {
    this.root = resolve(root)
  }
  getChild (prefix: string) {
    return new ChildFile(this.root, prefix)
  }
}
