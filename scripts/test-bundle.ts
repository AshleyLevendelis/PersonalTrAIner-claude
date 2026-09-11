// ---------------------------------------------------------------------------
// Gate: the app is not one enormous file again.
//
// Audit §12. Everything shipped as a single 1,549 kB chunk (444 kB gzipped),
// which cost twice over:
//
//   ON A NORMAL LOAD, every user downloaded the onboarding conversation they
//   will run exactly once, and the developer test page they can never reach.
//
//   AFTER EVERY DEPLOY, changing one line of app code invalidated React,
//   Supabase, the markdown renderer and the icon set along with it — 550 kB
//   of libraries that had not changed and would not change.
//
// The second one is the bigger number, and it is the one people feel: a
// returning user opening the app on mobile data after a deploy. It is also
// invisible in a "total bundle size" figure, which is why the budgets below
// are per-chunk and separate the two.
//
// MEASURED FROM A REAL BUILD, never from the config. A manualChunks function
// that silently stopped matching would leave the config looking perfect and
// the output back to one file — so this reads dist/ and fails if it is stale.
// ---------------------------------------------------------------------------

import { execFileSync } from 'child_process'
import { readdirSync, statSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { gzipSync } from 'zlib'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist/assets')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

// A gate that reads a stale dist/ is measuring last week. Build unless the
// caller has just done so and says so.
if (!process.argv.includes('--no-build')) {
  console.log('Building...')
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'ignore' })
}
if (!existsSync(DIST)) { console.error('No dist/assets — the build did not produce anything.'); process.exit(1) }

interface Chunk { name: string; raw: number; gzip: number }
const chunks: Chunk[] = readdirSync(DIST)
  .filter(f => f.endsWith('.js'))
  .map(f => {
    const body = readFileSync(join(DIST, f))
    return { name: f, raw: statSync(join(DIST, f)).size, gzip: gzipSync(body).length }
  })
  .sort((a, b) => b.raw - a.raw)

const kb = (n: number) => Math.round(n / 1024)
const find = (prefix: string) => chunks.find(c => c.name.startsWith(prefix))

console.log('\nBuilt chunks:')
for (const c of chunks) console.log(`  ${c.name.padEnd(44)} ${String(kb(c.raw)).padStart(5)} kB  (${kb(c.gzip)} kB gzipped)`)

console.log('\n1. The libraries are cached separately from the app')
{
  for (const vendor of ['vendor-react', 'vendor-supabase', 'vendor-markdown', 'vendor-radix', 'vendor-icons']) {
    check(`${vendor} is its own chunk`, find(vendor) !== undefined)
  }
  const app = find('index-')
  check('the app has a chunk of its own', app !== undefined)

  // The number that matters after a deploy: what a returning user re-fetches.
  // It was 444 kB gzipped, because it was everything.
  const appGzip = app ? kb(app.gzip) : Infinity
  check(`a deploy re-downloads ${appGzip} kB gzipped, not 444`, appGzip < 280, appGzip)
}

console.log('\n2. Two screens no ordinary load needs are not in it')
{
  check('onboarding is a separate chunk — it runs once, ever', find('ConversationalOnboarding') !== undefined)
  check('the dev test page is a separate chunk — users cannot reach it', find('DevTestPage') !== undefined)

  const app = find('index-')
  const appSrc = app ? readFileSync(join(DIST, app.name), 'utf8') : ''
  // Content only those screens contain, so this catches a lazy import
  // reverted to a static one and quietly folded back in.
  //
  // A STRING LITERAL, NOT A FUNCTION NAME. The first version looked for
  // `runConstraintAudit` and stayed green with the dev page inlined, because
  // the minifier renames every symbol it can. Only user-visible text survives
  // minification intact, so only user-visible text is worth searching for.
  const devOnlyText = 'Generating workout history...'
  check('...and the dev-only code really left the main chunk',
    appSrc.length > 0 && !appSrc.includes(devOnlyText), `${devOnlyText} found in the app chunk`)

  const devChunk = find('DevTestPage')
  check('...while still being present in the chunk that was split out',
    !!devChunk && readFileSync(join(DIST, devChunk.name), 'utf8').includes(devOnlyText),
    'the marker is in neither chunk — it may simply have been deleted, which would make the check above vacuous')
}

