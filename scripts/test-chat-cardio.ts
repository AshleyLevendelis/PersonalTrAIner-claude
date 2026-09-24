/**
 * CARDIO LOGGED THROUGH THE CHAT — the parse and the write, below the screen.
 *
 * 24 Sep 2026, the chat fix Ashley asked for. "Did a 30 min walk" through the
 * chat wrote an effort of 5 nobody chose, stored "did a 30 min walk" as the
 * activity, read back "Cardio" under "0 exercises · 0 sets", reported a refused
 * write as logged, and its Undo left the walk in place. verify:chat-cardio
 * drives the real chat through all of it. This holds the rules the screen
 * cannot show: which words count as an effort and which do not, that the
 * message only speaks for the entry when it holds one entry, and that a
 * refusal is never counted.
 */

// --- Environment shims (test-cardio-effort.ts's shape) ------------------------
const storeMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => { storeMap.set(k, String(v)) },
    removeItem: (k: string) => { storeMap.delete(k) },
    clear: () => { storeMap.clear() },
  },
  configurable: true,
})
// Offline, so nothing flushes: the queue itself is the record this reads.
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true })

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

async function main() {
  const { parseWorkoutEntries } = await import('../src/lib/set-parse')
  const { executeLogWorkout } = await import('../src/lib/nl-logging-executor')
  const { effortFromWords } = await import('../src/lib/cardio-effort')

  const one = (said: string, extra: Partial<{ userSaid: string }> = {}) =>
    parseWorkoutEntries({ entries: [{ rawText: said, exercisePhrase: said, setsPhrase: said }], todaysPlanExerciseNames: [], userSaid: extra.userSaid ?? said }).groups[0]

  console.log('\n1. Her words for how hard — and only her words')
  // Literals on one side: what each phrase must come back as.
  const cases: [string, string | null][] = [
    ['30 min walk', null],
    ['30 min easy walk', 'easy:3'],
    ['took it easy on a 30 min walk', 'easy:3'],
    ['20 min steady bike', 'steady:5'],
    ['hard intervals on the bike 20 min', 'hard:7'],
    ['25 min run at RPE 8', 'hard:8'],
    ['25 min bike, 6/10', 'steady:6'],
    ['30 min walk, not hard', null],
    ['it wasnt easy, 30 min run', null],
    ['an easy but hard 30 min run', null],
    ['30 min comfortable swim', null],
    ['30 min zone 2 bike', null],
  ]
  const got = cases.map(([t]) => { const e = effortFromWords(t); return e ? `${e.key}:${e.rpe}` : null })
  check('each phrase reads as the effort it states, and a guessable word does not count', cases.every(([, want], i) => got[i] === want),
    cases.map(([t, want], i) => ({ t, want, got: got[i] })).filter(x => x.want !== x.got))

  console.log('\n2. No effort, no write: it asks, with three taps')
  const bare = one('did a 30 min walk')
  check('a bare walk routes to cardio, named "Walk"', bare.routesToCardio === true && bare.cardioActivity === 'Walk' && bare.cardioMinutes === 30, bare)
  check('...carries no effort', bare.cardioRpe === undefined, bare.cardioRpe)
  check('...and a blocking question', bare.ambiguity?.field === 'effort' && bare.ambiguity.message === 'How hard was the walk?', bare.ambiguity)
  check('...whose answers are Easy, Steady and Hard, as taps',
    (bare.ambiguity?.options ?? []).map(o => `${o.label}=${o.value}`).join(',') === 'Easy=easy,Steady=steady,Hard=hard', bare.ambiguity?.options)
  const answered = one('did a 30 min walk easy')
  check('the tapped answer, added to the phrase, resolves it', answered.ambiguity === undefined && answered.cardioRpe === 3, answered)

  console.log('\n3. The message speaks for the entry only when it holds one')
  const split = one('30 min walk', { userSaid: 'did a 30 min walk, nice and easy' })
  check('one entry: the effort in the rest of her message is taken', split.cardioRpe === 3 && !split.ambiguity, split)
  const two = parseWorkoutEntries({
    entries: [
      { rawText: 'bench 3x5 60kg', exercisePhrase: 'bench press', setsPhrase: '3x5 60kg' },
      { rawText: '20 min bike', exercisePhrase: '20 min bike', setsPhrase: '20 min' },
    ],
    todaysPlanExerciseNames: [],
    userSaid: 'bench 3x5 60kg, that was hard, then 20 min bike',
  }).groups[1]
  check('two entries: "that was hard" about the bench does not become the bike\'s effort', two.routesToCardio === true && two.cardioRpe === undefined && two.ambiguity?.field === 'effort', two)
  check('activity words read back as the rest-day chip names',
    ['20 min cycling', '20 min jog', '20 min swim'].map(t => one(`${t} easy`).cardioActivity).join(',') === 'Cycle,Run,Swim')

  console.log('\n4. The write: her effort, the name, and a refusal said as one')
  const ctx = {
    profileId: 'u1', date: '2026-09-24', weekNumber: 1, dayName: 'Wednesday',
    setsFor: () => [], logSet: () => {}, declareOffPlan: () => {}, deleteSet: () => {},
    todaysPlanSetCounts: new Map(), todaysPlanLoads: new Map(), replaceExisting: false,
  } as unknown as Parameters<typeof executeLogWorkout>[1]
  const ok = executeLogWorkout([one('25 min run at RPE 8')], ctx)
  const queue = JSON.parse(localStorage.getItem('fitplan_cardio_pending_v1') || '[]') as { activityName: string; durationMinutes: number; intensityRpe: number; clientId: string }[]
  check('the stored log is "Run", 25 minutes, her 8', queue.length === 1 && queue[0].activityName === 'Run' && queue[0].durationMinutes === 25 && queue[0].intensityRpe === 8, queue)
  check('...read back in the screen\'s words', ok.rows.length === 1 && ok.rows[0].label === 'Run' && ok.rows[0].detail === '25 min · Hard' && !ok.rows[0].note, ok.rows)
  check('...and handed back for Undo by the id the store deletes by', ok.cardioLogged.length === 1 && ok.cardioLogged[0] === queue[0]?.clientId && ok.cardioRefused === 0, ok)
  const refused = executeLogWorkout([one('0 min easy swim')], ctx)
  check('a length the store refuses is not counted as logged', refused.cardioLogged.length === 0 && refused.cardioRefused === 1, refused)
  check('...and its row says so', /^Not saved/.test(refused.rows[0]?.note ?? ''), refused.rows)
  check('...and nothing was queued', (JSON.parse(localStorage.getItem('fitplan_cardio_pending_v1') || '[]') as unknown[]).length === 1)
  const unasked = executeLogWorkout([{ ...one('30 min walk'), ambiguity: undefined }], ctx)
  check('a cardio group that somehow arrives with no effort writes nothing — the executor never invents one', unasked.cardioLogged.length === 0 && unasked.cardioRefused === 1, unasked)

  console.log(`\nchat-cardio: ${ran} checks ran`)
  if (failures > 0) { console.error(`chat-cardio: ${failures} check(s) FAILED`); process.exit(1) }
  console.log('The chat logs cardio on her effort, in the screen\'s words, and never claims a refused write.')
}

main().catch(err => { console.error('Test crashed:', err); process.exit(1) })
