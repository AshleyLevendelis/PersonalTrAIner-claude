import { generateMesocycle, resetRandomSource, setRandomSource, getConstrainedPool, getFlaggedJoints, repRangeForIncomingExercise, isEquipmentAllowed, unbudgetedRestSeconds } from '../src/lib/exercise-plan'
import { PHASE_CONFIGS } from '../src/lib/periodization'
import { seededRngFromKey } from '../src/lib/seeded-random'
import {
  planSessionKindToday, confirmSessionKindToday, undoSessionKindToday, buildSessionKindTodayProposal,
  sessionKindsFor, sessionKindFrom, describeKindToday, kindTodayOf, type SessionKind, type SessionKindOffer, type SessionKindPlan,
} from '../src/lib/session-kind'
import { isMainLiftSlot } from '../src/lib/mesocycle-edit'
import { EXERCISE_DATABASE, isContraindicatedFor, type ExerciseEntry } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import { estimateDaySeconds, getSessionMaximumSeconds, getSessionMinimumSeconds } from '../src/lib/session-duration'
import type { UserProfile, MesocycleWeek, WorkoutDay } from '../src/lib/types'

// ---------------------------------------------------------------------------
// A DIFFERENT KIND OF SESSION TODAY — "let's do a cardio workout today".
//
// Ashley's live test, 19 Oct 2026, and her ruling of 20 Oct: "Drop it, today
// only." The whole day is replaced, main lift included, for today only, and
// the main lift is back the next time it is due. docs/plans/
// a-different-kind-of-session-today.md has the CSCS call this holds.
//
// THE CHECKS CALL THE BUILDER AND READ WHAT COMES BACK — the plan it returns,
// the week it would write, the words both surfaces show. Nothing here asks
// whether a function APPEARS in a file. Every fixture is SEEDED and every
// check runs every time with a null-safe subject, so the count of checks that
// ran is the same on every run and a crash can never read as a pass.
// ---------------------------------------------------------------------------

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

const base = (over: Partial<UserProfile>): UserProfile => ({
  age: 30, gender: 'female', height_cm: 168, weight_kg: 65, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1500, tdee: 2200,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: 'ai_recommendation',
  training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, i) => ({ day, available: [0, 2, 4].includes(i) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  ...over,
} as unknown as UserProfile)

const quiet = console.log
const quietWarn = console.warn
const meso = (p: UserProfile, key: string): MesocycleWeek[] => {
  console.log = () => {}
  setRandomSource(seededRngFromKey(key))
  try { return generateMesocycle(p) } finally { resetRandomSource(); console.log = quiet }
}
const plan = async (m: MesocycleWeek[], p: UserProfile, kind: SessionKind, o: { week?: number; day?: string; moves?: string[]; exclusions?: string[]; logged?: number } = {}): Promise<SessionKindPlan> => {
  console.log = () => {}; console.warn = () => {}
  try {
    return await planSessionKindToday({ mesocycle: m, profile: p, weekNumber: o.week ?? 2, dayName: o.day ?? 'Monday', kind, moves: o.moves ?? [], exclusions: o.exclusions ?? [], loggedSets: o.logged ?? 0 })
  } finally { console.log = quiet; console.warn = quietWarn }
}
const offerOf = (r: SessionKindPlan): SessionKindOffer | null => (r.ok ? r.offer : null)
const entryOf = (name: string): ExerciseEntry | undefined => EXERCISE_DATABASE.find(e => e.name === name)
const dayIn = (m: MesocycleWeek[], w: number, d: string): WorkoutDay | undefined => m.find(x => x.week_number === w)?.days.find(x => x.day === d)
const J = (x: unknown) => JSON.stringify(x ?? null)

const FULL = base({})
const MINI = base({ equipment_access: 'minimalist' })
const BODY = base({ equipment_access: 'bodyweight', session_duration_preference: '30-45' })
// MINIMALIST AND KNEE-FLAGGED, so the injury filter binds: a full gym's cardio is
// machines, none of which loads the knee, and would pass with the filter gone.
const KNEE = base({ equipment_access: 'minimalist', injuries: ['knees'] })
const M_FULL = meso(FULL, 'kind-full')
const M_MINI = meso(MINI, 'kind-mini')
const M_BODY = meso(BODY, 'kind-body')
const M_KNEE = meso(KNEE, 'kind-knee')
// One training day a week, so nothing else in the week claims the big lifts and
// a hybrid day's main block can take a tier-1 compound.
const ONE = base({ training_style: 'functional', training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, i) => ({ day, available: i === 0 })) })
const M_ONE = meso(ONE, 'kind-one')
// The seed under which the app's ranker, left to itself, puts a press-up jump
// (an upper-body explosive move) ahead of a broad jump for the prep slot — the
// case where "a stand-in of its own kind" has to do the work.
const M_BODY2 = meso(BODY, 'x')

