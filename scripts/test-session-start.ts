/**
 * M7 + M12 (cause A) + M30 (titles), 9 Oct 2026 — "a session starts the same
 * way whichever way it starts".
 *
 * The tester: a session begun by ticking a set (no Start workout) showed
 * "Session running · 0:00" for its whole length and called all five lifts
 * "New PR" on the finish card; one begun with the button was titled "training"
 * in history where the other said "Thursday".
 *
 * One cause: the button and the first ticked set each wrote their own patch,
 * and each was missing something the other had. This gate holds the three
 * pieces they share now —
 *   1. sessionStartStamp: the one list of facts a start writes;
 *   2. getPRBaseline: the record as it stood BEFORE a date, derived from the
 *      sets themselves, so it cannot depend on how the session was opened;
 *   3. ensureSessionSynced: a row created before any set still gets its day.
 * The screen's half (the dock's clock, the rest bar) is verify:session-start.
 */

// --- Environment shims (before importing any lib modules) -------------------
const storeMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => { storeMap.set(k, String(v)) },
    removeItem: (k: string) => { storeMap.delete(k) },
    clear: () => { storeMap.clear() },
    key: (i: number) => [...storeMap.keys()][i] ?? null,
    get length() { return storeMap.size },
  },
  configurable: true,
})
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
// The harness's fake reads `window.__netDown`; in a script there is no window.
;(globalThis as unknown as { window: unknown }).window = globalThis

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const USER = 'u-start'

