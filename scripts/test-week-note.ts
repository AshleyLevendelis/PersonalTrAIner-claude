// ---------------------------------------------------------------------------
// THE WEEK NOTE AND THE DELTA CHIP, ASSERTED AGAINST REAL GENERATED PLANS.
//
// Ashley photographed the browse screen on 1 Sep 2026 and every defect was in
// the two lines above the workout:
//   "...controlled tempo The volume phase." — two texts joined with a bare
//     space, the first not ending in a full stop.
//   Week 1 told her to find RPE 6 twice, in two different wordings.
//   Deload weeks opened two sentences with "Deload week —", both explaining
//     the same thing.
//   The note ran ten lines, so no complete workout was on screen.
//   "+0 sets vs last week" on three weeks in four, while the note underneath
//     said the weight went up.
//   "+27 sets vs last week" on a block's first week — because the week before
//     it was a deload.
//
// Every check below is derived from a generated mesocycle rather than pinned
// to a string, because the strings are the thing most likely to change and a
// snapshot of them would only prove they hadn't.
// ---------------------------------------------------------------------------
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { weekNoteText, splitSentences } from '../src/lib/week-note'
import { weekDelta, weekSetTotal } from '../src/lib/week-delta'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const buildProfile = (o: Partial<UserProfile>): UserProfile => ({
  age: 34, gender: 'male', height_cm: 178, weight_kg: 85, activity_level: 'moderate',
  fitness_goal: 'fat_loss', preferred_time: 'morning', bmr: 1800, tdee: 2600,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: 'upper_lower',
  training_days: [
    { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
    { day: 'Friday', available: true }, { day: 'Saturday', available: false },
    { day: 'Sunday', available: false },
  ],
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  ...o,
} as UserProfile)

function planFor(o: Partial<UserProfile>, seed: string): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(seed))
  try {
    return generateMesocycle(buildProfile(o), generateExercisePlan(buildProfile(o)).plan)
  } finally { resetRandomSource() }
}

// Four shapes, deliberately including one that must NEVER be told its weights
// got heavier: a bodyweight trainee has no weight to add.
const PLANS: [string, MesocycleWeek[]][] = [
  ['full_gym/fat_loss', planFor({}, 'wn:1')],
  ['full_gym/strength', planFor({ fitness_goal: 'strength', training_experience: 'advanced' }, 'wn:2')],
  ['bodyweight/beginner', planFor({ equipment_access: 'bodyweight', training_experience: 'beginner' }, 'wn:3')],
  ['minimalist/hypertrophy', planFor({ equipment_access: 'minimalist', fitness_goal: 'hypertrophy' }, 'wn:4')],
]

console.log('\n1. The note reads as sentences, not as two texts shoved together')
{
  let runOns: string[] = []
  let longest = 0
  let longestText = ''
  for (const [label, weeks] of PLANS) {
    for (const w of weeks) {
      const note = weekNoteText(w)
      if (!note) continue
      // A run-on is a lowercase or capitalised word arriving straight after a
      // word with no terminator — exactly "controlled tempo The volume phase".
      for (const s of splitSentences(note)) {
        if (!/[.!?]$/.test(s)) runOns.push(`${label} W${w.week_number}: ${s.slice(-40)}`)
      }
      if (note.length > longest) { longest = note.length; longestText = `${label} W${w.week_number}: ${note}` }
    }
  }
  check('every sentence in every week note is terminated', runOns.length === 0, runOns.slice(0, 3))
  // The screenshot that started this ran ~590 characters. A note is two
  // sentences: what the block is for, and what this week does.
  check(`the longest note across all four plans is short enough to sit above a workout (${longest} chars)`,
    longest <= 260, longestText)
}

console.log('\n2. Nothing is said twice')
{
  const repeats: string[] = []
  for (const [label, weeks] of PLANS) {
    for (const w of weeks) {
      const sentences = splitSentences(weekNoteText(w))
      // Same opening clause twice = the "Deload week — … Deload week — …"
      // defect. Compared on the announcement, not the whole sentence, because
      // the two deload sentences were differently worded and still redundant.
      const clauses = sentences.map(s => (s.split('—')[0] ?? s).trim().toLowerCase())
      const dupes = clauses.filter((c, i) => clauses.indexOf(c) !== i)
      if (dupes.length) repeats.push(`${label} W${w.week_number}: ${dupes.join(' / ')}`)
      // And the specific instruction Ashley saw twice on week 1.
      const rpe6 = sentences.filter(s => /RPE 6/i.test(s)).length
      if (rpe6 > 1) repeats.push(`${label} W${w.week_number}: RPE 6 stated ${rpe6}x`)
    }
  }
  check('no week note announces the same thing twice', repeats.length === 0, repeats.slice(0, 4))
}

