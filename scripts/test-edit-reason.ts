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
  type EditReason, type ReasonedEditKind, type ReasonRoute,
} from '../src/lib/edit-reason'
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

console.log(failures === 0 ? '\nAll reason-chip checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
