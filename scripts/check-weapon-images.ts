import axios from 'axios'
import { Splatoon2Data } from '../src/modules/splatoon2'
import { writeFile as writeFileAsync, stat as statAsync, readFile as readFileAsync, readdir as readdirAsync } from 'fs'
import { promisify } from 'util'
import path from 'path'
const writeFile = promisify(writeFileAsync)
const readFile = promisify(readFileAsync)
const readdir = promisify(readdirAsync)
const stat = promisify(statAsync)
const dataPath = path.resolve(__dirname, '..', 'data')

interface StageInfo {
  id: string
  name: string
  image: string
}

interface WeaponInfo {
  id: string
  name: string
  image: string
  special: {
    id: string
    image_a: string
    image_b: string
  }
  sub: {
    id: string
    image_a: string
    image_b: string
  }
}

interface RecordResponse {
  records: {
    weapon_stats: Record<string, {
      weapon: WeaponInfo
    }>
    stage_stats: Record<string, {
      stage: StageInfo
    }>
  }
}

async function main (argv: string[]) {
  const resp = JSON.parse((await readFile(path.join(dataPath, 'splatoon2-data.json'), 'utf-8')))
  const data: Splatoon2Data = resp
  const imgs = await readdir(path.join(dataPath, 'images', 'weapon'))
  for (let weapon of data.weapons) {
    const imageName = path.basename(weapon.image)
    const idx = imgs.indexOf(imageName)
    if (idx === -1) {
      console.warn(`${imageName} not found`)
    } else {
      imgs.splice(idx, 1)
    }
  }
  console.log(`Done ${imgs.join(' ')}`)
}
main(process.argv.slice(1)).catch(e => console.error(e))
