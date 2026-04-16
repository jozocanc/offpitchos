// One-shot icon generator: renders /public/icon.svg into PNG sizes used by
// the favicon + Apple touch icon + PWA manifest. Run with `node scripts/generate-icons.mjs`.
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join } from 'path'

const publicDir = join(process.cwd(), 'public')
const svg = readFileSync(join(publicDir, 'icon.svg'))

const sizes = [
  { name: 'favicon-32.png', size: 32 },
  { name: 'icon-180.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
]

for (const { name, size } of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(join(publicDir, name))
  console.log(`wrote ${name}`)
}
