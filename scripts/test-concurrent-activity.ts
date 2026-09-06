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
import { reorderTracksForClassDays, activityDays, HEAVY_TRACKS, describeActivity, MOVEMENT_DEMANDS, TIMES_OF_DAY } from '../src/lib/concurrent-activity'
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

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nA second sport bends the plan; nobody else moved.\n')
