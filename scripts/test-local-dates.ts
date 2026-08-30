// ---------------------------------------------------------------------------
// Gate: ONE calendar-date convention, and it is the user's local one.
//
// THE BUG. Every write in this app stamps rows with the LOCAL calendar date
// (set-log-store, water-store, WeighInCard, meal picks — all via
// getLocalDateString). buildContext, the function that tells the coach what
// it knows, computed "today" as `new Date().toISOString().slice(0, 10)` —
// the UTC date — and compared it against those local-dated logs.
//
// The two disagree for part of every day in almost any timezone. In the UK
// in summer, anything logged between midnight and 1am filed under yesterday.
// In New York the coach was already on tomorrow from 8pm and saw no training
// logged at all. In Sydney it was wrong for the first ten hours of every
// day. What the user saw was the coach insisting they hadn't trained when
// they had, or congratulating them when they hadn't.
//
// Section 1 proves the two conventions really do diverge, by running the
// same instant through real timezones in a child process — so this gate
// fails on a machine set to UTC too, rather than passing vacuously.
// Sections 2-3 scan source with comments stripped, so this file's own
// explanation can never be what satisfies it.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'fs'
import { execFileSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log('\n1. The two conventions genuinely disagree — measured, not assumed')
{
  // Two instants, because one cannot demonstrate both directions: east of
  // UTC the local date runs AHEAD late in the evening, west of it the local
  // date is still BEHIND just after UTC midnight. An earlier draft of this
  // gate used a single 23:30Z instant and "proved" New York diverged when at
  // that moment it is 19:30 on the same day — a check that would have passed
  // while measuring nothing.
  const LATE_EVENING = '2026-08-29T23:30:00.000Z'   // Sydney/London: already tomorrow
  const JUST_PAST_MIDNIGHT = '2026-08-30T02:00:00.000Z' // New York: still yesterday
  // Plain concatenation, not a nested template literal — the child script is
  // itself full of ${} and backticks, and interpolating one inside the other
  // is how you end up shipping the literal text "${JSON.stringify(iso)}" to
  // node and reading a syntax error instead of a date.
  const probeFor = (iso: string) =>
    'const d = new Date(' + JSON.stringify(iso) + ');' +
    "const local = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');" +
    'console.log(JSON.stringify({ utc: d.toISOString().slice(0,10), local }));'
  const inZone = (tz: string, iso: string) =>
    JSON.parse(execFileSync(process.execPath, ['-e', probeFor(iso)], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }))

  const sydney = inZone('Australia/Sydney', LATE_EVENING)
  const london = inZone('Europe/London', LATE_EVENING)
  const newYork = inZone('America/New_York', JUST_PAST_MIDNIGHT)

  check(`Sydney, 23:30 UTC: local ${sydney.local} vs UTC ${sydney.utc} — a day ahead`,
    sydney.local > sydney.utc, sydney)
  check(`London in BST, 23:30 UTC: local ${london.local} vs UTC ${london.utc} — a day ahead`,
    london.local > london.utc, london)
  check(`New York, 02:00 UTC: local ${newYork.local} vs UTC ${newYork.utc} — a day behind`,
    newYork.local < newYork.utc, newYork)
  check('...so a log stamped local and a "today" computed in UTC land on different days, both ways',
    sydney.local !== sydney.utc && newYork.local !== newYork.utc, { sydney, newYork })
}

