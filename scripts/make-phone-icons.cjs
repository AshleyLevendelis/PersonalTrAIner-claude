// ---------------------------------------------------------------------------
// THE APP'S ICON, EVERYWHERE: his pick 20 Nov 2026, "Just go with the coach bubble for now and we can change it later"
// (from four drawn options; it replaces the placeholder dumbbell the old generate-app-icons.mjs drew).
//
// A mint chat bubble holding a dumbbell, with a sparkle for the AI, on the app's deep violet. Drawn here as vector and
// photographed by the pre-installed Chromium, so every size is sharp and the mark is code that can be changed.
//
//   node scripts/make-phone-icons.cjs
//
// Writes:
//   assets/   the sources the phone apps are cut from on the Mac (npx @capacitor/assets generate, see
//             docs/handover/phone-app-stores.md): icon-only (square, opaque: Apple refuses see-through corners),
//             icon-foreground + icon-background (Android's shaped icons, foreground inside the middle two thirds),
//             splash + splash-dark (2732, the mark in the middle).
//   public/   the website's: icon-192/512 (rounded, "any"), icon-maskable-512 (full bleed, the mark inside the safe
//             circle), apple-touch-icon (180, square: iOS rounds it), favicon.svg.
// ---------------------------------------------------------------------------
const { chromium } = require('playwright')
const { writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')

const ROOT = join(__dirname, '..')
mkdirSync(join(ROOT, 'assets'), { recursive: true })

const DEFS = `
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B2163"/><stop offset="1" stop-color="#120F29"/></linearGradient>
<linearGradient id="mint" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8BF5DA"/><stop offset="1" stop-color="#2FC9A3"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#5DE8C5" stop-opacity=".35"/><stop offset="1" stop-color="#5DE8C5" stop-opacity="0"/></radialGradient>`

/** The mark on a 1024 canvas, centred on 512. */
const MARK = `
<path d="M232 250 h560 a90 90 0 0 1 90 90 v300 a90 90 0 0 1 -90 90 h-330 l-150 120 l20 -120 h-100 a90 90 0 0 1 -90 -90 v-300 a90 90 0 0 1 90 -90z" fill="url(#mint)"/>
<g fill="#1A1636"><rect x="352" y="472" width="320" height="44" rx="10"/><rect x="300" y="390" width="78" height="208" rx="26"/><rect x="646" y="390" width="78" height="208" rx="26"/><rect x="262" y="430" width="50" height="128" rx="20"/><rect x="712" y="430" width="50" height="128" rx="20"/></g>
<path transform="translate(800 236) scale(1.5)" d="M0 -50 C6 -14 14 -6 50 0 C14 6 6 14 0 50 C-6 14 -14 6 -50 0 C-14 -6 -6 -14 0 -50Z" fill="#FFFFFF"/>`

const BG = (rounded) => `<rect width="1024" height="1024" ${rounded ? 'rx="225"' : ''} fill="url(#bg)"/><circle cx="512" cy="512" r="420" fill="url(#glow)"/>`
const mark = (scale) => `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${MARK}</g>`
/** An SVG on a 1024 viewBox, drawn at `size`. */
const svg = (body, size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024"><defs>${DEFS}</defs>${body}</svg>`

const OUT = {
  'assets/icon-only.png': [1024, BG(false) + mark(1)],
  'assets/icon-foreground.png': [1024, mark(0.62)],
  'assets/icon-background.png': [1024, BG(false)],
  'assets/splash.png': [2732, `<rect width="1024" height="1024" fill="#1A1636"/>` + mark(0.32)],
  'assets/splash-dark.png': [2732, `<rect width="1024" height="1024" fill="#1A1636"/>` + mark(0.32)],
  'public/icon-512.png': [512, BG(true) + mark(1)],
  'public/icon-192.png': [192, BG(true) + mark(1)],
  'public/icon-maskable-512.png': [512, BG(false) + mark(0.78)],
  'public/apple-touch-icon.png': [180, BG(false) + mark(1)],
}

;(async () => {
  const b = await chromium.launch()
  for (const [file, [size, body]] of Object.entries(OUT)) {
    const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg(body, size)}</body></html>`)
    await p.screenshot({ path: join(ROOT, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
    await p.close()
  }
  await b.close()
  writeFileSync(join(ROOT, 'public/favicon.svg'), svg(BG(true) + mark(1), 100).replace('width="100" height="100"', 'role="img" aria-label="Personal TrAIner"') + '\n')
  console.log(`Wrote ${Object.keys(OUT).length} icons and public/favicon.svg.`)
})()
