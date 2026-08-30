// ---------------------------------------------------------------------------
// Gate: the app is installable, has an icon, and opens offline.
//
// Audit §9.1/§9.2. There was no public/ directory at all. index.html asked
// for /favicon.svg and got a 404 on every single page load, so the browser
// tab showed a blank default and the app had no icon anywhere. There was no
// manifest, so it could never be added to a Home Screen as an app; and no
// service worker, so opening it with no signal gave the browser's own error
// page — all that careful local-first write queueing sitting behind a door
// that wouldn't open.
//
// On iPhone the missing manifest was worse than cosmetic: Safari clears
// script-written storage for sites the user hasn't opened in about a week
// UNLESS they're installed to the Home Screen, and that storage IS the
// account (§1.2).
//
// Every URL check here resolves the actual file, and the PNG checks parse
// the real image header — a manifest that promises a 512x512 icon and ships
// a 180x180 one is an install that silently looks wrong.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** Width and height straight out of a PNG's IHDR — proves the file is what it claims. */
function pngSize(path: string): { width: number; height: number } | null {
  const buf = readFileSync(path)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buf.subarray(0, 8).equals(signature)) return null
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const html = readFileSync(join(ROOT, 'index.html'), 'utf8')

console.log('\n1. Every file the page asks for actually exists')
{
  // THE ORIGINAL BUG: /favicon.svg was referenced and did not exist, on every
  // load, for the life of the app. So this resolves each href rather than
  // checking the tag is present.
  const referenced = [...html.matchAll(/(?:href|content)="(\/[^"]+\.(?:svg|png|webmanifest))"/g)].map(m => m[1])
  check('the page references at least an icon and a manifest', referenced.length >= 3, referenced)
  for (const url of referenced) {
    check(`${url} exists in public/`, existsSync(join(ROOT, 'public', url.slice(1))))
  }
}

console.log('\n2. The manifest is one a browser will actually install')
{
  const raw = readFileSync(join(ROOT, 'public/manifest.webmanifest'), 'utf8')
  let manifest: Record<string, unknown> = {}
  let parsed = true
  try { manifest = JSON.parse(raw) } catch { parsed = false }
  check('it is valid JSON', parsed)

  // The fields without which Chrome refuses the install prompt outright.
  for (const key of ['name', 'short_name', 'start_url', 'display', 'icons']) {
    check(`declares ${key}`, manifest[key] != null && manifest[key] !== '')
  }
  check('display is standalone, so it opens as an app rather than a tab', manifest.display === 'standalone')
  check('the theme colour matches the default canvas, so there is no seam at the status bar',
    manifest.theme_color === '#1A1636' && manifest.background_color === '#1A1636')

  const icons = (manifest.icons ?? []) as { src: string; sizes: string; purpose?: string }[]
  check('there is a 192 and a 512 — the two Chrome asks for',
    ['192x192', '512x512'].every(s => icons.some(i => i.sizes === s)), icons.map(i => i.sizes))
  check('...and a maskable one, or Android crops the mark inside its own shape',
    icons.some(i => (i.purpose ?? '').includes('maskable')))

  // Each icon must exist AND be the size it claims.
  for (const icon of icons) {
    const path = join(ROOT, 'public', icon.src.slice(1))
    if (!existsSync(path)) { check(`${icon.src} exists`, false); continue }
    const size = pngSize(path)
    const [w, h] = icon.sizes.split('x').map(Number)
    check(`${icon.src} is a real PNG, actually ${icon.sizes}`,
      size != null && size.width === w && size.height === h, size)
  }

  // iOS ignores the manifest for the Home Screen icon entirely.
  const apple = join(ROOT, 'public/apple-touch-icon.png')
  check('there is an apple-touch-icon, because iOS reads that and not the manifest', existsSync(apple))
  check('...and the page points at it', /rel="apple-touch-icon"/.test(html))
}

console.log('\n3. The offline shell caches the app and nothing of the user\'s')
{
  const sw = stripComments(readFileSync(join(ROOT, 'public/sw.js'), 'utf8'))

  check('non-GET requests are left alone', /request\.method !== 'GET'/.test(sw))
  // THE LINE THAT MATTERS MOST. Caching a Supabase response here would put a
  // second, invisible copy of the user's data one layer beneath the stores
  // built to own it — and a stale plan is worse than no plan.
  check('cross-origin requests are left alone, so no API response is ever cached',
    /url\.origin !== self\.location\.origin/.test(sw))
  check('navigations are network-first, so a deploy is never masked by a stale document',
    /request\.mode === 'navigate'/.test(sw) && /fetch\(request\)[\s\S]{0,400}catch/.test(sw))
  check('...with the cached shell as the fallback', /caches\.match\(SHELL_URL\)/.test(sw))
  check('only successful same-origin responses are stored',
    /response\.ok && response\.type === 'basic'/.test(sw))
  check('old caches are cleared on activate', /caches\.delete\(k\)/.test(sw))
  check('a failed install does not wedge the app', /\.catch\(\(\) => \{\}\)/.test(sw))
}

console.log('\n4. Registration is deliberate about when it happens')
{
  const main = stripComments(readFileSync(join(ROOT, 'src/main.tsx'), 'utf8'))
  check('the worker is registered', /navigator\.serviceWorker\.register\('\/sw\.js'\)/.test(main))
  // A caching worker in front of Vite's dev server fights hot reload.
  check('...production builds only', /import\.meta\.env\.PROD/.test(main))
  // Installing while the first paint is still in flight slows down the very
  // thing it exists to make faster.
  check('...after load, not during the first render', /addEventListener\('load'/.test(main))
  check('...and a failure is silent rather than fatal', /register\('\/sw\.js'\)\.catch\(/.test(main))
  check('the guard checks support before calling', /'serviceWorker' in navigator/.test(main))
}

console.log('\n5. iOS gets what it specifically needs')
{
  check('standalone capability is declared', /apple-mobile-web-app-capable" content="yes"/.test(html))
  check('a Home Screen title is set, or iOS uses the full <title>', /apple-mobile-web-app-title"/.test(html))
  check('the viewport covers the notch', /viewport-fit=cover/.test(html))
  check('a theme colour is set for the status bar', /name="theme-color"/.test(html))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll installability checks passed.')
