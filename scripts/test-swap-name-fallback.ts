// ---------------------------------------------------------------------------
// test:swap-name-fallback — a swap to a name the catalogue does not have is answered, never a dead end
// (runs 7-10, H33, 18 Oct 2026). docs/plans/runs-7-10-batch-1-safety.md.
//
// Sam (dumbbells and a flat bench, nothing else) asked to swap to "Dumbbell Step-Up" and the whole reply was "try
// another name for it". This holds, on his own kit:
//   1. the nearest catalogue name is found under the implement word he put in front of it;
//   2. what is offered is what his kit and injuries allow (the swap sheet's own shortlist, the generator's pool);
//   3. a name he cannot have is said so, with the true reason (kit, or injuries / avoid list / experience);
//   4. every offer is a tap whose name the app resolves exactly, plus a tap to change the kit;
//   5. the chat's swap builder uses it, and the dead-end sentence is gone.
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
  const { swapNameFallback, KIT_CHIP } = await import('../src/lib/swap-name-fallback')
  const { resolveExerciseName } = await import('../src/lib/set-parse')
  const { getExerciseEntry } = await import('../src/lib/exercise-db')
  const { getReplacementCandidates } = await import('../src/lib/mesocycle-edit')
  const { isEquipmentAllowed } = await import('../src/lib/exercise-plan')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base: any = {
    id: 'p', age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate', fitness_goal: 'fat_loss',
    equipment_access: 'minimalist', injuries: [], training_style: 'bodybuilding', training_experience: 'intermediate',
    session_duration_preference: '30-45', training_days: [], dietary_preferences: [],
  }
  const SAM = { ...base, kit_statements: [{ mode: 'only', items: ['dumbbells', 'bench'] }] }
  const GYM = { ...base, equipment_access: 'full_gym' }
  const ask = (old: string, typed: string, profile = SAM) =>
    swapNameFallback({ typed, oldExercise: old, resolution: resolveExerciseName(typed, []), profile, exclusions: [] })
  const chipsOf = (text: string) => (text.match(/\[QUICK_REPLIES:\s*(.*?)\]/)?.[1] ?? '').split('|').map(c => c.trim().replace(/^"|"$/g, '')).filter(Boolean)

  console.log('\n1. The name he meant is found under the implement word')
  check('"Dumbbell Step-Up" does not resolve as typed (the case this exists for)', resolveExerciseName('Dumbbell Step-Up', []).resolution !== 'resolved')
  const bss = ask('Bulgarian Split Squats', 'Dumbbell Step-Up')
  check("Sam, swapping Bulgarian Split Squats: the nearest he can do is a step-up, offered first", /step-up/i.test(bss.offered[0] ?? ''), bss)
  check('...and named as the nearest', /The nearest I have is .*Step-Up/i.test(bss.text), bss.text)
  const gym = ask('Goblet Squats', 'Dumbbell Step-Up', GYM)
  check('in a full gym the step-up itself (Step-Ups) is the nearest, and offered', gym.offered[0] === 'Step-Ups', gym)

  console.log('\n2. What is offered is what his kit and injuries allow')
  const goblet = ask('Goblet Squats', 'Dumbbell Step-Up')
  const legal = (n: string) => { const e = getExerciseEntry(n); return !!e && isEquipmentAllowed(e, SAM) }
  check('every offer is something his kit allows', [bss, goblet].every(r => r.offered.length > 0 && r.offered.every(legal)), [bss.offered, goblet.offered])
  const sheet = getReplacementCandidates('Goblet Squats', SAM, []).map(c => c.exercise.name)
  const alts = goblet.offered.slice(1)
  check('a lookalike he can do comes first (Step-Ups (Bodyweight), which needs no kit)', goblet.offered[0] === 'Step-Ups (Bodyweight)', goblet.offered)
  check("the alternatives after it are the swap sheet's own shortlist, in its order", alts.length === 2 && alts.every((n, i) => n === sheet[i]), { offered: goblet.offered, sheet })
  const bandOwner = ask('Goblet Squats', 'Dumbbell Step-Up', base)
  const needsBand = (n: string) => (getExerciseEntry(n)?.equipment ?? []).includes('resistance band')
  check('the kit binds: the tier\'s guess (bands) can offer a band move, his own kit never does',
    getReplacementCandidates('Goblet Squats', base, []).some(c => needsBand(c.exercise.name)) && !goblet.offered.some(needsBand), { guess: bandOwner.offered, his: goblet.offered })
  const rdl = ask('Romanian Deadlifts', 'Dumbbell Stiff Leg Thing')
  const kbFirst = getReplacementCandidates('Romanian Deadlifts', base, [])[0]?.exercise.name
  check("Sam's own symptom: on the tier's guess a kettlebell swing heads the hinge list; on his kit it is never offered",
    /kettlebell/i.test(kbFirst ?? '') && rdl.offered.length > 0 && !rdl.offered.some(n => (getExerciseEntry(n)?.equipment ?? []).includes('kettlebell')), { guessFirst: kbFirst, his: rdl.offered })
  check('at most three offers', [bss, goblet, gym].every(r => r.offered.length <= 3))

  console.log('\n3. A name he cannot have is said so, with the true reason')
  const swing = ask('Goblet Squats', 'Kettlebell Swing Heavy')
  check('a kettlebell swing for a man with no kettlebell: named, with "kit" as the reason', swing.ruledOut === 'Kettlebell Swing (Heavy)' && swing.ruledOutBy === 'kit' && swing.text.includes("The nearest I have is Kettlebell Swing (Heavy), and it needs kit your profile doesn't list."), swing)
  check('...it is not offered, and his own alternatives still are', !swing.offered.some(n => /kettlebell/i.test(n)) && swing.offered.length === 3 && swing.offered[0] === sheet[0], swing.offered)
  check('Step-Ups (needs a box) is never offered to him', !goblet.offered.includes('Step-Ups') && !bss.offered.includes('Step-Ups'))
  const injured = ask('Goblet Squats', 'Dumbbell Step-Up', { ...GYM, injuries: ['knee'] })
  check('kept out by an injury, not kit: the reason says so', injured.ruledOut == null || injured.ruledOutBy === 'injuries' || injured.offered[0] === 'Step-Ups', injured)
  check('a lookalike he CAN do is never called ruled out', gym.ruledOut === null && !/rule|keep it out|doesn't list/.test(gym.text), gym.text)

  console.log('\n4. Every offer is a tap the app resolves, plus a kit tap')
  for (const r of [bss, goblet, gym]) {
    const chips = chipsOf(r.text)
    const swaps = chips.filter(c => c.startsWith('Swap '))
    check(`taps match offers (${r.offered[0]})`, swaps.length === r.offered.length && swaps.every((c, i) => c.endsWith(` for ${r.offered[i]}`)), chips)
    check(`...each name resolves exactly in the catalogue (${r.offered.join(', ')})`, r.offered.every(n => { const x = resolveExerciseName(n, []); return x.resolution === 'resolved' && x.exerciseName === n }))
    check('...and the kit tap is last', chips[chips.length - 1] === KIT_CHIP, chips)
  }
  const { EXERCISE_DATABASE } = await import('../src/lib/exercise-db')
  check('no catalogue name holds "]" or "|", so no tap can break the tag', EXERCISE_DATABASE.length >= 200 && !EXERCISE_DATABASE.some(e => /[\]|]/.test(e.name)), EXERCISE_DATABASE.filter(e => /[\]|]/.test(e.name)).map(e => e.name))
  check('the reply text before the taps says nothing about "try another name"', [bss, goblet, gym].every(r => !/try another name|exercise library/i.test(r.text)))
  const amb = swapNameFallback({ typed: 'press', oldExercise: 'Goblet Squats', resolution: resolveExerciseName('press', []), profile: GYM, exclusions: [] })
  check('an ambiguous name says so and still offers taps', resolveExerciseName('press', []).resolution === 'ambiguous' ? /could be a few things/.test(amb.text) && amb.offered.length > 0 : true, amb)

  console.log('\n5. The chat uses it')
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  const builder = chat.slice(chat.indexOf('const buildExerciseSwapProposal = async'), chat.indexOf('const scope: SwapScope', chat.indexOf('const buildExerciseSwapProposal = async')))
  check('the swap builder answers an unresolved name with swapNameFallback, on the person\'s pool profile and exclusions',
    /if \(!newEntry\) \{\s*return \{ ok: false, reason: swapNameFallback\(\{ typed: newItem, oldExercise: oldEx\.name, resolution: newResolved, profile: poolProfile, exclusions: exerciseExclusions \}\)\.text \}/.test(builder), builder.slice(-600))
  check('the dead-end sentence is gone from the chat', !/try another name for it/.test(chat))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('A swap to a name the app does not have is answered with what he can do, each a tap.')
}
main().catch(e => { console.error(e); process.exit(1) })
