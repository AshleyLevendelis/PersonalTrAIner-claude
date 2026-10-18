// ---------------------------------------------------------------------------
// test:setup-kit-ticks — the kit is what was said, and setup shows the ticks once (runs 7-10, H34, 18 Oct 2026).
//
// Sam picked "no barbell or bench" (minimalist) and said nothing more about his kit. The ticks on Profile and the
// plan both used the choice's guess — kettlebell, bands, pull-up bar, bag, no bench — and his plan had Banded TKE,
// Band Tricep Pushdown, Spanish Squat and a heavy kettlebell swing. Her ruling, from three options: "Show ticks
// once" — one setup screen for any home equipment choice, pre-ticked with the guess. This holds:
//   1. the question is shown for every home choice, never for a full gym, and just after equipment and injuries;
//   2. the ticks start as Profile's own ticks would (the same function), including anything already said;
//   3. what he leaves ticked becomes the first plan's kit; left as the guess, nothing changes (no statement);
//   4. Sam's own answer: his first plan holds nothing that needs kit he unticked;
//   5. the catalogue is honest: every band move needs a band, every kettlebell move a kettlebell (Spanish Squat too);
//   6. the screen: a new equipment choice starts the ticks again, and the card reads the same selection.
// docs/plans/runs-7-10-batch-1-safety.md.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

