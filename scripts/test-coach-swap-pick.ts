// test:coach-swap-pick — when the COACH chooses a swap, it chooses what the swap list would (coach exam, 7 Nov 2026).
//
// Asked "swap the walking lunges for something else today", the coach picked Step-Ups, which need a box the home gym
// does not have. Held here: the coach is sent the Exercise tab's own swap list for today's exercises; with nothing
// named, a pick the list does not hold (or an unloaded pick for a loaded lift) becomes the list's first; her own
// named choice is never touched; and the exam's fixture and accepted answers are the real functions' output.
import { readFileSync } from 'fs'
import { coachSwapPick, replacementNamed, swapListFor, swapOptionsBlock, SWAP_OPTIONS_SENT } from '../src/lib/coach-swap-pick'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import { exercisesThatFit } from '../src/lib/exercise-shortlist'
import type { UserProfile } from '../src/lib/types'

let failures = 0
let ran = 0
function check(label: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const base = JSON.parse(readFileSync('scripts/exam-cases/_base-context.json', 'utf8'))
const profile = { ...base.profile, injuries: [] } as unknown as UserProfile
const input = { profile, exclusions: [] as string[] }
const ASK = 'Swap the walking lunges for something else today, please.'

console.log('1. Did she name the replacement?')
check('"something else" names nothing', !replacementNamed(ASK, 'Step-Ups', 'Walking Lunges'))
check('"lunges" is the lift being swapped, not a choice of a reverse lunge', !replacementNamed(ASK, 'Dumbbell Reverse Lunge', 'Walking Lunges'))
check('"swap them for step ups" names Step-Ups', replacementNamed('swap the lunges for step ups', 'Step-Ups', 'Walking Lunges'))
check('"reverse lunges instead" names a reverse lunge', replacementNamed('can I do reverse lunges instead', 'Dumbbell Reverse Lunge', 'Walking Lunges'))
check('"split squats" names Bulgarian Split Squats', replacementNamed('swap lunges for split squats', 'Bulgarian Split Squats', 'Walking Lunges'))
check('plurals match: "lunges" names a lunge', replacementNamed('swap the squats for lunges', 'Dumbbell Reverse Lunge', 'Barbell Squats'))
check('...and "presses" names a press', replacementNamed('swap the rows for presses', 'Landmine Press', 'Barbell Rows'))
check('an implement word alone is no choice', !replacementNamed('swap lunges for something with dumbbells', 'Dumbbell Lateral Lunge', 'Walking Lunges'))

console.log('\n2. The swap list is the Exercise tab\'s, and the coach is sent its head')
const list = swapListFor('Walking Lunges', input)
check('the list exists for the exam person\'s lunges', list.length >= SWAP_OPTIONS_SENT, list)
check('Step-Ups are not on it (they need a box this home gym lacks)', !list.includes('Step-Ups'), list)
check('it leads with a loaded option', !!getExerciseEntry(list[0]) && isExternallyLoaded(getExerciseEntry(list[0])!), list[0])
const block = swapOptionsBlock(['Barbell Back Squat', 'Walking Lunges'], input)
check('the block names today\'s lunges with the list\'s first options, in order', block.includes(`- Walking Lunges: ${list.slice(0, SWAP_OPTIONS_SENT).join(', ')}`), block)
check('...and tells the coach to take the FIRST when nothing is named', /do not name what to do instead, put the FIRST option/.test(block))
check('...and leaves her own named choice to her', /A replacement THEY name is theirs to choose/.test(block))
check('a name the catalogue does not know gets no line', !/Barbell Back Squat:/.test(block), block)
check('no catalogue exercise today: no block at all', swapOptionsBlock(['Barbell Back Squat'], input) === '')

console.log('\n3. With nothing named, the list chooses when the coach\'s pick is off it or a downgrade')
const stepUps = coachSwapPick({ ...input, picked: 'Step-Ups', outgoing: 'Walking Lunges', userSaid: ASK })
check('the exam\'s Step-Ups become the list\'s first', stepUps.name === list[0] && stepUps.replaced, stepUps)
const unloaded = list.find(n => !isExternallyLoaded(getExerciseEntry(n)!))
const down = unloaded ? coachSwapPick({ ...input, picked: unloaded, outgoing: 'Walking Lunges', userSaid: ASK }) : null
check('an unloaded option that IS on the list, for a loaded lift: the loaded first instead', !!unloaded && down?.name === list[0] && down?.replaced === true, { unloaded, down })
const second = coachSwapPick({ ...input, picked: list[1], outgoing: 'Walking Lunges', userSaid: ASK })
check('a loaded option on the list stays the coach\'s choice', second.name === list[1] && !second.replaced, second)
const named = coachSwapPick({ ...input, picked: 'Step-Ups', outgoing: 'Walking Lunges', userSaid: 'swap the lunges for step ups' })
check('HER named Step-Ups stand (her "show everything, warn me")', named.name === 'Step-Ups' && !named.replaced, named)
const plankList = swapListFor('Plank', input)
const plankPick = plankList.find((n, i) => i > 0 && !isExternallyLoaded(getExerciseEntry(n)!))
const plank = plankPick ? coachSwapPick({ ...input, picked: plankPick, outgoing: 'Plank', userSaid: 'swap the plank for something else' }) : null
check('an unloaded lift going out: an unloaded pick further down its list stays', !!plankPick && plank?.name === plankPick && plank?.replaced === false, { plankPick, plank, plankList })

console.log('\n4. The chat uses it, before the card is built')
const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
const b0 = chat.indexOf('const buildExerciseSwapProposal')
const builder = b0 >= 0 ? chat.slice(b0, chat.indexOf('const buildExerciseAddProposal', b0) > b0 ? chat.indexOf('const buildExerciseAddProposal', b0) : b0 + 9000) : ''
const pickAt = builder.search(/coachSwapPick\(\{/)
const entryAt = builder.search(/const newEntry = pick \? getExerciseEntry\(pick\.name\)/)
const cardAt = builder.search(/rows: \[\{ field: 'Exercise', before: oldEx\.name, after: newEntry\.name \}\]/)
check('the swap card\'s exercise comes from coachSwapPick', pickAt >= 0 && entryAt > pickAt && cardAt > entryAt, { pickAt, entryAt, cardAt })
check('...given her own words', /userSaid,/.test(builder.slice(pickAt, pickAt + 300)) && /buildExerciseSwapProposal\(result\.proposal\.rawArgs, userSaid\)/.test(chat))
check('the coach is sent the swap list inside today\'s exercise summary', /exercise_summary:[\s\S]{0,200}\[exerciseSummary, swapOptionsBlock\(todayRow\.exercises\.map\(e => e\.name\)/.test(chat))
const fn = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
check('the swap tool tells the coach where its pick comes from', /SWAP OPTIONS FOR TODAY, exactly as written/.test(fn))

console.log('\n5. The exam measures the coach the app talks to')
const today = 'Today (Tuesday): Lower body — Barbell Back Squat 3x8 @ 45kg, Romanian Deadlift 3x10 @ 40kg, Walking Lunges 3x12, Standing Calf Raise 3x15.'
const want = [today, swapOptionsBlock(['Barbell Back Squat', 'Romanian Deadlift', 'Walking Lunges', 'Standing Calf Raise'], input)].join('\n\n')
check('the fixture\'s summary carries the real swap list block', base.exercise_summary === want, { got: base.exercise_summary })
check('the fixture\'s kit list is the real exercisesThatFit', base.profile.exercises_that_fit === exercisesThatFit(profile, []))
const swapCase = JSON.parse(readFileSync('scripts/exam-cases/swap-prefers-loaded-peer.json', 'utf8'))
const accepted: string[] = swapCase.checks.swapReplacementOneOf[0].oneOf
const loadedLead: string[] = []
for (const n of list) { if (isExternallyLoaded(getExerciseEntry(n)!)) loadedLead.push(n); else break }
check('the case accepts exactly the loaded options leading the real list', JSON.stringify(accepted) === JSON.stringify(loadedLead), { accepted, loadedLead })
check('...and never Step-Ups', !accepted.includes('Step-Ups'))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`coach swap pick: ${failures} check(s) failed`); process.exit(1) }
console.log('The coach picks a swap from the Exercise tab\'s own list.')
