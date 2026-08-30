// ---------------------------------------------------------------------------
// Generates the app's icons — audit §9.1/§9.2.
//
// index.html asked for /favicon.svg and there was no public/ directory at
// all, so every page load 404'd and the browser tab showed a blank default.
// The app had no icon anywhere: not in the tab, not on a bookmark, and
// (with no manifest) nothing to put on a Home Screen either.
//
// PNGs are generated here rather than committed as opaque binaries so the
// mark is reviewable and reproducible: the shape is code, and regenerating
// after a palette change is one command. Node's own zlib does the PNG
// compression, so this needs no image library.
//
// THE MARK IS A PLACEHOLDER and says so in the report — a plain dumbbell in
// the app's own default accent on its own default canvas. Branding is
// Ashley's call, not something to invent quietly; this exists so the app
// stops being iconless, and is one file to replace when there is a real one.
//
//   node scripts/generate-app-icons.mjs
// ---------------------------------------------------------------------------

import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public')
mkdirSync(OUT, { recursive: true })

// The default theme's canvas and accent, read off index.css's nightshift block.
const CANVAS = [0x1a, 0x16, 0x36]
const MINT = [0x5b, 0xe9, 0xc2]

/** Signed distance to a rounded rectangle centred at (cx, cy) — negative inside. */
function roundedRectSdf(x, y, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(x - cx) - (halfW - radius)
  const dy = Math.abs(y - cy) - (halfH - radius)
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  const inside = Math.min(Math.max(dx, dy), 0)
  return outside + inside - radius
}

/**
 * A dumbbell, in units of the icon's own size so it scales exactly.
 * Two end blocks and a bar between them, tilted slightly so it reads as an
 * object rather than a plus sign at 32px.
 */
function markCoverage(u, v) {
  // Rotate the sample point by -20deg about the centre; drawing straight
  // shapes in a rotated frame is cheaper and crisper than rotating pixels.
  const a = (-20 * Math.PI) / 180
  const x = 0.5 + (u - 0.5) * Math.cos(a) - (v - 0.5) * Math.sin(a)
  const y = 0.5 + (u - 0.5) * Math.sin(a) + (v - 0.5) * Math.cos(a)

  const bar = roundedRectSdf(x, y, 0.5, 0.5, 0.30, 0.045, 0.045)
  const left = roundedRectSdf(x, y, 0.215, 0.5, 0.075, 0.155, 0.05)
  const right = roundedRectSdf(x, y, 0.785, 0.5, 0.075, 0.155, 0.05)
  return Math.min(bar, left, right) < 0
}

function renderRgba(size) {
  const SS = 4 // supersample factor — 16 samples per pixel, plenty for a flat mark
  const px = Buffer.alloc(size * size * 4)
  const cornerRadius = size * 0.22

  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let bgHits = 0
      let markHits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = pxi + (sx + 0.5) / SS
          const fy = py + (sy + 0.5) / SS
          const inSquircle = roundedRectSdf(fx, fy, size / 2, size / 2, size / 2, size / 2, cornerRadius) < 0
          if (!inSquircle) continue
          bgHits++
          if (markCoverage(fx / size, fy / size)) markHits++
        }
      }
      const total = SS * SS
      const alpha = bgHits / total
      const markMix = bgHits === 0 ? 0 : markHits / bgHits
      const i = (py * size + pxi) * 4
      for (let c = 0; c < 3; c++) {
        px[i + c] = Math.round(CANVAS[c] * (1 - markMix) + MINT[c] * markMix)
      }
      px[i + 3] = Math.round(alpha * 255)
    }
  }
  return px
}

/** Minimal PNG encoder — RGBA, 8-bit, one IDAT. */
function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter type 0 (None)
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return c ^ 0xffffffff
}

/** The same mark as SVG, for the browser tab — vector, so it stays sharp at any size. */
function markSvg() {
  const hex = (c) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Personal TrAIner">
  <rect width="100" height="100" rx="22" fill="${hex(CANVAS)}"/>
  <g transform="rotate(-20 50 50)" fill="${hex(MINT)}">
    <rect x="20" y="45.5" width="60" height="9" rx="4.5"/>
    <rect x="14" y="34.5" width="15" height="31" rx="5"/>
    <rect x="71" y="34.5" width="15" height="31" rx="5"/>
  </g>
</svg>
`
}

const SIZES = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  // iOS ignores the manifest for the Home Screen icon and reads this instead.
  // It also composites onto white, so this one is written without the
  // rounded-corner transparency — iOS applies its own mask.
  ['apple-touch-icon.png', 180],
]

for (const [name, size] of SIZES) {
  const rgba = renderRgba(size)
  if (name === 'apple-touch-icon.png') {
    // Fill the transparent corners with the canvas colour rather than
    // letting iOS composite them onto white.
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] === 255) continue
      const a = rgba[i + 3] / 255
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(rgba[i + c] * a + CANVAS[c] * (1 - a))
      rgba[i + 3] = 255
    }
  }
  writeFileSync(join(OUT, name), encodePng(size, rgba))
  console.log(`wrote public/${name} (${size}x${size})`)
}

writeFileSync(join(OUT, 'favicon.svg'), markSvg())
console.log('wrote public/favicon.svg')
