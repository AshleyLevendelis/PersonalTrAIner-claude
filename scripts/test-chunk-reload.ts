// ---------------------------------------------------------------------------
// test:chunk-reload — a screen whose file a deploy took away reloads the app once (run 7, H30).
//
// verify:chunk-reload drives the real Exercise tab with the What happened sheet's file missing. This holds
// what a driver cannot reach: which errors count as "the file is gone", the loop guard's arithmetic, that
// EVERY lazily loaded screen in src/ goes through the reload (not only the one she hit), and that main.tsx
// installs the listener for plain import() calls.
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

// A window with sessionStorage and a counted reload, so reloadOnce can be called outside a browser.
const store = new Map<string, string>()
let reloads = 0
let storageThrows = false
;(globalThis as unknown as { window: unknown }).window = {
  sessionStorage: {
    getItem: (k: string) => { if (storageThrows) throw new Error('blocked'); return store.get(k) ?? null },
    setItem: (k: string, v: string) => { if (storageThrows) throw new Error('blocked'); store.set(k, v) },
  },
  location: { reload: () => { reloads++ } },
  addEventListener: () => {},
}

async function main() {
  const { isChunkLoadError, reloadOnce, RELOAD_GUARD_MS } = await import('../src/lib/chunk-reload')

  console.log('\n1. What counts as "the file is gone"')
  const gone = [
    new TypeError('Failed to fetch dynamically imported module: https://x.app/assets/WhatHappenedSheet-ab12.js'),
    new TypeError('error loading dynamically imported module'),
    new TypeError('Importing a module script failed.'),
    Object.assign(new Error('Loading chunk 7 failed'), { name: 'ChunkLoadError' }),
    new Error('Unable to preload CSS for /assets/x.css'),
  ]
  check('the three browsers\' wordings, a ChunkLoadError and a CSS preload all count', gone.every(isChunkLoadError), gone.map(e => isChunkLoadError(e)))
  const real = [new TypeError("Cannot read properties of undefined (reading 'kg')"), new Error('Network request failed'), null, 'Failed to fetch dynamically imported module']
  check('...and a real render error, a network error, null and a bare string do not', real.every(e => !isChunkLoadError(e)), real.map(e => isChunkLoadError(e)))

  console.log('\n2. Once, and never a loop')
  store.clear(); reloads = 0
  const t0 = 1_000_000
  check('the first missing file reloads', reloadOnce(t0) === true && reloads === 1, { reloads })
  check('a second one inside the guard does NOT (a broken deploy, not an old page)', reloadOnce(t0 + 5_000) === false && reloads === 1, { reloads })
  check('...nor one second before the guard ends', reloadOnce(t0 + RELOAD_GUARD_MS - 1_000) === false && reloads === 1, { reloads })
  check('the guard is long enough for a reloaded page to start and fail again (10 s or more), and short enough to recover the next deploy (under a minute)', RELOAD_GUARD_MS >= 10_000 && RELOAD_GUARD_MS < 60_000, RELOAD_GUARD_MS)
  check('after the guard a later deploy reloads again', reloadOnce(t0 + RELOAD_GUARD_MS + 1_000) === true && reloads === 2, { reloads })
  storageThrows = true; reloads = 0
  check('storage that cannot be read refuses the reload (no stamp, no loop guard)', reloadOnce(t0 + 999_999) === false && reloads === 0, { reloads })
  storageThrows = false

  console.log('\n3. Every lazily loaded screen reloads, not only the one she hit')
  const files: string[] = []
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|jsx?)$/.test(n)) files.push(p) } }
  walk('src')
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const bare: string[] = []
  let wrapped = 0
  for (const f of files) {
    const s = strip(readFileSync(f, 'utf8'))
    wrapped += (s.match(/\blazyWithReload\(/g) ?? []).length - (f.endsWith('chunk-reload.ts') ? 0 : 0)
    for (const m of s.matchAll(/=\s*lazy\(/g)) {
      // A bare React.lazy is allowed only with its own load catch that reloads (Profile's renders nothing meanwhile).
      const after = s.slice(m.index!, m.index! + 900)
      if (!/isChunkLoadError\(\w+\)\s*&&\s*reloadOnce\(\)/.test(after)) bare.push(f)
    }
  }
  check('no React.lazy is left without the reload (each goes through lazyWithReload or reloads in its own catch)', bare.length === 0, bare)
  // Measured 15 Oct 2026: 19 through the wrapper, plus Profile's own catch (20 lazily loaded screens).
  check('...and the wrapper is really used across the app (19 screens, measured)', wrapped >= 19, wrapped)
  const chunk = readFileSync('src/lib/chunk-reload.ts', 'utf8')
  check('the wrapper keeps the screen waiting rather than crashing while the page reloads', /isChunkLoadError\(error\)\s*&&\s*reloadOnce\(\)\)\s*return new Promise/.test(strip(chunk)))

  console.log('\n4. Plain import() calls and anything that reaches the error screen')
  const main = strip(readFileSync('src/main.tsx', 'utf8'))
  check('main.tsx installs the vite:preloadError listener before the first render', /installChunkReload\(\)/.test(main) && main.indexOf('installChunkReload()') < main.indexOf('createRoot('))
  check('...which reloads on that event', /addEventListener\('vite:preloadError',[^)]*\)\s*=>\s*\{\s*reloadOnce\(\)/.test(strip(chunk)))
  const boundary = strip(readFileSync('src/components/AppErrorBoundary.tsx', 'utf8'))
  check('the root error screen reloads once for a missing file', /componentDidCatch[\s\S]*?isChunkLoadError\(error\)\)\s*reloadOnce\(\)/.test(boundary))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('Every lazily loaded screen reloads once when its file was deployed away, and never loops.')
}
main().catch(e => { console.error(e); process.exit(1) })
