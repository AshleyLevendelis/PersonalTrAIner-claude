// ---------------------------------------------------------------------------
// EVERY SCREEN THAT SHOWS A DAY SHOWS IT THE SAME WAY.
//
// Ashley, 31 Aug 2026, on the program view: "in exercise under see full
// program the app looks completely different to the exercise section. they
// should look the same as the main exercise section." It was a <Table> —
// Exercise / Sets / Reps / Rest columns — while today's screen was a list of
// hairline-separated lines.
//
// THIS IS THE THIRD TIME. PeekPanel had the same defect and was fixed by
// sharing ExerciseLine; its header comment promised the two "cannot drift
// apart again", and for the ROW that held. What it missed is that the row was
// the small half: what made two screens look like different apps was the
// chrome around it — the section labels, the superset rail, and whether a day
// is a list at all. Nothing shared the DAY, so the program view was never
// touched.
//
// So this gate is about the day, not the row. It fails if any browse surface
// grows its own day-rendering again, and it fails if the shared one starts
// doing things only today's screen is allowed to do.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8')
// COMMENTS ARE NOT CODE, and the first version of this gate forgot it: two
// checks went red against a correct implementation because they matched the
// prose explaining the fix ("this was a <Table> —", "it never imports
// SetGrid"). A check that a comment can satisfy — or break — is the defect
// this file exists to catch, wearing the reviewer's clothes. Same stripper
// the other source-reading gates use.
const read = (p: string) =>
  raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else {
    failures++
    console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

console.log('\n1. One component owns a read-only day')
{
  const shared = read('src/components/exercise/ReadOnlyDayList.tsx')
  check('ReadOnlyDayList exists and renders a day', /export function ReadOnlyDayList/.test(shared))
  // The three things that made the two screens look like one app. Each was
  // duplicated markup before, and each is the reason a table looked wrong.
  check('...building its rows from the shared ExerciseLine', /ExerciseLine/.test(shared))
  check('...its sections from the shared SectionLabel', /SectionLabel/.test(shared))
  check('...and its supersets through the shared shell', /SupersetShell/.test(shared))

  // READ-ONLY BY CONSTRUCTION, not by intention. A browse surface that grew a
  // set grid would be logging sets against a day that is not today.
  check('it cannot log a set — no SetGrid import', !/SetGrid/.test(shared))
  check('...and no session write facade', !/useActiveSession|logSet/.test(shared))
}

console.log('\n2. Both browse surfaces render through it')
{
  const peek = read('src/components/exercise/PeekPanel.tsx')
  const program = read('src/components/exercise/ProgramBrowse.tsx')
  check('the peek panel calls it', /<ReadOnlyDayList/.test(peek))
  check('the program view calls it', /<ReadOnlyDayList/.test(program))

  // The specific thing Ashley saw. A data table is not a list, however well
  // styled: the columns ARE the difference.
  check('the program view no longer renders a table of exercises',
    !/<Table>|<TableHead|<TableRow|<TableBody/.test(program))
  check('...and neither does the peek', !/<Table>|<TableHead/.test(peek))

  // Neither may keep a private copy of the row. This is the check that would
  // have caught the original defect, had it existed.
  for (const [label, src] of [['the peek', peek], ['the program view', program]] as const) {
    check(`${label} has no day-rendering of its own`,
      !/<ExerciseLine|<SectionLabel|<SupersetShell/.test(src))
  }
}

console.log('\n3. No FOURTH surface reinvents it')
{
  // Anything that renders ExerciseLine directly is claiming to draw a day.
  // Only the shared component and today's own row are allowed to.
  const ALLOWED = new Set(['ReadOnlyDayList.tsx', 'ExerciseLine.tsx', 'ExerciseRow.tsx'])
  const dir = 'src/components/exercise'
  const offenders = readdirSync(join(ROOT, dir))
    .filter(f => f.endsWith('.tsx') && !ALLOWED.has(f))
    .filter(f => /<ExerciseLine/.test(read(`${dir}/${f}`)))
  check('only the shared list and today\'s row render an exercise line', offenders.length === 0, offenders)
}

console.log('\n4. The two rows say the same things about an exercise')
{
  // §1-3 are about how a day LOOKS — the shared row, the section labels, no
  // table. They say nothing about WHAT each row says, and that is the hole two
  // real defects fell through on 3 Sep 2026:
  //
  //   selection_note — VISION's "where a choice is non-obvious, say why", and
  //   the same paragraph's "clearest signal that a coach designed the session
  //   rather than a filter" — rendered on today's row and nowhere else. 4,292
  //   of 24,592 slots across a 64-plan sweep carry one (17.5%, in 60 of 64
  //   plans); every one of them was invisible while browsing the plan.
  //
  //   rest — on NO screen at all. It reached ExerciseRow only as
  //   restTime={...} into SetGrid, whose one use for it is starting the timer
  //   AFTER a set is logged. So the two-minute main-lift rule could not be
  //   read before doing the work.
  //
  // Sharing the row was never enough, which is what this file's own header
  // half-said: the row was "the small half". So was the chrome.
  const rowSession = read('src/components/exercise/ExerciseRow.tsx')
  const rowBrowse = read('src/components/exercise/ReadOnlyDayList.tsx')
  const line = read('src/components/exercise/ExerciseLine.tsx')
  const SURFACES = [['today\'s row', rowSession], ['the browse row', rowBrowse]] as const

  // --- 4a. the rationale, on both -----------------------------------------
  for (const [label, src] of SURFACES) {
    // Three separate things, because any one alone is satisfiable by
    // something that renders nothing: the guard, the VISIBLE label as a text
    // node between > and <, and the note actually interpolated.
    check(`${label} guards on a selection note`, /ex\.selection_note\s*&&/.test(src))
    check(`${label} offers "why this exercise" as visible text`,
      />\s*why this exercise\s*</.test(src))
    check(`${label} renders the note itself`, /\{ex\.selection_note\}/.test(src))
  }

  // --- 4b. rest, as text rather than a prop -------------------------------
  // THE POINT OF THIS CHECK. `restTime={ex.rest}` was already true of
  // ExerciseRow the whole time the number was invisible, so a plain
  // /ex\.rest/ would have passed against the bug. Strip every prop={...}
  // first: what survives is what a reader can actually see.
  const stripProps = (src: string) => src.replace(/\w+=\{[^}]*\}/g, '')
  for (const [label, src] of SURFACES) {
    const children = stripProps(src)
    check(`${label} renders rest outside of any prop`, /ex\.rest/.test(children))
    check(`${label} labels it "Rest" as visible text`, />\s*Rest\s/.test(src))
  }

  // --- 4c. backstop: no field drifts onto one surface only ----------------
  // Derived from source rather than listed, so a field added tomorrow is
  // covered without anyone remembering to add it here.
  //
  // Adding to ALLOWED should feel uncomfortable: it means one screen knows
  // something about an exercise that the other does not show.
  const ALLOWED: Record<string, string> = {
    per_set_load: 'feeds SetGrid\'s per-set weights; a read-only surface has no set grid',
    prescription_type: 'labels SetGrid\'s log column (Hold/Distance/Work); same reason',
    load_source: 'today\'s row takes it as a prop from TodayPanel instead of off the exercise',
  }
  const fieldsIn = (...srcs: string[]) =>
    new Set(srcs.flatMap(s => [...s.matchAll(/\bex\.([a-z_]+)\b/g)].map(m => m[1])))
  const session = fieldsIn(rowSession, line)
  const browse = fieldsIn(rowBrowse, line)

  // The scan has to be finding real fields, or an empty difference is a
  // statement about a regex that matched nothing.
  check(`it read real exercise fields (${session.size} session / ${browse.size} browse)`,
    session.size >= 10 && browse.size >= 10, [[...session].sort(), [...browse].sort()])

  const sessionOnly = [...session].filter(f => !browse.has(f) && !(f in ALLOWED))
  const browseOnly = [...browse].filter(f => !session.has(f) && !(f in ALLOWED))
  check('no field is shown on today\'s row only', sessionOnly.length === 0, sessionOnly)
  check('no field is shown on the browse row only', browseOnly.length === 0, browseOnly)

  // And the other direction: an allowance that has since been closed should
  // leave the list rather than sit there implying an asymmetry that is gone.
  const stale = Object.keys(ALLOWED).filter(f => session.has(f) === browse.has(f))
  check('nothing on the allowance list is symmetric again', stale.length === 0,
    stale.map(f => `${f} — now on both (or neither); remove it from ALLOWED`))
  for (const f of Object.keys(ALLOWED)) {
    if (!stale.includes(f)) console.log(`     allowed: ${f} — ${ALLOWED[f]}`)
  }
}

console.log(failures === 0 ? '\nOne day, one look.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
