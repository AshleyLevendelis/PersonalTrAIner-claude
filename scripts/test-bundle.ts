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

// A CEILING ONLY SPEAKS WHEN IT IS CROSSED. That is how every note in this
// file came to quote headroom it no longer had — four separate times now, the
// last measured 17 Sep 2026, when ALL FOUR budgets below turned out to be
// within 5 kB of their line with nothing having said so.
//
// So each budgeted number now reports its remaining room on EVERY run, crossed
// or not, and the summary at the bottom puts them side by side. This records
// only; it decides nothing, so the checks themselves are untouched and the gate
// still has exactly one exit. A budget quietly filling up is now visible in the
// log instead of in a failure three days later.
const room: { name: string; measured: number; ceiling: number; unit: string }[] = []
const headroom = (name: string, measured: number, ceiling: number, unit: string) => {
  room.push({ name, measured, ceiling, unit })
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
  //
  // 19 Sep 2026, THE FIFTH TIME, and the printed headroom line added on 17 Sep
  // is what made it a two-minute question instead of a hunt. The meal-variety
  // and cooking-method work measured 264 against a 264 ceiling. Baseline on a
  // clean worktree of the commit before it: 263 — one kilobyte left, exactly
  // the state the paragraph above describes and warns about. So that change
  // was again the last straw rather than the cause; between 15 and 19 Sep the
  // app quietly ate the 8 kB this number was raised to give it, and only the
  // crossing said so.
  // 272 is 8 kB over a value MEASURED TODAY (264), same as every move before
  // it, and the margin is printed on every run so the next erosion is visible
  // before it is a failure rather than after.
  //
  // 24 Sep 2026, THE SIXTH TIME, moved on the 15 Sep precedent (raise it, the
  // real number written in). Measured on clean worktrees: 271 of 272 at
  // d7206e60, BEFORE the work that crossed it — seven of the 8 kB had gone
  // between 19 and 23 Sep with the printed margin saying so on every run and
  // nobody reading it. The crossing was 23 Sep's filler and medicine-ball
  // fixes, and it was PUSHED red: this gate reads the built app, so deriving
  // the affected gates by grepping for the changed source files can never
  // name it. Any change under src/ is a change to the bundle; run this gate
  // for all of them. 280 is 8 kB over the 272 measured today.
  headroom('a deploy re-downloads', appGzip, 280, 'kB gzipped')
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
  // 19 Sep 2026: crossed at 420 of 420 — and it was NAMED that morning, when
  // the re-download ceiling moved and this one was printed sitting at 419 with
  // 1 kB left. It was deliberately not raised then, because a ceiling should
  // move when something crosses it and says why. Something did, the same day.
  // 428 is 8 kB over a value measured TODAY (420), the same margin every other
  // move here has used, and the printed line means the next erosion is visible
  // before it is a failure.
  // 24 Sep 2026: crossed at 429, by cardio logging "like a lifting set"
  // (Ashley's ruling) — one shared row now drawn on the rest day, the finisher
  // and the activity day, all first-paint screens. Measured on a clean
  // worktree of the commit before: 427, so the row costs 2 kB gzipped. It sat
  // at 427 of 428 with 1 kB printed as left since 23 Sep. 437 is 8 kB over
  // today's 429, the margin every move here has used.
  headroom('first paint fetches', firstLoadGzip, 437, 'kB gzipped')
  check(`first paint fetches ${firstLoadGzip} kB gzipped, was 483 before the coach came out`,
    firstLoadGzip < 437, { firstLoadGzip, files: firstLoad.map(c => c.name) })
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
  // 15 Sep 2026: 920 -> 940, on Ashley's ruling from three options — raise it
  // with room to grow, over keeping it and trimming every time (which is what
  // she chose on 14 Sep, above) and over deferring the plan-BUILDING engine.
  //
  // THE NUMBERS, MEASURED ON CLEAN WORKTREES RATHER THAN INFERRED — the note
  // above is exactly why:
  //     ad1dd46, before the cardio work   917 kB
  //     b43edde, the cardio work inline   921 kB   (over the 920 ceiling)
  //     b43edde with the form deferred    920 kB   (green, zero headroom)
  // The deferral happened anyway and is not part of this raise: every other
  // sheet in this app is its own chunk and AddCardioSessionSheet was the odd
  // one out. But 920-under-920 is the same trap the 14 Sep note names, one
  // more turn of the screw, so the ceiling moves on top of the deferral rather
  // than instead of it.
  //
  // 940 IS 20 kB ABOVE TODAY'S MEASURED 920, and 20 is what "room to grow"
  // means here — the 13 Sep entry above used ~14, the one below ~8, and both
  // were spent within two days. RECORD THE MEASURED VALUE, NOT THE NOTE'S: the
  // BACKLOG said 918 and a clean build said 917.
  //
  // What this does NOT relax, and the reason it is safe to move: the number
  // that decides how fast the app opens is the FIRST-PAINT figure in §2b, not
  // this one. That is 411 kB gzipped against 483 before the coach was deferred,
  // and it has its own check. This budget is a proxy for it and a brake on
  // drift, not the user-facing measurement.
  //
  // 18 Sep 2026: 940 -> 960. MEASURED ON THIS BRANCH, both figures from a
  // build run minutes apart: 940 kB without the "last time" marker, 941 kB
  // with it. The marker itself is about a kilobyte; the ceiling had ZERO room
  // and a one-kilobyte feature tipped it, which is the 15 and 17 Sep notes
  // above happening for the fourth and fifth time.
  //
  // It is Ashley's 15 Sep ruling applied rather than a new decision — raise it
  // with room to grow, over trimming on every commit — so the only new thing
  // here is the measurement: 19 kB of real headroom above a measured 941,
  // which the line printed by `headroom` above will now show eroding on every
  // run rather than only when it is crossed.
  //
  // 20 Sep 2026: 960 -> 985, and this time the baseline was measured on a
  // SEPARATE WORKTREE of HEAD rather than guessed at, because the same note
  // three paragraphs up records guessing wrong twice. Clean HEAD: app chunk
  // 956 kB, 4 left. With the rest-day rebuild (design 4a — quick-log chips, a
  // segmented week track, two plan-action rows): 961 kB. Five kilobytes of
  // real UI on a card that previously ended in three text links, and the
  // ceiling had four. Raised with room the way Ashley's 15 Sep ruling says,
  // to 24 kB of measured headroom above 961.
  const APP_CHUNK_BUDGET_KB = 985
  const app = find('index-')
  headroom('the app chunk', app ? kb(app.raw) : 0, APP_CHUNK_BUDGET_KB, 'kB raw')
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
  //
  // 1,895 -> 1,915, 16 Sep 2026, ASHLEY'S RULING from three options: move the
  // line and write in the real number, over trimming to fit (what she chose on
  // 14 Sep for the app chunk) and over tightening it further. Her reason for
  // not trimming this time is the one this comment block already argues: the
  // numbers that decide how fast the app OPENS all still have room, and this
  // line is the early warning, not the speed.
  //
  // MEASURED 16 Sep, both ends, on real builds rather than inferred:
  //     ff31d09, before this session's work   total 1888   app 920   paint 411
  //     9c62e7b, after it                     total 1895   app 924   paint 413
  // (ff31d09 was measured on a clean detached worktree, not by stashing.)
  // +7 kB for a session rebuild on both surfaces and a target-change notice
  // that says what the numbers moved FROM. 1,915 is 20 above the 1,895
  // measured TODAY.
  //
  // AND THE 16 kB CLAIM ABOVE WAS ALREADY FALSE WHEN THIS TRIPPED. It was
  // written against a measured 1,879 on 15 Sep; by the end of that same night
  // the cardio work had taken it to 1,888, so 9 of the 16 were gone before
  // this session opened a file — with nothing saying so, because a ceiling
  // only speaks when it is crossed. That is the THIRD time a note in this file
  // has gone on quoting headroom it no longer had, and the second time in two
  // days. The rule is already written at the top of the app-chunk block and in
  // CLAUDE.md; what this entry adds is that writing the rule down has not yet
  // stopped it happening. Anyone raising this line again: measure BOTH ends
  // first, and assume the last note's figure is stale.
  // 1,915 -> 1,935, 17 Sep 2026. MEASURED BOTH ENDS on real builds the same
  // hour, the base on a clean detached worktree rather than by stashing:
  //     f9c2207, before this session's work   total 1913   app 935   paint 416
  //     15dd8fc, after it                     total 1915   app 936   paint 416
  // (read through THIS gate at both ends, not off a separate script — a hand-
  // rolled gzip at a different level printed 414/415 for the same two builds,
  // which would have recorded a first-paint move that did not happen.)
  // +2 kB for the opener rotation, the notification decision module and a
  // personal best that carries its own unit. 1,935 is 20 above the 1,915
  // measured TODAY, the same shape as Ashley's 16 Sep ruling on this line.
  //
  // AND THE NOTE ABOVE WAS ALREADY FALSE BEFORE THIS SESSION OPENED A FILE,
  // WHICH IS THE FOURTH TIME. It claimed 20 kB of room over a 1,895 measured
  // on 16 Sep; the base measured 1,913 today, so 18 of the 20 had gone to the
  // meal-resize work overnight. Two kilobytes of opener rotation were the last
  // straw, not the cause.
  //
  // This is the fourth entry saying the same thing, so the fix this time is
  // not another warning in a comment: every budget in this file now PRINTS its
  // remaining room on every run (see `headroom` at the top). Measured 17 Sep,
  // all four were within 5 kB of their ceiling and only one of them said so.
  // 20 Sep 2026: 1,935 -> 1,975. THE FINDING HERE IS THAT THIS ONE WAS ALREADY
  // FAILING, and it was not the rest-day rebuild that did it. Measured on a
  // separate worktree of HEAD with nothing else changed: everything together
  // came to exactly 1,935 kB against a 1,935 budget, and the check is `<`, so
  // it was RED at HEAD — the budget had not merely run out of headroom, it had
  // been consumed to the byte by work that never touched this line, and the
  // next commit of any size was going to trip it whatever that commit was.
  // The rest-day card then took it to 1,941.
  // This is the "a budget with headroom silently spends it" note above meeting
  // its own worst case, and the reason the fix is measured rather than nudged:
  // 1,975 is 34 kB above the measured 1,941, and the headroom line prints the
  // remainder every run so the next person sees it eroding rather than
  // crossing.
  const TOTAL_BUDGET_KB = 1975
  const total = chunks.reduce((s, c) => s + c.raw, 0)
  headroom('everything together', kb(total), TOTAL_BUDGET_KB, 'kB raw')
  check(`everything together is ${kb(total)} kB, under the ${TOTAL_BUDGET_KB.toLocaleString()} kB budget`, total < TOTAL_BUDGET_KB * 1024, kb(total))

  // A first load fetches the app and the vendors, but neither lazy screen.
  const deferred = ['ConversationalOnboarding', 'DevTestPage']
    .map(find).filter(Boolean).reduce((s, c) => s + (c as Chunk).raw, 0)
  check(`${kb(deferred)} kB is deferred off the first load`, deferred > 50 * 1024, kb(deferred))
}

console.log('\nHeadroom, measured this run:')
for (const b of room) {
  const left = b.ceiling - b.measured
  console.log(`  ${b.name.padEnd(22)} ${String(b.measured).padStart(5)} of ${String(b.ceiling).padStart(5)} ${b.unit.padEnd(11)} ${left > 0 ? `${left} left` : `OVER by ${-left}`}`)
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll bundle checks passed.')
