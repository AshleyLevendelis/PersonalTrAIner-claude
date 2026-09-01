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

console.log(failures === 0 ? '\nOne day, one look.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