console.log('\n3. Nothing has crept back up')
{
  // THE BUDGET MOVED, 8 Sep 2026: 950 kB -> 975 kB. Stated here rather than
  // quietly edited, because a budget nobody records the raising of is a budget
  // that ratchets. MEASURED: 945 kB before roadmap item 8 (the one-off session
  // move) and 953 kB after — +8 kB for a new pure module, a fourth day state
  // read by four surfaces, two banners, and a tool with its card, confirm and
  // undo. That is the feature's real cost, not creep, and 975 leaves the same
  // ~20 kB of headroom the old number did rather than moving the line to just
  // above wherever the build happens to sit today.
  // AND AGAIN, 11 Sep 2026: 975 kB -> 1,005 kB. MEASURED on a clean checkout of
  // the commit before "take one exercise out, and move one": app chunk 971 kB.
  // After: 984 kB. +13 kB for two new pure modules (the edit itself and the
  // read-only balance cost it reports), the row menu's three items, and two
  // coach tools with their cards, confirm and undo. Splitting the two modules
  // out was TRIED and measured: it saved nothing, because ChatAssistant
  // imports the same edit module statically for the coach's half of the same
  // operations, so the bundler keeps it in the main chunk either way — the
  // dynamic form only added an await between the tap and the sheet. 1,005
  // leaves ~20 kB of headroom, the same margin the last two moves left, rather
  // than drawing the line at wherever today's build happens to sit.
  const APP_CHUNK_BUDGET_KB = 1005
  const app = find('index-')
  check(`the app chunk is ${app ? kb(app.raw) : '?'} kB, under the ${APP_CHUNK_BUDGET_KB} kB budget`,
    !!app && app.raw < APP_CHUNK_BUDGET_KB * 1024, app ? kb(app.raw) : null)

  // THE TOTAL MOVED, 10 Sep 2026: 1,700 kB -> 1,720 kB. MEASURED on a clean
  // checkout of the commit before: app chunk 966 kB, everything 1,689 kB.
  // After "what happened to today's session": app chunk 971 kB (the sheet is
  // split into its own 10 kB chunk, 3 kB gzipped, loaded only when opened —
  // so the app chunk stays under 975 without moving that line), everything
  // 1,704 kB. +15 kB total for a fifth day state read by four surfaces, two
  // new day-flag writers, a coach tool with its card, confirm and undo, and
  // the sheet itself. Feature cost, recorded here, not creep; 1,720 leaves
  // ~16 kB of headroom rather than a line drawn at today's number.
  // AND AGAIN, 11 Sep 2026: 1,720 kB -> 1,740 kB. Clean checkout before "take
  // one exercise out, and move one": 1,704 kB; after: 1,719 kB — +15 kB, the
  // same feature as the app-chunk note above plus its lazy sheet. 1,740 keeps
  // the ~20 kB of headroom.
  const TOTAL_BUDGET_KB = 1740
  const total = chunks.reduce((s, c) => s + c.raw, 0)
  check(`everything together is ${kb(total)} kB, under the ${TOTAL_BUDGET_KB.toLocaleString()} kB budget`, total < TOTAL_BUDGET_KB * 1024, kb(total))

  // A first load fetches the app and the vendors, but neither lazy screen.
  const deferred = ['ConversationalOnboarding', 'DevTestPage']
    .map(find).filter(Boolean).reduce((s, c) => s + (c as Chunk).raw, 0)
  check(`${kb(deferred)} kB is deferred off the first load`, deferred > 50 * 1024, kb(deferred))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll bundle checks passed.')
