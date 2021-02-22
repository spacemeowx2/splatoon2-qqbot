import { Readable, Writable } from 'stream'

export function bufferToStream (buffer: Buffer) {
  return new Readable({
    read () {
      this.push(buffer)
      this.push(null)
    }
  })
}

export function streamToBuffer (bufs: Buffer[]) {
  return new Writable({
    write (chunk: Buffer, encoding, next) {
      bufs.push(chunk)
      next()
    },
  })
}
