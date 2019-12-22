import axios from 'axios'
import { cqStringify, cqCode } from '../utils/cqcode'

export async function getImage(url: string) {
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 5000
  })
  const buf = Buffer.from(new Uint8Array(res.data))
  return cqCode('image', {
    file: `base64://${buf.toString('base64')}`
  })
}
