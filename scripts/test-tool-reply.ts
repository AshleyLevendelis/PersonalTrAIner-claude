// ---------------------------------------------------------------------------
// THE SECOND PASS ON A TOOL TURN, against a mocked model.
//
// supabase/functions/chat-gemini/tool-reply.ts lets the model write the
// sentence after a tool runs, under two deterministic guards and a floor that
// is today's template. What this gate holds: the model is never called with
// tools on; the transcript carries the real result; a misquoted number or a
// false "logged" falls to the floor; the cost is bounded (0 extra calls when
// the model already spoke, at most 2 otherwise); and anything call-shaped the
// round trip returns is dropped, never executed.
// ---------------------------------------------------------------------------
import {
  resolveToolReply, guardReason, TOOL_TURN_NUDGE,
} from '../supabase/functions/chat-gemini/tool-reply.ts'
import type { GeminiLegResult, GeminiPart } from '../supabase/functions/_shared/gemini-parts.ts'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const text = (t: string): GeminiPart[] => [{ text: t }]
const call = (name: string, args: Record<string, unknown> = {}): GeminiPart => ({ functionCall: { name, args } })
const ok = (parts: GeminiPart[]): GeminiLegResult => ({ ok: true, parts })
const fail = (status = 503): GeminiLegResult => ({ ok: false, status, parts: [], errorText: 'mock upstream failure' })

/** Scripted model: consumes one result per call; records every invocation's shape. */
function scripted(steps: GeminiLegResult[]) {
  const invocations: Array<{ withTools: boolean; turns: unknown[] }> = []
  const callGemini = async (turns: unknown[], withTools: boolean): Promise<GeminiLegResult> => {
    invocations.push({ withTools, turns })
    const step = steps.shift()
    if (!step) throw new Error('mock model called more times than scripted')
    return step
  }
  return { callGemini, invocations, left: () => steps.length }
}

const CONTENTS = [{ role: 'user', parts: [{ text: 'how many calories in 20g of honey' }] }]
const OUTCOME = { name: 'log_meal', args: { food_name: 'Honey' }, response: { status: 'computed', kcal: 61, protein: 0.1, carbs: 16.5, fat: 0 } }
const FLOOR = '**Honey** is 61 kcal (P: 0.1g, C: 16.5g, F: 0g).'

