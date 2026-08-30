// ---------------------------------------------------------------------------
// Type sizes stop ignoring the reader — audit §11.
//
// Every font size in the app was written in px: `text-[10px]` in the JSX,
// `font-size: 34px` in the type scale. A CSS pixel does not move when someone
// raises their text size in iOS or Android settings, or sets a larger default
// in a desktop browser. So the one accessibility control almost everyone
// actually uses — the OS text-size slider — did nothing at all here.
//
// rem does move: it is a multiple of the browser's root font size, which is
// exactly what that slider changes. 1rem = 16px by default, so at default
// settings this codemod changes NOTHING VISUALLY — every value below divides
// exactly by 16, no rounding, no drift. It only starts to matter for the
// people for whom it currently doesn't work at all.
//
// DELIBERATELY NOT CONVERTED: `hit-slop-44`, `min-h-[44px]` and friends. Those
// are touch targets, and 44px is a floor, not a preference — a target that
// shrank with a smaller text setting would be a worse control, not a more
// respectful one.
//
// Idempotent. Run: node scripts/codemod-px-to-rem.mjs [--check]
// ---------------------------------------------------------------------------

import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = []
const walk = d => {
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(tsx|ts|css)$/.test(e)) files.push(p)
  }
}
walk(join(ROOT, 'src'))

/** px -> rem at the 16px root every browser ships with. Exact for every value in use. */
const rem = px => {
  const value = Number(px) / 16
  // Trim trailing zeros without ever rounding a real digit away.
  return String(Number(value.toFixed(6)))
}

const check = process.argv.includes('--check')
let changed = 0
const touched = []

for (const f of files) {
  const src = readFileSync(f, 'utf8')
  let out = src

  // Tailwind arbitrary font sizes: text-[10px] -> text-[0.625rem]
  out = out.replace(/text-\[([0-9.]+)px\]/g, (_, px) => `text-[${rem(px)}rem]`)

  // The type scale in CSS: font-size: 34px -> font-size: 2.125rem
  out = out.replace(/font-size:\s*([0-9.]+)px/g, (_, px) => `font-size: ${rem(px)}rem`)

  if (out !== src) {
    const n = (src.match(/text-\[[0-9.]+px\]|font-size:\s*[0-9.]+px/g) ?? []).length
    changed += n
    touched.push(`${f.replace(ROOT + '/', '')} (${n})`)
    if (!check) writeFileSync(f, out)
  }
}

if (check) {
  if (changed === 0) { console.log('ok: every font size is already in rem'); process.exit(0) }
  console.error(`FAIL: ${changed} font size(s) still written in px:`)
  for (const t of touched) console.error(`  ${t}`)
  console.error('Run: node scripts/codemod-px-to-rem.mjs')
  process.exit(1)
}

console.log(`Converted ${changed} font size(s) across ${touched.length} file(s).`)
for (const t of touched) console.log(`  ${t}`)
