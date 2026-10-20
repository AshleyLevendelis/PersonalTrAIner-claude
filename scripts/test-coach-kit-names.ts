/**
 * test:coach-kit-names — live test 19 Oct 2026, findings 4 and 13 (docs/audits/live-test-2026-10-19-findings.md).
 *
 * The coach told Sam he had "a flat bench" (not ticked), offered "Seated Dumbbell Overhead Press" (not in the app),
 * and the swap failed; and "I don't have bands" got a swap of one exercise for today. Held here, with Sam's profile:
 *   §1 the coach is always sent the kit the plan is built from, with what is NOT on it, and the prompt says it wins;
 *   §2 the coach is sent real names that fit him, by movement, and told to use only those;
 *   §3 the nearest-name search finds the press he meant (Dumbbell Shoulder Press) from the name the coach made up;
 *   §4 "I don't have bands" in her words routes the swap the model chose to the kit change instead;
 *   §5 the swap card's second button names its scope ("Rest of block"), not the raw word.
 * §1, §2 and §4 also run on a real screen in verify:chat-kit §5-6.
 */
import { readFileSync } from 'node:fs'
import { kitItemsFor, kitLine, kitInWords, kitItemsSaidNotOwned, KIT_ITEMS } from '../src/lib/kit-list'
import { exercisesThatFit } from '../src/lib/exercise-shortlist'
import { swapNameFallback } from '../src/lib/swap-name-fallback'
import { resolveExerciseName } from '../src/lib/set-parse'
import { getExerciseEntry } from '../src/lib/exercise-db'
import type { UserProfile } from '../src/lib/types'

