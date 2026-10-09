/**
 * M12 (the check), L29, L15 and two leftovers from the cardio slice, 9 Oct
 * 2026 — "finishing asks first, and the summary's numbers mean what they say".
 *
 * The tester: Finish session ended a session at 9 of 24 sets without a word;
 * "80m · 710kg · 7/9" — the 9 left out the exercise she had added, and the 80
 * minutes included a connection outage; 30 kg in each hand counted as 30.
 *
 *   - Finish with planned sets still to do asks first — the sheet the layout
 *     design drew (docs/LAYOUT-DESIGN.md §3.7, never built): "7 of 9 sets done
 *     — finish anyway?", Finish / Keep going. Nothing is asked when every
 *     planned set is done.
 *   - The fraction is PLANNED sets done over planned sets; anything beyond the
 *     plan is beside it ("7/9 planned · +1 extra"), never inside it.
 *   - Duration is TRAINING TIME (decided as a CSCS): from the session's start
 *     to its last set, and no single gap counts for more than ten minutes.
 *   - Volume is total load moved (decided as a CSCS): a pair of dumbbells
 *     logged "per hand" counts both hands.
 */

// --- Environment shims (before importing any lib modules) -------------------
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
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const strip = (t: string) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

async function main() {
  const derive = await import('../src/lib/session-derive')
  const voice = await import('../src/lib/coach-voice')
  const { getExerciseEntry } = await import('../src/lib/exercise-db')
  const { labelModeForEntry } = await import('../src/lib/load-prescription')

  const T = (min: number, sec = 0) => new Date(Date.UTC(2026, 9, 9, 17, min, sec)).toISOString()
  let n = 0
  const log = (name: string, setNumber: number, o: Record<string, unknown> = {}) => ({
    id: `l${++n}`, user_id: 'u', date: '2026-10-09', exercise_name: name, exercise_id: name.toLowerCase().replace(/\s+/g, '-'),
    set_number: setNumber, weight_kg: 20, reps_completed: 10, is_bodyweight: false, is_warmup: false, drop_index: 0, ...o,
  }) as never

  // The tester's Friday: three planned exercises of three sets, seven of the
  // nine done, plus one set of something she added herself.
  const planned = [
    { id: 'goblet-squats', name: 'Goblet Squats', sets: 3 },
    { id: 'romanian-deadlifts', name: 'Romanian Deadlifts', sets: 3 },
    { id: 'push-ups', name: 'Push-Ups', sets: 3 },
  ]
  const friday = [
    log('Goblet Squats', 1, { completed_at: T(2) }), log('Goblet Squats', 2, { completed_at: T(5) }), log('Goblet Squats', 3, { completed_at: T(8) }),
    log('Romanian Deadlifts', 1, { weight_kg: 30, reps_completed: 8, completed_at: T(12) }), log('Romanian Deadlifts', 2, { weight_kg: 30, reps_completed: 8, completed_at: T(15) }), log('Romanian Deadlifts', 3, { weight_kg: 30, reps_completed: 8, completed_at: T(18) }),
    log('Push-Ups', 1, { weight_kg: 0, is_bodyweight: true, completed_at: T(22) }),
    log('Hammer Curls', 1, { weight_kg: 8, completed_at: T(26) }),
  ]

  // -------------------------------------------------------------------------
  console.log('\n[1] THE CHECK BEFORE FINISHING')
  const progress = derive.plannedSetProgress(friday, planned)
  check('seven of the nine planned sets are done', progress.done === 7 && progress.planned === 9, progress)
  check('...two are left — the added exercise is not one of the nine and does not hide them', progress.remaining === 2, progress)
  check('the sheet asks in those numbers', voice.FINISH_CHECK.title(7, 9) === '7 of 9 sets done — finish anyway?', voice.FINISH_CHECK.title(7, 9))
  check('...with two plain answers', voice.FINISH_CHECK.finish === 'Finish' && voice.FINISH_CHECK.keepGoing === 'Keep going')
  check('one set reads as one set', voice.FINISH_CHECK.title(1, 9) === '1 of 9 sets done — finish anyway?')
  const all = [...friday, log('Push-Ups', 2, { weight_kg: 0, is_bodyweight: true }), log('Push-Ups', 3, { weight_kg: 0, is_bodyweight: true })]
  check('with every planned set done nothing is left to ask about', derive.plannedSetProgress(all, planned).remaining === 0, derive.plannedSetProgress(all, planned))
  const over = [...all, log('Push-Ups', 4, { weight_kg: 0, is_bodyweight: true })]
  check('an extra set on a planned exercise never counts as a planned one: still 9 of 9', derive.plannedSetProgress(over, planned).done === 9, derive.plannedSetProgress(over, planned))
  check('four sets on one exercise do not stand in for the two missing on another',
    derive.plannedSetProgress([...friday, log('Goblet Squats', 4), log('Goblet Squats', 5)], planned).remaining === 2)
  check('a build-up set and a drop are not planned sets done',
    derive.plannedSetProgress([log('Goblet Squats', 1, { is_warmup: true }), log('Goblet Squats', 1, { drop_index: 1 })], planned).done === 0)
  const panel = strip(read('src/components/exercise/TodayPanel.tsx'))
  check('Finish session goes through the check', /onClick=\{requestFinish\}>Finish session</.test(panel) && !/onClick=\{handleFinish\}>Finish session</.test(panel))
  check('...which only opens the sheet when planned sets remain and something is logged', /if \(progress\.remaining > 0 && anyLogged\) \{\s*setFinishCheck\(/.test(panel), /const requestFinish[\s\S]{0,400}/.exec(panel)?.[0])

  // -------------------------------------------------------------------------
  console.log('\n[2] THE FRACTION — planned sets, with extras beside it')
  const summary = derive.computeSessionSummary(friday, planned, T(0), T(80))
  check('"7/9": planned sets done over planned sets (it read 8/9 with the added set in the top half only)', summary.setsCompleted === 7 && summary.setsPrescribed === 9, { done: summary.setsCompleted, of: summary.setsPrescribed })
  check('the added set is counted, beside it', summary.extraSets === 1, summary.extraSets)
  // The card prints the fraction and, on its own line, "+1 extra" (SessionSummaryDialog). The joined
  // phrase it once had a helper for was never rendered and was removed on 9 Oct.
  check('the extra is said as "+1 extra", beside the 7/9', voice.extraSetsNote(summary.extraSets) === '+1 extra', voice.extraSetsNote(summary.extraSets))
  const overSummary = derive.computeSessionSummary(over, planned, T(0), T(80))
  check('an extra set on a planned exercise is an extra, not a tenth of nine', overSummary.setsCompleted === 9 && overSummary.setsPrescribed === 9 && overSummary.extraSets === 2, { done: overSummary.setsCompleted, extra: overSummary.extraSets })
  // A row with no exercise id is matched by NAME — and must then be counted
  // once, under its planned exercise, not again as off-plan work.
  const noIds = friday.slice(0, 7).map(l => { const { exercise_id: _drop, ...rest } = l as Record<string, unknown>; return rest as never })
  const byName = derive.computeSessionSummary(noIds, planned, T(0), T(80))
  check('a planned set matched by name is not also counted as an extra', byName.setsCompleted === 7 && byName.extraSets === 0, { done: byName.setsCompleted, extra: byName.extraSets })
  check('with no extras there is nothing beside it', voice.extraSetsNote(derive.computeSessionSummary(friday.slice(0, 7), planned, T(0), T(80)).extraSets) === '')
  check('the per-exercise rows still say what was done on each', summary.exercises.find(e => e.exerciseName === 'Hammer Curls')?.setsCompleted === 1 && summary.exercises.find(e => e.exerciseName === 'Hammer Curls')?.setsPrescribed === 0)

  // -------------------------------------------------------------------------
  console.log('\n[3] DURATION IS TRAINING TIME')
  check('the cap on one gap is ten minutes', derive.TRAINING_GAP_CAP_MS === 10 * 60 * 1000)
  check('start to LAST SET, not to the Finish tap: 26 minutes, though Finish came at 80', summary.durationMinutes === 26, summary.durationMinutes)
  // The outage: nothing logged between minute 26 and minute 61.
  const withOutage = [...friday, log('Push-Ups', 2, { weight_kg: 0, is_bodyweight: true, completed_at: T(61) }), log('Push-Ups', 3, { weight_kg: 0, is_bodyweight: true, completed_at: T(64) })]
  const outage = derive.computeSessionSummary(withOutage, planned, T(0), T(80))
  check('A 35-MINUTE GAP COUNTS AS TEN: 39 minutes, where the clock says 64', outage.durationMinutes === 39, outage.durationMinutes)
  check('the helper says the same from bare times', derive.trainingMinutes(T(0), withOutage.map(l => (l as { completed_at?: string }).completed_at), T(80)) === 39)
  check('a gap of exactly ten minutes is counted whole', derive.trainingMinutes(T(0), [T(10), T(20)], T(30)) === 20)
  check('a session started by its first set has one set and no time before it: at least a minute, never 0', derive.trainingMinutes(T(5), [T(5)], T(40)) === 1)
  check('the warm-up before the first set counts, up to the cap', derive.trainingMinutes(T(0), [T(8), T(11)], T(30)) === 11 && derive.trainingMinutes(T(0), [T(25), T(28)], T(30)) === 13)
  check('sets out of order are read in time order', derive.trainingMinutes(T(0), [T(9), T(3), T(6)], T(30)) === 9)
  check('a set logged before Start was tapped is still part of the session: the time runs from whichever came first', derive.trainingMinutes(T(10), [T(4), T(13)], T(30)) === 9, derive.trainingMinutes(T(10), [T(4), T(13)], T(30)))
  check('with no set times at all it falls back to the clock, start to finish', derive.trainingMinutes(T(0), [], T(42)) === 42 && derive.trainingMinutes(T(0), [undefined], T(42)) === 42)
  check('a finish before the start is 0, never negative', derive.trainingMinutes(T(42), [], T(0)) === 0)
  const store = strip(read('src/hooks/useActiveSession.tsx'))
  check('the same figure is what the session row is given, so the card and history agree', (store.match(/markSessionCompleted\(sessionId, [^)]*trainingMinutes\(/g) ?? []).length + (store.match(/minutes = trainingMinutes\(/g) ?? []).length >= 1 && /durationMinutes/.test(strip(read('src/lib/daily-tracking.ts')).match(/export async function markSessionCompleted[\s\S]{0,900}/)?.[0] ?? ''))

  // -------------------------------------------------------------------------
  console.log('\n[4] VOLUME IS THE LOAD MOVED — a pair of dumbbells counts both hands')
  const mode = (name: string) => { const e = getExerciseEntry(name); return e ? labelModeForEntry(e) : null }
  check('the fixture is what it says: RDLs are per hand, the goblet squat is one bell, the calf raise is one side at a time',
    mode('Romanian Deadlifts') === 'per_hand' && mode('Goblet Squats') === 'total' && mode('Single-Leg Dumbbell Calf Raise') === 'single_side' && mode('Barbell Bench Press') === 'total',
    [mode('Romanian Deadlifts'), mode('Goblet Squats'), mode('Single-Leg Dumbbell Calf Raise'), mode('Barbell Bench Press')])
  check('30 KG IN EACH HAND FOR 8 IS 480, NOT 240', derive.setVolumeKg(log('Romanian Deadlifts', 1, { weight_kg: 30, reps_completed: 8 })) === 480)
  check('one dumbbell held in both hands is counted once', derive.setVolumeKg(log('Goblet Squats', 1, { weight_kg: 16, reps_completed: 10 })) === 160)
  check('a bar is counted once', derive.setVolumeKg(log('Barbell Bench Press', 1, { weight_kg: 60, reps_completed: 8 })) === 480)
  check('one side at a time is counted as logged', derive.setVolumeKg(log('Single-Leg Dumbbell Calf Raise', 1, { weight_kg: 12, reps_completed: 10 })) === 120)
  check('a bodyweight set is 0, as it always was', derive.setVolumeKg(log('Push-Ups', 1, { weight_kg: 0, is_bodyweight: true })) === 0)
  check('a name the catalogue does not know is taken as logged — never doubled on a guess', derive.setVolumeKg(log('Something I Made Up', 1, { weight_kg: 10, reps_completed: 10 })) === 100)
  // Goblet 3×(20×10) + RDL 3×(30×8×2) + Hammer Curls 1×(8×10×2)
  check('the session\'s volume uses it: 600 + 1,440 + 160', summary.totalVolumeKg === 600 + 1440 + 160, summary.totalVolumeKg)
  const history = strip(read('src/lib/exercise-history.ts'))
  const { sumVolumeAndSets } = await import('../src/lib/exercise-history')
  check('session history counts volume the same way: 30 per hand for 8 is 480 there too',
    sumVolumeAndSets([{ weightKg: 30, repsCompleted: 8, exerciseName: 'Romanian Deadlifts' }, { weightKg: 60, repsCompleted: 8, exerciseName: 'Barbell Bench Press' }]).totalVolumeKg === 960)
  check('...and the history reader tells it which exercise each set was', /exerciseName: s\.exercise_name/.test(/export async function getSessionHistory[\s\S]*?\n}\n/.exec(history)?.[0] ?? ''))
  const prSrc = strip(read('src/lib/pr-engine.ts')) + strip(read('src/lib/progression-engine.ts'))
  check('personal bests and progression do NOT: they compare a hand with a hand', !/setVolumeKg/.test(prSrc))

  // -------------------------------------------------------------------------
  console.log('\n[5] THE TWO LEFTOVERS')
  check('finishing with only a walk logged says the walk is saved', voice.noSetsButCardio(['Brisk Walk']) === 'No sets logged — your brisk walk is saved.', voice.noSetsButCardio(['Brisk Walk']))
  check('...whatever the activity was', voice.noSetsButCardio(['skipping rope']) === 'No sets logged — your skipping rope is saved.')
  check('...and "your cardio" when it was more than one thing', voice.noSetsButCardio(['Brisk Walk', 'Rowing']) === 'No sets logged — your cardio is saved.')
  const dialog = strip(read('src/components/exercise/SessionSummaryDialog.tsx'))
  check('the finish card labels the fraction "Planned sets" and puts the extras on their own line', /Planned sets</.test(dialog) && /extraSetsNote\(data\.summary\.extraSets\)/.test(dialog) && voice.extraSetsNote(1) === '+1 extra' && voice.extraSetsNote(0) === '')
  check('the finish card says it instead of "Nothing logged"', /noSetsButCardio\(/.test(dialog) && /savedCardio/.test(dialog))
  check('the badge counts what is waiting in the row\'s own words', voice.setsWaitingToSend(2) === '2 sets waiting to send' && voice.setsWaitingToSend(1) === '1 set waiting to send' && voice.setsWaitingToSend(2).endsWith(voice.SET_WAITING_TO_SEND.replace('on this phone, ', '')))
  const badge = strip(read('src/components/OfflineStatusIndicator.tsx'))
  check('...and the badge prints that, not "Saved Offline (2 sets queued)"', /setsWaitingToSend\(state\.queuedCount\)/.test(badge) && !/queued\)`/.test(badge) && !/Saved Offline/.test(badge))

  console.log(`\n${ran} checks ran. ${failures === 0 ? 'All passed.' : `${failures} FAILED.`}`)
  if (failures > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
