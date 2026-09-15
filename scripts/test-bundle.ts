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
  // MOVED 12 Sep 2026: 280 -> 292 kB gzipped, alongside the two raw budgets
  // below and for the same reason. Same ~8 kB of headroom over the measured
  // 284 that the old number had over its own baseline.
  //
  // MOVED DOWN 14 Sep 2026: 292 -> 256, because the app got SMALLER rather than
  // because it got bigger. On 14 Sep this check failed at exactly 292 against a
  // 292 ceiling — the app had grown into its budget, so the next feature tipped
  // it. I first reported that as "a stale 444 expectation"; it was not, and the
  // correction matters because the two call for opposite actions.
  // Ashley's ruling, from three options: take the coach off the first-paint
  // path rather than raise the ceiling a second time. Measured 248; 256 keeps
  // the same ~8 kB of headroom this file has always allowed.
  //
  // MOVED 15 Sep 2026: 256 -> 264, on Ashley's ruling from three options —
  // raise it, with the real number written in. She rejected clawing back the
  // kilobyte (the cost IS the feature: eighteen coach cards that now speak)
  // and rejected leaving the check red (a permanently red check teaches people
  // to scroll past red). It does NOT reverse her 14 Sep ruling: the coach
  // stays off the first-paint path, which is the check below and still has
  // room.
  //
  // AND THE PART WORTH READING, WHICH IS NOT THE KILOBYTE. Every move of this
  // number has claimed "~8 kB of headroom over a measured value" — 284 -> 292,
  // then 248 -> 256. Measured on a clean worktree of 7d6c7e6 on 15 Sep, the
  // real baseline was 255, not 248: the app had grown 7 kB since 14 Sep and
  // the headroom had gone from 8 kB to 1 kB WITH NOTHING SAYING SO, because a
  // ceiling only speaks when it is crossed. The comment went on claiming 8 kB
  // the whole time. So the voice work's 1 kB was the last straw, not the cause,
  // and the number below is 8 kB over a value measured TODAY (256) rather than
  // over one inherited from a note.
  //
  // Treat the stated headroom as a lead, not a fact: it decays silently, and
  // the app-chunk budget below is doing the same thing right now (918 of 920).
  check(`a deploy re-downloads ${appGzip} kB gzipped, not 444`, appGzip < 264, appGzip)
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