async function main() {
  const slots = await import('../src/lib/onboarding-slots')
  const { ONBOARDING_SLOTS, getSlotDef, isSlotApplicable, initialSlotValues, defaultKitTicks, kitStatementsFromSetup, multiSelection, assembleProfile, NEVER_BLOCKING_SLOTS, unconfirmedOptionalSlots } = slots
  const { kitItemsFor, TIER_KIT_ITEMS, profileWithKit } = await import('../src/lib/kit-list')
  const { generateMesocycle, setRandomSource, resetRandomSource } = await import('../src/lib/exercise-plan')
  const { seededRngFromKey } = await import('../src/lib/seeded-random')
  const { EXERCISE_DATABASE, getExerciseEntry } = await import('../src/lib/exercise-db')

  const v = (over: Record<string, unknown>) => ({ ...initialSlotValues(), ...over }) as ReturnType<typeof initialSlotValues>
  const def = getSlotDef('kitTicks')

  console.log('\n1. Shown once, for every home choice, never for a full gym')
  check('the slot exists, as ticks', !!def && def.control === 'multi' && (def.options ?? []).length === 9, def)
  const keys = ONBOARDING_SLOTS.map(s => s.key)
  check('after the equipment question and the injuries question (which stays in the opening block), before anything else', keys.indexOf('kitTicks') > keys.indexOf('equipment') && keys.indexOf('kitTicks') === keys.indexOf('injuries') + 1, keys.slice(keys.indexOf('equipment'), keys.indexOf('kitTicks') + 1))
  check('shown for home gym, minimalist and bodyweight', !!def && ['home_gym', 'minimalist', 'bodyweight'].every(e => isSlotApplicable(def, v({ equipment: e }))))
  check('never for a full gym, and not before the equipment question is answered', !!def && !isSlotApplicable(def, v({ equipment: 'full_gym' })) && !isSlotApplicable(def, v({ equipment: null })))
  check('asked (not a never-asked slot), and only until answered', !NEVER_BLOCKING_SLOTS.includes('kitTicks')
    && unconfirmedOptionalSlots(new Set(['equipment']), v({ equipment: 'minimalist' })).includes('kitTicks')
    && !unconfirmedOptionalSlots(new Set(['equipment', 'kitTicks']), v({ equipment: 'minimalist', kitTicks: ['dumbbells'] })).includes('kitTicks'))

  console.log('\n2. The ticks start as Profile\'s would')
  check('minimalist: the guess, exactly as Profile ticks it', JSON.stringify(defaultKitTicks(v({ equipment: 'minimalist' }))) === JSON.stringify(kitItemsFor({ equipment_access: 'minimalist' })) && JSON.stringify(defaultKitTicks(v({ equipment: 'minimalist' }))) === JSON.stringify(TIER_KIT_ITEMS.minimalist), defaultKitTicks(v({ equipment: 'minimalist' })))
  check('...with anything already said applied ("only: dumbbells, bench")', JSON.stringify(defaultKitTicks(v({ equipment: 'minimalist', kitList: 'only: dumbbells, bench' }))) === JSON.stringify(['dumbbells', 'bench']), defaultKitTicks(v({ equipment: 'minimalist', kitList: 'only: dumbbells, bench' })))
  check('the card reads the defaults until it is answered, then the answer', JSON.stringify(multiSelection('kitTicks', v({ equipment: 'bodyweight' }))) === JSON.stringify(TIER_KIT_ITEMS.bodyweight) && JSON.stringify(multiSelection('kitTicks', v({ equipment: 'bodyweight', kitTicks: ['bands'] }))) === '["bands"]')
  check('every other multi reads its own value', JSON.stringify(multiSelection('injuries', v({ injuries: ['knees'] }))) === '["knees"]' && JSON.stringify(multiSelection('injuries', v({}))) === '[]')

  console.log('\n3. What he leaves ticked becomes the first plan\'s kit')
  const sam = v({ equipment: 'minimalist', kitTicks: ['dumbbells', 'bench'] })
  const samKit = kitItemsFor({ equipment_access: 'minimalist', kit_statements: kitStatementsFromSetup(sam) })
  check('Sam: dumbbells and a flat bench, nothing else of the nine', JSON.stringify(samKit) === '["dumbbells","bench"]', { statements: kitStatementsFromSetup(sam), samKit })
  check('left as the guess: no statement at all (the plan is what it was before this screen existed)', kitStatementsFromSetup(v({ equipment: 'minimalist', kitTicks: [...TIER_KIT_ITEMS.minimalist] })).length === 0 && kitStatementsFromSetup(v({ equipment: 'minimalist' })).length === 0)
  check('a full gym ignores stray ticks', kitStatementsFromSetup(v({ equipment: 'full_gym', kitTicks: ['bands'] })).length === 0)
  const said = v({ equipment: 'minimalist', kitList: 'only: dumbbells, bench', kitTicks: ['dumbbells', 'bench', 'bands'] })
  check('what he said comes first, the ticks on top of it ("only: dumbbells, bench" then ticking bands)', JSON.stringify(kitItemsFor({ equipment_access: 'minimalist', kit_statements: kitStatementsFromSetup(said) })) === '["dumbbells","bench","bands"]', kitStatementsFromSetup(said))

  console.log('\n4. Sam\'s first plan holds nothing that needs kit he unticked')
  const samValues = v({
    displayName: 'Sam', fitnessGoal: 'fat_loss', trainingExperience: 'intermediate', activityLevel: 'moderate',
    equipment: 'minimalist', kitTicks: ['dumbbells', 'bench'], injuries: ['shoulders'], trainingDays: ['Mon', 'Tue', 'Thu', 'Sat'],
    sessionDuration: '30-45', trainingStyle: 'bodybuilding', conditioningPreference: 'tolerate', recoveryCapacity: 'moderate',
    age: '31', heightCm: '178', weightKg: '82', gender: 'male', mealsPerDay: 3, dietaryPreferences: ['nut-free'],
  })
  const profile = assembleProfile(samValues)
  check('the assembled profile carries his kit', JSON.stringify(kitItemsFor(profile)) === '["dumbbells","bench"]', profile.kit_statements)
  const LACKS = ['kettlebell', 'resistance band', 'pull-up bar', 'weighted backpack']
  const needs = (name: string) => { const e = getExerciseEntry(name); if (!e) return false; return e.equipment_alternatives ? e.equipment.every(q => LACKS.includes(q)) : e.equipment.some(q => LACKS.includes(q)) }
  const planNames = (p: Parameters<typeof generateMesocycle>[0]) => { setRandomSource(seededRngFromKey('sam-kit')); try { return generateMesocycle(p).flatMap(w => w.days.flatMap(d => d.exercises.map(e => e.name))) } finally { resetRandomSource() } }
  const guessPlan = planNames(profileWithKit(profile, []))
  const hisPlan = planNames(profile)
  check('the symptom is real: on the guess, his plan needs kit he does not have', guessPlan.some(needs), [...new Set(guessPlan.filter(needs))].slice(0, 8))
  check('on his ticks, nothing in sixteen weeks does', hisPlan.length > 50 && !hisPlan.some(needs), [...new Set(hisPlan.filter(needs))])

  console.log('\n5. The catalogue says what each move needs')
  const bandMoves = EXERCISE_DATABASE.filter(e => /\bband(ed|s)?\b/i.test(e.name) && !/band(-|\s)?free/i.test(e.name))
  check('every exercise named for a band needs a band (Banded TKE, Band Tricep Pushdown...)', bandMoves.length >= 10 && bandMoves.every(e => e.equipment.includes('resistance band')), bandMoves.filter(e => !e.equipment.includes('resistance band')).map(e => e.name))
  check('Spanish Squat needs a band', getExerciseEntry('Spanish Squat')?.equipment.includes('resistance band') === true, getExerciseEntry('Spanish Squat')?.equipment)
  const kbMoves = EXERCISE_DATABASE.filter(e => /\b(kettlebell|kb)\b/i.test(e.name))
  check('every exercise named for a kettlebell needs one (both swings, the heavy one included)', kbMoves.length >= 2 && kbMoves.every(e => e.equipment.includes('kettlebell')), kbMoves.filter(e => !e.equipment.includes('kettlebell')).map(e => e.name))

  console.log('\n6. The screen')
  const onb = strip(readFileSync('src/components/onboarding/ConversationalOnboarding.tsx', 'utf8'))
  check('a new equipment choice, or something said about the kit, starts the ticks again and shows the card again',
    /if \(\(key === 'equipment' \|\| key === 'kitList'\) && valueChanged && ws\.values\.kitTicks !== null\) \{\s*ws\.values = \{ \.\.\.ws\.values, kitTicks: null \}\s*const c = new Set\(ws\.confirmed\); c\.delete\('kitTicks'\); ws\.confirmed = c/.test(onb))
  check('tapping a tick and Next both read the same selection the card shows', /toggleValue\(multiSelection\(key, v\), value\)/.test(onb) && /const selected = multiSelection\(key, values\)/.test(onb))
  const card = strip(readFileSync('src/components/onboarding/SlotChipsCard.tsx', 'utf8'))
  check('the card draws that selection', /const selectedMulti: string\[\] = multiSelection\(def\.key, values\)/.test(card))
  const tab = strip(readFileSync('src/components/exercise/ExerciseTab.tsx', 'utf8'))
  check("the swap sheet's ticks read the SAVED profile (a temporary kit change is not what he owns)", /const kit = kitController && storedProfile \? \{ profile: storedProfile, controller: kitController \} : null/.test(tab))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log("Setup shows the kit once, and the first plan is built from what he has.")
}
main().catch(e => { console.error(e); process.exit(1) })
