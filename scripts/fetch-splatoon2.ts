import axios from 'axios'
import { Splatoon2Data } from '../src/modules/splatoon2'
import { writeFile as writeFileAsync, stat as statAsync } from 'fs'
import { promisify } from 'util'
import path from 'path'
const writeFile = promisify(writeFileAsync)
const stat = promisify(statAsync)
const dataPath = path.resolve(__dirname, '..', 'data')
const blacklist = [
  '45',
  '6005',
  '5015',
  '1015',
  '46',
  '2015'
]

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

async function downloadImage (image: string) {
  const dst = path.join(dataPath, image)
  try {
    await stat(dst)
    console.log(`${image} Skip`)
    return
  } catch (e) {
  }
  const resp = await axios.get(`https://app.splatoon2.nintendo.net${image}`, {
    responseType: 'arraybuffer'
  })
  await writeFile(dst, resp.data)
  console.log(`${image} Done`)
}

async function main (argv: string[]) {
  if (argv.length !== 2) {
    console.log(`need iksm_session`)
    return
  }
  const resp = await axios.get<RecordResponse>(`https://app.splatoon2.nintendo.net/api/records`, {
    headers: {
      cookie: `iksm_session=${argv[1]}`
    }
  })
  const data: Splatoon2Data = {
    weapons: [],
    stages: []
  }
  const { weapon_stats, stage_stats } = resp.data.records
  for (let { weapon } of Object.values(weapon_stats)) {
    data.weapons.push({
      id: weapon.id,
      name: weapon.name,
      image: weapon.image,
      special: {
        id: weapon.special.id,
        image_a: weapon.special.image_a,
        image_b: weapon.special.image_b
      },
      sub: {
        id: weapon.sub.id,
        image_a: weapon.sub.image_a,
        image_b: weapon.sub.image_b
      }
    })
  }
  for (let { stage } of Object.values(stage_stats)) {
    data.stages.push({
      id: stage.id,
      name: stage.name,
      image: stage.image
    })
  }
  await writeFile(path.join(dataPath, 'splatoon2-data.json'), JSON.stringify(data))
  console.log('Downloading images...')
  for (let weapon of data.weapons) {
    const s = [
      downloadImage(weapon.image),
      downloadImage(weapon.sub.image_a),
      downloadImage(weapon.special.image_a),
      downloadImage(weapon.sub.image_b),
      downloadImage(weapon.special.image_b),
    ]
    await Promise.all(s)
  }
  for (let stage of data.stages) {
    await downloadImage(stage.image)
  }
  console.log(`Done`)
}
main(process.argv.slice(1)).catch(e => console.error(e))