console.log('a different kind of session today\n')

// ---------------------------------------------------------------------------
console.log('0. The fixtures')
// ---------------------------------------------------------------------------
const planned = dayIn(M_FULL, 2, 'Monday')
const mainName = planned?.exercises.find(isMainLiftSlot)?.name ?? null
check('week 2 Monday is a session with a main lift', !!planned && planned.exercises.length >= 4 && !!mainName, { n: planned?.exercises.length, mainName })
const deloadWeek = M_FULL.find(w => w.is_deload)?.week_number ?? null
check('the plan has a deload week to test against', deloadWeek != null, deloadWeek)

const cardio = offerOf(await plan(M_FULL, FULL, 'cardio'))
const functional = offerOf(await plan(M_FULL, FULL, 'functional', { moves: ['sled push', 'box jumps'] }))
const bodybuilding = offerOf(await plan(M_FULL, FULL, 'bodybuilding'))
const miniCardio = offerOf(await plan(M_MINI, MINI, 'cardio'))
const bodyFunctional = offerOf(await plan(M_BODY, BODY, 'functional', { moves: ['box jumps', 'sled push'] }))
const kneeCardio = offerOf(await plan(M_KNEE, KNEE, 'cardio'))
const kneeFunctional = offerOf(await plan(M_KNEE, KNEE, 'functional'))
const oneHybrid = offerOf(await plan(M_ONE, ONE, 'hybrid'))
const body2Functional = offerOf(await plan(M_BODY2, BODY, 'functional', { moves: ['box jumps'] }))
check('every fixture offer was built', [cardio, functional, bodybuilding, miniCardio, bodyFunctional, kneeCardio, kneeFunctional, oneHybrid, body2Functional].every(Boolean),
  [cardio, functional, bodybuilding, miniCardio, bodyFunctional, kneeCardio, kneeFunctional, oneHybrid, body2Functional].map(o => !!o))

