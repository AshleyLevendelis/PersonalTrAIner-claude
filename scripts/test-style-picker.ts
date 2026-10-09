// ---------------------------------------------------------------------------
// Gate: no surface offers a training style the picker hides — and a profile
// that already holds one keeps working.
//
// Ashley's ruling, August 2026 (test log M3, 9 Oct 2026: "still offered"):
// "remove combat from the picker for now and backlog it properly. It's a real
// audience she wants to come back to, but not at this stage. Removal must
// handle existing profiles that already have combat set."
//
// Two halves, and the second matters as much as the first:
//   OFFERED nowhere  — onboarding chips, the catalogue the onboarding coach is
//                      sent, the Profile picker, the coach's style-change tool.
//   STILL RUNS       — the type, the engine, the label, and a plan for someone
//                      already on it. Nothing is migrated.
//
// Everything is derived from OFFERED_STYLE_OPTIONS, so bringing combat back
// (or hiding another style) is one line in onboarding-slots.ts and this gate
// follows it without being edited.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  ONBOARDING_SLOTS,
  OFFERED_STYLE_OPTIONS,
  STYLE_OPTIONS,
  buildSlotCatalog,
  displaySlotValue,
  getSlotDef,
  initialSlotValues,
  offeredOptionsFor,
  styleOptionsFor,
  type OnboardingSlotValues,
} from '../src/lib/onboarding-slots'
import { STYLE_CONFIGS, generateExercisePlan } from '../src/lib/exercise-plan'
import type { TrainingStyle, UserProfile } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
/** Source with comments removed, so a note about a removal cannot stand in for it. */
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

const offered = OFFERED_STYLE_OPTIONS.map(o => o.value)
const hidden = STYLE_OPTIONS.map(o => o.value).filter(v => !offered.includes(v))
const styleDef = getSlotDef('trainingStyle')!

console.log('\n1. The ruling is in force')
check('combat is not offered', !offered.includes('combat'), offered)
check('...and something still is', offered.length >= 2, offered)
check('at least one style is hidden, so the rest of this gate has something to hold', hidden.length >= 1, hidden)

console.log('\n2. Onboarding does not offer it')
{
  const chips = (offeredOptionsFor(styleDef) ?? []).map(o => String(o.value))
  check('the style chips are exactly the offered styles', chips.join() === offered.join(), chips)
  const sent = (buildSlotCatalog(initialSlotValues()).find(e => e.key === 'trainingStyle') as { values?: { value: string }[] } | undefined)?.values?.map(v => v.value) ?? []
  check('the catalogue the onboarding coach is sent lists exactly those too', sent.join() === offered.join(), sent)
  for (const h of hidden) {
    check(`"${h}" cannot be recorded as a new answer — not by the coach, not by typing its label`, !styleDef.validate(h))
  }
  check('every offered style can', offered.every(v => styleDef.validate(v)))
  // Nothing else was hidden by accident.
  const others = ONBOARDING_SLOTS.filter(s => s.key !== 'trainingStyle' && s.options && offeredOptionsFor(s)!.length !== s.options.length).map(s => s.key)
  check('no other question lost an option', others.length === 0, others)
}

console.log('\n3. The Profile screen does not offer it — except to someone who already has it')
{
  for (const h of hidden) {
    check(`someone on "${h}" still sees it named in their own picker`, styleOptionsFor(h).some(o => o.value === h))
    check(`...alongside every offered style`, offered.every(v => styleOptionsFor(h).some(o => o.value === v)))
  }
  for (const v of offered) {
    check(`someone on "${v}" is not offered a hidden style`, styleOptionsFor(v).map(o => o.value).join() === offered.join(), styleOptionsFor(v).map(o => o.value))
  }
  check('...nor is someone with no style yet', styleOptionsFor(null).map(o => o.value).join() === offered.join())
  const profile = code('src/components/ProfileScreen.tsx')
  check('the Style row takes its options from that function',
    /label="Style">\s*<EditableSelectField[^>]*options=\{styleOptionsFor\(profile\.training_style\)\}/.test(profile))
  check('...and the full list is not used anywhere on the screen', !/\bSTYLE_OPTIONS\b/.test(profile.replace(/BREAKFAST_STYLE_OPTIONS/g, '')))
}

console.log('\n4. The coach cannot move someone onto it')
{
  const fn = code('supabase/functions/chat-gemini/index.ts')
  const tool = fn.slice(fn.indexOf('name: "propose_style_change"'))
  const enumList = /training_style:\s*\{[\s\S]*?enum:\s*\[([^\]]*)\]/.exec(tool)?.[1].match(/"([a-z_]+)"/g)?.map(s => s.replace(/"/g, '')) ?? []
  check('the style-change tool exists and has an enum (sanity check on this check)', enumList.length >= 2, enumList)
  check('its enum is exactly the offered styles', [...enumList].sort().join() === [...offered].sort().join(), { enumList, offered })
  const instruction = /Call propose_style_change with training_style: one of ([^.]*)\./.exec(fn)?.[1] ?? ''
  check('the coach\'s instruction lists exactly the offered styles too',
    instruction.split(/,\s*/).map(s => s.trim()).sort().join() === [...offered].sort().join(), instruction)
  const chat = code('src/components/ChatAssistant.tsx')
  check('the app refuses a proposal for a style that is not offered, whatever the model sends',
    /const wantedOpt = OFFERED_STYLE_OPTIONS\.find\(o => o\.value === String\(rawArgs\.training_style/.test(chat))
  check('...while still naming the style someone is moving FROM', /const beforeOpt = STYLE_OPTIONS\.find\(o => o\.value === beforeValue\)/.test(chat))
}

console.log('\n5. Someone already on a hidden style keeps everything')
for (const h of hidden) {
  check(`"${h}" still has its label, for the Profile row and every receipt`,
    displaySlotValue(styleDef, { ...initialSlotValues(), trainingStyle: h } as OnboardingSlotValues) === STYLE_OPTIONS.find(o => o.value === h)!.label)
  check(`the engine still has its "${h}" settings`, !!STYLE_CONFIGS[h as TrainingStyle])
  const profile = {
    age: 31, gender: 'male', height_cm: 178, weight_kg: 82, activity_level: 'moderate',
    fitness_goal: 'fat_loss', training_experience: 'intermediate', equipment_access: 'full_gym',
    training_style: h, session_duration_preference: '45-60', conditioning_preference: 'tolerate',
    recovery_capacity: 'moderate', injuries: [], dietary_preferences: [], meals_per_day: 3, include_snacks: true,
    workout_split_preference: 'ai_recommendation', macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
    preferred_time: 'morning', display_name: 'Existing',
    training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      .map(day => ({ day, available: ['Monday', 'Wednesday', 'Friday'].includes(day) })),
  } as unknown as UserProfile
  const plan = generateExercisePlan(profile).plan
  const days = plan.filter(d => (d.exercises?.length ?? 0) > 0)
  check(`a "${h}" profile still gets a plan built — ${days.length} training days`, days.length === 3, days.length)
  // And it is THEIR style's plan, not a quiet fallback to another one. Sets
  // and reps only, so the comparison does not depend on which exercises the
  // selector happened to draw.
  const prescription = (style: string) => JSON.stringify(
    generateExercisePlan({ ...profile, training_style: style } as UserProfile).plan.map(d => d.exercises.map(e => `${e.sets}x${e.reps}`).sort()))
  const differs = offered.filter(v => prescription(v) !== prescription(h))
  check(`...prescribed differently from every offered style (${differs.join(', ')})`, differs.length === offered.length, differs)
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('A hidden style is offered nowhere and still works for whoever has it.')
