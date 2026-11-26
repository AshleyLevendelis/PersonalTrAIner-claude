/**
 * TAKING A LOGGED ACTIVITY OFF (27 Nov 2026, his report: "I accidentally added a walk today. Remove it", answered
 * "I couldn't match Walk to anything on Thursday" while Exercise showed "✓ Walk · 5 min · Easy" with no way to take
 * it off once Undo had gone). Holds: which log his words name; the coach's own tool; the app's catch when the coach
 * reaches for the exercise-removal tool; one road (the row's Remove) for Apply; Undo puts the log back. The store's
 * remove and put-back are driven in test:cardio-log §4-5; the screen in verify:cardio-remove.
 */
import { readFileSync } from 'node:fs'
import { matchLoggedActivity } from '../src/lib/cardio-remove'

let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const names = (r: { activity_name: string }[]) => r.map(x => x.activity_name)

console.log('\n1. Which log his words name')
const day = [{ activity_name: 'Walk' }, { activity_name: 'Brisk Walk' }, { activity_name: 'Bike' }, { activity_name: 'Hill Sprints' }]
check('"walk" is the Walk, not a question (an exact name wins)', JSON.stringify(names(matchLoggedActivity('walk', day))) === '["Walk"]', names(matchLoggedActivity('walk', day)))
check('"Remove the walk I logged today" still finds it', JSON.stringify(names(matchLoggedActivity('the walk I logged today', day))) === '["Walk"]', names(matchLoggedActivity('the walk I logged today', day)))
check('"brisk walk" is only the Brisk Walk', JSON.stringify(names(matchLoggedActivity('brisk walk', day))) === '["Brisk Walk"]')
check('"walks" (plural) is the Walk', JSON.stringify(names(matchLoggedActivity('walks', day))) === '["Walk"]')
check('"sprints" is the Hill Sprints', JSON.stringify(names(matchLoggedActivity('sprints', day))) === '["Hill Sprints"]')
const twoWalks = [{ activity_name: 'Brisk Walk' }, { activity_name: 'Dog Walk' }]
check('two logs that both fit are both returned, so the app asks which', matchLoggedActivity('walk', twoWalks).length === 2)
check('a word he said that is not in the name rules it out ("brisk hill walk" is not the Brisk Walk)', matchLoggedActivity('brisk hill walk', [{ activity_name: 'Brisk Walk' }]).length === 0)
check('a word not in any name matches nothing (never a guess)', matchLoggedActivity('swim', day).length === 0)
check('nothing said matches nothing', matchLoggedActivity('the', day).length === 0 && matchLoggedActivity('', day).length === 0)
check('"run" does not match "Hill Sprints" (whole words only)', matchLoggedActivity('run', [{ activity_name: 'Hill Sprints' }, { activity_name: 'Rowing' }]).length === 0)

console.log('\n2. The coach has its own tool, and is told not to use the exercise one for a log')
const fn = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
check('the tool is declared', /name:\s*["']propose_cardio_remove["']/.test(fn))
check('its handler returns the card kind', /name === ["']propose_cardio_remove["'][\s\S]{0,600}kind:\s*["']propose_cardio_remove["']/.test(fn))
check('the prompt says a logged activity is never propose_exercise_remove', /propose_cardio_remove[^\n]{0,400}never[^\n]{0,80}propose_exercise_remove|never[^\n]{0,80}propose_exercise_remove[^\n]{0,400}propose_cardio_remove/i.test(fn))

console.log('\n3. The app catches the exercise tool aimed at a log, and only when the plan has no such exercise')
const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
const rmStart = chat.indexOf("result.proposal.kind === 'propose_exercise_remove' && result.proposal.rawArgs")
const rmBlock = rmStart >= 0 ? chat.slice(rmStart, rmStart + 2200) : ''
const okAt = rmBlock.indexOf('if (rm.ok)')
const elseAt = rmBlock.indexOf('else {', okAt)
const fallAt = rmBlock.indexOf('buildCardioRemoveProposal(', okAt)
check('the exercise-removal branch exists', rmStart >= 0 && okAt >= 0)
check('the log is tried only after the exercise was not found (in the else)', elseAt > okAt && fallAt > elseAt, { okAt, elseAt, fallAt })
check('a found log becomes the cardio card', /kindOverride = 'propose_cardio_remove'/.test(rmBlock))
check('no log either: the exercise refusal stands', /else refusal = rm\.reason/.test(rmBlock))

console.log('\n4. Apply is the row\'s own Remove; Undo puts it back and says when it could not')
const exAt = chat.indexOf("row.kind === 'propose_cardio_remove'")
const exBlock = exAt >= 0 ? chat.slice(exAt, exAt + 900) : ''
check('Apply calls removeCardioLog(', /removeCardioLog\(/.test(exBlock))
check('only a removal that worked offers Undo', /undoToken = ok \? row\.id : undefined/.test(exBlock))
const undoAt = chat.indexOf("row.kind === 'propose_cardio_remove'", exAt + 10)
const undoBlock = undoAt >= 0 ? chat.slice(undoAt, undoAt + 600) : ''
check('Undo calls restoreCardioLog(', /restoreCardioLog\(/.test(undoBlock))
check('an Undo that did not save keeps its button', /if \(!back\) return \{ refused: RECEIPTS_UNDONE\.failed, keep: true \}/.test(undoBlock))
check('the card is reversible and says the plan is untouched', /reversible: true/.test(chat.slice(chat.indexOf('const buildCardioRemoveProposal'), chat.indexOf('const buildMissedSessionProposal'))) && /your plan and your sessions stay as they are/.test(chat))
check('only the last two weeks, never a day ahead', /delta > 0 \|\| delta < -14/.test(chat))

console.log('\n5. The row offers Remove only once Undo has gone')
const row = strip(readFileSync('src/components/exercise/CardioSetRow.tsx', 'utf8'))
check('Remove is drawn when Undo is not', /\{!undoable && onRemoved && \(log\.id \|\| log\.clientId\) && \(/.test(row))
check('Remove calls removeCardioLog(', /removeCardioLog\(/.test(row))
check('the removed line puts it back with restoreCardioLog(', /restoreCardioLog\(/.test(row))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} failure(s)`); process.exit(1) }
console.log('All cardio-remove checks passed.')
