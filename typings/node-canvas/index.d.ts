declare module 'canvas' {
  import { Stream } from "stream"

  export const MODE_IMAGE: number
  export const MODE_MIME: number
  export class Image {
    src: Buffer
    dataMode: number
  }
  export class Font {
    constructor (name: string, path: string)
  }
  export interface CanvasNonStandard {
    pngStream (): Stream
    jpegStream (): Stream
    syncJPEGStream (): Stream
    toBuffer (type?: string): Buffer
    toBuffer (cb: (err: Error | undefined, buf: Buffer) => void): void
    toDataURL (mime?: string): string
  }
  const Canvas: HTMLCanvasElement
  const factory: { new (width: number, height: number): HTMLCanvasElement & CanvasNonStandard }
  export default factory
}
