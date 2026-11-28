/**
 * SWAP FOR ANYTHING, WITH THE WHY (advise-then-allow fix 17, his ruling 28 Nov 2026).
 *
 * The coach was told a replacement MUST be the same movement pattern, and nothing in the app checked his hard stops
 * on a replacement he named himself (coachSwapPick leaves a named choice alone, and the card and confirm checked only
 * that the name existed). Now: a named replacement of a different pattern is carded with one sentence of why; a move
 * his injuries list rules out, the pregnancy rules or his never-again list is refused at the card AND at confirm.
 *
 * 1. The words (swap-advice.ts), called.  2. The hard stops at confirm, run.  3. The card and the coach, read.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { swapPatternAdvice, swapHardStop } from '../src/lib/swap-advice'
import { resolveAdditionAnywhere } from '../src/lib/exercise-add-candidates'
import { executeExerciseSwap, executeExerciseAdd } from '../src/lib/pending-action-executor'
import { EXERCISE_DATABASE, getExerciseEntry } from '../src/lib/exercise-db'
import type { UserProfile } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
let ran = 0
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

async function main() {
  console.log('\n1. What the card says about a different movement')
  const lunge = getExerciseEntry('Walking Lunges'), goblet = getExerciseEntry('Goblet Squats')
  check('the fixture: a lunge and a squat really are two patterns', !!lunge && !!goblet && lunge.movement_pattern !== goblet.movement_pattern, [lunge?.movement_pattern, goblet?.movement_pattern])
  const said = swapPatternAdvice('Walking Lunges', 'Goblet Squats', 'Tuesday') ?? ''
  check('names both movements in plain words, whatever the names\' number', said.startsWith("That puts a squat (Goblet Squats) where Tuesday's session had a lunge or split squat (Walking Lunges)"), said)
  check('...says what it costs and that it is his choice, never a refusal', /keeps the work but trains a different movement/.test(said) && /Fine if that's what you want/.test(said) && !/can't|won't|not allowed/i.test(said), said)
  check('...and "today" reads as today', (swapPatternAdvice('Walking Lunges', 'Goblet Squats', 'today') ?? '').includes("where today's session had"))
  const warm = EXERCISE_DATABASE.find(e => !e.retired && e.movement_pattern === 'activation')
  const intoWarm = warm ? swapPatternAdvice('Goblet Squats', warm.name, 'Tuesday') ?? '' : ''
  check('into or out of the warm-up it never claims the session "keeps the work"', !!warm && /does a different job there/.test(intoWarm) && !/keeps the work/.test(intoWarm) && /a warm-up move/.test(intoWarm), intoWarm)
  check('...and no label in brackets of its own ("deadlift/RDL pattern")', !/\/|pattern\)/.test(swapPatternAdvice('Goblet Squats', 'Romanian Deadlift', 'Tuesday') ?? ''), swapPatternAdvice('Goblet Squats', 'Romanian Deadlift', 'Tuesday'))
  const sameKind = EXERCISE_DATABASE.find(e => !e.retired && e.name !== 'Walking Lunges' && e.movement_pattern === lunge?.movement_pattern)
  check('a like-for-like swap says nothing extra', !!sameKind && swapPatternAdvice('Walking Lunges', sameKind.name, 'Tuesday') === null, sameKind?.name)
  check('an unknown name says nothing (never a guess)', swapPatternAdvice('Walking Lunges', 'Turbo Encabulator', 'Tuesday') === null)

  console.log('\n1b. The hard stops, on the ENTRY (a machine version, the pregnancy rules early and late, never-again)')
  const base = { equipment_access: 'full_gym', injuries: [], training_style: 'bodybuilding', training_experience: 'intermediate', health_conditions: [] } as unknown as UserProfile
  const hyper = getExerciseEntry('45-Degree Hyperextension Bench (Roman Chair)')
  check('the fixture: a machine VERSION, outside the catalogue the add lookup searches', !!hyper && !EXERCISE_DATABASE.some(e => e.name === hyper.name) && resolveAdditionAnywhere(hyper.name, { ...base, injuries: ['lower_back'] } as unknown as UserProfile, []) === null)
  const backStop = hyper ? swapHardStop(hyper, { ...base, injuries: ['lower_back'] } as unknown as UserProfile, [], '2026-11-28') : null
  check('a bad back STOPS that machine version (it was waved through: the add lookup returned nothing)', !!backStop && /loads your lower back axial, which your plan is protecting for your injuries, so I won't swap it in/.test(backStop), backStop)
  check('...and the same move is fine with no injury', !!hyper && swapHardStop(hyper, base, [], '2026-11-28') === null)
  check('...and its PARENT on the never-again list stops the version', !!hyper && /never-again list/.test(swapHardStop(hyper, base, ['Back Extension Machine'], '2026-11-28') ?? ''))
  const jump = ['Box Jumps', 'Burpees', 'Jump Squats'].map(n => getExerciseEntry(n)).find(Boolean)
  const pregnant = { ...base, health_conditions: ['pregnancy'] } as unknown as UserProfile
  const jumpStop = jump ? swapHardStop(jump, pregnant, [], '2026-11-28') : null
  check('pregnant: a jumping move is refused, naming it, in a refusal (not the search warning)', !!jumpStop && jumpStop.startsWith(`${jump!.name} is a jumping move`) && /so I won't swap it in/.test(jumpStop), jumpStop)
  const late = { ...pregnant, due_date: '2027-01-20' } as unknown as UserProfile // about 31 weeks on 28 Nov 2026
  const early = { ...pregnant, due_date: '2027-05-20' } as unknown as UserProfile
  const split = getExerciseEntry('Bulgarian Split Squats')!
  check('from 28 weeks: a split squat is refused (generation already swapped these out)', /from 28 weeks pregnant/.test(swapHardStop(split, late, [], '2026-11-28') ?? ''), swapHardStop(split, late, [], '2026-11-28'))
  check('...and allowed earlier in the pregnancy, as generation allows it', swapHardStop(split, early, [], '2026-11-28') === null)
  // THE LAST DAY THE CHANGE REACHES (the lead's review): 27 weeks today, past 28 by the block's end.
  const at27 = { ...pregnant, due_date: '2027-02-27' } as unknown as UserProfile
  check('at 27 weeks: a swap for today alone is fine...', swapHardStop(split, at27, [], '2026-11-28') === null)
  check('...but one reaching three weeks on (a whole block) is refused', /from 28 weeks pregnant/.test(swapHardStop(split, at27, [], '2026-12-19') ?? ''))
  check('a move he can do, of another pattern, has no stop', swapHardStop(goblet!, base, [], '2026-11-28') === null)

  console.log('\n2. The hard stops, at confirm (run, not read)')
  setRandomSource(seededRngFromKey('swap-for-anything'))
  const hurt = {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate', fitness_goal: 'build_muscle',
    bmr: 1800, tdee: 2500, equipment_access: 'full_gym', injuries: ['shoulders'], training_style: 'bodybuilding',
    training_experience: 'intermediate', session_duration_preference: '60', workout_split_preference: 'ai_recommendation',
    training_days: ['Monday', 'Tuesday', 'Thursday', 'Friday'].map(day => ({ day, available: true })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  } as unknown as UserProfile
  const log = console.log; console.log = () => {}
  const meso = generateMesocycle(hurt)
  console.log = log
  resetRandomSource()
  const week = meso[0]
  const day = week.days.find(d => d.exercises.length > 2)!
  const exIndex = day.exercises.findIndex(e => !!getExerciseEntry(e.name))
  const outgoing = day.exercises[exIndex]
  const stopped = EXERCISE_DATABASE.find(e => !e.retired && !e.log_only && /shoulder/.test(e.name.toLowerCase() + (e as { contraindications?: unknown }).contraindications) && swapHardStop(e, hurt, [], '2026-11-28') !== null) ?? EXERCISE_DATABASE.find(e => !e.retired && !e.log_only && swapHardStop(e, hurt, [], '2026-11-28') !== null)
  const otherPattern = EXERCISE_DATABASE.find(e => !e.retired && !e.log_only && e.movement_pattern !== getExerciseEntry(outgoing.name)?.movement_pattern && e.movement_pattern !== 'activation' && swapHardStop(e, hurt, [], '2026-11-28') === null)
  check('the fixture: a move his shoulders rule out, and an allowed one of another pattern', !!stopped && !!otherPattern, [stopped?.name, otherPattern?.name])
  const noId = { ...hurt, id: undefined } as unknown as UserProfile
  const payload = (name: string) => ({ weekNumber: week.week_number, dayName: day.day, sayDay: day.day, exIndex, oldExerciseName: outgoing.name, newExerciseName: name, scope: 'today' as const })
  const errOf = (r: Awaited<ReturnType<typeof executeExerciseSwap>>) => r.receipt.failed[0]?.error ?? ''
  const refused = await executeExerciseSwap(noId, meso, payload(stopped?.name ?? 'Overhead Press'), { profile: hurt, exclusions: [], latestDate: '2026-11-28' })
  check('an injury-blocked replacement is refused AT CONFIRM, in the stop\'s words, plan untouched', /which your plan is protecting for your injuries, so I won't swap it in/.test(errOf(refused)) && refused.mesocycle === meso, errOf(refused))
  const banned = await executeExerciseSwap(noId, meso, payload(otherPattern?.name ?? 'Goblet Squats'), { profile: hurt, exclusions: [otherPattern?.name ?? 'Goblet Squats'], latestDate: '2026-11-28' })
  check('...and one on his never-again list', /never-again list/.test(errOf(banned)) && banned.mesocycle === meso, errOf(banned))
  const allowed = await executeExerciseSwap(noId, meso, payload(otherPattern?.name ?? 'Goblet Squats'), { profile: hurt, exclusions: [], latestDate: '2026-11-28' })
  check('a different pattern he named gets past the stops (to the save, which needs an account)', allowed.receipt.failed[0]?.op === 'save' && allowed.mesocycle !== meso, allowed.receipt)

  console.log('\n2b. ONE RULE ON THE COACH\'S ADD TOO (run, not read)')
  const addPayload = (name: string) => ({ weekNumber: week.week_number, dayName: day.day, exerciseName: name, scope: 'today' as const })
  const addErr = (r: Awaited<ReturnType<typeof executeExerciseAdd>>) => r.receipt.failed[0] ?? { op: '', error: '' }
  const backHurt = { ...hurt, injuries: ['lower_back'], id: undefined } as unknown as UserProfile
  const machine = await executeExerciseAdd({ ...hurt, injuries: [], id: undefined } as unknown as UserProfile, meso, addPayload('45-Degree Hyperextension Bench (Roman Chair)'), [], '2026-11-28')
  check('a machine version is FOUND by the add (it was "couldn\'t find"): past resolution, to the save', addErr(machine).op === 'save', addErr(machine))
  const machineHurt = await executeExerciseAdd(backHurt, meso, addPayload('45-Degree Hyperextension Bench (Roman Chair)'), [], '2026-11-28')
  check('...and a bad back STOPS it there, in "won\'t put it in" words', /which your plan is protecting for your injuries, so I won't put it in/.test(addErr(machineHurt).error), addErr(machineHurt))
  const lateAdd = await executeExerciseAdd({ ...hurt, injuries: [], health_conditions: ['pregnancy'], due_date: '2027-02-27', id: undefined } as unknown as UserProfile, meso, addPayload('Bulgarian Split Squats'), [], '2026-12-19')
  check('...and the from-28-weeks rules bind an add reaching past 28 weeks', /from 28 weeks pregnant/.test(addErr(lateAdd).error), addErr(lateAdd))
  const chat0 = strip(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
  check('the coach\'s add card runs the same rule, at the farthest day it reaches', /const addStop = swapHardStop\(found\.entry, poolProfile, exerciseExclusions, editReachesUntil\('permanent'\)\)/.test(chat0) && /executeExerciseAdd\(poolProfile, mesocycle, addPayload, exerciseExclusions, editReachesUntil\(addPayload\.scope\)\)/.test(chat0))

  console.log('\n3. The card and the coach')
  const chat = strip(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
  const card = chat.slice(chat.indexOf('const buildExerciseSwapProposal'), chat.indexOf('const buildExerciseAddProposal'))
  check('the card asks the stops about the ENTRY he named, with the pool profile, at the farthest day the card reaches, before any payload', card.length > 1000 && /const stop = swapHardStop\(newEntry, poolProfile, exerciseExclusions, editReachesUntil\('permanent'\)\)/.test(card) && card.indexOf('swapHardStop(') < card.indexOf('const payload: ExerciseSwapPayload'))
  const reach = chat.slice(chat.indexOf('const editReachesUntil ='), chat.indexOf('const buildExerciseSwapProposal'))
  check('...a whole-block change reaches the block\'s last day (the day before the next block), today\'s reaches the week', /if \(scope !== 'permanent'\) return addDays\(activeSession\.date, 6\)/.test(reach) && /const next = blockSwapEndsOn\(mesocycle, activeSession\.liveWeek,/.test(reach) && /return next \? addDays\(next, -1\)/.test(reach))
  check('...a stop is refused there', /if \(stop\) return \{ ok: false, reason: stop \}/.test(card))
  check('...and the movement line only when HE chose (never on the list\'s stand-in, nor on the coach\'s own pick when the list is empty)', /const patternNote = !pick \|\| pick\.replaced \|\| !replacementNamed\(userSaid, newEntry\.name, oldEx\.name\) \? null : swapPatternAdvice\(/.test(card))
  check('...the different-movement line and any kit, style or level warning are on the card, as warnings', /\.\.\.\(patternNote \? \[\{ severity: 'warn' as const, text: patternNote \}\] : \[\]\)/.test(card) && /\.\.\.fitWarnings\.map\(text => \(\{ severity: 'warn' as const, text \}\)\)/.test(card) && /const fitWarnings = swapFitWarnings\(newEntry, poolProfile, exerciseExclusions\)/.test(card))
  check('confirm hands the stops to the executor', /executeExerciseSwap\(profile, mesocycle, \{ \.\.\.payload, scope \}, \{ profile: poolProfile, exclusions: exerciseExclusions, latestDate: editReachesUntil\(scope\) \}\)/.test(chat))
  const fn = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  check('the tool no longer says the replacement MUST be the same pattern', !/must be biomechanically similar/.test(fn) && !/for a biomechanically similar alternative/.test(fn))
  check('...it says his named choice is proposed, even a different movement', /when THEY name one, it is what they named, even a different kind of movement: propose it/.test(fn))
  check('the prompt: same pattern only when the COACH chooses; his different-pattern choice is never refused', /When YOU choose a replacement, select from the SAME movement pattern/.test(fn) && /never refuse it or argue it down/.test(fn) && !/ALWAYS select from the SAME movement pattern/.test(fn))

  console.log(`\nswap-for-anything: ${ran} checks ran`)
  if (failures > 0) { console.error(`swap-for-anything: ${failures} check(s) FAILED`); process.exit(1) }
  console.log('swap-for-anything: all checks passed')
}
main().catch(e => { console.error(e); process.exit(1) })