const run = async () => {
  console.log('\n[1] The guards themselves')
  check('a missing number is refused', guardReason('Honey is mostly sugar, so a spoon is fine.', ['61 kcal']) !== null)
  check('...case-insensitively, present passes', guardReason('20g of honey is about 61 KCAL — a tablespoon, basically.', ['61 kcal']) === null)
  check('a forbidden word is refused', guardReason("Logged — that's 61 kcal.", ['61 kcal'], [/\blogged\b/i]) !== null)
  check('"logging" is not "logged" — word boundary holds', guardReason("No logging needed, it's 61 kcal.", ['61 kcal'], [/\blogged\b/i]) === null)

  console.log('\n[2] The model already spoke — zero extra calls')
  {
    const m = scripted([])
    const r = await resolveToolReply({ contents: CONTENTS, firstParts: [...text('Honey comes to 61 kcal for 20g — pure carbs, quick energy.'), call('log_meal')], callGemini: m.callGemini, outcome: OUTCOME, floor: FLOOR, preferFirstLegText: true, mustContain: ['61 kcal'] })
    check('the first leg\'s own text is the reply', r.source === 'first_leg' && /quick energy/.test(r.reply), r)
    check('...at no extra cost', r.legs === 0 && m.invocations.length === 0)
  }
  {
    const m = scripted([ok(text('About 61 kcal for that spoonful — nearly all of it sugar.'))])
    const r = await resolveToolReply({ contents: CONTENTS, firstParts: [...text('Honey is around 80 calories there.'), call('log_meal')], callGemini: m.callGemini, outcome: OUTCOME, floor: FLOOR, preferFirstLegText: true, mustContain: ['61 kcal'] })
    check('first-leg text with the WRONG number is refused and the round trip runs', r.source === 'round_trip' && /61 kcal/.test(r.reply), r)
  }
  {
    const m = scripted([ok(text('Sixty-one calories there.'))])
    const r = await resolveToolReply({ contents: CONTENTS, firstParts: [...text('Right, logging that now.'), call('log_meal')], callGemini: m.callGemini, outcome: OUTCOME, floor: FLOOR, mustContain: ['61 kcal'] })
    check('without preferFirstLegText the first leg is never used, even when it spoke', r.source !== 'first_leg', r)
  }

  console.log('\n[3] The round trip — one call, tools off, the result in the transcript')
  {
    const m = scripted([ok(text('Twenty grams of honey is 61 kcal, near enough all sugar — a decent pre-session hit.'))])
    const r = await resolveToolReply({ contents: CONTENTS, firstParts: [call('log_meal', { food_name: 'Honey' })], callGemini: m.callGemini, outcome: OUTCOME, floor: FLOOR, mustContain: ['61 kcal'] })
    check('the reply is the model\'s sentence', r.source === 'round_trip' && /decent pre-session/.test(r.reply), r)
    check('exactly one extra call', r.legs === 1 && m.invocations.length === 1)
    check('...with tools OFF', m.invocations[0].withTools === false)
    const turns = m.invocations[0].turns as Array<{ role: string; parts: Array<Record<string, unknown>> }>
    const fr = turns.find(t => t.parts.some(p => 'functionResponse' in p))
    check('the transcript carries the tool\'s real result as a functionResponse', !!fr && JSON.stringify(fr).includes('"kcal":61'), fr)
    const modelCall = turns.find(t => t.role === 'model' && t.parts.some(p => 'functionCall' in p))
    check('...after the model\'s own call', !!modelCall && turns.indexOf(modelCall) < turns.indexOf(fr!))
    const last = turns[turns.length - 1]
    check('...and ends with the nudge', JSON.stringify(last).includes(TOOL_TURN_NUDGE.slice(0, 40)))
    check('the nudge says not to claim "logged" when nothing was', /if activity_logged is false do not say logged/.test(TOOL_TURN_NUDGE))
    check('...and forbids lists, bold and field names', /no lists, no bold, no field names/.test(TOOL_TURN_NUDGE))
  }
  {
    const m = scripted([ok(text('Right — logged that, 61 kcal.'))])
    const r = await resolveToolReply({ contents: CONTENTS, firstParts: [call('log_meal')], callGemini: m.callGemini, outcome: OUTCOME, floor: FLOOR, mustContain: ['61 kcal'], forbid: [/\blogged\b/i] })
    check('a round trip that claims "logged" falls to the floor — no second attempt for a model choice', r.source === 'floor' && r.reply === FLOOR && r.legs === 1, r)
  }
  {
    const m = scripted([ok(text('Honey is basically sugar, so go easy.'))])
    const r = await resolveToolReply({ contents: CONTENTS, firstParts: [call('log_meal')], callGemini: m.callGemini, outcome: OUTCOME, floor: FLOOR, mustContain: ['61 kcal'] })
    check('a round trip that drops the number she asked for falls to the floor', r.source === 'floor' && r.reply === FLOOR, r)
  }
  {
    const m = scripted([ok([])])
    const r = await resolveToolReply({ contents: CONTENTS, firstParts: [call('log_meal')], callGemini: m.callGemini, outcome: OUTCOME, floor: FLOOR })
    check('an empty round trip → floor, one call, no retry', r.source === 'floor' && r.legs === 1, r)
  }
  {
    const m = scripted([ok([call('log_meal', { food_name: 'Honey' })]), ok(text('never reached'))])
    const r = await resolveToolReply({ contents: CONTENTS, firstParts: [call('log_meal')], callGemini: m.callGemini, outcome: OUTCOME, floor: FLOOR })
    check('a round trip that answers with another CALL is dropped, never executed → floor', r.source === 'floor', r)
    check('...and it is not retried either', m.left() === 1)
  }
  {
    const m = scripted([ok(text('{"name": "log_meal", "args": {}}')), ok(text('never reached'))])
    const r = await resolveToolReply({ contents: CONTENTS, firstParts: [call('log_meal')], callGemini: m.callGemini, outcome: OUTCOME, floor: FLOOR })
    check('a leak-shaped reply (bare JSON) is sanitized to nothing → floor', r.source === 'floor', r)
  }

  console.log('\n[4] Transport failure — one retry, then the floor')
  {
    const m = scripted([fail(), ok(text('61 kcal — all sugar, quick to burn.'))])
    const r = await resolveToolReply({ contents: CONTENTS, firstParts: [call('log_meal')], callGemini: m.callGemini, outcome: OUTCOME, floor: FLOOR, mustContain: ['61 kcal'] })
    check('a failed leg is retried once and the retry counts', r.source === 'round_trip' && r.legs === 2, r)
  }
  {
    const m = scripted([fail(), fail(500), ok(text('never reached'))])
    const r = await resolveToolReply({ contents: CONTENTS, firstParts: [call('log_meal')], callGemini: m.callGemini, outcome: OUTCOME, floor: FLOOR })
    check('two failures → floor, and the chain stops at two', r.source === 'floor' && r.legs === 2 && m.left() === 1, r)
  }

  console.log('\n[5] The module never turns tools on, whatever it is given')
  {
    const seen: boolean[] = []
    const m = { callGemini: async (_t: unknown[], withTools: boolean) => { seen.push(withTools); return fail() } }
    await resolveToolReply({ contents: CONTENTS, firstParts: [call('x')], callGemini: m.callGemini, outcome: OUTCOME, floor: FLOOR })
    await resolveToolReply({ contents: CONTENTS, firstParts: [], callGemini: m.callGemini, outcome: OUTCOME, floor: FLOOR, preferFirstLegText: true })
    check('every invocation had tools off', seen.length > 0 && seen.every(v => v === false), seen)
  }
  {
    const r = await resolveToolReply({ contents: CONTENTS, firstParts: [call('x')], callGemini: async () => ok(text('anything')), outcome: OUTCOME, floor: '' as string })
    check('the floor is whatever the caller passed — this module does not invent text', r.source === 'round_trip' || r.reply === '')
  }

  console.log(failures === 0 ? '\nAll tool-reply checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
  process.exit(failures === 0 ? 0 : 1)
}
run()
