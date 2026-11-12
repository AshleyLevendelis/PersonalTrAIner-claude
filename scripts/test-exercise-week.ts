/**
 * test:exercise-week — his Exercise Week handoff (approved 12 Nov 2026; docs/plans/exercise-week.md).
 *
 * verify:exercise-week drives the three screens. This holds the words and numbers a row is built from, which a screen
 * shows only for the fixture it happens to load:
 *   1. the load on the right: its value, unit and qualifier, the plan's own wording kept ("per hand" stays per hand),
 *      added weight signed, assistance named, bodyweight and band said as words, nothing for a row with no load;
 *   2. the set bar: one segment per set, warm-ups first, logged ones filled, never more filled than there are;
 *   3. the legend: warm-ups only when there are some, a warm-up move's sets are "easy", never "working";
 *   4. the week's rows: a rest day is one line, a walk is a session, a moved day names where it went, a missed or
 *      swapped day keeps its label, a done day (and a logged swap) is done, and the main lift is named with its load;
 *   5. the week view's first few exercises are whole groups (a superset is never cut in half).
 */
process.env.TZ = 'Europe/London'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

async function main() {
  const wk = await import('../src/lib/exercise-week')
  const { groupExercises } = await import('../src/lib/session-derive')
  const { groupsUpTo } = await import('../src/components/exercise/ReadOnlyDayList')

  console.log('\n1. The load on the right of a row')
  const perHand = wk.exerciseLoadBadge({ suggested_load: '~14kg per hand', suggested_load_kg: 14 } as never, null)
  check('a per-hand load keeps its own words: "~14" "kg", "per hand" under it', perHand?.value === '~14' && perHand?.unit === 'kg' && perHand?.qualifier === 'per hand', perHand)
  const bar = wk.exerciseLoadBadge({ suggested_load: '47.5kg', suggested_load_kg: 47.5 } as never, null)
  check('a barbell load: "47.5" "kg", no qualifier', bar?.value === '47.5' && bar?.unit === 'kg' && bar?.qualifier === '', bar)
  const added = wk.exerciseLoadBadge({ suggested_added_load_kg: 15 } as never, null)
  check('added weight is signed: "+15" "kg", "added"', added?.value === '+15' && added?.unit === 'kg' && added?.qualifier === 'added', added)
  const assist = wk.exerciseLoadBadge({ suggested_assistance_kg: 20 } as never, null)
  check('assistance is named: "20" "kg", "assist"', assist?.value === '20' && assist?.qualifier === 'assist', assist)
  const graduated = wk.exerciseLoadBadge({ suggested_assistance_kg: 5, assistance_ready_to_graduate: true } as never, null)
  check('assistance ready to drop says so', graduated?.value === 'BW' && graduated?.qualifier === 'no assist', graduated)
  const bw = wk.exerciseLoadBadge({} as never, 'Bodyweight')
  check('bodyweight is "BW" with "bodyweight" under it', bw?.value === 'BW' && bw?.unit === '' && bw?.qualifier === 'bodyweight', bw)
  const band = wk.exerciseLoadBadge({} as never, 'Band')
  check('a band is said as a word', band?.value === 'Band' && band?.unit === '', band)
  check('a row with no load says nothing', wk.exerciseLoadBadge({} as never, null) === null)
  check('every load with a number carries "kg"', [perHand, bar, added, assist].every(b => b?.unit === 'kg'))
  check('as a phrase: "~14 kg per hand", "bodyweight", "+15 kg added"',
    wk.loadPhrase(perHand) === '~14 kg per hand' && wk.loadPhrase(bw) === 'bodyweight' && wk.loadPhrase(added) === '+15 kg added',
    [wk.loadPhrase(perHand), wk.loadPhrase(bw), wk.loadPhrase(added)])

  console.log('\n2. The set bar')
  const segs = wk.setBarSegments(2, 1, 3, 2)
  check('one segment per set, warm-ups first', segs.length === 5 && segs.map(s => s.kind).join() === 'warmup,warmup,working,working,working', segs)
  check('logged sets filled from the left: 1 of 2 warm-ups, 2 of 3 working', segs.map(s => s.done ? 1 : 0).join('') === '10110', segs)
  const over = wk.setBarSegments(0, 0, 3, 5)
  check('never more filled than there are segments (5 logged of 3 planned fills 3)', over.length === 3 && over.every(s => s.done), over)
  check('no warm-ups, no violet segments', wk.setBarSegments(0, 0, 3, 0).every(s => s.kind === 'working'))

  console.log('\n3. The legend')
  const lift = wk.exerciseLegend({ name: 'Barbell Squats', sets: 3, reps: '9-11', tier: 'tier_1_main' } as never, 2)
  check('a lift with warm-ups: "2" warm-up, then its dose "working"', lift.warmups === 2 && lift.word === 'working' && /^3 × 9.11$/.test(lift.dose), lift)
  check('no warm-ups, no warm-up count', wk.exerciseLegend({ name: 'Leg Curl', sets: 3, reps: '10', tier: 'tier_3_accessory' } as never, 0).warmups === null)
  const prep = wk.exerciseLegend({ name: 'Arm Circles', sets: 2, reps: '8', tier: 'tier_0_primer' } as never, 0)
  check('a warm-up move is "easy", never "working"', prep.word === 'easy', prep)

  console.log('\n4. The week\'s rows')
  const ex = (name: string, extra: Record<string, unknown> = {}) => ({ name, sets: 3, reps: '8', rest: '90s', tier: 'tier_3_accessory', ...extra })
  const session = { day: 'Monday', focus: 'Squat & Carry', exercises: [ex('Arm Circles', { tier: 'tier_0_primer', sets: 2 }), ex('Barbell Squats', { tier: 'tier_1_main', suggested_load: '47.5kg', suggested_load_kg: 47.5 }), ex('Leg Curl')] }
  const day = (state: string, extra: Record<string, unknown> = {}) => ({ date: '2026-09-14', dayName: 'Monday', state, session, ...extra }) as never
  const none = () => null
  const due = wk.weekDayRow(day('due'), none)
  check('a session day names its focus and its main lift with the load', due.kind === 'session' && due.title === 'Squat & Carry' && due.line === 'Barbell Squats · 47.5 kg' && !due.done, due)
  check('...with its minutes and its working sets', due.kind === 'session' && due.minutes > 0 && due.sets === 6, due)
  check('a done day is done', wk.weekDayRow(day('done'), none).kind === 'session' && (wk.weekDayRow(day('done'), none) as { done: boolean }).done)
  const rest = wk.weekDayRow({ date: '2026-09-15', dayName: 'Tuesday', state: 'rest', session: null } as never, none)
  check('a rest day is one line', rest.kind === 'rest' && rest.note === null, rest)
  const moved = wk.weekDayRow(day('moved', { movedTo: { date: '2026-09-17', dayName: 'Thursday' } }), none)
  check('a moved day is a rest line that names where the session went', moved.kind === 'rest' && moved.note === 'Moved to Thursday', moved)
  const missed = wk.weekDayRow(day('missed'), none)
  check('a missed day keeps "Missed"', missed.kind === 'session' && missed.status === 'Missed' && !missed.done, missed)
  const swappedLogged = wk.weekDayRow(day('swapped', { swappedLine: 'Football · 60 min · Hard', swapLogged: true }), none)
  check('a swap keeps its line, and a LOGGED swap is done (his 8 Nov "Count it as a session")', swappedLogged.kind === 'session' && swappedLogged.status === 'Football · 60 min · Hard' && swappedLogged.done, swappedLogged)
  check('a swap with nothing logged is not done', !(wk.weekDayRow(day('swapped', { swappedLine: 'Football' }), none) as { done: boolean }).done)
  const walk = wk.weekDayRow({ date: '2026-09-16', dayName: 'Wednesday', state: 'due', session: { day: 'Wednesday', focus: 'Active Recovery', exercises: [], plannedActivity: { activity: 'Walk', duration: 20 } } } as never, none)
  check('a walk is a session (recovery), with its activity and minutes', walk.kind === 'recovery' && walk.line === 'Walk' && walk.minutes === 20, walk)
  check('the week\'s phase line: "B1 · Anatomical adaptation"; a deload says so',
    wk.weekPhaseLine(1, 'ANATOMICAL ADAPTATION') === 'B1 · Anatomical adaptation' && wk.weekPhaseLine(2, 'Hypertrophy', { isDeload: true }) === 'B2 · Deload week',
    [wk.weekPhaseLine(1, 'ANATOMICAL ADAPTATION'), wk.weekPhaseLine(2, 'Hypertrophy', { isDeload: true })])

  console.log('\n5. The week view\'s first exercises')
  const day5 = [ex('A'), ex('B'), ex('C', { superset_label: 'A1' }), ex('D', { superset_label: 'A2' }), ex('E')] as never[]
  const groups = groupExercises(day5)
  const shown = groupsUpTo(groups, 3)
  const count = shown.reduce((n, g) => n + (g.kind === 'single' ? 1 : g.members.length), 0)
  check('whole groups only: a superset that crosses the limit is shown whole (4), never cut', count === 4 && shown.length === 3, { count, groups: shown.map(g => g.kind) })
  check('no limit, every group', groupsUpTo(groups, undefined).length === groups.length)

  console.log(`\n${ran} checks ran, ${failures} failed.`)
  if (failures > 0) process.exit(1)
  console.log('PASSED — every row says its load with its unit, its sets as a bar, and the week as the day verbs left it.')
}

main().catch(e => { console.error(e); process.exit(1) })