console.log('\n3. The safety-relevant sentences still survive the trim')
{
  for (const [label, weeks] of PLANS) {
    const calib = weeks.find(w => w.isCalibrationWeek)
    if (calib) {
      check(`${label}: the calibration week still says how to find the weight`,
        /RPE 6/i.test(weekNoteText(calib)), weekNoteText(calib))
    }
    const deload = weeks.find(w => w.is_deload)
    if (deload) {
      const note = weekNoteText(deload)
      check(`${label}: a deload week still explains itself`, /deload/i.test(note), note)
      check(`${label}: ...and still says it is not a stall`, /stall/i.test(note), note)
    }
  }
}

console.log('\n4. The chip never claims a change that did not happen')
{
  const lies: string[] = []
  for (const [label, weeks] of PLANS) {
    for (const w of weeks) {
      const chip = weekDelta(w, weeks)
      if (!chip) continue
      const comparison = weeks
        .filter(x => x.week_number < w.week_number)
        .sort((a, b) => b.week_number - a.week_number)
        .find(x => w.is_deload ? true : !x.is_deload)
      if (!comparison) continue
      const setDelta = weekSetTotal(w) - weekSetTotal(comparison)
      // "Same sets" must mean the same sets.
      if (/Same sets/.test(chip.text) && setDelta !== 0) lies.push(`${label} W${w.week_number}: "${chip.text}" but sets moved by ${setDelta}`)
      // "+N sets" must be N.
      const m = /^([+-]\d+) sets/.exec(chip.text)
      if (m && parseInt(m[1], 10) !== setDelta) lies.push(`${label} W${w.week_number}: "${chip.text}" but sets moved by ${setDelta}`)
    }
  }
  check('every chip matches the plan it describes', lies.length === 0, lies.slice(0, 4))

  // THE ONE THAT WOULD BE A PLAIN UNTRUTH. A bodyweight plan has no weight to
  // add, so "heavier weights" must never appear in one.
  const bodyweight = PLANS.find(([l]) => l.startsWith('bodyweight'))![1]
  const heavierClaims = bodyweight
    .map(w => ({ week: w.week_number, chip: weekDelta(w, bodyweight)?.text }))
    .filter(x => x.chip && /heavier/i.test(x.chip))
  check('a bodyweight plan is never told its weights got heavier', heavierClaims.length === 0, heavierClaims)
}

console.log('\n5. A block\'s first week is not measured against a deload')
{
  const misleading: string[] = []
  for (const [label, weeks] of PLANS) {
    for (const w of weeks) {
      if (w.is_deload || (w.week_in_block ?? 1) !== 1 || w.week_number === 1) continue
      const chip = weekDelta(w, weeks)
      if (!chip) continue
      const previous = weeks.find(x => x.week_number === w.week_number - 1)
      if (!previous?.is_deload) continue
      // It must not compare against the deload, and it must say which week it
      // DID compare against rather than calling it "last week".
      if (/vs last week/.test(chip.text)) misleading.push(`${label} W${w.week_number}: "${chip.text}" (W${previous.week_number} is a deload)`)
    }
  }
  check('a week after a deload names the week it compares to', misleading.length === 0, misleading.slice(0, 4))

  // And the comparison it makes is the honest one: against the last real
  // training week, so the number is not inflated by the deload's dip.
  const [, weeks] = PLANS[0]
  const opener = weeks.find(w => (w.week_in_block ?? 1) === 1 && w.week_number > 1)
  if (opener) {
    const chip = weekDelta(opener, weeks)
    const deloadBefore = weeks.find(w => w.week_number === opener.week_number - 1)
    const realBefore = weeks.filter(w => w.week_number < opener.week_number && !w.is_deload).pop()
    if (chip && deloadBefore?.is_deload && realBefore) {
      const vsDeload = weekSetTotal(opener) - weekSetTotal(deloadBefore)
      const vsReal = weekSetTotal(opener) - weekSetTotal(realBefore)
      console.log(`     (W${opener.week_number}: ${vsDeload} sets vs the deload, ${vsReal} vs W${realBefore.week_number} — chip says "${chip.text}")`)
      check('...and reports the smaller, honest comparison',
        !chip.text.includes(`+${vsDeload} `) || vsDeload === vsReal, chip.text)
    }
  }
}