let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const read = (p: string) => readFileSync(p, 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const sam = {
  equipment_access: 'minimalist', injuries: [], training_style: 'bodybuilding', training_experience: 'intermediate',
  session_duration_preference: '30-45', fitness_goal: 'fat_loss', max_dumbbell_kg: 24, kit_statements: [],
} as unknown as UserProfile

console.log('\n§1 The kit the plan is built from, always, with what is not on it')
{
  const have = kitItemsFor(sam)
  check('Sam\'s kit (Minimalist, nothing said) has no bench', !have.includes('bench'), have)
  const chat = strip(read('src/components/ChatAssistant.tsx'))
  const block = chat.slice(chat.indexOf('kit_said:'), chat.indexOf('kit_said:') + 700)
  check('the coach is sent the kit list whether or not she has said anything (no "null when nothing said")', /kit_said: \(\(\) =>/.test(block) && !/kit_said: \(profile\.kit_statements \?\? \[\]\)\.length > 0/.test(block), block.slice(0, 200))
  check('...built from the plan\'s own kit and naming what is NOT on it', /kitItemsFor\(profile\)/.test(block) && /KIT_ITEMS\.filter\(i => !have\.includes\(i\)\)/.test(block) && /NOT on it: \$\{kitInWords\(missing\)\}/.test(block))
  const missing = KIT_ITEMS.filter(i => !have.includes(i))
  check('for Sam that line names the bench as NOT on it', /bench/.test(kitInWords(missing)) && /^Your kit: /.test(kitLine(have)), kitInWords(missing))
  const fn = strip(read('supabase/functions/chat-gemini/index.ts'))
  check('the prompt says the kit list WINS over anything remembered or said earlier', /Their kit: \$\{context\.profile\.kit_said[^\n]*WINS over anything about kit in WHAT YOU ALREADY KNOW/.test(fn))
}

console.log('\n§2 Real exercise names that fit him')
{
  const list = exercisesThatFit(sam)
  check('the overhead presses he can do are named', /overhead press: [^;]*Dumbbell Shoulder Press/.test(list), list.slice(0, 300))
  const names = list.split(';').flatMap(part => part.split(':')[1]?.split(',').map(n => n.trim()) ?? [])
  check('every name is a real catalogue name', names.length >= 20 && names.every(n => !!getExerciseEntry(n)), names.filter(n => !getExerciseEntry(n)))
  const needs = (n: string, kit: string) => !!getExerciseEntry(n)?.equipment.includes(kit) && !getExerciseEntry(n)?.equipment_alternatives
  check('none needs a bench or a barbell (his kit has neither)', names.every(n => !needs(n, 'bench') && !needs(n, 'flat bench') && !needs(n, 'barbell')), names.filter(n => needs(n, 'bench') || needs(n, 'flat bench') || needs(n, 'barbell')))
  const chat = strip(read('src/components/ChatAssistant.tsx'))
  check('the chat sends it from the pool profile and her exclusions', /exercises_that_fit: exercisesThatFit\(poolProfile \?\? profile, exerciseExclusions\)/.test(chat))
  const fn = strip(read('supabase/functions/chat-gemini/index.ts'))
  check('the prompt gives it and says to use a name from it, exactly as written', /Exercises that fit them, by movement: \$\{context\.profile\.exercises_that_fit[^\n]*use a name from this list, exactly as written/.test(fn))
}

console.log('\n§3 The made-up name finds the press he meant')
{
  const typed = 'Seated Dumbbell Overhead Press'
  check('the name the coach used is not in the app (the fixture is the case)', !getExerciseEntry(typed))
  const fb = swapNameFallback({ typed, oldExercise: 'Spanish Squat', resolution: resolveExerciseName(typed, []), profile: sam, exclusions: [] })
  check('the nearest name offered is Dumbbell Shoulder Press', fb.offered[0] === 'Dumbbell Shoulder Press', fb.offered)
  check('...as a tap', fb.text.includes('"Swap Spanish Squat for Dumbbell Shoulder Press"'), fb.text)
  const kb = swapNameFallback({ typed: 'Standing Kettlebell Overhead Press', oldExercise: 'Spanish Squat', resolution: resolveExerciseName('Standing Kettlebell Overhead Press', []), profile: sam, exclusions: [] })
  check('a press with no kettlebell version still lands on an overhead press he can do, not a squat', !!kb.offered[0] && getExerciseEntry(kb.offered[0])?.movement_pattern === 'vertical_push', kb.offered)
}

console.log('\n§4 "I don\'t have bands" goes to the kit change')
{
  check('"I don\'t have Bands" names bands as not owned', JSON.stringify(kitItemsSaidNotOwned("I don't have Bands")) === '["bands"]', kitItemsSaidNotOwned("I don't have Bands"))
  check('"I\'ve got bands" names nothing', kitItemsSaidNotOwned("I've got bands and a bench").length === 0)
  check('"no pull-up bar or kettlebell" names both', JSON.stringify(kitItemsSaidNotOwned('no pull-up bar or kettlebell').sort()) === '["kettlebell","pull_up_bar"]', kitItemsSaidNotOwned('no pull-up bar or kettlebell'))
  const chat = strip(read('src/components/ChatAssistant.tsx'))
  const at = chat.indexOf("result.proposal.kind === 'propose_exercise_swap' && result.proposal.rawArgs")
  const branch = at >= 0 ? chat.slice(at, at + 1200) : ''
  check('the swap branch reads HER words for kit she lacks before building any swap', at >= 0 && branch.indexOf('kitItemsSaidNotOwned(userSaid)') >= 0 && branch.indexOf('kitItemsSaidNotOwned(userSaid)') < branch.indexOf('buildExerciseSwapProposal('), branch.slice(0, 300))
  check('...offers the kit card, under the kit card\'s own kind, when one can be built', /buildKitChangeProposal\(\{ mode: 'hasnt', items: notOwned \}, userSaid\)/.test(branch) && /kindOverride = 'propose_kit_change'/.test(branch))
}

console.log('\n§5 The swap card names its scope')
{
  const card = strip(read('src/components/chat/ProposalCard.tsx'))
  check('"permanent" reads "Rest of block", the swap sheet\'s own words', /opt === 'permanent' \? 'Rest of block'/.test(card))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('coach kit and names: all checks passed')
