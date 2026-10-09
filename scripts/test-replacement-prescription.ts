/**
 * A replacement is prescribed as ITSELF — its own rep bracket, and a weight
 * worked out for those reps on its own implement.
 *
 * Test log M32, 9 Oct 2026. Banning a band kickback put Overhead Tricep
 * Extension in its place at "3x16-19, ~22kg" for someone whose heaviest
 * dumbbell is 24kg. Reproduced exactly, and it was two defects:
 *
 *   1. THE REP RANGE CAME FROM THE OUTGOING SLOT. A slot's `reps` is not "the
 *      block's range" — it is that range after the outgoing lift's own levers
 *      have worked on it (a weightless lift walks a rep a week; a frozen
 *      weight buys reps). So a bodyweight step-up took over a walking lunge's
 *      11-13 beside 10-12 neighbours, and the weight of every replacement was
 *      priced for a range that was not its own.
 *   2. THE WEIGHT WAS A PUSHDOWN'S. One fraction priced every triceps
 *      isolation; a single dumbbell held overhead in two hands was costed as a
 *      cable pushdown, and only the person's own stated limit kept it on the
 *      rack.
 *
 * WHAT THIS HOLDS
 *   [1] the rule is generation's own: for slots generation itself wrote, the
 *       helper returns what generation printed.
 *   [2] the tester's row, by name.
 *   [3] every replacement path — swap, ban, injury adaptation, session
 *       rebuild — leaves each replaced slot with its own range AND a weight
 *       priced for exactly that range.
 *   [4] the single-dumbbell triceps estimate sits below the cable one.
 *   [5] what is deliberately unchanged: sets and rest stay the slot's; a hold
 *       swapped for a hold keeps this week's figures; an ADD still copies its
 *       peer; an unreadable phase is said out loud, not guessed at.
 */
import { generateExercisePlan, generateMesocycle, repRangeForIncomingExercise, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { prescribeLoad, isExternallyLoaded, categorize, loadingMode, getEquipmentFloorKg, DELOAD_LOAD_FRACTION } from '../src/lib/load-prescription'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { applyReplacement, banExerciseFromMesocycle, swapExerciseInMesocycle, replacementProgramming, buildReplacementSlot, getReplacementCandidates } from '../src/lib/mesocycle-edit'
import { substituteForInjury } from '../src/lib/plan-adaptations'
import { rebuildDayAroundMainLift } from '../src/lib/session-rebuild'
import type { Exercise, MesocycleWeek, UserProfile } from '../src/lib/types'
import { untrainedPlanContext } from '../src/lib/plan-adaptations'
// These gates address whole plan weeks on a plan nobody has trained on: every
// row of the named weeks, and no day protected. (A live plan addresses days by
// date and loads the real guard — see test:adaptations-respect-trained.)
const GATE_CONTEXT = untrainedPlanContext({ planCreatedAt: new Date(2026, 0, 5).toISOString(), today: '2026-01-05', moves: [] })
const rowsOfWeeks = (m: { week_number: number; days: { day: string }[] }[], weeks: number[]) =>
  m.filter(w => weeks.includes(w.week_number)).flatMap(w => w.days.map(d => ({ weekNumber: w.week_number, dayName: d.day })))

let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra)}` : ''}`) }
}

const base = {
  age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate',
  preferred_time: 'evening', bmr: 1800, tdee: 2600, workout_split_preference: 'ai_recommendation',
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate', created_at: '2026-10-05T00:00:00.000Z',
}
const days = (names: string[]) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  .map(day => ({ day, available: names.includes(day) }))
const SAM_DAYS = days(['Monday', 'Tuesday', 'Thursday', 'Saturday'])
/** The tester: minimalist, bodybuilding, 30-45 min, intermediate, shoulder flag, fat loss, 24kg dumbbells. */
const sam = (over: Record<string, unknown> = {}) => ({
  ...base, fitness_goal: 'fat_loss', equipment_access: 'minimalist', injuries: ['shoulders'], training_style: 'bodybuilding',
  training_experience: 'intermediate', session_duration_preference: '30-45', max_dumbbell_kg: 24, training_days: SAM_DAYS, ...over,
}) as unknown as UserProfile
function build(p: UserProfile, seed: string): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(seed))
  try { return generateMesocycle(p, generateExercisePlan(p, []).plan) } finally { resetRandomSource() }
}
const silenced = <T>(fn: () => T): T => { const w = console.warn; console.warn = () => {}; try { return fn() } finally { console.warn = w } }
const lever = (name: string) => {
  const e = getExerciseEntry(name)!
  return e.mechanics_tier === 'primer' ? 'primer' : (isExternallyLoaded(e) && categorize(e) != null) ? 'loaded' : 'bodyweight'
}

