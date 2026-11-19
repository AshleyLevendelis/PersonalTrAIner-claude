// The coach never quotes a past lift the logs do not hold (his report 17 Nov 2026, a profile started the day before:
// "Aim for 72.5kg for 6-8 reps on your trap bar deadlifts today because you killed 70kg for 8 reps last week").
// Holds: his reply loses the invented history and keeps today's target; a claim the logs support stays; the future is
// not caught; nothing goes out empty; the step is on every reply's way out; the prompt's copyable examples are gone.
import { readFileSync } from 'node:fs'
import { dropUnloggedPastLifts, guardPastLifts, loggedWeights } from '../supabase/functions/chat-gemini/past-performance'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}

async function main() {
  // His real day: Monday's logged sets (dumbbells), nothing on the trap bar.
  const history = '2026-11-16: Dumbbell Bench Press — Set 1 34kg x 8, Set 2 34kg x 8, Set 3 34kg x 7; Seated Cable Row — Set 1 45kg x 10'
  const his = "Great to hear, Ashley! 🏋️\n\nAim for 72.5kg for 6–8 reps on your trap bar deadlifts today because you killed 70kg for 8 reps last week and we want to keep building that strength.\n\nGet a good warm-up in with those band hip abductions and let me know how it goes!"

  console.log('1. His reply')
  const out = dropUnloggedPastLifts(his, history)
  check('the invented "70kg for 8 reps last week" is gone', !/70kg/.test(out.text) && !/last week/.test(out.text), out.text)
  check('...today\'s target stays', /Aim for 72\.5kg for 6–8 reps on your trap bar deadlifts today\./.test(out.text), out.text)
  check('...and the rest of the reply is untouched', out.text.startsWith('Great to hear, Ashley!') && /band hip abductions/.test(out.text) && out.dropped === 1, out)

  console.log('\n2. What stays')
  const real = 'You pressed 34kg for 8 last session, so try 36kg today. Keep the reps clean.'
  check('a past lift the logs DO hold stays', dropUnloggedPastLifts(real, history).text === real)
  const future = 'Once you hit 75kg for 8, the plan moves you up. Keep at it.'
  check('a sentence about the future is not caught', dropUnloggedPastLifts(future, history).text === future)
  const plain = 'Start at 72.5kg and see how the last set feels.'
  check('today\'s number on its own is never touched', dropUnloggedPastLifts(plain, '').text === plain)
  const noKg = 'Last week went really well, keep it up.'
  check('a past mention with no weight stays', dropUnloggedPastLifts(noKg, '').text === noKg)

  console.log('\n3. What goes')
  const yday = dropUnloggedPastLifts('Yesterday was 100kg for 5 on the squat. Add a rep today.', history)
  check('"yesterday" with a weight the logs lack goes', yday.text === 'Add a rep today.' && yday.dropped === 1, yday)
  const whole = 'Yesterday you squatted 100kg for 5. Nice work.'
  const w = dropUnloggedPastLifts(whole, history)
  check('a whole sentence of invented history goes; the rest stays', w.text === 'Nice work.' && w.dropped === 1, w)
  const none = dropUnloggedPastLifts('Last session you benched 80kg.', '')
  check('a reply that is nothing but invented history is left as it was, never empty', none.text === 'Last session you benched 80kg.' && none.dropped === 0, none)
  check('weights are read off the logs as numbers ("34kg", "34.0 kg" alike)', loggedWeights('34.0 kg x 8, 45kg x 10').has('34') && loggedWeights('45kg').has('45'))

  console.log('\n4. On every reply\'s way out')
  const res = new Response(JSON.stringify({ reply: his, proposal: null }), { headers: { 'Content-Type': 'application/json' } })
  const guarded = await (await guardPastLifts(res, history, () => {})).json()
  check('the response\'s reply is cleaned and nothing else in it changes', !/70kg/.test(guarded.reply) && guarded.proposal === null, guarded)
  const server = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
  check('the one door applies it, with the logged sets the app sent', // 19 Nov 2026: the cleaning step is also handed the conversation (a second argument). The property is unchanged:
  // the guard wraps the CLEANED response of the handler, with the logged sets the app sent.
  /guardPastLifts\(await cleanCoachResponse\(await handleChatRequest\(req\)(?:, [\w.]+\(request\))?\), \(request as [^)]*\)\?\.context\?\.workout_log_history\)/.test(server))
  check('the prompt\'s copyable past-lift examples are gone', !/Last session you hit 70kg x 8/.test(server) && !/You got 140kg x 4 on deadlifts last time/.test(server))
  check('...and the coach is told a lift with no line has no last performance', /A lift with no line above has NO last performance/.test(server))

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
  console.log('All past-lift checks passed.')
}
main().catch(e => { console.error(e); process.exit(1) })