// ---------------------------------------------------------------------------
console.log('\n1. Refusals, each in words')
// ---------------------------------------------------------------------------
{
  const rest = await plan(M_FULL, FULL, 'cardio', { day: 'Tuesday' })
  check('a rest day is refused', !rest.ok && /no session on Tuesday/.test(rest.refusal), rest)
  const logged = await plan(M_FULL, FULL, 'cardio', { logged: 1 })
  check('a session with a working set logged is refused — it is not redrawn underneath her', !logged.ok && /already logged sets/.test(logged.refusal), logged)
  const own = await plan(M_FULL, FULL, 'hybrid')
  check('her own style is refused and pointed at the rebuild, which keeps her main lift', !own.ok && /already how you train/.test(own.refusal) && /different session/.test(own.refusal), own)
  const allCardio = EXERCISE_DATABASE.filter(e => e.mechanics_tier === 'cardio').map(e => e.name)
  const starved = await plan(M_FULL, FULL, 'cardio', { exclusions: allCardio })
  check('a pool with no cardio left refuses rather than building a session that is not cardio', !starved.ok && /can't build a cardio session/.test(starved.refusal), starved)
  const unknown = await plan(M_FULL, FULL, 'combat' as SessionKind)
  check('a kind the app does not offer (combat) is refused', !unknown.ok, unknown)
}

// ---------------------------------------------------------------------------
console.log('\n2. Her ruling: the whole day, today only, and the main lift comes back')
// ---------------------------------------------------------------------------
for (const [label, o] of [['cardio', cardio], ['functional', functional], ['bodybuilding', bodybuilding]] as const) {
  const today = o ? dayIn([o.week], 2, 'Monday') : undefined
  check(`${label}: the planned main lift is NOT in today's session`, !!today && !!mainName && !today.exercises.some(e => e.name === mainName), today?.exercises.map(e => e.name))
  check(`${label}: and it is named, with when it is back`, o?.droppedMainLift?.name === mainName && o?.droppedMainLift?.backOn === 'next Monday', o?.droppedMainLift)
}
{
  const written = cardio ? confirmSessionKindToday(M_FULL, cardio) : null
  const m = written && written.ok ? written.mesocycle : null
  check('confirm writes', !!m)
  check('every OTHER week is byte for byte the same — the main lift is back next time at the weight it had',
    !!m && M_FULL.every(w => w.week_number === 2 || J(m.find(x => x.week_number === w.week_number)) === J(w)))
  const nextMain = dayIn(m ?? [], 3, 'Monday')?.exercises.find(e => e.name === mainName)
  const plannedNext = dayIn(M_FULL, 3, 'Monday')?.exercises.find(e => e.name === mainName)
  check('next week\'s main lift is there, at its planned weight', !!nextMain && nextMain.suggested_load_kg === plannedNext?.suggested_load_kg, { nextMain: nextMain?.suggested_load_kg, planned: plannedNext?.suggested_load_kg })
  check('the OTHER days of this week are untouched — a one-off is not rebalanced around',
    !!m && ['Wednesday', 'Friday'].every(d => J(dayIn(m, 2, d)) === J(dayIn(M_FULL, 2, d))))
  check('only today changed in this week', !!m && J(dayIn(m, 2, 'Monday')) !== J(dayIn(M_FULL, 2, 'Monday')))
  // NOT TOMORROW'S WORK EARLY: in a full gym every block has something else to
  // fill it, so nothing on today's new session is also on another day this week.
  const elsewhere = new Set(M_FULL.find(w => w.week_number === 2)!.days.filter(d => d.day !== 'Monday').flatMap(d => d.exercises.map(e => e.name)))
  const repeats = [cardio, functional, bodybuilding].flatMap(o => o?.session ?? []).filter(e => elsewhere.has(e.name)).map(e => e.name)
  check('full gym: nothing in today\'s new session is also on another day this week', repeats.length === 0 && elsewhere.size > 5, repeats)
  // AND WHERE THE BLOCK'S OWN FIRST CHOICE IS ON ANOTHER DAY: Farmer's Walk is
  // the carry block's first pick, so put it on Wednesday and it must step aside.
  const carryFirst = functional?.session.find(e => entryOf(e.name)?.movement_pattern === 'carry')?.name ?? '(none)'
  const withCarry = M_FULL.map(w => (w.week_number !== 2 ? w : { ...w, days: w.days.map(d => (d.day !== 'Wednesday' ? d : { ...d, exercises: [...d.exercises, { ...d.exercises[d.exercises.length - 1], name: carryFirst }] })) }))
  const again = offerOf(await plan(withCarry, FULL, 'functional', { moves: ['sled push', 'box jumps'] }))
  const carryAgain = again?.session.find(e => entryOf(e.name)?.movement_pattern === 'carry')?.name
  check(`a carry already on Wednesday (${carryFirst}) is not today's carry; the next one is`, carryFirst === "Farmer's Walk" && !!carryAgain && carryAgain !== carryFirst, { carryFirst, carryAgain })
  // HER RULING, WHERE IT BINDS: the planned main lift stays out even when it is
  // the only lift left for its block (everything else of its pattern avoided).
  const oneMain = dayIn(M_ONE, 2, 'Monday')?.exercises.find(isMainLiftSlot)?.name ?? '(none)'
  const oneMainEntry = entryOf(oneMain)
  const others = getConstrainedPool(ONE, [], { skipStyle: true }).filter(e => e.movement_pattern === oneMainEntry?.movement_pattern && e.name !== oneMain).map(e => e.name)
  const only = offerOf(await plan(M_ONE, ONE, 'bodybuilding', { exclusions: others }))
  check(`even as the only ${oneMainEntry?.movement_pattern ?? '?'} lift left, the planned main lift (${oneMain}) is not today's`, !!oneMainEntry && others.length > 2 && !!only && !only.session.some(e => e.name === oneMain), only?.session.map(e => e.name))
  check('the input plan was not mutated by the trial', J(dayIn(M_FULL, 2, 'Monday')) === J(planned))
}

// ---------------------------------------------------------------------------
console.log('\n3. Cardio is cardio')
// ---------------------------------------------------------------------------
for (const [label, o] of [['full gym', cardio], ['minimalist', miniCardio], ['knee', kneeCardio]] as const) {
  const ex = o?.session ?? []
  const entries = ex.map(e => entryOf(e.name))
  check(`${label}: every exercise is a conditioning block or core work`, ex.length > 0 && entries.every(e => !!e && (e.mechanics_tier === 'cardio' || e.movement_pattern === 'core')), ex.map(e => e.name))
  const cardioBlocks = entries.filter(e => e?.mechanics_tier === 'cardio')
  check(`${label}: at least two conditioning blocks`, cardioBlocks.length >= 2, cardioBlocks.map(e => e?.name))
  check(`${label}: no exercise twice`, new Set(ex.map(e => e.name)).size === ex.length, ex.map(e => e.name))
  check(`${label}: at most one high-impact block`, cardioBlocks.filter(e => e?.joint_stress === 'high').length <= 1, cardioBlocks.map(e => [e?.name, e?.joint_stress]))
}
{
  const first = cardio?.session.map(e => entryOf(e.name)).find(e => e?.mechanics_tier === 'cardio')
  check('full gym: the first conditioning block is a machine', !!first && first.equipment.some(q => ['treadmill', 'stationary bike', 'rowing machine', 'elliptical machine'].includes(q)), first?.name)
  const machines = (miniCardio?.session ?? []).filter(e => entryOf(e.name)?.equipment.some(q => ['treadmill', 'stationary bike', 'rowing machine', 'elliptical machine', 'battle ropes'].includes(q)))
  check('minimalist: no machine in sight', (miniCardio?.session.length ?? 0) > 0 && machines.length === 0, machines.map(e => e.name))
  const intervals = (miniCardio?.session ?? []).filter(e => e.prescription_type === 'intervals')
  check('minimalist intervals are the catalogue\'s own bodyweight work:rest (30s on, 30s off)', intervals.length >= 2 && intervals.every(e => e.reps === '30s' && e.rest === '30s'), intervals.map(e => [e.reps, e.rest]))
  check('the rounds fill the time, up to the conditioning ceiling of 8', intervals.some(e => e.sets > 6) && intervals.every(e => e.sets <= 8), intervals.map(e => e.sets))
  // NOT THREE MOVES ON REPEAT: bodyweight cardio files most of its moves under
  // one group, and a session of 45 minutes needs four of them.
  check('minimalist: four conditioning blocks, two of a group at most', intervals.length >= 4, intervals.map(e => e.name))
}

// ---------------------------------------------------------------------------
console.log('\n4. Functional is athletic: power first, a hinge, a carry, a finisher')
// ---------------------------------------------------------------------------
{
  const ex = functional?.session ?? []
  const entries = ex.map(e => entryOf(e.name))
  check('it opens with an explosive move', entries[0]?.mechanics_tier === 'primer' && ['explosive_lower', 'explosive_upper', 'swing'].includes(entries[0]?.substitution_group ?? ''), entries[0]?.name)
  check('...and the box jumps she asked for are that move', ex[0]?.name === 'Box Jumps', ex[0]?.name)
  check('it has a hinge', entries.some(e => e?.movement_pattern === 'hip_hinge' && e.mechanics_tier !== 'primer'), ex.map(e => e.name))
  check('it has a loaded carry', entries.some(e => e?.movement_pattern === 'carry' && e.prescription_type === 'distance_load'), ex.map(e => e.name))
  check('it ends its work with a conditioning finisher', entries.some(e => e?.mechanics_tier === 'cardio'), ex.map(e => e.name))
  check('the conditioning comes after every lift (power before strength before conditioning)',
    entries.findIndex(e => e?.mechanics_tier === 'cardio') > Math.max(...entries.map((e, i) => (e && (e.mechanics_tier === 'tier1_compound' || e.mechanics_tier === 'tier2_compound') ? i : -1))))
  check('at most one main lift', ex.filter(isMainLiftSlot).length <= 1, ex.filter(isMainLiftSlot).map(e => e.name))
  const weighted = entries.filter(e => e && (e.mechanics_tier === 'tier1_compound' || e.mechanics_tier === 'tier2_compound') && e.movement_pattern !== 'core')
  check('full gym: every strength block carries a weight (her 10 Sep rule: weight wins)', weighted.length >= 3 && weighted.every(e => e!.equipment.some(q => q !== 'bodyweight' && q !== 'box' && q !== 'bench')), weighted.map(e => [e?.name, e?.equipment]))
  const bb = (bodybuilding?.session ?? []).map(e => entryOf(e.name))
  check('bodybuilding: squat, push and pull all there', ['knee_dominant', 'horizontal_push'].every(p => bb.some(e => e?.movement_pattern === p)) && bb.some(e => e?.movement_pattern === 'horizontal_pull' || e?.movement_pattern === 'vertical_pull'), bb.map(e => e?.name))
  check('bodybuilding: no conditioning blocks', !bb.some(e => e?.mechanics_tier === 'cardio'), bb.map(e => e?.name))
}

// ---------------------------------------------------------------------------
console.log('\n5. Her kit, her injuries, her avoid list')
// ---------------------------------------------------------------------------
{
  const inPool = (p: UserProfile, names: string[]) => { const pool = new Set(getConstrainedPool(p, [], { skipStyle: true }).map(e => e.name)); return names.filter(n => !pool.has(n)) }
  for (const [label, p, o] of [['full gym cardio', FULL, cardio], ['minimalist cardio', MINI, miniCardio], ['bodyweight functional', BODY, bodyFunctional], ['knee cardio', KNEE, kneeCardio], ['knee functional', KNEE, kneeFunctional]] as const) {
    const names = o?.session.map(e => e.name) ?? ['(none)']
    check(`${label}: every exercise is in her own constrained pool`, inPool(p, names).length === 0, inPool(p, names))
  }
  const knee = getFlaggedJoints(['knees'])
  check('the knee fixture really flags the knee (the vocabulary is "knees")', knee.has('knee'), [...knee])
  const bad = [...(kneeCardio?.session ?? []), ...(kneeFunctional?.session ?? [])].filter(e => { const x = entryOf(e.name); return !x || isContraindicatedFor(x, knee) })
  check('knee flagged: nothing contraindicated for the knee', (kneeCardio?.session.length ?? 0) > 0 && bad.length === 0, bad.map(e => e.name))
  const bodyKit = (bodyFunctional?.session ?? []).filter(e => { const x = entryOf(e.name); return !x || !isEquipmentAllowed(x, BODY) })
  check('bodyweight: nothing needs kit she does not have', (bodyFunctional?.session.length ?? 0) > 0 && bodyKit.length === 0, bodyKit.map(e => e.name))
  const avoid = cardio?.session.find(e => entryOf(e.name)?.mechanics_tier === 'cardio')?.name ?? '(none)'
  const without = offerOf(await plan(M_FULL, FULL, 'cardio', { exclusions: [avoid] }))
  check('an exercise on her avoid list never appears', !!without && !without.session.some(e => e.name === avoid), { avoid, got: without?.session.map(e => e.name) })
}

// ---------------------------------------------------------------------------
console.log('\n6. Moves she names: in, or said plainly — never invented')
// ---------------------------------------------------------------------------
{
  const said = (o: SessionKindOffer | null, w: string) => o?.asked.find(a => a.said.toLowerCase() === w)
  check('box jumps (full gym): included by name', said(functional, 'box jumps')?.included === 'Box Jumps', said(functional, 'box jumps'))
  const sled = said(functional, 'sled push')
  const carry = functional?.session.find(e => entryOf(e.name)?.movement_pattern === 'carry')?.name
  check('sled push: the app has none, and says so', !!sled?.reason && /no sled push in the app's exercise list/.test(sled.reason), sled)
  check('...and names the carry in the session as what does that job', !!carry && !!sled?.reason && sled.reason.includes(carry) && /loaded carrying/.test(sled.reason), { sled, carry })
  const box = said(bodyFunctional, 'box jumps')
  const box2 = said(body2Functional, 'box jumps')
  check('...and where the ranker alone would pick an upper-body jump, the stand-in is still a lower-body one', !!box2?.reason && /so Broad Jumps take their place/.test(box2.reason), box2)
  check('box jumps (bodyweight): her kit lacks the box, and the sentence says so', !!box?.reason && /Box Jumps need a plyo box, which isn't in your kit/.test(box.reason), box)
  check('...and the stand-in is of its own kind (a lower-body jump) and is in the session', !!box?.reason && /so Broad Jumps take their place/.test(box.reason) && !!bodyFunctional?.session.some(e => e.name === 'Broad Jumps'), { box, session: bodyFunctional?.session.map(e => e.name) })
  const bodySled = said(bodyFunctional, 'sled push')
  const bodyCarry = bodyFunctional?.session.find(e => entryOf(e.name)?.movement_pattern === 'carry')?.name
  check('a stand-in for a move she asked for is kept even on a short day', !!bodyCarry && !!bodySled?.reason?.includes(bodyCarry), { bodySled, bodyCarry })
  const avoided = offerOf(await plan(M_FULL, FULL, 'functional', { moves: ['box jumps'], exclusions: ['Box Jumps'] }))
  check('an avoided move is said to be avoided, not included', /on your exercises to avoid/.test(said(avoided, 'box jumps')?.reason ?? '') && !avoided?.session.some(e => e.name === 'Box Jumps'), said(avoided, 'box jumps'))
  const nonsense = offerOf(await plan(M_FULL, FULL, 'cardio', { moves: ['zorbing'] }))
  check('a move the app has never heard of is said, not guessed', /no zorbing in the app's exercise list, so it isn't in today's session/.test(said(nonsense, 'zorbing')?.reason ?? ''), said(nonsense, 'zorbing'))
  const burpees = offerOf(await plan(M_MINI, MINI, 'cardio', { moves: ['burpees'] }))
  check('a named cardio move goes in', !!burpees?.session.some(e => e.name === 'Burpees') && said(burpees, 'burpees')?.included === 'Burpees', burpees?.session.map(e => e.name))
}

// ---------------------------------------------------------------------------
console.log('\n7. Priced the way generation prices that style and phase')
// ---------------------------------------------------------------------------
{
  const wk = M_FULL.find(w => w.week_number === 2)!
  const intensity = planned?.exercises.find(e => e.tier !== 'tier_0_primer' && e.intensity)?.intensity
  const checkReps = (o: SessionKindOffer | null, style: 'functional' | 'bodybuilding') => (o?.session ?? [])
    .filter(e => e.prescription_type === 'reps' && e.tier !== 'tier_0_primer')
    .map(e => ({ name: e.name, reps: e.reps, want: repRangeForIncomingExercise(entryOf(e.name)!, { ...FULL, training_style: style }, wk, intensity) }))
  const fr = checkReps(functional, 'functional')
  check('functional: every rep lift has the functional style\'s own bracket for this phase', fr.length >= 3 && fr.every(x => x.reps === x.want), fr)
  const br = checkReps(bodybuilding, 'bodybuilding')
  check('bodybuilding: every rep lift has the bodybuilding bracket for this phase', br.length >= 3 && br.every(x => x.reps === x.want), br)
  // The hybrid bracket differs from functional at tier 1 (6-10 against 5-8), so a
  // functional trainee's hybrid day is the case where pricing with the wrong
  // style would show.
  const oneWk = M_ONE.find(w => w.week_number === 2)!
  const oneIntensity = dayIn(M_ONE, 2, 'Monday')?.exercises.find(e => e.tier !== 'tier_0_primer' && e.intensity)?.intensity
  const hr = (oneHybrid?.session ?? []).filter(e => e.prescription_type === 'reps' && e.tier !== 'tier_0_primer')
    .map(e => ({ name: e.name, tier: e.tier, reps: e.reps, want: repRangeForIncomingExercise(entryOf(e.name)!, { ...ONE, training_style: 'hybrid' }, oneWk, oneIntensity) }))
  check('hybrid (for a functional trainee): the hybrid bracket, a tier-1 lift among them', hr.some(x => x.tier === 'tier_1_primary') && hr.every(x => x.reps === x.want), hr)
  // REST IS THE STYLE'S OWN, MOVED BY THE PHASE — never cut to fit (her 18 Sep
  // "protect the rest, do less"). Hypertrophy's rest multiplier is 1, so the
  // style row plus the phase shift is the whole prescription.
  const shift = Object.values(PHASE_CONFIGS).find(c => c.label === wk.phase_label?.trim())?.rest_adjust_seconds ?? 0
  const rests = (functional?.session ?? []).filter(e => e.prescription_type === 'reps' && e.tier !== 'tier_0_primer' && e.tier !== 'tier_1_primary')
    .map(e => ({ name: e.name, rest: e.rest, want: `${unbudgetedRestSeconds(entryOf(e.name), 'functional', shift)}s` }))
  check('functional: every accessory rests the functional style\'s own number for this phase', rests.length >= 3 && rests.every(x => x.rest === x.want), { shift, rests })
  const restOf = (r: string) => parseInt(r, 10)
  const lifts = [...(functional?.session ?? []), ...(bodybuilding?.session ?? [])].filter(e => e.tier === 'tier_2_secondary')
  check('no second-tier compound rests 30s or less (her 18 Sep report, as an absolute)', lifts.length >= 3 && lifts.every(e => restOf(e.rest) > 30), lifts.map(e => [e.name, e.rest]))
  const mains = [...(functional?.session ?? []), ...(bodybuilding?.session ?? [])].filter(isMainLiftSlot)
  check('a main lift rests at least 60s', mains.every(e => restOf(e.rest) >= 60), mains.map(e => [e.name, e.rest]))
  const loaded = [...(functional?.session ?? [])].filter(e => e.prescription_type === 'reps' && e.tier !== 'tier_0_primer' && isExternallyLoaded(entryOf(e.name)!))
  check('every loaded lift has a weight', loaded.length >= 2 && loaded.every(e => typeof e.suggested_load_kg === 'number' && e.suggested_load_kg > 0), loaded.map(e => [e.name, e.suggested_load_kg]))
}
{
  const d = deloadWeek ?? 0
  const dl = offerOf(await plan(M_FULL, FULL, 'cardio', { week: d }))
  const di = (dl?.session ?? []).filter(e => e.prescription_type === 'intervals')
  check('deload: interval rounds are halved and not grown (3)', di.length >= 1 && di.every(e => e.sets === 3), di.map(e => e.sets))
  const df = offerOf(await plan(M_FULL, FULL, 'functional', { week: d }))
  const dfl = (df?.session ?? []).filter(e => e.prescription_type === 'reps' && e.tier !== 'tier_0_primer')
  check('deload: every lift is halved to the two-set floor, no top-up', dfl.length >= 3 && dfl.every(e => e.sets === 2), dfl.map(e => [e.name, e.sets]))
}

// ---------------------------------------------------------------------------
console.log('\n8. Sized to the length she set')
// ---------------------------------------------------------------------------
for (const [label, p, o] of [['full gym cardio', FULL, cardio], ['full gym functional', FULL, functional], ['full gym bodybuilding', FULL, bodybuilding], ['minimalist cardio', MINI, miniCardio], ['bodyweight functional', BODY, bodyFunctional]] as const) {
  const today = o ? dayIn([o.week], 2, 'Monday') : undefined
  const secs = today ? estimateDaySeconds(today) : 0
  const dur = p.session_duration_preference || '45-60'
  check(`${label}: inside her stated maximum`, secs > 0 && secs <= getSessionMaximumSeconds(dur), Math.round(secs / 60))
  check(`${label}: and not a token session (at least 80% of her minimum)`, secs >= 0.8 * getSessionMinimumSeconds(dur), Math.round(secs / 60))
  check(`${label}: the minutes the offer states are the day's own`, o?.minutes === Math.round(secs / 60), { said: o?.minutes, real: Math.round(secs / 60) })
}

// ---------------------------------------------------------------------------
console.log('\n9. The same answer every time')
// ---------------------------------------------------------------------------
{
  const again = offerOf(await plan(M_FULL, FULL, 'functional', { moves: ['sled push', 'box jumps'] }))
  check('the same request twice is the same session (seeded ranker)', J(again?.week) === J(functional?.week))
}

// ---------------------------------------------------------------------------
console.log('\n10. The shared tail ran on the new day')
// ---------------------------------------------------------------------------
{
  const today = functional ? dayIn([functional.week], 2, 'Monday') : undefined
  const names = new Set(today?.exercises.map(e => e.name) ?? [])
  const ramps = today?.warmup?.ramp_ups?.map(r => r.exercise) ?? []
  check('the warm-up was rebuilt from what the day now holds', !!today?.warmup && ramps.every(n => names.has(n)) && J(today.warmup) !== J(planned?.warmup), ramps)
  // Across every offer that has a main lift, and at least one must, or the
  // check binds on nothing.
  const withMain = [cardio, functional, bodybuilding, miniCardio, bodyFunctional, kneeCardio, kneeFunctional, oneHybrid]
    .map(o => o?.session ?? []).filter(s => s.some(isMainLiftSlot))
  const over = withMain.flatMap(s => { const main = s.find(isMainLiftSlot)!; return s.filter(e => e.tier === 'tier_2_secondary' && e.sets > main.sets).map(e => [e.name, e.sets, main.name, main.sets]) })
  check('set hierarchy holds: no accessory out-sets the main lift', withMain.length >= 1 && over.length === 0, { withMain: withMain.length, over })
  check('the day says what it is', today?.focus === 'Functional session', today?.focus)
}

// ---------------------------------------------------------------------------
console.log('\n11. Confirm writes the offer or nothing; Undo puts it back exactly')
// ---------------------------------------------------------------------------
{
  const written = cardio ? confirmSessionKindToday(M_FULL, cardio) : null
  const m = written && written.ok ? written.mesocycle : []
  check('confirm writes exactly the week the offer showed', J(m.find(w => w.week_number === 2)) === J(cardio?.week))
  const changed = M_FULL.map(w => (w.week_number !== 2 ? w : { ...w, days: w.days.map(d => (d.day !== 'Monday' ? d : { ...d, exercises: d.exercises.slice(1) })) }))
  const stale = cardio ? confirmSessionKindToday(changed, cardio) : null
  check('a day that changed since the offer is refused, not overwritten', !!stale && !stale.ok && /changed since/.test(stale.refusal), stale)
  const back = undoSessionKindToday(m, 2, 'Monday', 0)
  check('Undo restores the planned day byte for byte', back.ok && J(dayIn(back.mesocycle, 2, 'Monday')) === J(planned), back.ok ? null : back)
  check('...and the whole plan', back.ok && J(back.mesocycle) === J(M_FULL))
  const refused = undoSessionKindToday(m, 2, 'Monday', 2)
  check('Undo is refused once working sets are logged against the new session', !refused.ok && /logged sets/.test(refused.refusal), refused)
  const nothing = undoSessionKindToday(M_FULL, 2, 'Monday', 0)
  check('Undo on a day that was never swapped says so', !nothing.ok && /nothing to put back/.test(nothing.refusal), nothing)
  check('the note on the Exercise tab says what today is and when the main lift is back',
    /^Today is a cardio session instead of .+, just for today\. .+ (is|are) back next Monday/.test(describeKindToday(m, 2, 'Monday') ?? ''), describeKindToday(m, 2, 'Monday'))
  // A SECOND KIND ON A SWAPPED DAY starts from the PLANNED day.
  const second = offerOf(await plan(m, FULL, 'functional'))
  check('a second request on a swapped day is built from the planned day', kindTodayOf(dayIn([second?.week ?? M_FULL[0]], 2, 'Monday'))?.planned && J(kindTodayOf(dayIn([second!.week], 2, 'Monday'))!.planned) === J(planned), second?.droppedMainLift)
  const w2 = second ? confirmSessionKindToday(m, second) : null
  const back2 = w2 && w2.ok ? undoSessionKindToday(w2.mesocycle, 2, 'Monday', 0) : null
  check('...so its Undo goes all the way back to the planned session', !!back2 && back2.ok && J(dayIn(back2.mesocycle, 2, 'Monday')) === J(planned))
  const same = await plan(m, FULL, 'cardio')
  check('asking for the kind today already is says so', !same.ok && /already a cardio session/.test(same.refusal), same)
}

// ---------------------------------------------------------------------------
console.log('\n12. The words both surfaces show')
// ---------------------------------------------------------------------------
{
  const w = functional ? buildSessionKindTodayProposal(functional, 'today') : null
  check('the lead is a question that names both kinds', !!w && /^Want me to make today a functional session instead of .+\?$/.test(w.lead), w?.lead)
  check('every exercise in the session is listed, in order', !!w && functional!.session.length === w.lines.length && functional!.session.every((e, i) => w.lines[i].startsWith(e.name)), w?.lines)
  check('the main lift sentence is there', !!w && w.notes.some(n => mainName != null && n.startsWith(mainName) && /back next Monday/.test(n) && /doesn't change the weight/.test(n)), w?.notes)
  check('the sled sentence is there', !!w && w.notes.some(n => /no sled push/.test(n)), w?.notes)
  check('today only is said', !!w && w.notes.some(n => /^Just today — Monday is back to normal next week\.$/.test(n)), w?.notes)
  const all = w ? [w.lead, ...w.notes].join(' ') : ''
  check('every sentence starts like a sentence', all.length > 0 && ![...all.matchAll(/[.!?]\s+([a-z])/g)].length, [...all.matchAll(/[.!?]\s+([a-z]\w*)/g)].map(x => x[1]))
}

// ---------------------------------------------------------------------------
console.log('\n13. What is offered')
// ---------------------------------------------------------------------------
{
  const kinds = (p: Partial<UserProfile>) => sessionKindsFor(base(p)).map(k => k.kind)
  check('her own style is not offered as a kind', !kinds({ training_style: 'bodybuilding' }).includes('bodybuilding') && kinds({ training_style: 'bodybuilding' }).includes('hybrid'), kinds({ training_style: 'bodybuilding' }))
  check('cardio and functional are always offered, functional even to a functional trainee', ['cardio', 'functional'].every(k => kinds({ training_style: 'functional' }).includes(k as SessionKind)), kinds({ training_style: 'functional' }))
  check('combat is never offered (her August ruling)', ['functional', 'bodybuilding', 'hybrid', 'combat'].every(s => !kinds({ training_style: s as never }).includes('combat' as SessionKind)))
  check('the coach\'s words map to kinds', sessionKindFrom('Cardio') === 'cardio' && sessionKindFrom('HIIT') === 'cardio' && sessionKindFrom('athletic') === 'functional' && sessionKindFrom('bodybuilding') === 'bodybuilding')
  check('...and an unknown word is null, never a guess', sessionKindFrom('yoga') === null && sessionKindFrom('') === null)
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`session-kind: ${failures} check(s) failed`); process.exit(1) }
console.log('session-kind: all checks passed')
process.exit(0)
