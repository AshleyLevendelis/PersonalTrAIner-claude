/**
 * test:goal-ask — A GOAL GETS BOTH ITS NUMBERS, AND APPLY ALWAYS SAYS WHAT
 * HAPPENED (7 Nov 2026, Ashley's phone: "110kg is my max", Apply did nothing).
 *
 *   1. goalAsk: which number is missing, in words, with units; nothing asked
 *      of a directional goal or one that has both.
 *   2. The table's rule: a goal goalAsk lets through is one the user_goals
 *      CHECK accepts, and every goal it would refuse is asked about. Read off
 *      the migration itself, so a change to the rule fails here.
 *   3. The wiring (source): the card asks before it is built, the save asks
 *      before it writes, a save that throws is caught and said, and a question
 *      back is the coach's next message, never a "Note" row.
 * Section 3 reads text, so it cannot prove a branch is REACHED; the browser
 * half, verify:chat-goal, drives each one on the real chat.
 */
import { readFileSync } from 'node:fs'
import { goalAsk, goalAmount, goalLabel, goalThing } from '../src/lib/goal-ask'
import { ROW_CHECKS } from '../.tour-harness/fake-supabase'

let ran = 0, failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('\n1. Which number is missing, said plainly')
const bench = { metric: 'lift_1rm_kg', trackable: 'measurable' as const, metricRef: 'Barbell Bench Press' }
check('neither number: both are asked for', goalAsk(bench) === "What's your Barbell Bench Press max now, and what number are you aiming for? I need both to track it.", goalAsk(bench))
check('the starting number only (her 110 kg): the target is asked for, with its unit', goalAsk({ ...bench, baselineValue: 110 }) === 'Got it, 110 kg to start. What number are you aiming for?', goalAsk({ ...bench, baselineValue: 110 }))
check('the target only: the starting number is asked for, the target said back', goalAsk({ ...bench, targetValue: 120 }) === "What's your Barbell Bench Press max now? I need a starting point before I can track progress toward 120 kg.", goalAsk({ ...bench, targetValue: 120 }))
check('both: nothing to ask', goalAsk({ ...bench, baselineValue: 110, targetValue: 120 }) === null)
check('a starting number of 0 counts as given (sessions a week can start at 0)', goalAsk({ metric: 'sessions_per_week', trackable: 'measurable', baselineValue: 0, targetValue: 3 }) === null)
check('a number that is not a number is missing', goalAsk({ ...bench, baselineValue: NaN, targetValue: 120 }) !== null && goalAsk({ ...bench, baselineValue: 110, targetValue: Infinity }) !== null)
check('a directional goal ("get leaner") is never asked for a number', goalAsk({ metric: 'directional', trackable: 'directional' }) === null)
check('every kind says what it is about', goalThing('lift_working_kg', 'Back Squat') === 'your Back Squat working weight' && goalThing('body_weight_kg') === 'your body weight' && goalThing('sessions_per_week') === 'your sessions a week')
check('a number never goes out without its unit', goalAmount('body_weight_kg', 72.5) === '72.5 kg' && goalAmount('sessions_per_week', 4) === '4 sessions a week' && goalAmount('sessions_per_week', 1) === '1 session a week')
check('the card and the saved goal say both numbers', goalLabel('lift_1rm_kg', 'Barbell Bench Press', 110, 120) === 'Barbell Bench Press max: 110 kg → 120 kg', goalLabel('lift_1rm_kg', 'Barbell Bench Press', 110, 120))

console.log('\n2. What the table accepts')
const sql = readFileSync('supabase/migrations/20260806090000_create_memory_and_goals.sql', 'utf8')
check("the migration's rule still needs a baseline, its date AND a target for an active measurable goal",
  sql.includes("CHECK (status <> 'active' OR trackable = 'directional' OR (baseline_value IS NOT NULL AND baseline_captured_at IS NOT NULL AND target_value IS NOT NULL))"))
