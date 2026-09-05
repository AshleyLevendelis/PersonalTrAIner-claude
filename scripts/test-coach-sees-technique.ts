/**
 * Gate: the coach can see how to do the exercises it is coaching.
 *
 * Ashley, told the coach answered technique from the model's own knowledge
 * while the app held 801 curated cues one tap away: "fix it."
 *
 * THIS IS THE THIRD TIME THE SAME HOLE HAS BEEN PATCHED, which is why this
 * file asserts an INVARIANT rather than a string:
 *
 *   test-coach-sees-ingredients.ts — the coach said "none of your scheduled
 *   meals actually contain almond butter" about a breakfast holding 13g.
 *   Its header names the shape: "Two readers of the same data, one right and
 *   one blind."
 *
 *   chat-plan-context.ts's describeExerciseForCoach header — intensity and
 *   tempo withheld, leaving the coach "unable to answer 'how hard should the
 *   push-ups be?' about a number on the next screen."
 *
 *   And now form_cues, which until 5 Sep 2026 had EXACTLY ONE READER in the
 *   whole repo: the Exercise tab's How-to panel.
 *
 * So §1 is the invariant, borrowed from the ingredients gate's §3: anything
 * the How-to tab can show for an exercise in the user's plan must appear in
 * the text the coach is given. A source-text check could never catch the
 * divergence that produced the bug; only comparing the two readers can.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { EXERCISE_DATABASE, getExerciseEntry } from '../src/lib/exercise-db'
import {
  buildCoachTechniqueSummary,
  describeTechniqueForCoach,
  techniqueTruncationNote,
  MAX_TECHNIQUE_EXERCISES,
} from '../src/lib/exercise-technique'
import { buildCoachExerciseSummary } from '../src/lib/chat-plan-context'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, WorkoutDay, EquipmentAccess } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

function quiet<T>(fn: () => T): T {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
}

function profile(o: Partial<UserProfile>): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '45-60',
    workout_split_preference: 'upper_lower',
    training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      .map((day, i) => ({ day, available: i < 4 })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...o,
  } as UserProfile
}

/** Real plans from the real engine — a hand-written fixture would only ever contain lifts someone remembered. */
function weeksFor(equipment_access: EquipmentAccess, goal: string, seed: string) {
  return quiet(() => {
    setRandomSource(seededRngFromKey(seed))
    try { return generateMesocycle(profile({ equipment_access, fitness_goal: goal as UserProfile['fitness_goal'] })) }
    finally { resetRandomSource() }
  })
}

console.log('\n1. THE INVARIANT — anything the How-to tab can show, the coach is given\n')
{
  // Across several real configurations, so this covers what the ENGINE can
  // prescribe rather than what a fixture author thought of.
  const CONFIGS: [EquipmentAccess, string][] = [
    ['full_gym', 'hypertrophy'], ['minimalist', 'fat_loss'],
    ['bodyweight', 'general_fitness'], ['full_gym', 'strength'],
  ]
  const planned = new Set<string>()
  const allDays: WorkoutDay[] = []
  for (const [equip, goal] of CONFIGS) {
    for (const wk of weeksFor(equip, goal, `tech:${equip}:${goal}`)) {
      for (const d of wk.days) {
        allDays.push(d)
        for (const ex of d.exercises) planned.add(ex.name)
      }
    }
  }
  check(`the sweep found real plans (${planned.size} distinct exercises across ${CONFIGS.length} configs)`,
    planned.size >= 40, planned.size)

  // THE CHECK. For every exercise the engine can put in front of a user, the
  // cues the panel would render must be present in what the coach is sent.
  const blind: { name: string; missing: string }[] = []
  for (const name of planned) {
    const entry = getExerciseEntry(name)
    if (!entry) continue // covered separately by §3 — an unknown name says so
    const text = describeTechniqueForCoach(name)
    for (const cue of entry.form_cues) {
      if (!text.includes(cue)) { blind.push({ name, missing: cue }); break }
    }
  }
  check('every cue the panel would render reaches the coach', blind.length === 0, blind.slice(0, 5))

  // The muscles too — the panel's "Works" row and the Summary tab's map both
  // show them, and "what does this work?" is the other half of the question
  // the prompt tells the coach to answer.
  const noMuscles = [...planned].filter(n => {
    const e = getExerciseEntry(n)
    return e && !e.primary_muscles.every(m => describeTechniqueForCoach(n).includes(m))
  })
  check('...and so do the muscles it works', noMuscles.length === 0, noMuscles.slice(0, 5))

  // END TO END, through the real payload builder, not just the helper.
  const sample = allDays.filter(d => d.exercises.length > 0).slice(0, 3)
  const summary = buildCoachExerciseSummary({ days: sample })
  const sampleNames = new Set(sample.flatMap(d => d.exercises.map(e => e.name)))
  const missingFromPayload = [...sampleNames].filter(n => {
    const e = getExerciseEntry(n)
    return e && !summary.includes(e.form_cues[0])
  })
  check('the cues survive the real exercise_summary payload, not just the helper',
    missingFromPayload.length === 0, missingFromPayload)
  check('...and the payload says whose words they are',
    /HOW TO PERFORM THESE/.test(summary) && /Exercise tab/.test(summary))
}

