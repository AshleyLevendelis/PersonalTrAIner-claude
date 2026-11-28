/**
 * A WORKOUT OF HIS OWN, FROM THE CHAT (advise-then-allow fix 13, 28 Nov 2026).
 *
 * The screen could start a workout of his own or save one for a day (25 Nov); the coach could not. The coach's card is
 * worked out by planOwnWorkoutOffer and written by applyOwnWorkout through the screen's own store, so Exercise shows
 * what the chat made. 1. the offer, called; 2. Apply and Undo against the real store (a phone storage stand-in);
 * 3. the wiring, read.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { setSupabaseClient } from '../src/lib/supabase'
import { planOwnWorkoutOffer, applyOwnWorkout, undoOwnWorkout, ownItemLine, ownWorkoutStopAtApply, type OwnWorkoutPayload } from '../src/lib/own-workout-offer'
import { loadOwnWorkouts, saveOwnWorkout } from '../src/lib/own-workout'
import { ownPlans, setPlanOnDate } from '../src/lib/own-workout-plans'
import { getExerciseEntry, registerNearCopies, logOnlyExercises } from '../src/lib/exercise-db'
import { NEAR_COPIES } from '../src/lib/exercise-near-copies'
import { swapHardStop } from '../src/lib/swap-advice'
import type { UserProfile } from '../src/lib/types'

setSupabaseClient({ from: () => ({ upsert: () => Promise.resolve({ error: null }) }) } as never)
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v) }, removeItem: k => { store.delete(k) },
  clear: () => store.clear(), key: () => null, length: 0,
} as Storage

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
let ran = 0
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const TODAY = '2026-11-28'
const profile = { equipment_access: 'full_gym', injuries: [], training_style: 'bodybuilding', training_experience: 'intermediate', health_conditions: [] } as unknown as UserProfile
let ids = 0
const offer = (args: Record<string, unknown>, p: UserProfile = profile, exclusions: string[] = []) => planOwnWorkoutOffer({
  mode: args.mode, name: args.name, date: args.date, items: args.items, today: TODAY,
  dayName: d => (d === '2026-11-30' ? 'Monday' : d), resolve: said => (/^bench$/i.test(said) ? { ambiguous: ['Barbell Bench Press', 'Dumbbell Bench Press'] } : getExerciseEntry(said) ?? null),
  profile: p, exclusions, newId: () => `own-test-${++ids}`,
})

console.log('\n1. The offer')
const start = offer({ mode: 'start', name: 'Arms', items: [{ exercise: 'Barbell Bench Press', sets: 4, reps: '6', weight_kg: 60 }, { exercise: 'Hammer Curls' }, { cardio: 'bike', minutes: 10 }] })
check('start today: his own workout, started now', start.ok && start.payload.mode === 'start' && start.payload.date === TODAY && start.lead === 'start **Arms** now', start)
check('...his numbers kept as he gave them (4 × 6 at 60 kg)', start.ok && start.lines[0] === 'Barbell Bench Press · 4 × 6 at 60 kg', start.ok && start.lines)
check('...none given: 3 × 8-10, the screen\'s own default', start.ok && start.lines[1] === 'Hammer Curls · 3 × 8-10', start.ok && start.lines)
check('...cardio as cardio, with its minutes', start.ok && start.lines[2] === 'Bike · 10 min', start.ok && start.lines)
const plan = offer({ mode: 'plan', date: '2026-11-30', items: [{ exercise: 'Goblet Squats' }] })
check('a day ahead is saved for that day, named "My workout" when he gave no name', plan.ok && plan.payload.mode === 'plan' && plan.payload.date === '2026-11-30' && plan.payload.name === 'My workout' && plan.lead === 'save **My workout** to your workouts and put it on Monday', plan)
check('"start" for a day ahead is a plan for that day, not a start', (() => { const o = offer({ mode: 'start', date: '2026-11-30', items: [{ exercise: 'Goblet Squats' }] }); return o.ok && o.payload.mode === 'plan' })())
const past = offer({ mode: 'start', date: '2026-11-20', items: [{ exercise: 'Goblet Squats' }] })
check('a day that has been is not this card: sent to the session log, nothing written', !past.ok && /Tell me the sets you did and I'll log them on that day/.test(past.reason), past)
const unknown = offer({ mode: 'start', items: [{ exercise: 'Turbo Encabulator Press' }] })
check('a name the app does not know is asked about, never guessed', !unknown.ok && /couldn't find "Turbo Encabulator Press"/.test(unknown.reason), unknown)
check('nothing named: asked what goes in it', !offer({ mode: 'start', items: [] }).ok)
check('more than twelve things: asked which matter', (() => { const o = offer({ mode: 'start', items: Array.from({ length: 13 }, () => ({ exercise: 'Hammer Curls' })) }); return !o.ok && /12 at most/.test(o.reason) })())
check('his reps are kept as he said them ("AMRAP", "45s"), never replaced by a default', (() => { const o = offer({ mode: 'start', items: [{ exercise: 'Hammer Curls', reps: 'AMRAP' }, { exercise: 'Plank', sets: 3, reps: '45s' }] }); return o.ok && o.lines[0] === 'Hammer Curls · 3 × AMRAP' && o.lines[1] === 'Plank · 3 × 45s' })())
check('a number that cannot be right is ASKED about, never replaced (99 sets, 900 kg)', (() => { const a = offer({ mode: 'start', items: [{ exercise: 'Hammer Curls', sets: 99 }] }); const b = offer({ mode: 'start', items: [{ exercise: 'Hammer Curls', weight_kg: 900 }] }); return !a.ok && /How many sets of Hammer Curls/.test(a.reason) && !b.ok && /What weight for Hammer Curls/.test(b.reason) })())
check('a name that fits several is asked about by name, not "couldn\'t find"', (() => { const o = offer({ mode: 'start', items: [{ exercise: 'bench' }] }); return !o.ok && o.reason === 'Which "bench" do you mean: Barbell Bench Press, Dumbbell Bench Press?' })())
check('an item that is neither an exercise nor cardio is asked about, never dropped', (() => { const o = offer({ mode: 'start', items: [{ exercise: 'Hammer Curls' }, { name: 'curls' } as never] }); return !o.ok && /couldn't tell what one of those was/.test(o.reason) })())
check('a day that is not a date is asked about, never dropped to "no day"', (() => { const o = offer({ mode: 'plan', date: 'Saturday', items: [{ exercise: 'Hammer Curls' }] }); return !o.ok && o.reason === 'Which day do you want it on?' })())

console.log('\n1b. The hard stops refuse; everything else goes in with a note')
const knee = { ...profile, injuries: ['knees'] } as unknown as UserProfile
const kneeStop = offer({ mode: 'start', items: [{ exercise: 'Barbell Bench Press' }, { exercise: 'Box Jumps' }] }, knee)
check('a move his injuries rule out stops the whole card, in "put it in" words', !kneeStop.ok && /which your plan is protecting for your injuries, so I won't put it in/.test(kneeStop.reason), kneeStop)
const banned = offer({ mode: 'start', items: [{ exercise: 'Hammer Curls' }] }, profile, ['Hammer Curls'])
check('his never-again list stops it', !banned.ok && /never-again list/.test(banned.reason) && /I can put it in/.test(banned.reason), banned)
const pregnant = { ...profile, health_conditions: ['pregnancy'] } as unknown as UserProfile
const jumpCardio = offer({ mode: 'start', items: [{ cardio: 'Burpees', minutes: 10 }] }, pregnant)
check('pregnant: a jumping move filed as CARDIO is still refused (cardio was skipping the stops)', !jumpCardio.ok && /jumping move/.test(jumpCardio.reason) && /won't put it in/.test(jumpCardio.reason), jumpCardio)
const late = { ...pregnant, due_date: '2027-01-20' } as unknown as UserProfile
check('...and from 28 weeks a split squat, read on the app\'s today', (() => { const o = offer({ mode: 'start', items: [{ exercise: 'Bulgarian Split Squats' }] }, late); return !o.ok && /from 28 weeks/.test(o.reason) })())
check('...a plain walk is cardio and goes in', offer({ mode: 'start', items: [{ cardio: 'walk', minutes: 20 }] }, pregnant).ok)
const at27 = { ...pregnant, due_date: '2027-02-27' } as unknown as UserProfile
check('at 27 weeks: a workout saved for three weeks on is judged on THAT day (past 28 weeks)', (() => { const o = offer({ mode: 'plan', date: '2026-12-19', items: [{ exercise: 'Bulgarian Split Squats' }] }, at27); return !o.ok && /from 28 weeks/.test(o.reason) })() && offer({ mode: 'start', items: [{ exercise: 'Bulgarian Split Squats' }] }, at27).ok)
check('"jumps" while pregnant, a name that could be several moves, is asked about (any of them could be a stop)', (() => { const o = planOwnWorkoutOffer({ mode: 'start', name: null, date: null, items: [{ cardio: 'jumps', minutes: 10 }], today: TODAY, dayName: d => d, resolve: () => ({ ambiguous: ['Box Jumps', 'Jumping Jacks'] }), profile: pregnant, exclusions: [], newId: () => 'x' }); return !o.ok && o.reason === 'Which "jumps" do you mean: Box Jumps, Jumping Jacks?' })())
check('...a cardio minutes figure that cannot be right is asked, as lifts are', (() => { const o = offer({ mode: 'start', items: [{ cardio: 'walk', minutes: 900 }] }); return !o.ok && /How many minutes of walk/.test(o.reason) })())
const okStart = offer({ mode: 'start', items: [{ exercise: 'Box Jumps' }] })
check('THE STOPS AGAIN AT APPLY: fine when carded, a knee added since stops it', okStart.ok && ownWorkoutStopAtApply(okStart.payload, profile, [], TODAY) === null && /won't put it in/.test(ownWorkoutStopAtApply(okStart.payload, knee, [], TODAY) ?? ''))
registerNearCopies(NEAR_COPIES)
const copy = logOnlyExercises().find(e => !!e.parent && swapHardStop(e, profile, [], TODAY) === null)
const withCopy = copy ? offer({ mode: 'start', items: [{ exercise: copy.name }] }) : null
check('a near-copy goes into his own workout WITH A NOTE naming the plan\'s own pick (his "Yes, with a note")', !!withCopy && withCopy.ok && withCopy.notes.some(n => n === `${copy!.name}: a version of ${copy!.parent}; your plan's own pick is ${copy!.parent}.`), { copy: copy?.name, withCopy })
const home = { ...profile, equipment_access: 'bodyweight' } as unknown as UserProfile
const outOfKit = offer({ mode: 'start', items: [{ exercise: 'Barbell Bench Press' }] }, home)
check('outside his kit: in, with the screen\'s own warning named by exercise', outOfKit.ok && outOfKit.warnings.some(w => w.startsWith('Barbell Bench Press: ')), outOfKit)
check('...and nothing to say about one that fits', start.ok && start.warnings.length === 0, start.ok && start.warnings)
check('the line a card shows', ownItemLine({ kind: 'lift', name: 'Dips', sets: 3, reps: '10', weight: '' }) === 'Dips · 3 × 10' && ownItemLine({ kind: 'cardio', activity: 'Run', minutes: '' }) === 'Run')

console.log('\n2. Apply and Undo, through the screen\'s store')
const P = 'prof-1', NOW = `${TODAY}T10:00:00.000Z`
const s = start.ok ? start.payload : null as unknown as OwnWorkoutPayload
check('Apply starts it: one workout today, under the card\'s id, live, unfinished', applyOwnWorkout(P, s, NOW, () => []) && (() => { const w = loadOwnWorkouts(P).find(x => x.id === s.id); return !!w && w.date === TODAY && w.mode === 'live' && w.finishedAtIso === null && w.name === 'Arms' })())
const w = loadOwnWorkouts(P).find(x => x.id === s.id)
check('...the sets in the boxes, nothing logged, his rest', !!w && w.items.length === 3 && w.items[0].kind === 'lift' && w.items[0].sets.length === 4 && w.items[0].sets.every(x => !x.done && x.reps === '6' && x.weight === '60'), w?.items[0])
check('...not tied to a saved workout (none was made)', !!w && w.planId === undefined && ownPlans(P).length === 0)
check('...its set numbers run on after the plan\'s sets already logged today', (() => {
  const p2 = { ...s, id: 'own-test-taken' }
  applyOwnWorkout(P, p2, NOW, id => id === getExerciseEntry('Barbell Bench Press')!.id ? [1, 2, 3] : [])
  const got = loadOwnWorkouts(P).find(x => x.id === 'own-test-taken')
  return !!got && got.items[0].kind === 'lift' && got.items[0].sets[0].setNumber === 4
})())
check('Undo takes it off while nothing is logged', undoOwnWorkout(P, s, NOW).ok && !loadOwnWorkouts(P).some(x => x.id === s.id))
applyOwnWorkout(P, s, NOW, () => [])
const ticked = loadOwnWorkouts(P).find(x => x.id === s.id)!
saveOwnWorkout(P, { ...ticked, items: ticked.items.map((i, n) => n === 0 && i.kind === 'lift' ? { ...i, sets: i.sets.map((x, k) => k === 0 ? { ...x, done: true } : x) } : i) })
const kept = undoOwnWorkout(P, s, NOW)
check('...but once a set is ticked it stays, and says so', !kept.ok && /You've logged some of it, so it stays/.test(kept.kept) && loadOwnWorkouts(P).some(x => x.id === s.id), kept)
const pl = plan.ok ? plan.payload : null as unknown as OwnWorkoutPayload
check('Apply a plan: in his workouts, on that day, with his items', applyOwnWorkout(P, pl, NOW, () => []) && (() => { const x = ownPlans(P).find(p => p.id === pl.id); return !!x && x.onDates.join() === '2026-11-30' && x.items.length === 1 && x.items[0].kind === 'lift' && x.items[0].name === 'Goblet Squats' })())
check('...Undo removes it', undoOwnWorkout(P, pl, NOW).ok && !ownPlans(P).some(p => p.id === pl.id))
applyOwnWorkout(P, pl, NOW, () => [])
setPlanOnDate(P, pl.id, '2026-12-05', true, NOW)
const editedUndo = undoOwnWorkout(P, pl, NOW)
check('...but once he has changed it (put it on another day) Undo leaves it, and says so', !editedUndo.ok && /You've changed it since/.test(editedUndo.kept) && ownPlans(P).some(p => p.id === pl.id), editedUndo)

console.log('\n3. The coach and the card')
const chat = strip(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
const card = chat.slice(chat.indexOf('const buildOwnWorkoutProposal'), chat.indexOf('const buildRestDayProposal'))
check('the card is planned by the offer, with the pool profile, his bans and the app\'s today', card.length > 500 && /planOwnWorkoutOffer\(\{/.test(card) && /profile: poolProfile, exclusions: exerciseExclusions/.test(card) && /today: activeSession\.date/.test(card))
check('...a refusal is said, never a card', /if \(!offer\.ok\) return offer/.test(card) && /propose_own_workout'\) \{\s*const ow = buildOwnWorkoutProposal[\s\S]{0,300}else refusal = ow\.reason/.test(chat))
check('...on a day with a plan session, it says the plan\'s session stays', /It's a separate workout: today's \$\{todaySession\} stays on your plan\./.test(card))
check('Apply and Undo go through the store functions', /const ok = !stale && !stopNow && applyOwnWorkout\(profile\.id, payload,/.test(chat) && /const stopNow = stale \? null : ownWorkoutStopAtApply\(payload, poolProfile, exerciseExclusions, activeSession\.date\)/.test(chat) && /const back = undoOwnWorkout\(profile\.id,/.test(chat))
check('...numbering after today\'s logged sets AND the plan\'s own sets of that lift', /id => \[\.\.\.activeSession\.logs\.filter\(l => \(l\.exercise_id \?\? getExerciseId\(l\.exercise_name\)\) === id\)\.map\(l => l\.set_number\), \.\.\.planSets\(id\)\]/.test(chat) && /const planSets = \(id: string\) => \(todayResolved\.day\?\.exercises/.test(chat))
check('...a start card tapped after midnight is refused, not dated yesterday', /const stale = payload\.mode === 'start' && payload\.date !== activeSession\.date/.test(chat))
check('...the chat\'s lookup hands back the few a name could be', /if \(r\.resolution === 'ambiguous'\) return \{ ambiguous: r\.candidates\.map\(c => c\.name\) \}/.test(card))
const fn = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
check('the coach has the tool, returns a proposal, and is told when to use it', /name: "propose_own_workout"/.test(fn) && /kind: "propose_own_workout",\s*rawArgs: \{ mode: args\.mode, name: args\.name, date: args\.date, items: args\.items \}/.test(fn) && /- Trigger propose_own_workout when they want a workout of THEIR OWN/.test(fn))

console.log(`\nown-workout-offer: ${ran} checks ran`)
if (failures > 0) { console.error(`own-workout-offer: ${failures} check(s) FAILED`); process.exit(1) }
console.log('own-workout-offer: all checks passed')