console.log('\n2. What the coach is told about "today" comes from the local helper')
{
  const chat = stripComments(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
  check('todayStr is derived from getSessionDateContext, not an ISO slice',
    /const todayStr = getSessionDateContext\(profile\.id\)\.date/.test(chat))
  check('...and nothing in this file slices a date out of toISOString any more',
    !/toISOString\(\)\.slice\(0, ?10\)/.test(chat))
  // The same call site also used a raw `new Date()`, which ignored the dev
  // clock while everything around it respected it.
  check('the coach also reads the clock through getAppNow, so time-travel is consistent',
    /const now = getAppNow\(profile\.id\)/.test(chat))
  check('workoutLoggedToday still compares against that same todayStr',
    /workoutLogHistory\.includes\(todayStr\)/.test(chat))
}

console.log('\n3. No calendar date is derived from a UTC slice, except where it is written down why')
{
  // Files still allowed to do it, each with the reason. An entry here is a
  // claim someone has to defend at review — not a way to silence the check.
  //
  // THE ONE REMAINING GROUP, and why it is a group. exercise_set_logs has no
  // date column at all — only completed_at (a server timestamptz) and a
  // session_id. The authoritative LOCAL date of a session lives one table
  // over, on workout_sessions.date. So these three do not have a local date
  // to switch to; they need to start reading it from the session row, which
  // is an extra read and a real change to which sessions fall inside a block
  // range. That feeds load suggestions, so it goes with the load-prescription
  // work and gets a plan first — not smuggled in behind a date cleanup.
  const ACKNOWLEDGED: Record<string, string> = {
    'src/lib/set-log-store.ts':
      'Server set rows carry no date column — completed_at is the established proxy (see getSetsForSession). The local date lives on workout_sessions.date, one table over; reading it from there is a join, not a rename.',
    'src/lib/exercise-history.ts':
      'getExerciseHistory derives a session date the same way, from completed_at, for the same reason. Moving it alone would put the history chart on local dates while block ranges stayed UTC.',
    'src/lib/block-review.ts':
      'getBlockDateRange is UTC deliberately, to match the two above. All three move together or none do, because load-suggestions and block-consistency compare one against the other.',
  }

  const files: string[] = []
  const walk = (d: string) => {
    for (const f of readdirSync(join(ROOT, d))) {
      const rel = join(d, f)
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
      else if (/\.tsx?$/.test(f)) files.push(rel)
    }
  }
  walk('src')

  // TWO shapes, not one. The first draft of this scan only looked for
  // `toISOString().slice(0, 10)` and reported exercise-history.ts clean —
  // while that file was doing exactly the same thing by slicing the
  // completed_at STRING instead of formatting a Date. A scan that misses the
  // instance it was written for is worse than no scan.
  const UTC_DATE_SHAPES = [
    /toISOString\(\)\.slice\(0, ?10\)/,          // a Date formatted as UTC, then cut
    /\b(?:completed_at|created_at|resolved_at|claimed_at|expires_at)\.slice\(0, ?10\)/, // a server timestamp cut
  ]
  const usesUtcDate = (src: string) => UTC_DATE_SHAPES.some(re => re.test(src))

  const offenders: string[] = []
  for (const f of files) {
    const src = stripComments(readFileSync(join(ROOT, f), 'utf8'))
    if (!usesUtcDate(src)) continue
    if (f in ACKNOWLEDGED) continue
    offenders.push(f)
  }
  check('no unacknowledged file turns a timestamp into a calendar date via UTC', offenders.length === 0, offenders)

  // The acknowledgement list must not rot: an entry for a file that no
  // longer does it is a stale excuse, and should be deleted.
  const stale = Object.keys(ACKNOWLEDGED).filter(f => {
    try { return !usesUtcDate(stripComments(readFileSync(join(ROOT, f), 'utf8'))) }
    catch { return true }
  })
  check('every acknowledged file still actually needs its acknowledgement', stale.length === 0, stale)
  check('...and each acknowledgement gives a reason, not just a filename',
    Object.values(ACKNOWLEDGED).every(r => r.trim().length > 60))
  console.log(`     (${Object.keys(ACKNOWLEDGED).length} acknowledged, ${files.length} files scanned)`)
}

console.log('\n4. The dashboard measures the streak and the plan start on local dates')
{
  const dash = stripComments(readFileSync(join(ROOT, 'src/lib/dashboard-data.ts'), 'utf8'))
  check('the 35-day streak window uses getLocalDateString', /const dateStr = getLocalDateString\(d\)/.test(dash))
  check('the plan start date is converted to a local date before comparison',
    /planStartStr = planCreatedAt \? getLocalDateString\(new Date\(planCreatedAt\)\)/.test(dash))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll local-date checks passed.')