console.log('\n2b. The coach is not on the path to first paint')
{
  // ASHLEY'S RULING, 14 Sep 2026, and the reason the budget above could come
  // down instead of up. The coach chat is the largest separable piece of the
  // app — 44 kB gzipped of its own, and it drags the markdown renderer (36 kB)
  // behind it, because nothing else renders markdown. It stays force-mounted,
  // so the coach still speaks first; what changed is that its code is no longer
  // in the bundle the browser must parse before it can paint.
  //
  // THREE CHECKS, BECAUSE ONE IS NOT ENOUGH. A lazy import reverted to a static
  // one still leaves a chunk on disk if something else imports it, so "the
  // chunk exists" alone would stay green through the regression this guards.
  // What actually matters is the set of files index.html tells the browser to
  // fetch before first paint — read from the real build, like everything else
  // here.
  const chatChunk = find('ChatAssistant')
  check('the coach is a chunk of its own', chatChunk !== undefined)

  const app = find('index-')
  const appSrc = app ? readFileSync(join(DIST, app.name), 'utf8') : ''
  // User-visible text, for the same reason §2 gives: the minifier renames
  // every symbol it can, so only copy survives intact.
  const coachOnlyText = 'Ask about your plan or request changes'
  check('...and its code really left the main chunk',
    appSrc.length > 0 && !appSrc.includes(coachOnlyText), `"${coachOnlyText}" found in the app chunk`)
  check('...while still being present in the chunk that was split out',
    !!chatChunk && readFileSync(join(DIST, chatChunk.name), 'utf8').includes(coachOnlyText),
    'the marker is in neither chunk — it may simply have been reworded, which would make the check above vacuous')

  // THE NUMBER A PHONE ACTUALLY FEELS: everything index.html asks for up front.
  const html = readFileSync(join(DIST, '..', 'index.html'), 'utf8')
  const firstLoad = chunks.filter(c => html.includes(c.name))
  const firstLoadGzip = kb(firstLoad.reduce((n, c) => n + c.gzip, 0))
  check(`first paint fetches ${firstLoadGzip} kB gzipped, was 483 before the coach came out`,
    firstLoadGzip < 420, { firstLoadGzip, files: firstLoad.map(c => c.name) })
  check('...and neither the coach nor the markdown renderer is among those files',
    !firstLoad.some(c => c.name.startsWith('ChatAssistant') || c.name.startsWith('vendor-markdown')),
    firstLoad.map(c => c.name))
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
  // AND AGAIN, 12 Sep 2026: 1,005 kB -> 1,030 kB. MEASURED against origin/main
  // (app chunk 998 kB) and after this branch's four pieces of work: 1,015 kB.
  // +17 kB for editing one food in a meal on both surfaces (three builders, a
  // verified-swap suggester, the screen's edit sheet), the Tools redesign (the
  // round card, the chip setup) and the grocery screen with its shop-day card.
  // 1,030 leaves the same ~15 kB of headroom rather than parking the line just
  // above wherever today's build happens to sit.
  // AND AGAIN, 13 Sep 2026: 1,030 kB -> 1,050 kB. MEASURED by stashing this
  // branch's work and rebuilding: app chunk 1,026 kB before, 1,036 kB after.
  // +10 kB for adding one exercise to a session on BOTH surfaces — the ranked
  // candidate module, the coach's builder, confirm and undo, the executor with
  // its re-resolution, and the screen's trial. The sheet itself is NOT in this
  // number: it is lazy, 6 kB in its own chunk, loaded only when opened.
  // 1,050 leaves ~14 kB of headroom rather than parking the line just above
  // wherever today's build sits.
  // 14 Sep 2026: 1050 -> 910, the raw half of the same move — measured 895.
  // LATER THE SAME DAY: 910 -> 920, and the reason is the one the total-budget
  // note warns about. Ashley's four-screenshot batch took this to 921 against a
  // 910 ceiling. The fix was NOT to raise it — both new sheets were deferred
  // behind their own chunks, which brought it back to 908. But 908 under 910 is
  // two kilobytes of headroom, which is the same trap as the 1,770-under-1,770
  // line below: the next feature of any size trips it, and the temptation then
  // is to raise the budget instead of doing the deferring. 920 restores real
  // room while still sitting well under the 921 this batch would have cost
  // unsplit.
  const APP_CHUNK_BUDGET_KB = 920
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
  // AND AGAIN, 13 Sep 2026: 1,770 kB -> 1,805 kB. Same measurement: 1,770 kB
  // before, 1,786 kB after — +16 kB, the app-chunk +10 plus the lazy sheet.
  // WORTH SAYING, because the convention above is about headroom: the previous
  // raise left NONE on this line. 1,770 before this work was 1,770 exactly, so
  // the next feature of any size was always going to trip it. 1,805 restores
  // the ~19 kB the note above says this line is supposed to carry.
  // AND AGAIN, 14 Sep 2026: 1,805 kB -> 1,835 kB. Measured the same way, on a
  // clean checkout of the commit before the work: 1,797 kB before, 1,817 kB
  // after — +20 kB for moving a meal between slots (engine, sheet, coach tool,
  // client dispatch and undo), adding a food from the screen (sheet plus the
  // food search), and four newly-editable setup answers. 1,835 restores the
  // ~18 kB of headroom this line is supposed to carry.
  // TWO OF THAT +20 IS THE SPLIT ITSELF, and that is a fair trade rather than
  // a cost: this check went red at 921 kB on the APP chunk, and the fix was to
  // defer both new sheets rather than raise that budget — so first paint went
  // DOWN (897 -> 908 is the feature; without the split it was 921) while the
  // total went up by the two extra chunk headers. The number people feel got
  // better; the number that counts everything got bigger. Both are true and
  // the budgets now say so.
  // 1,835 -> 1,870, 14 Sep 2026, for the trade-off engine — a change that
  // works against someone's goal is now asked about rather than silently
  // allowed, and pricing it needs the plan scorer in the browser for the first
  // time.
  //
  // THE APP CHUNK DID NOT MOVE: 909 kB, same as before, because all of it
  // lands in the deferred ChatAssistant chunk (151 -> 171 kB). First paint is
  // the number people feel and it is unchanged; this is the number that counts
  // everything.
  //
  // THE 21 kB IS THE SCORER, AND IT WAS MEASURED BEFORE IT WAS ACCEPTED rather
  // than waved through as "new capability". Stubbing quality-score out put the
  // total at 1,828 — under the old budget — so the question was whether the
  // scorer earns its weight at card-build time. Probed across 581 real edits
  // (remove / add / volume / shorten) on twelve goal-and-experience profiles:
  //
  //   the score is the ONLY signal    109  (19%)
  //   both it and weekly muscle sets   98
  //   weekly muscle sets only         133
  //
  // Dropping it would make the app go quiet on nearly a fifth of the edits
  // that genuinely cost something — an added exercise that breaks the set
  // hierarchy, a removed primer, a week that stops building on the last. That
  // is not a rounding error, so the budget moves and the reason is here.
  // 1,870 -> 1,895, 15 Sep 2026, for two features, MEASURED ON A CLEAN
  // CHECKOUT of the commit before either of them (458d713) rather than
  // inferred from the diff:
  //
  //   before both          app 910   total 1867   first paint 408 kB gz
  //   + the activity swap  app 911   total 1872
  //   + tightness          app 915   total 1879   first paint 410 kB gz
  //
  // THE FIRST FIVE WERE ALREADY OVER AND NOBODY SAW IT. The activity-swap
  // change — the coach asking before it marks a day, plus the detector that
  // stops it claiming a change it did not make — took the total to 1,872
  // against a 1,870 budget, and I did not catch it because I stopped that
  // sweep before it reached this check. That is the cost of killing a sweep:
  // the number it would have told you is the number you then have to go and
  // find. Recorded so the next person reads it as a habit and not a one-off.
  //
  // THE SEVEN FOR TIGHTNESS BOUGHT SOMETHING ON THE OTHER SIDE. The sheet is
  // deferred, so the app chunk took 4 of it rather than 8 and first paint
  // moved 2 kB — the same trade the two nutrition sheets took on 14 Sep: one
  // more chunk header in the total, the sheet's whole weight off first paint.
  //
  // 1,895 restores the ~16 kB of headroom this line is supposed to carry.
  // Prior totals are not comparable to later ones across this line.
  const TOTAL_BUDGET_KB = 1895
  const total = chunks.reduce((s, c) => s + c.raw, 0)
  check(`everything together is ${kb(total)} kB, under the ${TOTAL_BUDGET_KB.toLocaleString()} kB budget`, total < TOTAL_BUDGET_KB * 1024, kb(total))

  // A first load fetches the app and the vendors, but neither lazy screen.
  const deferred = ['ConversationalOnboarding', 'DevTestPage']
    .map(find).filter(Boolean).reduce((s, c) => s + (c as Chunk).raw, 0)
  check(`${kb(deferred)} kB is deferred off the first load`, deferred > 50 * 1024, kb(deferred))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll bundle checks passed.')
