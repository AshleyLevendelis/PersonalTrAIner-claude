/**
 * Gate: a second sport on a standing schedule bends the plan around it — and
 * nobody WITHOUT one is touched.
 *
 * Ashley, 5 Sep 2026: "I want to be able to tell the chat something like 'I
 * train in the gym Mon, Tue, Thu, Fri in the mornings but I also do Muay Thai
 * twice a week in the evenings' and have it acknowledge it and create a plan
 * for that." Asked what the plan should DO about two hard evenings, she chose
 * (a): keep the gym days, put the lighter sessions on the class days, keep
 * prescribed cardio off those nights. Not (b) cutting volume.
 *
 * `concurrent_activities` had been a column, a type, and a line in the coach's
 * prompt since July 2026 — written by nothing, read by nothing in generation.
 * This gate is what stops it going quiet again: §1 is the reorder as a unit,
 * §2 is the generator honouring it end to end, §3 is the byte-identity
 * promise, §4 is the field actually being read.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { reorderTracksForClassDays, activityDays, HEAVY_TRACKS, describeActivity, MOVEMENT_DEMANDS, TIMES_OF_DAY, activityCountsAsLoad, countsAsTrainingLoad, effectiveRecoveryCapacity, volumeNotice, countWorkingSets, HARD_ACTIVITY_INTENSITY } from '../src/lib/concurrent-activity'
import type { UserProfile, ConcurrentActivity, MesocycleWeek } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 240)}` : ''}`) }
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const trainingDays = (on: string[]) => DAYS.map(day => ({ day, available: on.includes(day) }))
function profileFor(o: Partial<UserProfile> = {}): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid', training_experience: 'intermediate',
    session_duration_preference: '45-60', workout_split_preference: 'ai_recommendation',
    training_days: trainingDays(['Monday', 'Tuesday', 'Thursday', 'Friday']),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [] as unknown as never,
    macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...o,
  } as UserProfile
}
const MUAY: ConcurrentActivity = { name: 'Muay Thai', intensity: 0.7, days: ['Tuesday', 'Thursday'], movement_demands: ['striking', 'knee_dominant', 'conditioning'], timeOfDay: 'evening' }
const quiet = <T,>(seed: string, f: () => T): T => {
  setRandomSource(seededRngFromKey(seed))
  const l = console.log, d = console.debug, w = console.warn
  console.log = () => {}; console.debug = () => {}; console.warn = () => {}
  try { return f() } finally { console.log = l; console.debug = d; console.warn = w; resetRandomSource() }
}

console.log('\n1. The reorder, as a unit\n')
{
  const days = trainingDays(['Monday', 'Tuesday', 'Thursday', 'Friday']).filter(d => d.available)
  const split = ['Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Upper Pull & Core']
  const { tracks, unavoidable } = reorderTracksForClassDays(days, split, new Set(['Tuesday', 'Thursday']))
  const byDay = Object.fromEntries(days.map((d, i) => [d.day, tracks[i]]))
  check('the one light track lands on a class day', !HEAVY_TRACKS.has(byDay.Tuesday) || !HEAVY_TRACKS.has(byDay.Thursday), byDay)
  check('...and the other class day is reported as unavoidable', unavoidable.length === 1 && ['Tuesday', 'Thursday'].includes(unavoidable[0]), unavoidable)
  check('it is a permutation — same tracks, same count',
    [...tracks].sort().join('|') === [...split].sort().join('|'), tracks)
  check('an empty class set returns the split untouched',
    reorderTracksForClassDays(days, split, new Set()).tracks.join('|') === split.join('|'))
  // Every split shape × every class-day subset: always a permutation, never a
  // dropped or duplicated track. This is what lets the generator trust it.
  let permutations = 0, broken = 0
  const shapes: string[][] = [
    ['Full Body Power', 'Full Body Power', 'Full Body Power'],
    ['Push & Press', 'Squat & Carry', 'Upper Pull & Core', 'Squat & Carry'],
    ['Chest & Triceps', 'Back & Biceps', 'Legs & Calves', 'Shoulders & Abs', 'Chest & Triceps'],
    ['Push & Press', 'Pull & Hinge', 'Squat & Carry', 'Upper Pull & Core', 'Conditioning & Core', 'Full Body Power'],
  ]
  for (const shape of shapes) {
    const ds = DAYS.slice(0, shape.length).map(day => ({ day, available: true }))
    for (let mask = 0; mask < (1 << ds.length); mask++) {
      const cls = new Set(ds.filter((_, i) => mask & (1 << i)).map(d => d.day))
      const { tracks: t } = reorderTracksForClassDays(ds, shape, cls)
      permutations++
      if ([...t].sort().join('|') !== [...shape].sort().join('|')) broken++
    }
  }
  check(`every split shape × every class-day subset is a permutation (${permutations} cases)`, broken === 0, broken)
  check('unknown day spellings are dropped, not guessed', activityDays([{ ...MUAY, days: ['tuesday', 'Thurs', 'Funday'] }]).size === 1)
  check('describeActivity never invents a time of day',
    describeActivity({ ...MUAY, timeOfDay: undefined }) === 'Muay Thai · Tuesday & Thursday'
    && describeActivity(MUAY) === 'Muay Thai · Tuesday & Thursday evenings')
  check('the vocabularies are closed sets a card can validate against',
    (MOVEMENT_DEMANDS as readonly string[]).includes('striking') && (TIMES_OF_DAY as readonly string[]).includes('evening'))
}

console.log("\n2. The generator honours it — Ashley's sentence, end to end\n")
{
  const withMuay = quiet('cat', () => generateExercisePlan(profileFor({ concurrent_activities: [MUAY] })).plan)
  const focusOf = (day: string) => withMuay.find(d => d.day === day)?.focus ?? ''
  const gymDays = withMuay.filter(d => d.exercises.length > 0)
  check('four gym days survive — the classes did not cost a session', gymDays.length === 4, gymDays.map(d => d.day))
  check('a class day carries the lighter session',
    !HEAVY_TRACKS.has(focusOf('Tuesday')) || !HEAVY_TRACKS.has(focusOf('Thursday')), { Tue: focusOf('Tuesday'), Thu: focusOf('Thursday') })
  check('no prescribed cardio on either class day',
    !withMuay.some(d => ['Tuesday', 'Thursday'].includes(d.day) && d.recommendedCardio && !(d.recommendedCardio as { is_filler?: boolean }).is_filler),
    withMuay.filter(d => ['Tuesday', 'Thursday'].includes(d.day)).map(d => [d.day, d.recommendedCardio?.activity]))
  check('...and no rest-day cardio was invented on a class day either',
    !withMuay.some(d => ['Tuesday', 'Thursday'].includes(d.day) && d.focus === 'Active Recovery + Cardio'))
  // The lever is a reordering: same multiset of focuses as without the class.
  const without = quiet('cat', () => generateExercisePlan(profileFor()).plan)
  check('the same sessions exist, on different days',
    without.filter(d => d.exercises.length > 0).map(d => d.focus).sort().join('|') === gymDays.map(d => d.focus).sort().join('|'))
  // Across the whole mesocycle, not just the base week.
  const meso = quiet('cat', () => generateMesocycle(profileFor({ concurrent_activities: [MUAY] })))
  const badWeeks = meso.filter(w => w.days.some(d => ['Tuesday', 'Thursday'].includes(d.day) && d.recommendedCardio && !(d.recommendedCardio as { is_filler?: boolean }).is_filler)).map(w => w.week_number)
  check('holds for all 16 weeks, deloads included', badWeeks.length === 0, badWeeks)
}

console.log('\n3. Nobody without a second sport is touched — byte-identical plans\n')
{
  let same = 0, differ: string[] = []
  const cases: Partial<UserProfile>[] = [
    {}, { training_style: 'combat' }, { training_style: 'functional', training_days: trainingDays(['Monday', 'Wednesday', 'Friday']) },
    { workout_split_preference: 'upper_lower' }, { workout_split_preference: 'full_body', training_experience: 'beginner' },
    { equipment_access: 'minimalist' }, { equipment_access: 'bodyweight', training_days: trainingDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) },
    { fitness_goal: 'conditioning', conditioning_preference: 'love' }, { recovery_capacity: 'low', training_days: trainingDays(DAYS.slice(0, 5)) },
    { training_style: 'bodybuilding', training_days: trainingDays(DAYS.slice(0, 6)) },
  ]
  cases.forEach((c, i) => {
    const a = JSON.stringify(quiet(`bi${i}`, () => generateMesocycle(profileFor(c))))
    const b = JSON.stringify(quiet(`bi${i}`, () => generateMesocycle(profileFor({ ...c, concurrent_activities: [] }))))
    const cUndef = JSON.stringify(quiet(`bi${i}`, () => generateMesocycle(profileFor({ ...c, concurrent_activities: undefined }))))
    if (a === b && b === cUndef) same++; else differ.push(JSON.stringify(c))
  })
  check(`${cases.length} profiles: empty and undefined activities produce identical plans`, differ.length === 0, differ)
  // And a stored row from BEFORE the vocabulary existed — junk in
  // movement_demands, a day nobody spells that way — must not throw or move
  // anything it cannot understand.
  const legacy = { name: 'Old', intensity: 0.5, days: ['someday'], movement_demands: ['???'] } as ConcurrentActivity
  const a = JSON.stringify(quiet('legacy', () => generateMesocycle(profileFor())))
  const b = JSON.stringify(quiet('legacy', () => generateMesocycle(profileFor({ concurrent_activities: [legacy] }))))
  check('a legacy row with no recognisable day changes nothing', a === b)
}

console.log('\n4. The field is read, written, shown, and undoable\n')
{
  const gen = read('src/lib/exercise-plan.ts')
  check('the generator reads concurrent_activities (it did not, for two months)',
    /reorderTracksForClassDays\(availableDays, baseSplit, activityDays\(profile\.concurrent_activities\)\)/.test(gen))
  check('...and keeps rest-day cardio off class days', /!trainingDayNames\.has\(d\) && !classDays\.has\(d\)/.test(gen))
  check('...and post-session cardio too', /&& !classDays\.has\(d\.day\)/.test(gen))
  const exec = read('src/lib/pending-action-executor.ts')
  check('something finally WRITES it', /concurrent_activities: activities/.test(exec) && /export async function executeConcurrentActivity/.test(exec))
  check('...rebuild first, write second', exec.indexOf('rebuildFromCurrentWeek(updated, exclusions, mesocycle, payload.fromWeek)', exec.indexOf('executeConcurrentActivity')) < exec.indexOf('updateProfileField(profile.id, patch)', exec.indexOf('executeConcurrentActivity')))
  const ui = read('src/components/ChatAssistant.tsx')
  check('the card names the class day that still carries a heavy session', /will still carry a heavy one on a class night/.test(ui))
  check('...and validates days and vocabulary rather than trusting the model', /canonicalDay\(String\(d\)\)/.test(ui) && /MOVEMENT_DEMANDS as readonly string\[\]\)\.includes/.test(ui))
  check('undo restores the activity AND its passengers', /concurrent_activities: pre\?\.beforeActivities \?\? \[\]/.test(ui) && /patch\.preferred_time = pre\.beforeTime/.test(ui))
  const prof = read('src/components/ProfileScreen.tsx')
  check('the Profile shows it', /Other training/.test(prof) && /describeActivity\(a\)/.test(prof))
  check('...and removing it offers a rebuild', /'concurrent_activities' in patch/.test(read('src/lib/plan-invalidation.ts')))
  check('both copies of APP_REALITY mention it',
    /other training \(a second sport/.test(read('supabase/functions/_shared/coach-rules.ts')) && /other training \(a second sport/.test(read('supabase/functions/chat-gemini/index.ts')))
}

console.log("\n5. The classes count as training load — Ashley's ruling, 6 Sep 2026\n")
{
  // "Automatically reduce volume by one recovery notch when 2+ sessions or 1
  // hard/combat session are added. Light mobility/yoga only affects
  // scheduling, not volume." Judged per activity.
  const yoga: ConcurrentActivity = { name: 'Yoga', intensity: 0.3, days: ['Monday'], movement_demands: [], timeOfDay: 'evening' }
  const pilates: ConcurrentActivity = { name: 'Pilates', intensity: 0.3, days: ['Wednesday'], movement_demands: [] }
  const oneStriking: ConcurrentActivity = { name: 'Boxing', intensity: 0.4, days: ['Wednesday'], movement_demands: ['striking'] }
  const oneHardRun: ConcurrentActivity = { name: 'Club run', intensity: 0.8, days: ['Saturday'], movement_demands: ['running'] }
  check('two sessions a week count, whatever the effort', activityCountsAsLoad({ ...MUAY, intensity: 0.2, movement_demands: [] }))
  check('one gentle class does not', !activityCountsAsLoad(yoga))
  check('one combat session counts even when the effort was not stated high', activityCountsAsLoad(oneStriking))
  check('one hard session counts', activityCountsAsLoad(oneHardRun))
  check(`the hard line is ${HARD_ACTIVITY_INTENSITY}: at it counts, just under it does not`,
    activityCountsAsLoad({ ...oneHardRun, intensity: HARD_ACTIVITY_INTENSITY }) && !activityCountsAsLoad({ ...oneHardRun, intensity: HARD_ACTIVITY_INTENSITY - 0.01 }))
  check('two different gentle classes do not add up to a notch — the rule is per activity, on purpose', !countsAsTrainingLoad([yoga, pilates]))
  check('an activity with no recognisable day never counts', !activityCountsAsLoad({ ...MUAY, days: ['Funday'] }))
  check('"Revert to full volume" opts that sport out of the notch but not out of the schedule',
    !countsAsTrainingLoad([{ ...MUAY, keep_full_volume: true }]) && activityDays([{ ...MUAY, keep_full_volume: true }]).size === 2)
  const eff = (r: 'low' | 'moderate' | 'high', acts: ConcurrentActivity[]) => effectiveRecoveryCapacity({ recovery_capacity: r, concurrent_activities: acts })
  check('one notch: high -> moderate, moderate -> low, low stays low',
    eff('high', [MUAY]) === 'moderate' && eff('moderate', [MUAY]) === 'low' && eff('low', [MUAY]) === 'low')
  check('...and nothing moves without a qualifying sport', eff('high', []) === 'high' && eff('moderate', [yoga]) === 'moderate' && eff('low', undefined as unknown as ConcurrentActivity[]) === 'low')
  check('the card has nothing to say without one', volumeNotice({ recovery_capacity: 'moderate', concurrent_activities: [yoga] }) === null)
  check('...names the sport when there is one', volumeNotice({ recovery_capacity: 'moderate', concurrent_activities: [MUAY] })?.names.join() === 'Muay Thai')
  check('...and is honest at the floor', volumeNotice({ recovery_capacity: 'low', concurrent_activities: [MUAY] })?.atFloor === true)
  check('...and knows when the person reverted', volumeNotice({ recovery_capacity: 'moderate', concurrent_activities: [{ ...MUAY, keep_full_volume: true }] })?.reverted === true)
}

console.log('\n6. The plan actually does less — and exactly one notch less\n')
{
  const week2 = (m: MesocycleWeek[]) => m.find(w => w.week_number === 2)
  const reverted: ConcurrentActivity = { ...MUAY, keep_full_volume: true }
  const withNotch = quiet('notch', () => generateMesocycle(profileFor({ concurrent_activities: [MUAY] })))
  const fullVolume = quiet('notch', () => generateMesocycle(profileFor({ concurrent_activities: [reverted] })))
  const a = countWorkingSets(week2(fullVolume)), b = countWorkingSets(week2(withNotch))
  // The scorer's own threshold for low vs high (quality-score.ts): at least 15% fewer.
  check(`her week does less lifting with the classes counted (${a} -> ${b} working sets, >=15% fewer)`, a > 0 && b <= a * 0.85, { a, b })
  check('...and the schedule half of the ruling still holds on the reduced plan',
    !withNotch.some(w => w.days.some(d => ['Tuesday', 'Thursday'].includes(d.day) && d.recommendedCardio && !(d.recommendedCardio as { is_filler?: boolean }).is_filler)))
  // EXACTLY the low tier: Muay Thai at moderate is byte-identical to a reverted
  // Muay Thai at low. Anything the notch did beyond "one tier down" fails here.
  const asLow = quiet('notch', () => generateMesocycle(profileFor({ recovery_capacity: 'low', concurrent_activities: [reverted] })))
  check('the notch is exactly one tier — Muay Thai at moderate == reverted Muay Thai at low, byte for byte', JSON.stringify(withNotch) === JSON.stringify(asLow))
  const lowWith = quiet('notch', () => generateMesocycle(profileFor({ recovery_capacity: 'low', concurrent_activities: [MUAY] })))
  check('low stays low — no double notch', JSON.stringify(lowWith) === JSON.stringify(asLow))
  const yoga: ConcurrentActivity = { name: 'Yoga', intensity: 0.3, days: ['Monday'], movement_demands: [] }
  const yogaPlan = quiet('notch', () => generateMesocycle(profileFor({ concurrent_activities: [yoga] })))
  const yogaReverted = quiet('notch', () => generateMesocycle(profileFor({ concurrent_activities: [{ ...yoga, keep_full_volume: true }] })))
  check('a gentle class changes the schedule and not one set', JSON.stringify(yogaPlan) === JSON.stringify(yogaReverted))
}

console.log('\n7. Every reader goes through the one helper — and the rest of the app knows\n')
{
  // A second sport must reach ALL six readers of recovery_capacity or it
  // reaches some and not others (the scorer's under-budget exemption and the
  // generator's top-up exemption are documented as load-bearing coupling).
  // So no raw read may survive outside the helper, the one comparison that
  // deliberately varies the stated answer, and the profile type itself.
  const rawRead = /profile\??\.recovery_capacity\b/g
  const gen = read('src/lib/exercise-plan.ts'), score = read('src/lib/quality-score.ts'), panel = read('src/components/exercise/TodayPanel.tsx')
  check('the generator has no raw read of recovery_capacity left', (gen.match(rawRead) ?? []).length === 0, gen.match(rawRead))
  check('the scorer reads it raw exactly once — to pick which profiles get the low-vs-high comparison', (score.match(rawRead) ?? []).length === 1, score.match(rawRead))
  check('...and its under-budget exemption follows the EFFECTIVE tier', /exemptUnderrun = effectiveRecoveryCapacity\(profile\) === 'low'/.test(score))
  check('...as does the expected low-vs-high gap', /RECOVERY_SET_MULTIPLIER\[effectiveRecoveryCapacity\(profile\)\] \/ RECOVERY_SET_MULTIPLIER\[effectiveRecoveryCapacity\(highProfile\)\]/.test(score))
  check('the workout card has none either', (panel.match(rawRead) ?? []).length === 0, panel.match(rawRead))
  check('the generator takes its set multiplier from the helper', /RECOVERY_SET_MULTIPLIER\[effectiveRecoveryCapacity\(profile\)\]/.test(gen))
  // The toggle, end to end.
  const exec = read('src/lib/pending-action-executor.ts'), ui = read('src/components/ChatAssistant.tsx'), tool = read('supabase/functions/chat-gemini/index.ts')
  check('the executor can keep full volume and put the notch back, rebuild first', /export async function executeSecondSportVolume/.test(exec) && /keep_full_volume: true/.test(exec) && exec.indexOf('rebuildFromCurrentWeek(updated, exclusions, mesocycle, payload.fromWeek)', exec.indexOf('executeSecondSportVolume')) < exec.indexOf("updateProfileField(profile.id, { concurrent_activities: activities })", exec.indexOf('executeSecondSportVolume')))
  check('the confirm receipt says what happened to the volume', /Lifting volume: one recovery notch down for/.test(exec) && /already at its lowest setting/.test(exec))
  check('the workout card shows the notice with the measured figure and a one-tap revert', /Volume reduced ~\$\{volumeReduction\.pct\}%/.test(panel) && /Revert to full volume/.test(panel) && /executeSecondSportVolume\(profile, mesocycle, exclusions/.test(panel))
  check('...and is honest at the floor and after a revert', /already at its lowest setting/.test(panel) && /Full lifting volume kept despite/.test(panel))
  check('the chat card no longer promises "same amount of lifting" unconditionally',
    /notchApplies = activityCountsAsLoad\(activity\)/.test(ui) && /Same amount of lifting/.test(ui) && /working sets a week\. Revert to full volume any time from the workout card/.test(ui))
  check('the coach is told the rule and told not to double-count it',
    !/Total lifting work does not change/.test(tool) && /two or more sessions a week, or one hard\/combat session/.test(tool) && /never offer propose_volume_change "because of" the sport/.test(tool))
  check('...and is shown when the person kept full volume', /KEEP FULL lifting volume despite it/.test(tool))
  const shared = read('supabase/functions/_shared/coach-rules.ts')
  check('both copies of APP_REALITY mention the notch and the revert', /one recovery notch, shown on the workout card with a one-tap revert/.test(shared) && /one recovery notch, shown on the workout card with a one-tap revert/.test(tool))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nA second sport bends the plan; nobody else moved.\n')