console.log('\n2. Bounded, and honest about it\n')
{
  const many = EXERCISE_DATABASE.filter(e => !e.retired).slice(0, MAX_TECHNIQUE_EXERCISES + 7).map(e => e.name)
  const out = buildCoachTechniqueSummary(many)
  const lines = out.split('\n')
  check(`the cap holds at ${MAX_TECHNIQUE_EXERCISES} described exercises`,
    lines.length === MAX_TECHNIQUE_EXERCISES + 1, lines.length)
  // ANNOUNCED, not silent. A shortened list read as complete would reproduce
  // this whole bug in a new place — the model reasoning from a partial view
  // it believed was total.
  check('...and the truncation is announced, not silent',
    out.includes(techniqueTruncationNote(many.length)), lines[lines.length - 1])

  const under = EXERCISE_DATABASE.filter(e => !e.retired).slice(0, 5).map(e => e.name)
  check('a normal week carries no truncation note',
    !buildCoachTechniqueSummary(under).includes('not listed'))

  // A lift programmed twice in a week must not pay for its cues twice.
  const dup = buildCoachTechniqueSummary(['Deadlifts', 'Deadlifts', 'deadlifts'])
  check('a repeated exercise is described once', dup.split('\n').length === 1, dup)
}

console.log('\n3. Absence is stated, never implied\n')
{
  const unknown = describeTechniqueForCoach('Zercher Good Morning From Rings')
  check('a movement with no catalogue entry says so in words',
    /no technique notes recorded/.test(unknown), unknown)
  check('...and tells the coach what to do instead', /your own knowledge/.test(unknown), unknown)

  // THE EMPTY-PLAN CONTRACT. test-log-correction.ts pins this literally, and
  // the prompt has a rule keyed on the section being empty ("if the section
  // above is EMPTY, say you don't have their prescribed weights"). A header
  // appended unconditionally would make the coach believe it had a plan.
  check('no exercises means no block at all', buildCoachTechniqueSummary([]) === '')
  check('...so an empty plan still yields exactly an empty summary',
    buildCoachExerciseSummary({ days: [] }) === '',
    JSON.stringify(buildCoachExerciseSummary({ days: [] })))
}

console.log('\n4. The prompt teaches the form the builder emits\n')
{
  // The norm this repo already codified in test-coach-plan-context §6: every
  // form the builder can emit must be taught in the prompt, or the model gets
  // text it has not been told how to read.
  const fn = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf-8')
  check('the prompt names the block the builder emits', /HOW TO PERFORM THESE/.test(fn))
  check('...says the cues are the app\'s own, matching the screen', /the app's own coaching/i.test(fn))
  check('...forbids contradicting them', /never contradict them/i.test(fn))
  check('...and keeps them out of a list, per the voice rules',
    /no-lists rule/i.test(fn) && /material, not a format/i.test(fn))
  // The client must send it through the shared builder, never hand-rolled in
  // the component — the rule test-log-correction.ts already enforces for the
  // rest of this payload.
  const client = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf-8')
  check('the component does not hand-roll a second technique block',
    !/form_cues/.test(client))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nThe coach and the screen answer from the same words.\n')