console.log('\n6. The chain is wired — the screen uses these, not its own copy')
{
  const { readFileSync } = await import('fs')
  const src = readFileSync(new URL('../src/components/exercise/ProgramBrowse.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('the screen renders the shared note helper', /weekNoteText\(weekObj\)/.test(src))
  check('the screen renders the shared delta helper', /weekDelta\(weekObj, mesocycle\)/.test(src))
  // The hardcoded calibration paragraph that duplicated the plan's own.
  check('the screen no longer carries its own calibration copy', !/RPE 6/.test(src))
  check('...nor its own note concatenation', !/noteParts/.test(src))
}

console.log('\n7. A plan ALREADY GENERATED still reads clean')
{
  // The notes are persisted in mesocycle_weeks when a plan is built, so a
  // trainee mid-programme keeps the text their plan was written with —
  // wording fixed in the generator reaches them only on a rebuild. These are
  // the exact strings off Ashley's screenshots (1 Sep 2026), which is the
  // state her live plan is actually in, and the reason the trimming happens
  // on the way to the screen rather than by asking the generator to emit
  // less.
  const legacyDeload = {
    phase_focus: 'Build a base — connective tissue, movement quality, work capacity',
    coach_note: 'Deload week — volume is deliberately cut so you arrive at the next block recovered. Resist the urge to push. Deload week — load and volume both step back so you arrive at the next block recovered, not because progress stalled.',
  }
  const legacyCalibration = {
    phase_focus: 'Build a base — connective tissue, movement quality, work capacity',
    coach_note: 'Higher reps, lighter loads, shorter rest. This phase prepares tendons and ligaments, which adapt more slowly than muscle. Do not rush it. Diet drives the fat loss here, not the workout — this program is built to protect the muscle you already have while you are in a deficit. Weights stay real weights and progression keeps climbing; conditioning is appended on top, never substituted for lifting. Loads start deliberately light — find the weight where the last rep feels like RPE 6, log it, and next week builds from YOUR numbers.',
  }
  const legacyBaseline = {
    phase_focus: 'Build muscle — moderate loads, higher volume, controlled tempo',
    coach_note: 'The volume phase. Take most sets close to failure but keep form clean — quality reps drive growth, not grinding. Diet drives the fat loss here, not the workout — this program is built to protect the muscle you already have while you are in a deficit. Baseline week — this sets the working weight every later week in the block adds load on top of.',
  }

  const d = weekNoteText(legacyDeload)
  check(`a stored deload note announces the deload once (${d.length} chars)`,
    (d.match(/Deload week —/g) ?? []).length === 1, d)
  check('...and keeps the reason it is not a stall', /stall/.test(d), d)

  const c = weekNoteText(legacyCalibration)
  check(`a stored calibration note states RPE 6 once (${c.length} chars)`,
    (c.match(/RPE 6/g) ?? []).length === 1, c)
  check('...and drops the programme-level framing that repeated every block',
    !/Diet drives the fat loss/.test(c), c)

  const b = weekNoteText(legacyBaseline)
  check(`a stored baseline note fits above a workout (${b.length} chars)`, b.length <= 260, b)
  check('...with no run-on where the two texts meet',
    /work capacity\.|controlled tempo\./.test(b), b)

  // The one thing the display CANNOT fix: a sentence stored with a missing
  // word. Ashley's plan carries "the working weight every later week in the
  // block adds load on top of" and will until her plan is rebuilt; new plans
  // say "the working weight THAT every later week…". Asserted so the claim
  // that it is generator-side, not display-side, stays true.
  check('a wording fix in the generator does NOT rewrite an existing plan',
    /working weight every later week/.test(b), b)
}

console.log(failures === 0 ? '\nThe week note says one thing, once.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
