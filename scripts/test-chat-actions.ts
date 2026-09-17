// ---------------------------------------------------------------------------
// EVERY ACTION THE EDGE FUNCTION CAN EMIT MUST BE HANDLED BY THE CLIENT.
//
// WHY, TWICE. chat-gemini returns `action: { type: "…" }` for a write it has
// ALREADY made; ChatAssistant's applyPlanAction switches on that type and
// falls through to `return false` for anything it does not recognise — and a
// false return makes the client append "Action failed — the change was not
// applied."
//
// So a server action with no client branch produces the worst possible
// outcome: the write lands, and the app tells the user it did not. That is
// strictly worse than silence, and it is the exact inverse of the defect this
// whole tool was built to fix (a reply claiming more than happened).
//
// IT HAS NOW HAPPENED TWICE:
//   log_workout_set          — fixed, with a comment explaining the trap
//   swap_session_for_activity — happened anyway, one type later, and was
//                               found by Ashley on a phone rather than here
//
// The comment did not prevent the recurrence. This does.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const EDGE = 'supabase/functions/chat-gemini/index.ts'
const CLIENT = 'src/components/ChatAssistant.tsx'
const TYPES = 'src/lib/types.ts'

const edge = readFileSync(EDGE, 'utf8')
const client = readFileSync(CLIENT, 'utf8')
const types = readFileSync(TYPES, 'utf8')

/**
 * JSON-schema primitives. `action: { type: "string", enum: [...] }` at
 * index.ts:464 is a tool PARAMETER named "action", not an emitted action, and
 * without this it reads as one.
 */
const SCHEMA_PRIMITIVES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'])

/**
 * Every literal `action: { type: "x" }` the edge function returns.
 *
 * WHAT THIS DELIBERATELY DOES NOT COVER, stated so the pass is not read as
 * more than it is: index.ts's final fall-through returns
 * `action: { type: name, ...args }` — the TOOL'S OWN NAME, computed at
 * runtime — for any tool without a specific handler. Those cannot be
 * enumerated statically, and most of them route through the proposal/confirm
 * flow rather than applyPlanAction, so listing every tool name here would be
 * mostly false positives.
 *
 * The defect this gate exists for is narrower and sharper: a handler that has
 * ALREADY WRITTEN to the database and returns a literal action to say so. If
 * the client has no branch for it, the write lands and the user is told it
 * failed. Those are exactly the `dbSuccess ? { type: "…" } : undefined`
 * returns, and they are all literal.
 */
const emitted = new Set<string>()
for (const m of edge.matchAll(/action:\s*(?:[^,{}]*\?\s*)?\{\s*type:\s*["']([a-z_]+)["']/g)) {
  if (!SCHEMA_PRIMITIVES.has(m[1])) emitted.add(m[1])
}

console.log('\n1. The edge function emits actions, and we can see them')
// THE FLOOR DROPPED FROM 3 TO 2 ON PURPOSE, 15 Sep 2026, and the reason is the
// point rather than the number: day-level verbs have been leaving this rail for
// the propose->confirm one ever since Ashley's "record it, but confirm first"
// ruling. ban_exercise went on 14 Sep, the activity swap on the 15th. A rising
// floor here would be the wrong direction of travel.
check(`actions found in ${EDGE} (${emitted.size})`, emitted.size >= 2, [...emitted].join(', '))

console.log('\n2. Every emitted action has a client branch')
{
  const unhandled = [...emitted].filter(t => !client.includes(`action.type === '${t}'`))
  check(`every emitted action is handled in applyPlanAction (${emitted.size} emitted)`,
    unhandled.length === 0,
    unhandled.map(t => `"${t}" is returned by the server but applyPlanAction has no branch — the user would be told "Action failed" about a write that landed`).join(' | '))
}

console.log('\n3. Every emitted action is in the PlanAction union')
{
  const missing = [...emitted].filter(t => !types.includes(`type: '${t}'`))
  check(`every emitted action has a type in PlanAction (${emitted.size} emitted)`,
    missing.length === 0,
    missing.map(t => `"${t}" has no interface in ${TYPES}`).join(' | '))
}

console.log('\n4. The one still on this rail that prompted this, named so a regression is loud')
check(`log_workout_set is emitted, typed, and handled`,
  emitted.has('log_workout_set') && types.includes(`type: 'log_workout_set'`) && client.includes(`action.type === 'log_workout_set'`),
  `emitted=${emitted.has('log_workout_set')}`)

console.log('\n5. THE DEPLOY WINDOW. The frontend merges on a push; the edge function')
console.log('   is deployed by hand afterwards. Between the two they disagree.')
{
  // swap_session_for_activity left this rail on 15 Sep 2026 — the new function
  // proposes instead. But PRODUCTION runs the old function until someone types
  // the deploy confirmation, and the old one still emits this action. Deleting
  // the client branch before that deploy re-creates the exact defect this file
  // exists for: the write lands and the user is told "Action failed".
  //
  // So the rule inverts for a retired action: it must NOT be emitted by the
  // source any more, and it must STILL be handled. Both halves, or the check
  // passes while the window is broken.
  check('the retired swap action is no longer emitted by the current source',
    !emitted.has('swap_session_for_activity'), [...emitted].join(', '))
  check('...but the client still handles it, for the window before the function is deployed',
    client.includes(`action.type === 'swap_session_for_activity'`) && types.includes(`type: 'swap_session_for_activity'`),
    'delete this branch only AFTER npm run deploy:functions:prod -- chat-gemini')
  // AND NOTHING WENT BACK. A day-level verb that reappears here is a change to
  // someone's record with no card and no tap — Ashley's ruling, twice over.
  const DAY_VERBS = ['swap_session_for_activity', 'propose_session_activity_swap', 'rest_day', 'missed_session', 'session_move']
  const back = [...emitted].filter(t => DAY_VERBS.some(v => t.includes(v)))
  check('no day-level verb writes without a card', back.length === 0, back.join(', '))
}

console.log(failures === 0 ? '\nAll chat-action checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
