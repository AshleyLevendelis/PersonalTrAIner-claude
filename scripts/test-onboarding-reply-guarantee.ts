// ---------------------------------------------------------------------------
// Gate for the onboarding-chat reply guarantee
// (supabase/functions/onboarding-chat/reply-resolver.ts): whatever the model
// does, the resolved turn carries non-empty reply text. This is the property
// that lets the system prompt stop demanding a reaction to every answer —
// the "react every turn" rule was measured to be the only thing keeping the
// model emitting text at all, and this module now carries that load instead
// (docs/PLAN-guaranteed-reply-text.md).
//
// Every failure shape injected here was measured live at some point:
// calls-with-zero-text turns (every turn of a 15-turn scripted onboarding),
// calls-only again on the round-trip leg (~a third of turns), entirely empty
// turns (4 of 7 under the loosened prompt), leak-shaped replies, and
// upstream HTTP failures. The mocked model also counts invocations, so the
// chain's cost stays bounded: at most 3 extra calls per turn, and zero on a
// turn that already spoke.
// ---------------------------------------------------------------------------

import {
  callsOf,
  floorReply,
  resolveReply,
  sanitizeReply,
  textOf,
  type ClientAction,
  type GeminiLegResult,
  type GeminiPart,
  type SlotCatalogEntry,
} from '../supabase/functions/onboarding-chat/reply-resolver.ts'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const CATALOG: SlotCatalogEntry[] = [
  { key: 'displayName', question: 'What should I call you?', control: 'text', required: true },
  { key: 'fitnessGoal', question: "What's your main goal?", control: 'single', required: true, values: [{ value: 'fat_loss', label: 'Fat Loss' }] },
  { key: 'trainingDays', question: 'Which days can you actually train?', control: 'multi', required: true, values: [{ value: 'Mon', label: 'Mon' }] },
  { key: 'age', question: 'How old are you?', control: 'numeric', required: false, min: 13, max: 100 },
]

const text = (t: string): GeminiPart[] => [{ text: t }]
const calls = (...cs: Array<{ name: string; args?: Record<string, unknown> }>): GeminiPart[] =>
  cs.map((c) => ({ functionCall: { name: c.name, args: c.args ?? {} } }))
const CONTENTS = [{ role: 'user', parts: [{ text: 'Monday and Wednesday' }] }]

/**
 * Scripted model: each call consumes the next result; running past the end
 * fails the current case (the chain made more calls than it is allowed to).
 * Records (withTools, lastTurnText) per invocation for shape assertions.
 */
function scripted(steps: GeminiLegResult[]) {
  const invocations: Array<{ withTools: boolean; lastText: string }> = []
  const callGemini = async (turns: unknown[], withTools: boolean): Promise<GeminiLegResult> => {
    const last = turns[turns.length - 1] as { parts?: Array<{ text?: string }> }
    invocations.push({ withTools, lastText: last?.parts?.map((p) => p.text ?? '').join('') ?? '' })
    const step = steps.shift()
    if (!step) throw new Error('mock model called more times than scripted')
    return step
  }
  return { callGemini, invocations }
}

const ok = (parts: GeminiPart[]): GeminiLegResult => ({ ok: true, parts })
const fail = (status = 500): GeminiLegResult => ({ ok: false, status, parts: [], errorText: 'mock upstream failure' })

const resolve = (firstParts: GeminiPart[], steps: GeminiLegResult[], remaining = ['trainingDays', 'age']) => {
  const mock = scripted(steps)
  return resolveReply({
    firstParts,
    contents: CONTENTS,
    callGemini: mock.callGemini,
    catalog: CATALOG,
    remaining,
    log: () => {},
  }).then((result) => ({ ...result, invocations: mock.invocations, unconsumed: steps.length }))
}

