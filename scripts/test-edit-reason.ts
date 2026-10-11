// ---------------------------------------------------------------------------
// THE REASON IS THE HINGE — that the question has answers, and that each
// answer goes somewhere real.
//
// `docs/how-the-app-talks-about-a-change.md` §3. Without a reason, "the bench
// is busy", "my shoulder hurts" and "I hate this exercise" are all answered
// with the same swap.
//
// WHAT THIS PINS, and what it deliberately does not. It pins the SHAPE of the
// answer set — four per verb, every one routed, one phrasebook, the escape
// chip never lost — because those are properties a wrong edit breaks silently.
// It does not pin the wording of any chip: the words are Ashley's to change,
// and a check that froze them would fail every time she improved one.
//
// IT CANNOT PROVE THE CHIPS ARE REACHED. Nothing a `test:` gate does can —
// measured 14 Sep 2026, when disabling a whole step with `if (false && …)`
// left twelve source checks green. `verify:edit-reason` drives a real screen
// for that half, and this file says so rather than letting the next reader
// take it for proof.
// ---------------------------------------------------------------------------

import {
  reasonsFor, reasonChipsFor, routeFor, cardLineFor, reasonForLabel, reasonQuestion,
  HURT_KINDS, NIGGLE_EASE_OFF_DAYS, RED_FLAG_ADVICE,
  NOTHING_LOADS_THAT_AREA, NOTHING_LOADS_THAT_AREA_NOTED, equipmentNothingToChange, isNothingToChangeMessage,
  type EditReason, type ReasonedEditKind, type ReasonRoute,
} from '../src/lib/edit-reason'
import { applyInjuryFromRow, applyEquipmentFromRow } from '../src/lib/screen-adaptations'
import { setSupabaseClient } from '../src/lib/supabase'
import { askText, DO_IT_ANYWAY, type Tradeoff } from '../src/lib/tradeoff-shape'
import { assessEdit } from '../src/lib/edit-tradeoff'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { readFileSync } from 'fs'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`)
  }
}

const KINDS: ReasonedEditKind[] = ['swap', 'remove']

// ---------------------------------------------------------------------------
console.log('\n1. Both verbs ask, and both offer exactly four answers')
// ---------------------------------------------------------------------------
{
  for (const kind of KINDS) {
    const chips = reasonChipsFor(kind)
    check(`${kind}: four chips`, chips.length === 4, chips.map(c => c.label))
    check(`${kind}: every chip has a label, a note and something to send`,
      chips.every(c => c.label.trim() && c.note.trim() && c.prompt.trim()), chips)
    // A duplicate label renders two identical buttons that do different
    // things, which is worse than a missing one.
    check(`${kind}: no two chips say the same thing`,
      new Set(chips.map(c => c.label.toLowerCase())).size === 4, chips.map(c => c.label))
  }

  // The verbs genuinely differ — if they did not, one list would do and the
  // per-verb split would be ceremony. Measured rather than asserted.
  const swap = reasonChipsFor('swap').map(c => c.label)
  const remove = reasonChipsFor('remove').map(c => c.label)
  check('the two verbs offer different answer sets',
    JSON.stringify(swap) !== JSON.stringify(remove), { swap, remove })
  check('...and they share the hurts answer, in the same position',
    reasonsFor('swap')[2].reason === 'hurts' && reasonsFor('remove')[2].reason === 'hurts',
    { swap: reasonsFor('swap').map(s => s.reason), remove: reasonsFor('remove').map(s => s.reason) })
}

// ---------------------------------------------------------------------------
console.log('\n2. Every answer goes somewhere real')
// ---------------------------------------------------------------------------
{
  // Every route named here must be a capability the app HAS. This list is the
  // claim; section 3 checks it against the code rather than trusting it.
  const ROUTES: ReasonRoute[] = ['swap_today', 'swap_block', 'ban', 'injury', 'shorten', 'lighter', 'equipment']
  const seen = new Set<ReasonRoute>()
  for (const kind of KINDS) {
    for (const spec of reasonsFor(kind)) {
      check(`${kind}/${spec.reason} → ${spec.route}`, ROUTES.includes(spec.route), spec)
      seen.add(spec.route)
    }
  }
  // Two answers must not collapse onto one route, or the question is theatre:
  // asking which of two problems it is and then doing the same thing either
  // way is exactly what this feature exists to stop.
  const perKind = KINDS.map(k => new Set(reasonsFor(k).map(s => s.route)).size)
  check('within one verb, no two answers do the same thing', perKind.every(n => n === 4), perKind)

  check('hurts always routes to the injury path, never a plain swap',
    KINDS.every(k => reasonsFor(k).filter(s => s.reason === 'hurts').every(s => s.route === 'injury')))
}

// ---------------------------------------------------------------------------
console.log('\n3. The routes are capabilities that exist')
// ---------------------------------------------------------------------------
{
  // DERIVED, NOT LISTED. The point of a route is that something answers it, so
  // the check reads the app rather than a second copy of the table. Each route
  // names the function the screen calls; if one is renamed or deleted, this
  // fails instead of the route quietly pointing at nothing.
  const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  const plan = src('src/lib/exercise-plan.ts')
  const volume = src('src/lib/volume-adjust.ts')
  const adapt = src('src/lib/plan-adaptations.ts')
  const exec = src('src/lib/pending-action-executor.ts')

  const BACKING: Record<ReasonRoute, [string, boolean]> = {
    shorten: ['shortenDayTo', /export function shortenDayTo\b/.test(plan)],
    lighter: ['adjustDayVolume', /export function adjustDayVolume\b/.test(volume)],
    equipment: ['substituteForEquipment', /export async function substituteForEquipment\b|export function substituteForEquipment\b/.test(adapt)],
    injury: ['executeInjuryAdaptation + executeLastingInjury',
      /export async function executeInjuryAdaptation\b/.test(exec) && /export async function executeLastingInjury\b/.test(exec)],
    ban: ['executeExerciseBan', /export async function executeExerciseBan\b/.test(exec)],
    // In mesocycle-edit.ts, and async — both of which the first cut of this
    // check got wrong, which is the check doing its job on itself.
    swap_today: ['swapExerciseInMesocycle', /export async function swapExerciseInMesocycle\b/.test(src('src/lib/mesocycle-edit.ts'))],
    swap_block: ['swapExerciseInMesocycle', /export async function swapExerciseInMesocycle\b/.test(src('src/lib/mesocycle-edit.ts'))],
  }
  for (const [route, [fn, ok]] of Object.entries(BACKING) as [ReasonRoute, [string, boolean]][]) {
    check(`${route} is backed by ${fn}`, ok)
  }
}

// ---------------------------------------------------------------------------
console.log('\n4. One phrasebook — nobody writes their own sentence')
// ---------------------------------------------------------------------------
{
  // A cardLine is either a real sentence or DELIBERATELY empty. The
  // distinction is the point: "" means §3 said "nothing extra", and a gate
  // must be able to tell that from a line somebody forgot to write.
  for (const kind of KINDS) {
    for (const spec of reasonsFor(kind)) {
      const line = cardLineFor(spec.reason)
      check(`${spec.reason}: its card line is a sentence or an intentional silence`,
        line === '' || (line.trim().length > 10 && /[.!?]$/.test(line.trim())), { reason: spec.reason, line })
    }
  }
  // The silent ones are the two §3 marks Tier 0 / hands to another flow.
  check('busy is silent (a one-day swap round a taken machine costs nothing)', cardLineFor('busy') === '')
  check('hurts is silent here (the injury flow does its own talking)', cardLineFor('hurts') === '')
  check('...and the other four DO say something',
    (['dislike', 'no_time', 'no_kit', 'tired'] as EditReason[]).every(r => cardLineFor(r) !== ''))

  check('the question names the exercise, on both verbs',
    KINDS.every(k => reasonQuestion(k, 'Barbell Bench Press').includes('Barbell Bench Press')))
  check('...and is a question', KINDS.every(k => reasonQuestion(k, 'X').trim().endsWith('?')))
}

// ---------------------------------------------------------------------------
console.log('\n5. A chip that comes back as text is recognised')
// ---------------------------------------------------------------------------
{
  // The coach side only gets the WORDS back — handleQuickReply puts the label
  // in the composer and sends it as an ordinary message. So every label the
  // app renders must map back to the reason that produced it, or the routing
  // is one-way and the answer is lost.
  for (const kind of KINDS) {
    for (const spec of reasonsFor(kind)) {
      check(`"${spec.chip.label}" round-trips to ${spec.reason}`,
        reasonForLabel(spec.chip.label) === spec.reason, reasonForLabel(spec.chip.label))
    }
  }
  check('...and so does the longer prompt form', reasonForLabel(reasonsFor('swap')[0].chip.prompt) === 'busy')
  check('case and padding do not split one answer in two', reasonForLabel('  IT HURTS  ') === 'hurts')
  check('something nobody offered is not guessed at', reasonForLabel('because I said so') === null)

  // THE LOOP ABOVE CANNOT FAIL ON ITS OWN. It reads both the label and the
  // expected answer from the same table, so renaming a chip renames both
  // sides and it stays green — the self-consistent-fixture trap this codebase
  // keeps finding. These pin `reasonForLabel`'s BEHAVIOUR instead, against
  // strings the table does not contain.
  check('the resolver is exact, not fuzzy — a longer sentence is not claimed',
    reasonForLabel('It hurts a lot when I press') === null, reasonForLabel('It hurts a lot when I press'))
  check('...nor is a fragment of a label', reasonForLabel('hurts') === null, reasonForLabel('hurts'))
  check('...and it resolves something rather than nothing',
    KINDS.flatMap(k => reasonsFor(k)).every(s => reasonForLabel(s.chip.label) !== null))
  // Every label must land on its OWN reason, which a resolver that returned
  // the first entry every time would fail while the loop above passed.
  const resolved = KINDS.flatMap(k => reasonsFor(k)).map(s => reasonForLabel(s.chip.label))
  check('...on more than one distinct reason', new Set(resolved).size >= 4, resolved)
}

// ---------------------------------------------------------------------------
console.log('\n6. The hurts triage — Ashley\'s ruling, held in code')
// ---------------------------------------------------------------------------
{
  check('three answers, not two', HURT_KINDS.length === 3, HURT_KINDS.map(h => h.kind))
  check('...a niggle, a lasting one, and the one that needs a person',
    HURT_KINDS.map(h => h.kind).join(',') === 'niggle,lasting,red_flag', HURT_KINDS.map(h => h.kind))
  check('every answer says what it will do', HURT_KINDS.every(h => h.label.trim() && h.note.trim()))

  // The red-flag branch is the only one that must never reach the plan, so
  // what it says has to say so.
  check('the red-flag advice sends them to a professional',
    /physio|professional/i.test(RED_FLAG_ADVICE), RED_FLAG_ADVICE)
  check('...and states plainly that nothing was changed',
    /left your plan|not changed|exactly as it is/i.test(RED_FLAG_ADVICE), RED_FLAG_ADVICE)
  check('...without naming a condition or offering a diagnosis',
    !/tendonitis|impingement|tear|strain|sprain|you have/i.test(RED_FLAG_ADVICE), RED_FLAG_ADVICE)

  check('a niggle eases off for a week', NIGGLE_EASE_OFF_DAYS === 7)
  check('...which is a real duration, not zero or forever',
    NIGGLE_EASE_OFF_DAYS > 0 && NIGGLE_EASE_OFF_DAYS <= 28)
}

// ---------------------------------------------------------------------------
console.log('\n7. Where both questions apply, there is ONE question')
// ---------------------------------------------------------------------------
{
  // The main-lift removal already asked "what's going on with it?" and offered
  // three chips that did not answer it. The fix is that its chips ARE the
  // reason chips — so a person is never asked why and then asked again.
  //
  // EXECUTED, not grepped: a real plan is generated, its week 1 is put into a
  // strength phase, assessEdit is RUN on removing that day's main lift, and
  // the chips are read off the verdict it hands back. A grep for
  // `reasonChipsFor` in the source would pass against a call whose result was
  // thrown away.
  const profile = {
    id: 'reason-gate', fitness_goal: 'hypertrophy', training_experience: 'intermediate',
    equipment_access: 'full_gym', session_duration_preference: '45-60',
    training_days: ['Monday', 'Tuesday', 'Thursday', 'Friday'].map(day => ({ day, available: true })),
    weight_kg: 80, height_cm: 180, age: 30, gender: 'male',
    training_style: 'hybrid', recovery_capacity: 'moderate', injuries: [],
  } as unknown as Parameters<typeof assessEdit>[0]['profile']

  setRandomSource(seededRngFromKey('edit-reason-gate'))
  const meso = generateMesocycle(profile)
  resetRandomSource()

  const strength = meso.map(w => (w.week_number === 1 ? { ...w, phase_label: 'Maximal Strength' } : w))
  const w1 = strength.find(w => w.week_number === 1)!
  const mainDay = w1.days.find(d => d.exercises.some(e => e.tier === 'tier_1_primary'))!
  const mainLift = mainDay.exercises.find(e => e.tier === 'tier_1_primary')!.name

  const verdict: Tradeoff = assessEdit({
    profile, before: strength, after: strength, weekNumber: 1,
    dayName: mainDay.day, kind: 'remove', scope: 'permanent', exerciseName: mainLift,
  })

  check('the fixture reaches the case at all (tier 2, main lift in a strength block)',
    verdict.tier === 2 && /main lift during a strength phase/.test(verdict.reason), verdict.reason)

  const labels = verdict.alternatives.map(a => a.label)
  check('...and its chips are the REMOVE reason chips',
    JSON.stringify(labels) === JSON.stringify(reasonChipsFor('remove').map(c => c.label)), labels)

  // THE DEFECT THIS REPLACED. The question asked "what's going on with it?"
  // and offered Swap it instead / Just today / Do it anyway — three buttons,
  // none of them an answer. Pinned as a property rather than as the old
  // strings, so it still holds when the wording changes.
  check('every chip is a possible answer to the question being asked',
    labels.every(l => reasonForLabel(l) !== null), labels)

  // ...AND THE ESCAPE IS STILL THERE. Four alternatives plus "Do it anyway"
  // is five, and askText used to slice the combined list to four — which
  // dropped exactly the chip the whole decision rests on. Read off the
  // rendered text, not the verdict.
  const asked = askText(verdict)
  check('the rendered question still offers the escape', asked.includes(DO_IT_ANYWAY), asked)
  check('...as the last chip', asked.trimEnd().endsWith(`"${DO_IT_ANYWAY}"]`), asked)
  const rendered = /\[QUICK_REPLIES:\s*(.*)\]/.exec(asked)?.[1].split('|').length ?? 0
  check('...alongside all four answers, none silently dropped', rendered === 5, { rendered, asked })
}

// ---------------------------------------------------------------------------
// 8. "I HAVEN'T GOT THE KIT" — test log H2/H3, 9 Oct 2026.
//
// Three things, all about one path:
//   (a) a kit change that changes nothing is INFORMATION, and the sheet can
//       tell it from a failure (it was drawn red);
//   (b) the picker does not offer the tier the plan is already built for;
//   (c) easing an area off, or changing kit, from the exercise row honours
//       what the person has banned — both passed `exclusions: []`, so a
//       row-level change could hand back a banned exercise.
// (c) is RUN, against the real appliers with a stand-in database, because the
// property is about what ends up on the plan.
// ---------------------------------------------------------------------------
async function kitAndExclusions() {
  console.log('\n8. "I haven\'t got the kit": a no-op is an answer, and bans are honoured')

  // --- (a) which messages are information ---
  const same = equipmentNothingToChange({ sameTier: true, tierLabel: 'Minimalist', scope: 'this week' })
  const other = equipmentNothingToChange({ sameTier: false, tierLabel: 'Home gym', scope: 'the next 5 days' })
  check('picking the tier you are already on says the plan is built for it', same === 'Your plan is already built around minimalist — nothing to change.', same)
  check('another tier that conflicts with nothing names the kit and the stretch checked', other === 'Everything in the next 5 days already works with home gym — nothing to change.', other)
  check('both are recognised as "nothing to change"', isNothingToChangeMessage(same) && isNothingToChangeMessage(other))
  check('so are the two "nothing loads that area" answers', isNothingToChangeMessage(NOTHING_LOADS_THAT_AREA) && isNothingToChangeMessage(NOTHING_LOADS_THAT_AREA_NOTED))
  const failuresSaid = [
    "That didn't save — try again in a moment.",
    "I can't see this week on your plan just now.",
    "I can't see the rest of your plan just now.",
    'No plan to edit.',
    "I can't adjust for that just now.",
    'Every exercise is already at its minimum.',
    // Contains the word, and is still a failure — recognition is by identity.
    'Nothing saved — check your connection and try again.',
    '',
  ]
  check('a real failure is never mistaken for one', failuresSaid.every(m => !isNothingToChangeMessage(m)), failuresSaid.filter(m => isNothingToChangeMessage(m)))
  check('...nor is null', !isNothingToChangeMessage(null) && !isNothingToChangeMessage(undefined))

  // --- the screens, read as source (comments stripped) ---
  const strip = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const dialog = strip(readFileSync('src/components/exercise/SwapDialog.tsx', 'utf8'))
  check('the swap sheet draws a no-op as a note, not in the error colour',
    /isNothingToChangeMessage\(reasonError\)\s*\?\s*<p className="[^"]*text-muted-foreground[^"]*" data-testid="swap-reason-note"/.test(dialog)
    && !/swap-reason-note"[^>]*text-destructive|text-destructive[^"]*" data-testid="swap-reason-note"/.test(dialog))
  check('...and a failure still in red', /<p className="[^"]*text-destructive[^"]*" data-testid="swap-reason-error"/.test(dialog))
  // --- (b) the picker ---
  const step = strip(readFileSync('src/components/exercise/EditReasonStep.tsx', 'utf8'))
  check('the kit picker leaves out the tier the plan is already built for', /EQUIPMENT_OPTIONS\.filter\(o => o\.value !== currentEquipment\)\.map/.test(step))
  check('...and the swap sheet tells it which tier that is', /currentEquipment=\{profile\?\.equipment_access\}/.test(dialog))
  // The coach says the same sentence for the same finding, instead of the
  // generic "I couldn't find that on your current plan".
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  const builder = chat.slice(chat.indexOf('const buildEquipmentAdaptationProposal = '), chat.indexOf('const buildEquipmentAdaptationProposal = ') + 3200)
  check('the coach\'s equipment card answers a no-op with the shared sentence', /touchedSlots\.length === 0\) \{\s*return \{\s*refusal: equipmentNothingToChange\(/.test(builder), builder.slice(0, 120))
  check('...and its caller passes that refusal on rather than dropping it', /const adaptation = await buildEquipmentAdaptationProposal\([^)]*\)\s*if \(adaptation && 'refusal' in adaptation\) refusal = adaptation\.refusal/.test(chat))

  // --- (c) bans are honoured, RUN ---
  const ok: unknown = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (resolve: (v: unknown) => void) => resolve({ data: null, error: null }) : ok),
    apply: () => ok,
  })
  setSupabaseClient({ from: () => ok, rpc: () => ok } as never)
  const quietLog = console.log; const quietWarn = console.warn
  const hush = async <T>(fn: () => Promise<T>): Promise<T> => { console.log = () => {}; console.warn = () => {}; try { return await fn() } finally { console.log = quietLog; console.warn = quietWarn } }

  const sam = {
    id: 'p-1', age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate',
    fitness_goal: 'fat_loss', preferred_time: 'evening', bmr: 1800, tdee: 2600, equipment_access: 'minimalist',
    injuries: ['shoulders'], training_style: 'bodybuilding', training_experience: 'intermediate',
    session_duration_preference: '30-45', workout_split_preference: 'ai_recommendation',
    training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({ day, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(day) })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate', max_dumbbell_kg: 24,
    // The plan starts NOW: the appliers address days by date from the app's
    // clock, so a fixed start would make this gate depend on the day it is run.
    created_at: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
  } as never
  setRandomSource(seededRngFromKey('sam:2'))
  const plan = await hush(async () => generateMesocycle(sam))
  resetRandomSource()
  const namesIn = (meso: { week_number: number; days: { exercises: { name: string }[] }[] }[], week: number) =>
    new Set(meso.find(w => w.week_number === week)!.days.flatMap(d => d.exercises.map(e => e.name)))

  // INJURY. First find what the knee adaptation reaches for with nothing banned…
  const open = await hush(() => applyInjuryFromRow(sam, plan, (sam as { created_at: string }).created_at, 'niggle', 'knees', []))
  const brought = [...namesIn(open.mesocycle ?? [], 1)].filter(n => !namesIn(plan, 1).has(n))
  check('with nothing banned, easing the knees off brings in other exercises', open.message === null && brought.length >= 2, { message: open.message, brought })
  // …then ban the first of them and ask again.
  const banned = brought[0]
  const honoured = await hush(() => applyInjuryFromRow(sam, plan, (sam as { created_at: string }).created_at, 'niggle', 'knees', [banned]))
  check(`with ${banned} banned, the same change does not bring it in`, !!honoured.mesocycle && !namesIn(honoured.mesocycle, 1).has(banned), honoured.mesocycle ? [...namesIn(honoured.mesocycle, 1)] : honoured.message)

  // KIT. Same shape: bodyweight for the week, with and without a ban.
  const kitOpen = await hush(() => applyEquipmentFromRow(sam, plan, (sam as { created_at: string }).created_at, 'bodyweight', []))
  const kitBrought = [...namesIn(kitOpen.mesocycle ?? [], 1)].filter(n => !namesIn(plan, 1).has(n))
  check('with nothing banned, switching to bodyweight brings in other exercises', kitOpen.message === null && kitBrought.length >= 1, { message: kitOpen.message, kitBrought })
  const kitBanned = kitBrought[0]
  const kitHonoured = await hush(() => applyEquipmentFromRow(sam, plan, (sam as { created_at: string }).created_at, 'bodyweight', [kitBanned]))
  check(`with ${kitBanned} banned, the kit change does not bring it in`, !!kitHonoured.mesocycle && !namesIn(kitHonoured.mesocycle, 1).has(kitBanned), kitHonoured.mesocycle ? [...namesIn(kitHonoured.mesocycle, 1)] : kitHonoured.message)

  // And the tester's own tap: his own tier, which the picker no longer
  // offers but the function must still answer honestly if it is ever asked.
  const own = await hush(() => applyEquipmentFromRow(sam, plan, (sam as { created_at: string }).created_at, 'minimalist', []))
  check('picking his own tier changes nothing and says so as information', own.mesocycle === undefined && isNothingToChangeMessage(own.message) && /already built around minimalist/.test(own.message ?? ''), own.message)

  // The tab hands the appliers the person's real list.
  const tab = strip(readFileSync('src/components/exercise/ExerciseTab.tsx', 'utf8'))
  check('the exercise tab passes its exclusions to both appliers',
    // Re-anchored 9 Oct 2026: both now take the SAVED profile (never the pool
    // one, which carries temporary constraints) and the plan's start, because
    // they address days by date rather than "this plan week".
    /applyInjuryFromRow\(saved, mesocycle, planCreatedAt, answer\.hurt, answer\.area, exclusions\)/.test(tab)
    && /applyEquipmentFromRow\(saved, mesocycle, planCreatedAt, tier, exclusions\)/.test(tab))
  const appliers = strip(readFileSync('src/lib/screen-adaptations.ts', 'utf8'))
  check('...and neither applier hard-codes an empty list any more', !/exclusions:\s*\[\]/.test(appliers), appliers.match(/exclusions:\s*\[\]/g))
}

kitAndExclusions().then(() => {
  console.log(failures === 0 ? '\nAll reason-chip checks passed.\n' : `\n${failures} check(s) failed.\n`)
  process.exit(failures === 0 ? 0 : 1)
}).catch(err => { console.error(err); process.exit(1) })
