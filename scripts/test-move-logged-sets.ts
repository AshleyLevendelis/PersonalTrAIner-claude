/**
 * test:move-logged-sets — sets logged under the wrong exercise move to the one he did (24 Nov 2026).
 *
 * Ashley logged Seated Leg Curl (25 x 14, 20 x 15, 20 x 15), told the coach "I incorrectly logged leg curl, I actually
 * did leg extensions", and got ONE invented Leg Extensions set while the three leg curl sets stayed. Now one planner
 * (move-logged-sets.ts) moves every set as logged, on the chat (move_logged_sets) and the screen (the ⋮ menu).
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { planMoveLoggedSets, applyMoveLoggedSets, moveLine } from '../src/lib/move-logged-sets'
import { decideChatMove } from '../src/lib/move-logged-sets-chat'
import { getExerciseId } from '../src/lib/exercise-db'
import type { ExerciseSetLog } from '../src/lib/types'
import type { SaveSetInput } from '../src/lib/set-log-store'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}${extra !== undefined ? `\n        ${JSON.stringify(extra)}` : ''}`) }
}

const CURL = 'Seated Leg Curl'
const EXT = 'Leg Extensions'
const row = (name: string, n: number, kg: number, reps: number, extra: Partial<ExerciseSetLog> = {}): ExerciseSetLog => ({
  user_id: 'u', date: '2026-11-24', exercise_name: name, exercise_id: getExerciseId(name), set_number: n,
  weight_kg: kg, reps_completed: reps, is_bodyweight: false, is_warmup: false, drop_index: 0, unit: 'kg', rpe: null, ...extra,
})
const ctx = { userId: 'u', date: '2026-11-24', weekNumber: 2, day: 'Tuesday' }
const curl = [row(CURL, 1, 25, 14), row(CURL, 2, 20, 15, { rpe: 8 }), row(CURL, 3, 20, 15)]
const to = { exerciseId: getExerciseId(EXT), exerciseName: EXT }

console.log('\n1. His three sets move, as logged')
{
  const plan = planMoveLoggedSets(curl, [], to, ctx)!
  check('every set is written under the exercise he did', !!plan && plan.writes.length === 3 && plan.writes.every(w => w.exerciseName === EXT && w.exerciseId === to.exerciseId), plan?.writes)
  check('...with the same weights, reps and effort, in order', JSON.stringify(plan.writes.map(w => [w.setNumber, w.weightKg, w.repsCompleted, w.rpe ?? null])) === JSON.stringify([[1, 25, 14, null], [2, 20, 15, 8], [3, 20, 15, null]]), plan.writes)
  check('...and every leg curl set is deleted', JSON.stringify(plan.deletes.map(d => [d.exerciseId, d.setNumber])) === JSON.stringify([[getExerciseId(CURL), 1], [getExerciseId(CURL), 2], [getExerciseId(CURL), 3]]), plan.deletes)
  check('Undo has the leg curl sets as they were', plan.before.length === 3 && plan.before.every(b => b.exerciseName === CURL) && plan.before[1].rpe === 8)
  check('the line says what moved', moveLine(CURL, EXT, plan) === 'Seated Leg Curl → Leg Extensions · 3 sets', moveLine(CURL, EXT, plan))
}

console.log('\n2. After sets already there; build-ups and drops keep their kind')
{
  const there = [row(EXT, 1, 25, 14)]
  const mixed = [row(CURL, 1, 10, 10, { is_warmup: true }), row(CURL, 1, 25, 14), row(CURL, 2, 20, 15), row(CURL, 2, 15, 12, { drop_index: 1 })]
  const plan = planMoveLoggedSets(mixed, there, to, ctx)!
  const work = plan.writes.filter(w => !w.isWarmup)
  check('working sets are numbered after the one already there, never over it', JSON.stringify(work.map(w => [w.setNumber, w.dropIndex])) === JSON.stringify([[2, 0], [3, 0], [3, 1]]), work)
  check('a drop keeps the number of the set it hangs off', work.find(w => w.dropIndex === 1)?.setNumber === work.find(w => w.weightKg === 20)?.setNumber)
  check('a build-up moves as a build-up', plan.writes.filter(w => w.isWarmup).length === 1 && plan.warmups === 1 && /1 warm-up/.test(moveLine(CURL, EXT, plan)), plan.writes)
  check('the deletes carry each row\'s kind', plan.deletes.some(d => d.isWarmup) && plan.deletes.some(d => d.dropIndex === 1))
  check('the drop is not counted as a set', plan.working === 2, plan.working)
}

console.log('\n3. Nothing to move, or the same exercise: no plan')
check('no sets', planMoveLoggedSets([], [], to, ctx) === null)
check('the same exercise', planMoveLoggedSets(curl, [], { exerciseId: getExerciseId(CURL), exerciseName: CURL }, ctx) === null)

console.log('\n4. Writes first; a refused write takes back what was written and deletes nothing')
{
  const plan = planMoveLoggedSets(curl, [], to, ctx)!
  const calls: string[] = []
  const ok = applyMoveLoggedSets(plan, { logSet: (i: SaveSetInput) => { calls.push(`log ${i.exerciseName} ${i.setNumber}`); return {} }, deleteSet: k => { calls.push(`del ${k.exerciseId} ${k.setNumber}`) } }, ctx)
  check('every write comes before any delete', ok.moved && calls.findIndex(c => c.startsWith('del')) === 3 && calls.length === 6, calls)
  check('Undo knows what was written, with its kind', ok.logged.length === 3 && ok.logged.every(k => k.isWarmup === false && k.dropIndex === 0))
  const calls2: string[] = []
  let n = 0
  const bad = applyMoveLoggedSets(plan, { logSet: (i: SaveSetInput) => { calls2.push(`log ${i.setNumber}`); return ++n === 2 ? null : {} }, deleteSet: k => { calls2.push(`del ${k.exerciseId} ${k.setNumber}`) } }, ctx)
  check('a refused write: not moved, the leg curl sets untouched, the one written taken back', !bad.moved && calls2.filter(c => c.startsWith(`del ${getExerciseId(CURL)}`)).length === 0 && calls2.includes(`del ${getExerciseId(EXT)} 1`), calls2)
}

console.log('\n5. The chat: names from his words and the app\'s own log, never from the model')
{
  const said = 'I incorrectly logged leg curl, I actually did leg extensions'
  const logged = [CURL, 'Trap Bar Deadlift', 'Renegade Row']
  const d = decideChatMove({ fromPhrase: 'leg curl', toPhrase: 'leg extensions', userSaid: said, loggedNames: logged })
  check('his message moves Seated Leg Curl to Leg Extensions', d.kind === 'move' && d.fromName === CURL && d.toName === EXT, d)
  const notSaid = decideChatMove({ fromPhrase: 'leg curl', toPhrase: 'leg extensions', userSaid: 'I logged the wrong one', loggedNames: logged })
  check('an exercise he did not name is asked about, never written', notSaid.kind === 'ask', notSaid)
  const notLogged = decideChatMove({ fromPhrase: 'bench press', toPhrase: 'leg extensions', userSaid: 'I logged bench press but did leg extensions', loggedNames: logged })
  check('a "from" that is not on today\'s log is asked about, listing what is', notLogged.kind === 'ask' && notLogged.say.includes(CURL), notLogged)
  const nothing = decideChatMove({ fromPhrase: 'leg curl', toPhrase: 'leg extensions', userSaid: said, loggedNames: [] })
  check('nothing logged today: asked, nothing written', nothing.kind === 'ask', nothing)
  const same = decideChatMove({ fromPhrase: 'leg curl', toPhrase: 'seated leg curl', userSaid: 'I logged leg curl, I did seated leg curl', loggedNames: logged })
  check('the same exercise is asked about', same.kind === 'ask', same)
}

console.log('\n6. Wired on both surfaces (source; the chat needs the chat-gemini deploy)')
{
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const chat = strip(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
  check('the chat answers the tool with the move', /if \(result\.moveLoggedSets\) return moveLoggedSetsFromChat\(/.test(chat) && /decideChatMove\(/.test(chat) && /applyMoveLoggedSets\(plan,/.test(chat))
  check('...with an Undo that writes the old rows back', /undoToken: JSON\.stringify\(\{ logged, replaced: plan\.before/.test(chat))
  check('the Undo deletes a moved row as its own kind', /isWarmup: key\.isWarmup \?\? false, dropIndex: key\.dropIndex \?\? 0/.test(chat))
  const fn = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  check('the coach has the tool and forwards no numbers', /name: "move_logged_sets"/.test(fn) && /moveLoggedSets: \{ from_phrase: String\(args\.from_phrase/.test(fn))
  check('the coach is told a wrong exercise is a move, not a log', /THE WRONG EXERCISE IS A MOVE, NOT A NEW LOG/.test(fn))
  const rowSrc = strip(readFileSync(join(ROOT, 'src/components/exercise/ExerciseRow.tsx'), 'utf8'))
  check('the ⋮ menu offers it once sets are logged', /onWrongExercise=\{loggedSets\.length > 0 \?/.test(rowSrc) && /Logged the wrong exercise\?/.test(rowSrc))
  const sheet = strip(readFileSync(join(ROOT, 'src/components/exercise/WrongExerciseSheet.tsx'), 'utf8'))
  check('the screen moves through the same planner and writer', /planMoveLoggedSets\(/.test(sheet) && /applyMoveLoggedSets\(plan,/.test(sheet))
}

console.log(`\n${ran} checks ran, ${failures} failed`)
if (failures > 0) process.exit(1)
