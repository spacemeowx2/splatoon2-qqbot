import { Stream } from "stream"

export class Bitmap {
  width: number
  height: number
  data: ArrayBuffer
  getContext(ctx: '2d'): CanvasRenderingContext2D
}

export function registerFont(binaryPath: string, family: string, weight?: number, style?: string, variant?: string): void
export function make(w: number, h: number, options?: {}): Bitmap
export function decodePNGFromStream(instream: Stream): Promise<Bitmap>
export function encodePNGToStream(bitmap: Bitmap, outstream: Stream): Promise<Bitmap>