async function main() {
  // -------------------------------------------------------------------------
  console.log('\n[1] The rule is generation\'s own arithmetic')
  // -------------------------------------------------------------------------
  // For every rep-counted slot generation wrote, ask the helper what THAT
  // exercise should get in THAT week and compare with what was printed. The
  // frozen-weight rep bump is the one lever deliberately left out (it is
  // earned by a named lift across a block, and a lift that arrived today has
  // earned nothing), so slots carrying one are set aside and counted.
  const tally: Record<string, { n: number; same: number; bad: string[] }> = {}
  const note = (k: string, same: boolean, why: string) => {
    const t = tally[k] ??= { n: 0, same: 0, bad: [] }
    t.n++; if (same) t.same++; else if (t.bad.length < 4) t.bad.push(why)
  }
  let bumped = 0
  const loadedMismatchNotARamp: string[] = []
  const deloadOff: string[] = []
  let deloadFour = 0
  let plans = 0
  for (const equipment_access of ['bodyweight', 'minimalist', 'home_gym', 'full_gym'])
    for (const fitness_goal of ['hypertrophy', 'fat_loss', 'conditioning'])
      for (const training_experience of ['beginner', 'intermediate'])
        for (const training_style of ['bodybuilding', 'hybrid']) {
          const p = { ...base, fitness_goal, equipment_access, injuries: [], training_style, training_experience,
            session_duration_preference: '45-60', training_days: SAM_DAYS } as unknown as UserProfile
          const meso = silenced(() => build(p, `replacement-prescription:${equipment_access}:${fitness_goal}:${training_experience}:${training_style}`))
          plans++
          for (const w of meso) for (const d of w.days) for (const e of d.exercises) {
            const entry = getExerciseEntry(e.name)
            if (!entry || (entry.prescription_type ?? 'reps') !== 'reps') continue
            if (e.rep_bump === 'bought' || e.rep_bump === 'capped' || e.rep_bump === 'matched') { bumped++; continue }
            const mine = silenced(() => repRangeForIncomingExercise(entry, p, w, e.intensity))
            const where = `${e.name} wk${w.week_number} printed ${e.reps}, helper ${mine} [${equipment_access}/${fitness_goal}/${training_experience}/${training_style}]`
            const key = `${w.is_deload ? 'deload' : 'loading'}/${lever(e.name)}`
            note(key, mine === e.reps, where)
            const low = (r: string | null) => Number(/^(\d+)/.exec(r ?? '')?.[1] ?? NaN)
            if (mine !== e.reps && key === 'loading/loaded') {
              // The one understood difference: generation asks "is a notch too
              // big a jump" of the block's BASELINE weight, and has none for a
              // lift it rotated in this week; the helper asks it of the lift's
              // own starting estimate. So the helper may walk the reps
              // (week-in-block minus one) where generation held them.
              if (low(mine) - low(e.reps) !== (w.week_in_block ?? 1) - 1) loadedMismatchNotARamp.push(where)
            }
            // Two reps is the cut the helper cannot see. FOUR happens for an
            // understood reason: generation's weight for a lift nobody has
            // logged is still climbing toward its estimate (the calibration
            // week, then one small step a week), so a light curl or an empty
            // bar there is "already at the lightest thing that exists" and its
            // deload cuts reps instead of weight. A lift that has just been
            // swapped in is priced at its estimate, is NOT at that floor, and
            // so takes 30% off the weight and eases the reps up — a different
            // deload, and a self-consistent one. Never more than four.
            const gap = Math.abs(low(mine) - low(e.reps))
            if (mine !== e.reps && w.is_deload && gap > 4) deloadOff.push(where)
            if (mine !== e.reps && w.is_deload && gap > 2) deloadFour++
          }
        }
  const pct = (k: string) => tally[k] ? tally[k].same / tally[k].n : NaN
  console.log(`     ${plans} plans; ` + Object.entries(tally).map(([k, t]) => `${k} ${t.same}/${t.n}`).join(', ') + `; ${bumped} bumped slots set aside`)
  check('there was enough of each kind to mean something', plans === 48 && (tally['loading/bodyweight']?.n ?? 0) > 2000 && (tally['loading/loaded']?.n ?? 0) > 2000 && (tally['loading/primer']?.n ?? 0) > 1000, Object.fromEntries(Object.entries(tally).map(([k, t]) => [k, t.n])))
  check('a weightless lift in a loading week: EXACTLY what generation printed, every time', pct('loading/bodyweight') === 1, tally['loading/bodyweight']?.bad)
  check('a warm-up move in a loading week: exactly what generation printed', pct('loading/primer') === 1, tally['loading/primer']?.bad)
  check('a loaded lift in a loading week: what generation printed at least 95% of the time', pct('loading/loaded') >= 0.95, { pct: pct('loading/loaded'), eg: tally['loading/loaded']?.bad })
  check('...and every difference is the one understood kind (reps walked where a notch is too big a jump)', loadedMismatchNotARamp.length === 0, loadedMismatchNotARamp.slice(0, 4))
  check('a loaded lift on a deload: at least 93%', pct('deload/loaded') >= 0.93, { pct: pct('deload/loaded'), eg: tally['deload/loaded']?.bad })
  check('a weightless lift on a deload: at least 88% (the two-rep cut it cannot see)', pct('deload/bodyweight') >= 0.88, { pct: pct('deload/bodyweight'), eg: tally['deload/bodyweight']?.bad })
  check('...and never more than four reps away on any deload', deloadOff.length === 0, deloadOff.slice(0, 4))
  check(`...with the four-rep kind staying rare (${deloadFour} of ${(tally['deload/loaded']?.n ?? 0) + (tally['deload/bodyweight']?.n ?? 0)} deload slots, under 3%)`, deloadFour / ((tally['deload/loaded']?.n ?? 0) + (tally['deload/bodyweight']?.n ?? 0)) < 0.03, deloadFour)

  // -------------------------------------------------------------------------
  console.log('\n[2] The tester\'s row: banning the band kickback')
  // -------------------------------------------------------------------------
  // His plan was built WITH the shoulder flag and the ban was made after he
  // had cleared it, which is why Overhead Tricep Extension was on offer.
  const samPlan = silenced(() => build(sam(), 'sam:2'))
  const cleared = sam({ injuries: [] })
  const wk2Before = samPlan.find(w => w.week_number === 2)!.days.find(d => d.day === 'Monday')!.exercises.find(e => e.name === 'Band Tricep Kickback')
  check('the plan has the band kickback on Monday, walked up to 16-19', wk2Before?.reps === '16-19', wk2Before?.reps)
  const banned = await silencedAsync(() => banExerciseFromMesocycle({ mesocycle: samPlan, profile: cleared, bannedName: 'Band Tricep Kickback', exclusions: ['Band Tricep Kickback'] }))
  const ote = getExerciseEntry('Overhead Tricep Extension')!
  const rows = banned.flatMap(w => w.days.flatMap(d => d.exercises.filter(e => e.name === 'Overhead Tricep Extension').map(e => ({ w, e }))))
  check('Overhead Tricep Extension came in for it', rows.length >= 2, rows.length)
  const heavy = rows.filter(r => (r.e.suggested_load_kg ?? 0) > 16).map(r => `wk${r.w.week_number} ${r.e.reps} ${r.e.suggested_load}`)
  check('never above 16kg for this 82kg intermediate (it was ~22kg, two kilos under his heaviest dumbbell)', heavy.length === 0, heavy)
  const wk2 = rows.find(r => r.w.week_number === 2)
  check('week 2 reads 3 sets at about 14kg', wk2?.e.sets === 3 && wk2?.e.suggested_load_kg === 14, wk2 && { sets: wk2.e.sets, kg: wk2.e.suggested_load_kg, reps: wk2.e.reps })
  const notOwn = rows.filter(r => r.e.reps !== repRangeForIncomingExercise(ote, cleared, r.w, r.e.intensity)).map(r => `wk${r.w.week_number} ${r.e.reps}`)
  check('every week\'s rep range is the extension\'s own for that week', notOwn.length === 0, notOwn)

  // -------------------------------------------------------------------------
  console.log('\n[3] Every replacement path: own range, and a weight priced for THAT range')
  // -------------------------------------------------------------------------
  let deloadsSeen = 0
  const heavyDeloads: string[] = []
  let calibrationSeen = 0
  const heavyCalibration: string[] = []
  const inspect = (label: string, before: MesocycleWeek[], after: MesocycleWeek[], p: UserProfile, minSlots: number) => {
    const wrongReps: string[] = []
    const wrongPrice: string[] = []
    const offPeers: string[] = []
    let seen = 0
    for (const w of after) {
      const was = before.find(x => x.week_number === w.week_number)!
      // What generation gave an untouched lift of each lever class and tier
      // this week — the independent yardstick, read off the plan, not off the
      // helper under test.
      const peers = new Map<string, Set<string>>()
      for (const d of was.days) for (const e of d.exercises) {
        const en = getExerciseEntry(e.name)
        if (!en || (en.prescription_type ?? 'reps') !== 'reps' || e.rep_bump || e.load_hold === 'unaffordable_step') continue
        const k = `${e.tier}|${lever(e.name)}`
        peers.set(k, (peers.get(k) ?? new Set()).add(e.reps))
      }
      for (const d of w.days) {
        const wasDay = was.days.find(x => x.day === d.day)!
        const wasNames = new Set(wasDay.exercises.map(e => e.name))
        for (const e of d.exercises) {
          if (wasNames.has(e.name)) continue
          const entry = getExerciseEntry(e.name)!
          seen++
          if ((entry.prescription_type ?? 'reps') === 'reps') {
            const own = repRangeForIncomingExercise(entry, p, w, e.intensity)
            if (e.reps !== own) wrongReps.push(`${label} wk${w.week_number} ${d.day} ${e.name}: ${e.reps}, own ${own}`)
            const peer = peers.get(`${e.tier}|${lever(e.name)}`)
            // Loading weeks only: on a deload generation splits these lifts by a
            // different question (is there a weight to take OFF), so one tier's
            // weightless lifts do not all share a range there.
            if (!w.is_deload && lever(e.name) === 'bodyweight' && peer && peer.size === 1 && !peer.has(e.reps)) offPeers.push(`${label} wk${w.week_number} ${d.day} ${e.name}: ${e.reps}, its untouched neighbours ${[...peer]}`)
          }
          if (e.tier === 'tier_1_primary' || entry.mechanics_tier === 'primer') continue
          const full = prescribeLoad(entry, p, { targetRpeLabel: e.intensity, isFirstBlock: false, sets: e.sets, repRangeLabel: e.reps, isCalibrationWeek: w.isCalibrationWeek === true })
          // A deload week is 70% of that, floored at the lightest thing that
          // exists — generation's rule for a slot with no week-3 number.
          const priced = w.is_deload && full.starting_weight_kg != null
            ? prescribeLoad(entry, p, { targetRpeLabel: e.intensity, isFirstBlock: false, sets: e.sets, repRangeLabel: e.reps, forceStartingWeightKg: full.starting_weight_kg * DELOAD_LOAD_FRACTION })
            : full
          if (priced.starting_weight_kg !== (e.suggested_load_kg ?? null)) wrongPrice.push(`${label} wk${w.week_number} ${d.day} ${e.name} ${e.reps}: shows ${e.suggested_load_kg}, priced for its reps ${priced.starting_weight_kg}`)
          if (w.isCalibrationWeek && e.suggested_load_kg != null) {
            // Read off the plan again: the same lift, same place, the week after.
            const next = after.find(x => x.week_number === w.week_number + 1)?.days.find(x => x.day === d.day)?.exercises.find(x => x.name === e.name)
            if (next?.suggested_load_kg != null) {
              calibrationSeen++
              if (!(e.suggested_load_kg < next.suggested_load_kg || e.suggested_load_kg <= getEquipmentFloorKg(entry))) heavyCalibration.push(`${label} ${e.name}: calibration week ${e.suggested_load_kg}kg, the week after ${next.suggested_load_kg}kg`)
            }
          }
          if (w.is_deload && e.suggested_load_kg != null) {
            deloadsSeen++
            // Read off the PLAN, not re-derived: the same lift in the week
            // before, in the same place.
            const prev = after.find(x => x.week_number === w.week_number - 1)?.days.find(x => x.day === d.day)?.exercises.find(x => x.name === e.name)
            const floor = getEquipmentFloorKg(entry)
            if (prev?.suggested_load_kg != null && !(e.suggested_load_kg < prev.suggested_load_kg || e.suggested_load_kg <= floor)) {
              heavyDeloads.push(`${label} ${e.name}: wk${w.week_number - 1} ${prev.suggested_load_kg}kg, deload ${e.suggested_load_kg}kg`)
            }
          }
        }
      }
    }
    check(`${label}: there were replaced slots to inspect (${seen})`, seen >= minSlots, seen)
    check(`${label}: every replaced rep-counted slot has its own range`, wrongReps.length === 0, wrongReps.slice(0, 4))
    check(`${label}: a weightless replacement matches its untouched weightless neighbours`, offPeers.length === 0, offPeers.slice(0, 4))
    check(`${label}: every weight was priced for the reps on the slot`, wrongPrice.length === 0, wrongPrice.slice(0, 4))
  }

  // (a) injury adaptation — the tester's knee card.
  const kneeProfile = sam()
  const knee = await silencedAsync(() => substituteForInjury({ mesocycle: samPlan, profile: kneeProfile, injuryCode: 'knees', targetDays: rowsOfWeeks(samPlan, [1, 2]), exclusions: [], context: GATE_CONTEXT }))
  inspect('knee adaptation', samPlan, knee.mesocycle, kneeProfile, 8)
  const stepUp = knee.mesocycle.find(w => w.week_number === 2)!.days.find(d => d.day === 'Thursday')!.exercises.find(e => e.name === 'Low Box Step-Up')
  check('the step-up that replaced a walking lunge reads 10-12, not the lunge\'s bought 11-13', stepUp?.reps === '10-12', stepUp?.reps)

  // (b) a ban, on a full-gym plan so loaded lifts replace loaded lifts.
  const gymProfile = { ...base, fitness_goal: 'hypertrophy', equipment_access: 'full_gym', injuries: [], training_style: 'bodybuilding',
    training_experience: 'intermediate', session_duration_preference: '45-60', training_days: SAM_DAYS } as unknown as UserProfile
  const gymPlan = silenced(() => build(gymProfile, 'replacement-prescription:gym'))
  const counts = new Map<string, number>()
  for (const w of gymPlan) for (const d of w.days) for (const e of d.exercises) if (e.tier === 'tier_3_isolation' || e.tier === 'tier_2_secondary') counts.set(e.name, (counts.get(e.name) ?? 0) + 1)
  const mostUsed = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const gymBanned = await silencedAsync(() => banExerciseFromMesocycle({ mesocycle: gymPlan, profile: gymProfile, bannedName: mostUsed, exclusions: [mostUsed] }))
  inspect(`ban of ${mostUsed}`, gymPlan, gymBanned, gymProfile, 4)

  // (c) a manual swap for the rest of the block: a LOADED accessory swapped
  // for a weightless one, and the reverse — the two directions the old code
  // got wrong.
  const wk1 = gymPlan.find(w => w.week_number === 1)!
  let swapped = 0
  for (const d of wk1.days) for (let i = 0; i < d.exercises.length && swapped < 2; i++) {
    const slot = d.exercises[i]
    if (slot.tier !== 'tier_2_secondary' && slot.tier !== 'tier_3_isolation') continue
    const wantLoaded = swapped === 1
    if ((lever(slot.name) === 'loaded') === wantLoaded) continue
    const pick = getReplacementCandidates(slot.name, { ...gymProfile, equipment_access: 'full_gym' } as UserProfile, [])
      .find(c => (c.exercise.prescription_type ?? 'reps') === 'reps' && (lever(c.exercise.name) === 'loaded') === wantLoaded && !d.exercises.some(e => e.name === c.exercise.name))
    if (!pick) continue
    const after = await silencedAsync(() => swapExerciseInMesocycle({ mesocycle: gymPlan, profile: gymProfile, currentWeekNumber: 1, dayName: d.day, exIndex: i, newExercise: pick.exercise, scope: 'permanent' }))
    inspect(`swap ${slot.name} -> ${pick.exercise.name} (${wantLoaded ? 'weightless to loaded' : 'loaded to weightless'})`, gymPlan, after, gymProfile, 2)
    swapped++
  }
  check('both swap directions were exercised', swapped === 2, swapped)

  // (d) session rebuild.
  const rebuildDay = wk1.days.find(d => d.exercises.length >= 4)!
  const rebuilt = await silencedAsync(() => rebuildDayAroundMainLift({ mesocycle: gymPlan, profile: gymProfile, weekNumber: 1, dayName: rebuildDay.day, exclusions: [] }))
  check('the rebuild changed something', rebuilt.changed === true, rebuilt.replaced?.length)
  inspect('session rebuild', gymPlan, rebuilt.mesocycle, gymProfile, 2)

  // A DELOAD STAYS A DELOAD, for a lift that was swapped in. Found while
  // building this gate: a swap "for the rest of the block" wrote the recovery
  // week at the full working weight.
  check(`replaced, weighted slots on a deload week were seen (${deloadsSeen})`, deloadsSeen >= 3, deloadsSeen)
  check('...and each is lighter than the same lift the week before (or already at the lightest thing that exists)', heavyDeloads.length === 0, heavyDeloads.slice(0, 4))

  // AND THE CALIBRATION WEEK STAYS LIGHT. Every unverified weight generation
  // prints in week 1 starts deliberately under its estimate; a lift swapped in
  // that week is just as unverified and used to be written at the full figure.
  check(`replaced, weighted slots in the calibration week were seen (${calibrationSeen})`, calibrationSeen >= 3, calibrationSeen)
  check('...and each starts lighter than the same lift the week after', heavyCalibration.length === 0, heavyCalibration.slice(0, 4))

  // -------------------------------------------------------------------------
  console.log('\n[4] One dumbbell held overhead is not priced as a cable pushdown')
  // -------------------------------------------------------------------------
  const pushdown = getExerciseEntry('Tricep Pushdowns')!
  const single = EXERCISE_DATABASE.filter(e => !e.retired && categorize(e) === 'isolation_tricep' && loadingMode(e) === 'single_implement')
  check('the catalogue has such a lift, and it is the overhead extension', single.length >= 1 && single.some(e => e.name === 'Overhead Tricep Extension'), single.map(e => e.name))
  const ratios: string[] = []
  for (const training_experience of ['beginner', 'novice', 'intermediate', 'advanced'])
    for (const weight_kg of [60, 82, 105]) {
      const p = { ...base, weight_kg, training_experience, fitness_goal: 'hypertrophy', equipment_access: 'full_gym', injuries: [], training_style: 'hybrid', training_days: SAM_DAYS } as unknown as UserProfile
      const opts = { targetRpeLabel: 'RPE 7-8', sets: 3, repRangeLabel: '10-12' }
      const a = prescribeLoad(ote, p, opts).starting_weight_kg!
      const b = prescribeLoad(pushdown, p, opts).starting_weight_kg!
      // Loose on purpose: both numbers are rounded to a real notch (2kg and
      // 2.5kg), so the 0.65 shows as anything from about a half to four fifths.
      if (!(a < b && a / b >= 0.45 && a / b <= 0.82)) ratios.push(`${training_experience}/${weight_kg}kg: ${a} vs ${b}`)
    }
  check('at every size and experience it is lighter than the pushdown, by roughly a third', ratios.length === 0, ratios)
  const noCeiling = prescribeLoad(ote, sam({ injuries: [], max_dumbbell_kg: undefined }), { targetRpeLabel: 'RPE 7-8', sets: 3, repRangeLabel: '8-12' }).starting_weight_kg
  check('...and it is right without his stated limit to lean on (8-12 reads under 20kg, was ~26)', noCeiling != null && noCeiling < 20, noCeiling)
  // The factor is about ONE implement in ONE category. Its neighbours — the
  // same category on a cable or a bar, and a one-dumbbell lift in another
  // category — must not have moved; pinned by their own figures.
  const im = sam({ injuries: [], max_dumbbell_kg: undefined, equipment_access: 'full_gym' })
  const at = (n: string) => prescribeLoad(getExerciseEntry(n)!, im, { targetRpeLabel: 'RPE 7-8', sets: 3, repRangeLabel: '8-12' }).starting_weight_kg
  check('the cable pushdown and the EZ-bar skull crusher are where they were (25kg)', at('Tricep Pushdowns') === 25 && at('Skull Crushers') === 25, { pushdown: at('Tricep Pushdowns'), skull: at('Skull Crushers') })
  check('a one-implement lift in another category is where it was (Goblet Squats, 32kg)', at('Goblet Squats') === 32, at('Goblet Squats'))
  // ...and the one-dumbbell ISOLATION lift in another category, which is the
  // neighbour a careless widening would actually reach. Held by its relation
  // to its own category's machine rather than by a kilo figure, because that
  // figure is itself in question: Dumbbell Leg Curl is priced exactly as a
  // leg-curl machine (a 48kg dumbbell between the feet for this lifter),
  // reported in BACKLOG as the same defect class and NOT changed here.
  const at15 = (n: string) => prescribeLoad(getExerciseEntry(n)!, im, { targetRpeLabel: 'RPE 7-8', sets: 3, repRangeLabel: '15-18' }).starting_weight_kg!
  check('the factor has not spread to Dumbbell Leg Curl (still within a notch of the leg-curl machine)', Math.abs(at15('Dumbbell Leg Curl') - at15('Lying Leg Curl')) <= 2.5, { dumbbell: at15('Dumbbell Leg Curl'), machine: at15('Lying Leg Curl') })

  // -------------------------------------------------------------------------
  console.log('\n[5] What is deliberately unchanged')
  // -------------------------------------------------------------------------
  const wkAA = samPlan.find(w => w.week_number === 2)!
  const repSlot: Exercise = { name: 'Band Tricep Kickback', sets: 3, reps: '16-19', rest: '45s', substitution: '', prescription_type: 'reps', intensity: 'RPE 6-7', tier: 'tier_3_isolation' }
  const prog = replacementProgramming(repSlot, ote, cleared, wkAA)
  check('sets and rest stay the slot\'s', prog.sets === 3 && prog.rest === '45s', prog)
  const holdSlot: Exercise = { name: 'Plank', sets: 3, reps: '35-50s', rest: '45s', substitution: '', prescription_type: 'time', intensity: 'RPE 6-7', tier: 'tier_3_isolation' }
  check('a hold swapped for a hold keeps THIS week\'s seconds', replacementProgramming(holdSlot, getExerciseEntry('Side Plank')!, cleared, wkAA).reps === '35-50s', replacementProgramming(holdSlot, getExerciseEntry('Side Plank')!, cleared, wkAA))
  // Week 2 of the block, so the hold is one five-second step up — what
  // generation gives a hold that week (test:hold-seconds).
  check('a rep lift swapped for a hold takes THIS week\'s hold (35-50s in week 2)', replacementProgramming(repSlot, getExerciseEntry('Plank')!, cleared, wkAA).reps === '35-50s', replacementProgramming(repSlot, getExerciseEntry('Plank')!, cleared, wkAA))
  const wkDeload = samPlan.find(w => w.is_deload)!
  const twoSets = replacementProgramming({ ...repSlot, sets: 2 }, getExerciseEntry('Plank')!, cleared, wkDeload)
  check('...the base on a deload, and never more sets than the place it took', twoSets.reps === '30-45s' && twoSets.sets === 2, twoSets)
  const fourSets = replacementProgramming({ ...repSlot, sets: 4 }, getExerciseEntry('Plank')!, cleared, wkAA)
  check('...and never more than the canonical three', fourSets.sets === 3, fourSets)
  // The tempo is the WEEK's, not whatever the outgoing lift carried.
  check('the week\'s tempo is offered in a loading week (Adaptation: 2-0-1)', prog.tempo === '2-0-1', prog.tempo)
  check('...and none on a deload', twoSets.tempo === null, twoSets.tempo)
  // RE-ANCHORED 9 Oct 2026, deliberately. This compared the step-up on
  // Thursday AND Saturday, because the tester's Saturday ("Shoulders & Abs")
  // held three leg compounds and the knee adaptation put a step-up there too.
  // That Saturday was the defect the day-purpose work fixed: it now holds one
  // light leg accessory, and no step-up lands on it. The property is
  // unchanged — the tempo is the WEEK's, not the outgoing lift's — and is held
  // on every day the step-up appears: Thursday's replaced a LOADED lunge,
  // which carries no tempo, so a tempo copied from the outgoing lift would
  // read undefined here.
  const stepUps = knee.mesocycle.find(w => w.week_number === 2)!.days
    .flatMap(d => d.exercises.filter(e => e.name === 'Low Box Step-Up').map(e => ({ day: d.day, tempo: e.tempo })))
  check('the step-up carries the week\'s tempo wherever the adaptation put it — it replaced a loaded lunge, which carries none',
    stepUps.length >= 1 && stepUps.every(x => x.tempo === '2-0-1'), stepUps)
  const spanish = knee.mesocycle.find(w => w.week_number === 2)!.days.find(d => d.day === 'Thursday')!.exercises.find(e => e.name === 'Spanish Squat')
  check('...and the Spanish Squat that came in beside it is a 35-50s hold with no tempo', spanish?.reps === '35-50s' && spanish?.tempo === undefined, spanish && { reps: spanish.reps, tempo: spanish.tempo })
  check('a hold swapped for a rep lift takes that lift\'s own range, not a fallback', replacementProgramming(holdSlot, ote, cleared, wkAA).reps === repRangeForIncomingExercise(ote, cleared, wkAA, 'RPE 6-7'), replacementProgramming(holdSlot, ote, cleared, wkAA))
  // The ADD path passes no programming on purpose: an addition has no
  // outgoing exercise and copies a peer (session-edit.ts).
  const added = applyReplacement(repSlot, ote, prescribeLoad(ote, cleared, { targetRpeLabel: 'RPE 6-7', sets: 3, repRangeLabel: '16-19' }), cleared)
  check('applyReplacement with no programming still copies the template (the ADD path)', added.reps === '16-19', added.reps)
  // An unreadable phase is LOUD and keeps the slot's range — never a silent guess.
  const warned: string[] = []
  const realWarn = console.warn
  console.warn = (...a: unknown[]) => { warned.push(a.join(' ')) }
  let fallback: ReturnType<typeof replacementProgramming>
  try { fallback = replacementProgramming(repSlot, ote, cleared, { phase_label: 'A Phase Nobody Wrote', week_in_block: 2, is_deload: false }) } finally { console.warn = realWarn }
  check('an unreadable phase keeps the slot\'s range', fallback.reps === '16-19', fallback)
  check('...and says so', warned.some(m => /no phase/.test(m) && /Overhead Tricep Extension/.test(m)), warned)
  check('the helper itself answers null for it rather than inventing a range', repRangeForIncomingExercise(ote, cleared, { phase_label: 'A Phase Nobody Wrote', week_in_block: 2, is_deload: false }) === null)
  check('...and null for a hold, whose units are fixed elsewhere', repRangeForIncomingExercise(getExerciseEntry('Plank')!, cleared, wkAA) === null)
  // buildReplacementSlot is the three steps in order; held end to end here so
  // a caller that prices with the OUTGOING reps cannot pass.
  const builtSlot = await buildReplacementSlot(repSlot, ote, cleared, wkAA, false)
  const expectKg = prescribeLoad(ote, cleared, { targetRpeLabel: 'RPE 6-7', isFirstBlock: false, sets: 3, repRangeLabel: builtSlot.reps }).starting_weight_kg
  check('buildReplacementSlot prices the weight for the reps it writes', builtSlot.suggested_load_kg === expectKg && builtSlot.reps === prog.reps, { kg: builtSlot.suggested_load_kg, expectKg, reps: builtSlot.reps })
}

async function silencedAsync<T>(fn: () => Promise<T>): Promise<T> {
  const w = console.warn; const l = console.log
  console.warn = () => {}; console.log = () => {}
  try { return await fn() } finally { console.warn = w; console.log = l }
}

main().then(() => {
  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} check(s) FAILED.`); process.exit(1) }
  console.log('All replacement-prescription checks passed.')
}).catch(err => { console.error(err); process.exit(1) })