async function main() {
  const { makeFakeSupabase } = await import('../.tour-harness/fake-supabase')
  const { setSupabaseClient } = await import('../src/lib/supabase')
  const db: Record<string, Record<string, unknown>[]> = { workout_sessions: [], exercise_set_logs: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient(makeFakeSupabase(db) as any)

  const { sessionStartStamp } = await import('../src/lib/active-session-store')
  const { refreshPRCacheFromDB, getPRBaseline, getPRCache, isPRCacheLoaded } = await import('../src/lib/pr-engine')
  const { ensureSessionSynced } = await import('../src/lib/set-log-store')

  // -------------------------------------------------------------------------
  console.log('\n[1] one stamp, both ways in')
  const T0 = '2026-10-08T17:00:00.000Z'
  const T1 = '2026-10-08T17:12:00.000Z'
  const baseline = { 'Back Squat': { maxWeight: 60, maxE1RM: 70, maxAddedLoad: 0, maxReps: 0, date: '2026-10-01' } }
  const bySet = sessionStartStamp(null, T0, baseline, false)
  const byButton = sessionStartStamp(null, T0, baseline, true)
  check('a first ticked set opens a running session', bySet.status === 'running')
  check('...with a start time (the dock\'s clock counts from it)', bySet.startedAtIso === T0, bySet.startedAtIso)
  check('...and the record each lift stood at (the finish card compares against it)', bySet.prSnapshotAtStart === baseline)
  check('THE BUTTON STAMPS EXACTLY THE SAME FACTS', JSON.stringify(bySet) === JSON.stringify(byButton), { bySet, byButton })
  check('the two stamps name the same four fields', Object.keys(bySet).sort().join() === 'finishedAtIso,prSnapshotAtStart,startedAtIso,status', Object.keys(bySet))

  const running = { profileId: USER, date: '2026-10-08', dayName: 'Thursday', liveWeek: 1, lastActivityIso: T0, ...byButton } as never
  const secondSet = sessionStartStamp(running, T1, {}, false)
  check('a set ticked after Start keeps the start the button gave', secondSet.startedAtIso === T0, secondSet.startedAtIso)
  check('...and the baseline taken then, not a later one', secondSet.prSnapshotAtStart === baseline)

  const finished = { ...(running as object), status: 'finished', finishedAtIso: T1 } as never
  const reopened = sessionStartStamp(finished, '2026-10-08T18:00:00.000Z', {}, false)
  check('one more set after Finish reopens the SAME session', reopened.status === 'running' && reopened.startedAtIso === T0 && reopened.finishedAtIso === undefined, reopened)

  // A record that only holds something typed: no start yet.
  const note = { profileId: USER, date: '2026-10-08', dayName: 'Thursday', liveWeek: 1, lastActivityIso: T0, status: 'idle', drafts: { 'squat:1': { weight: '6', reps: '', isBodyweight: false } } } as never
  const afterNote = sessionStartStamp(note, T1, baseline, false)
  check('a half-typed weight is not a start: the first set after it starts the clock THEN', afterNote.startedAtIso === T1, afterNote.startedAtIso)
  // A stored record from before this fix: "running" since a keystroke, with a start time.
  const legacyNote = { ...(note as object), status: 'idle', startedAtIso: T0 } as never
  check('...even where an old record carries a start time beside the note', sessionStartStamp(legacyNote, T1, baseline, false).startedAtIso === T1)
  const restart = sessionStartStamp(running, T1, {}, true)
  check('the button always starts the clock at the tap', restart.startedAtIso === T1)

  // -------------------------------------------------------------------------
  console.log('\n[2] the record as it stood BEFORE a day, derived from the sets')
  const set = (name: string, date: string, weight: number, reps: number, extra: Record<string, unknown> = {}) => ({
    id: `s-${db.exercise_set_logs.length}`, user_id: USER, exercise_name: name, exercise_id: name.toLowerCase().replace(/\s+/g, '-'),
    set_number: 1, weight_kg: weight, reps_completed: reps, is_bodyweight: false, is_warmup: false, drop_index: 0,
    completed_at: `${date}T12:00:00`, ...extra,
  })
  check('nothing is known before the first read', isPRCacheLoaded(USER) === false && Object.keys(getPRBaseline(USER, '2026-10-09')).length === 0)
  db.exercise_set_logs.push(
    set('Back Squat', '2026-10-01', 60, 5),
    set('Back Squat', '2026-10-08', 70, 5),
    set('Romanian Deadlifts', '2026-10-08', 30, 8),
    set('Press-Up', '2026-10-01', 0, 12, { is_bodyweight: true }),
    set('Press-Up', '2026-10-08', 0, 15, { is_bodyweight: true }),
    set('Back Squat', '2026-10-08', 200, 20, { is_warmup: true }),
    set('Back Squat', '2026-10-08', 150, 30, { drop_index: 1 }),
    set('Bench Press', '2026-10-08', 50, 5, { user_id: 'someone-else' }),
  )
  await refreshPRCacheFromDB(USER)
  check('the read is known to have happened', isPRCacheLoaded(USER) === true)
  const before8 = getPRBaseline(USER, '2026-10-08')
  check('before the 8th, the squat stood at 60', before8['Back Squat']?.maxWeight === 60, before8['Back Squat'])
  check('...set on the 1st', before8['Back Squat']?.date === '2026-10-01', before8['Back Squat']?.date)
  check('THE 8th\'S OWN SETS ARE NOT IN IT — a session cannot be its own baseline', before8['Back Squat']?.maxWeight !== 70)
  check('a lift first done on the 8th has no earlier record at all', !('Romanian Deadlifts' in before8), Object.keys(before8))
  check('a bodyweight record is kept by reps', before8['Press-Up']?.maxReps === 12 && before8['Press-Up']?.maxWeight === 0, before8['Press-Up'])
  const before9 = getPRBaseline(USER, '2026-10-09')
  check('before the 9th, the squat stands at 70', before9['Back Squat']?.maxWeight === 70 && before9['Back Squat']?.date === '2026-10-08', before9['Back Squat'])
  check('...and the deadlift now has a record to beat', before9['Romanian Deadlifts']?.maxWeight === 30)
  check('a build-up set and a drop never set a record', before9['Back Squat']?.maxWeight === 70 && getPRCache(USER)['Back Squat']?.maxWeight === 70, getPRCache(USER)['Back Squat'])
  check('somebody else\'s sets are not this person\'s record', !('Bench Press' in before9))
  check('the all-time record agrees with the latest baseline', getPRCache(USER)['Back Squat']?.maxWeight === before9['Back Squat']?.maxWeight)

  // -------------------------------------------------------------------------
  console.log('\n[3] a row created before any set still knows its day')
  const D = '2026-10-09'
  const id = await ensureSessionSynced(USER, D, 'training', { startedAt: '2026-10-09T17:00:00.000Z', weekNumber: 1, day: 'Friday' })
  const row = db.workout_sessions.find(r => r.id === id)
  check('Start workout\'s row is created', !!row)
  check('...WITH ITS DAY (it was null, and history said "training")', row?.day === 'Friday', row?.day)
  check('...its week', row?.week_number === 1, row?.week_number)
  check('...and the moment it started', row?.started_at === '2026-10-09T17:00:00.000Z', row?.started_at)

  // A day already holding a row with no day — a day note (rest, moved,
  // missed), or a session started with the button before this fix.
  storeMap.clear()
  db.workout_sessions.push({ id: 'ws-note', profile_id: USER, date: '2026-10-12', split_type: 'rest', started_at: '2026-10-12T08:00:00.000Z', day: null, week_number: null })
  const id2 = await ensureSessionSynced(USER, '2026-10-12', 'training', { startedAt: '2026-10-12T17:00:00.000Z', weekNumber: 2, day: 'Monday' })
  const row2 = db.workout_sessions.find(r => r.id === 'ws-note')
  check('an existing row is reused, not doubled', id2 === 'ws-note' && db.workout_sessions.filter(r => r.date === '2026-10-12').length === 1)
  check('...its blank day is filled in', row2?.day === 'Monday' && row2?.week_number === 2, row2)
  check('...and its own start time is left alone', row2?.started_at === '2026-10-12T08:00:00.000Z', row2?.started_at)

  storeMap.clear()
  db.workout_sessions.push({ id: 'ws-named', profile_id: USER, date: '2026-10-13', split_type: 'training', started_at: '2026-10-13T08:00:00.000Z', day: 'Tuesday', week_number: 2 })
  await ensureSessionSynced(USER, '2026-10-13', 'training', { startedAt: '2026-10-13T17:00:00.000Z', weekNumber: 3, day: 'Wednesday' })
  const row3 = db.workout_sessions.find(r => r.id === 'ws-named')
  check('a row that already has its day is never renamed', row3?.day === 'Tuesday' && row3?.week_number === 2, row3)

  console.log(`\n${ran} checks ran. ${failures === 0 ? 'All passed.' : `${failures} FAILED.`}`)
  if (failures > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