const run = async () => {
  console.log('reply-resolver primitives:')
  check('textOf joins text parts and trims', textOf([{ text: '  a' }, { functionCall: { name: 'x', args: {} } }, { text: 'b ' }]) === 'ab')
  check('callsOf extracts calls in order', callsOf(calls({ name: 'a' }, { name: 'b' })).map((c) => c.name).join(',') === 'a,b')
  check('sanitizeReply strips a trailing reasoning parenthetical', sanitizeReply('Which days work? (Note: the user didn\'t specify days, so I need to present the training days option.)') === 'Which days work?')
  check('sanitizeReply empties a parenthetical-only reply', sanitizeReply('(Note: I need to present the training days option.)') === '')
  check('sanitizeReply empties a bare tool-call JSON reply', sanitizeReply('{"name": "present_slot", "slot_key": "trainingDays"}') === '')
  check('sanitizeReply leaves a normal reply alone', sanitizeReply('Two days is plenty to start.') === 'Two days is plenty to start.')

  console.log('turn that already spoke:')
  {
    const r = await resolve([...text('Monday and Wednesday it is.'), ...calls({ name: 'set_slot', args: { slot_key: 'trainingDays', value: 'Mon,Wed' } })], [])
    check('no recovery call is made', r.invocations.length === 0)
    check('reply passes through', r.reply === 'Monday and Wednesday it is.')
    check('actions pass through', r.actions.length === 1 && r.actions[0].name === 'set_slot')
  }

  console.log('calls-only turn, round trip speaks (the common measured case):')
  {
    const r = await resolve(calls({ name: 'set_slot', args: { slot_key: 'trainingDays', value: 'Mon,Wed' } }), [ok(text('Two days is workable — how long can you usually stay?'))])
    check('reply comes from the round trip', r.reply.includes('workable'))
    check('exactly one recovery call, with tools', r.invocations.length === 1 && r.invocations[0].withTools === true)
    check('round trip transcript carries the function responses', r.invocations[0].lastText.includes('recorded'))
  }

  console.log('calls-only twice, text-only leg speaks (~a third of round trips):')
  {
    const r = await resolve(
      calls({ name: 'set_slot', args: { slot_key: 'trainingDays', value: 'Mon,Wed' } }),
      [
        ok(calls({ name: 'set_slot', args: { slot_key: 'trainingDays', value: 'Mon,Wed' } }, { name: 'present_slot', args: { slot_key: 'fitnessGoal' } })),
        ok(text('And what are you actually after — dropping weight, building?')),
      ],
    )
    check('reply comes from the text-only leg', r.reply.includes('after'))
    check('two recovery calls: tools then no tools', r.invocations.map((i) => i.withTools).join(',') === 'true,false')
    check('duplicate set_slot from the round trip is dropped', r.actions.filter((a) => a.name === 'set_slot').length === 1)
    check('new present_slot from the round trip is merged', r.actions.some((a) => a.name === 'present_slot' && a.args.slot_key === 'fitnessGoal'))
    check('text-only nudge forbids call syntax instead of requesting chips', r.invocations[1].lastText.includes('plain text only'))
  }

  console.log('every model leg ok-but-empty (the loosened-prompt shape) — floor, no wasted retry:')
  {
    const r = await resolve(calls({ name: 'set_slot', args: { slot_key: 'fitnessGoal', value: 'fat_loss' } }), [ok([]), ok([])])
    check('reply is non-empty from the floor', r.reply.trim().length > 0)
    check('floor asks the next remaining slot\'s question', r.reply.includes('Which days can you actually train?'))
    check('floor appends present_slot for a chip-rendering slot', r.actions.some((a) => a.name === 'present_slot' && a.args.slot_key === 'trainingDays'))
    check('ok-but-empty is not retried: exactly two recovery calls', r.invocations.length === 2)
  }

  console.log('every model leg fails upstream — floor, bounded at three calls:')
  {
    const r = await resolve(calls({ name: 'set_slot', args: { slot_key: 'fitnessGoal', value: 'fat_loss' } }), [fail(), fail(503), fail(503)])
    check('reply is non-empty from the floor', r.reply.trim().length > 0)
    check('transport failure IS retried once: exactly three recovery calls', r.invocations.length === 3)
    check('the set_slot the model DID make survives', r.actions.some((a) => a.name === 'set_slot'))
  }

  console.log('entirely empty first turn (no text, no calls — previously shipped as silence):')
  {
    const r = await resolve([], [ok(text('Still with me? Tell me which days usually work.'))])
    check('recovery runs without a round trip: one call, no tools', r.invocations.length === 1 && r.invocations[0].withTools === false)
    check('reply recovered', r.reply.includes('Still with me'))
    check('nudge is the speak-now variant, not function responses', r.invocations[0].lastText.includes('came back empty'))
  }

  console.log('entirely empty first turn AND the leg fails twice — floor still answers:')
  {
    const r = await resolve([], [fail(), fail()])
    check('reply is non-empty', r.reply.trim().length > 0)
    check('two calls: text-only plus its transport retry', r.invocations.length === 2)
  }

  console.log('leak-shaped replies trigger recovery instead of shipping empty:')
  {
    const r = await resolve(
      [...text('{"name": "present_slot", "slot_key": "trainingDays"}'), ...calls({ name: 'set_slot', args: { slot_key: 'trainingDays', value: 'Mon' } })],
      [ok(text('Just Mondays for now then.'))],
    )
    check('bare-JSON reply is discarded and recovered', r.reply === 'Just Mondays for now then.')
    const r2 = await resolve(
      [...text('(Note: the user didn\'t specify days, so I need to present the training days option.)'), ...calls({ name: 'present_slot', args: { slot_key: 'trainingDays' } })],
      [ok(text('Which days tend to work for you?'))],
    )
    check('parenthetical-only reply is discarded and recovered', r2.reply === 'Which days tend to work for you?')
    const r3 = await resolve(calls({ name: 'set_slot', args: { slot_key: 'trainingDays', value: 'Mon' } }), [ok(text('{"actions": []}')), ok(text('Noted — Mondays.'))])
    check('a leak-shaped ROUND-TRIP reply also keeps the chain going', r3.reply === 'Noted — Mondays.')
  }

  console.log('floor slot choice:')
  {
    const r = await resolve(calls({ name: 'present_slot', args: { slot_key: 'fitnessGoal' } }), [ok([]), ok([])], ['trainingDays', 'fitnessGoal'])
    check('a present_slot already in the turn pins the floor\'s question', r.reply.includes("What's your main goal?"))
    check('no second present_slot is appended', r.actions.filter((a) => a.name === 'present_slot').length === 1)
    const r2 = await resolve(calls({ name: 'set_slot', args: { slot_key: 'trainingDays', value: 'Mon' } }), [ok([]), ok([])], ['age'])
    check('numeric next slot gets its question with no chips', r2.reply.includes('How old are you?') && !r2.actions.some((a) => a.name === 'present_slot'))
    const fr = floorReply(CATALOG, ['displayName'], [])
    check('text-control next slot gets its question with no chips', fr.reply.includes('What should I call you?') && fr.extraActions.length === 0)
  }

  console.log('floor with nothing left to ask:')
  {
    const r = await resolve(calls({ name: 'set_slot', args: { slot_key: 'age', value: '41' } }), [ok([]), ok([])], [])
    check('wrap-up line instead of a question', r.reply.includes("That's everything"))
    check('complete_onboarding appended so finishing stays reachable', r.actions.filter((a) => a.name === 'complete_onboarding').length === 1)
    const r2 = await resolve(calls({ name: 'complete_onboarding' }), [ok([]), ok([])], [])
    check('an existing complete_onboarding is not duplicated', r2.actions.filter((a) => a.name === 'complete_onboarding').length === 1)
  }

  console.log('the invariant itself, across every shape a first leg can take:')
  {
    const shapes: Array<[string, GeminiPart[], string[]]> = [
      ['text only', text('hello'), ['trainingDays']],
      ['calls only', calls({ name: 'set_slot', args: { slot_key: 'age', value: '41' } }), ['trainingDays']],
      ['nothing', [], ['trainingDays']],
      ['leak text + calls', [...text('{"name": "x"}'), ...calls({ name: 'record_context_fact', args: { display_text: 'd', raw_phrase: 'r' } })], ['trainingDays']],
      ['calls only, nothing remaining', calls({ name: 'set_slot', args: { slot_key: 'age', value: '41' } }), []],
      ['empty parts array with unknown remaining key', [], ['notARealSlot']],
    ]
    for (const [name, firstParts, remaining] of shapes) {
      // Worst-case model: every recovery leg fails or returns nothing.
      const r = await resolve(firstParts, [fail(), fail(), fail(), fail()], remaining)
      check(`non-empty reply for: ${name}`, r.reply.trim().length > 0, JSON.stringify(r.reply))
    }
  }
}

run().then(() => {
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('\nAll reply-guarantee checks passed.')
})