// The row createGoal (memory-store.ts) would insert: active once a baseline exists.
const rowFor = (g: { trackable: 'measurable' | 'directional'; baselineValue?: number; targetValue?: number }) => ({
  trackable: g.trackable,
  status: g.trackable === 'directional' || g.baselineValue != null ? 'active' : 'needs_baseline',
  baseline_value: g.baselineValue ?? null,
  baseline_captured_at: g.baselineValue != null ? '2026-11-07T12:00:00Z' : null,
  target_value: g.targetValue ?? null,
})
const tableCheck = ROW_CHECKS.user_goals
const grid: { trackable: 'measurable' | 'directional'; baselineValue?: number; targetValue?: number }[] = []
for (const trackable of ['measurable', 'directional'] as const) for (const b of [undefined, 0, 110]) for (const t of [undefined, 0, 120]) grid.push({ trackable, baselineValue: b, targetValue: t })
const letThrough = grid.filter(g => goalAsk({ metric: 'lift_1rm_kg', metricRef: 'Bench', ...g }) === null)
check('every goal the app lets through is one the table accepts', letThrough.every(g => tableCheck(rowFor(g)) === null), letThrough.filter(g => tableCheck(rowFor(g)) !== null))
const refused = grid.filter(g => tableCheck(rowFor(g)) !== null)
check('every goal the table would refuse is asked about first', refused.length > 0 && refused.every(g => goalAsk({ metric: 'lift_1rm_kg', ...g }) !== null), refused)
check("...including the one on her phone: 110 kg, no target", tableCheck(rowFor({ trackable: 'measurable', baselineValue: 110 })) !== null && goalAsk({ ...bench, baselineValue: 110 }) !== null)

console.log('\n3. The wiring (source; verify:chat-goal drives it)')
const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
const a = chat.indexOf('} else if (APPEND_PROPOSAL_KINDS.has(result.proposal.kind) && result.proposal.rawArgs) {')
const offer = a >= 0 ? chat.slice(a, chat.indexOf('} else if', a + 80)) : ''
check('the offer branch is found', offer.length > 0)
const askAt = offer.indexOf('goalAsk(goal)'), buildAt = offer.indexOf('buildIntentProposal(')
check('...a goal is asked about BEFORE a card is built, and the question is the reply', askAt >= 0 && buildAt > askAt && /if \(goalQuestion\) refusal = goalQuestion\s*else \{/.test(offer), { askAt, buildAt })
check('...the starting number comes from the same lookup the save uses', /baselineValue: goalStart\(ga\)\.baselineValue/.test(offer))
check('...and the card says both numbers', /built\.diff\.rows\[0\]\.after = goalLabel\(/.test(offer))
const g0 = chat.indexOf("const metric = String(args.metric || '') as UserGoalRow['metric']"), g1 = chat.indexOf('const row = await createGoal(', g0)
const save = g0 >= 0 && g1 > g0 ? chat.slice(g0, g1) : ''
check('the save asks before it writes', /const ask = goalAsk\(\{ metric, trackable, metricRef, baselineValue, targetValue \}\)\s*if \(ask\) return \{ text: ask \}/.test(save), save.slice(0, 200))
const p0 = chat.indexOf('} else if (APPEND_PROPOSAL_KINDS.has(row.kind)) {'), p1 = chat.indexOf('const status: \'done\' | \'partial\' | \'failed\'', p0)
const apply = p0 >= 0 && p1 > p0 ? chat.slice(p0, p1) : ''
check('the Apply branch is found', apply.length > 0)
check('...a save that throws is caught', /try \{\s*saveResult = row\.kind === 'record_fact'/.test(apply) && /\} catch \(err\) \{/.test(apply))
const catchBody = (() => { const c = apply.indexOf('} catch (err) {'); return c < 0 ? '' : apply.slice(c, apply.indexOf('}', c + 15) + 1) })()
check('...and not thrown on: the catch only records it', catchBody.length > 0 && !/\bthrow\b/.test(catchBody) && /console\.error\(/.test(catchBody), catchBody)
check("...and says so: \"Couldn't save that\", never silence", /if \(!saveResult\) \{\s*receipt = \{ landed: \[\], failed: \[\{ op: row\.kind, error: "the save didn't go through, so try again in a moment" \}\] \}\s*title = "Couldn't save that"/.test(apply))
check('...a question back is the coach\'s next message', /if \(saveResult\.text\) followUp = \{ text: saveResult\.text, chips: \[\] \}/.test(apply))
check('...and never a "Note" row repeating it', !/label: 'Note'/.test(apply) && /title = 'Not saved yet'\s*rows = \[\]/.test(apply))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`goal ask: ${failures} check(s) failed`); process.exit(1) }
console.log('goal ask: all checks passed')
