/**
 * test:save-reply — THE COACH STILL ANSWERS WHEN IT KEEPS SOMETHING (7 Nov 2026).
 *
 * The coach exam on TEST, 7 Nov: two turns ("it's been a rough few weeks", "I did
 * 90 minutes of cardio because I'd overeaten") came back with an EMPTY reply and
 * a save, so she got silence and a receipt. Now:
 *   1. The chat shows the coach's words with the save's note beneath; the app's
 *      own words still win where they ask something back or nothing was saved
 *      (src/lib/save-reply.ts).
 *   2. The coach's save reply may never announce the save (the prompt's "DON'T
 *      ANNOUNCE THE SAVE"), and its brief asks for the referral when one is due.
 *   3. chat-gemini's record_context_fact handler writes a reply through the
 *      checked tool-reply path, with a floor that is never empty, on BOTH arms
 *      (kept and not kept), and the save itself is still forwarded only when
 *      her words are really in her message.
 *   4. resolveToolReply, driven with a fake model on this exact nudge: the
 *      coach's text beside the call is used, an announcing one is refused and
 *      the round trip asked, and silence falls to the floor, never "".
 *   5. The note a save leaves: a plain label stays; a clinical or judging one
 *      (the exam's "Compensatory exercise pattern ... extreme restriction") is
 *      replaced by HER OWN WORDS, in what is shown and what is kept.
 * Browser half: verify:chat-save-reply.
 */
import { readFileSync } from 'node:fs'
import { textBesideSave, contextNoteText } from '../src/lib/save-reply'
import { resolveToolReply, SAVE_NUDGE, ANNOUNCES_THE_SAVE } from '../supabase/functions/chat-gemini/tool-reply'

let ran = 0, failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

async function main() {
  console.log('\n1. What the chat shows')
  const receipt = { kind: 'memory_context_fact_saved', title: 'Saved to memory' }
  const saved = { text: 'Saved: Having a rough few weeks', receipt }
  check("the coach's words are the message when the save happened", textBesideSave(saved, 'That sounds hard.').text === 'That sounds hard.')
  check('...and the save keeps its note', textBesideSave(saved, 'That sounds hard.').receipt === receipt)
  check("an empty coach reply leaves the app's own line, never a blank", textBesideSave(saved, '').text === 'Saved: Having a rough few weeks' && textBesideSave(saved, '   ').text === 'Saved: Having a rough few weeks' && textBesideSave(saved, undefined).text === 'Saved: Having a rough few weeks')
  const asked = { text: 'What should I remember that about, specifically?' }
  check("the app's question back wins when nothing was saved", textBesideSave(asked, 'That sounds hard.').text === asked.text)
  check("the coach's words fill a save that returned nothing", textBesideSave({ text: '' }, 'That sounds hard.').text === 'That sounds hard.')
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  check('the chat routes every memory save through it, with the reply the server sent', /if \(result\.memoryIntent\) \{\s*return textBesideSave\(await resolveAndSaveMemory\(result\.memoryIntent\), result\.reply\)/.test(chat))

  console.log('\n2. What the reply may say')
  const banned = ['Saved to memory.', "I've recorded that.", 'Added that to your profile.', "I've noted it.", 'I saved that in your memory.']
  check('the phrases the prompt bans are refused', banned.every(t => ANNOUNCES_THE_SAVE.test(t)), banned.filter(t => !ANNOUNCES_THE_SAVE.test(t)))
  const fine = ['That sounds like a lot, Ashley.', 'Noted — a lighter week then.', 'Your profile says nut-free, so that stays out.', 'Rough weeks happen; we go light.']
  check('...an ordinary reply is not', fine.every(t => !ANNOUNCES_THE_SAVE.test(t)), fine.filter(t => ANNOUNCES_THE_SAVE.test(t)))
  check('the brief says never to mention the save, to answer what they said, and to name a professional when called for',
    /never mention saving/.test(SAVE_NUDGE) && /answer what they actually said/.test(SAVE_NUDGE) && /doctor, dietitian or other professional/.test(SAVE_NUDGE) && /Plain text only/.test(SAVE_NUDGE))

  console.log('\n3. The coach\'s server')
  const idx = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
  const a = idx.indexOf('if (name === "record_context_fact") {')
  const b = idx.indexOf('if (name === "set_display_name") {', a)
  const handler = a >= 0 && b > a ? idx.slice(a, b) : ''
  check('the record_context_fact handler is found', handler.length > 0)
  check('...it never sends an empty reply', !/reply:\s*""/.test(handler) && !/reply:\s*textPart/.test(handler), handler.match(/reply:[^,}]*/g))
  check('...it writes the reply through the checked tool-reply path with the save brief', /await toolReply\(\{/.test(handler) && /nudge: SAVE_NUDGE/.test(handler) && /preferFirstLegText: true/.test(handler) && /forbid: \[ANNOUNCES_THE_SAVE\]/.test(handler))
  check('...with the day checks and the plan-claim check on it', /checks: \[\.\.\.todayChecks,/.test(handler) && /detectPlanClaim\(t\)/.test(handler))
  check('...a floor that is not empty', /nudge: SAVE_NUDGE,\s*floor: "[^"]+",/.test(handler))
  check('...the reply goes out on both arms, the save only when her words are in her message',
    /const kept = !!quote && message\.toLowerCase\(\)\.includes\(quote\.toLowerCase\(\)\)/.test(handler)
      && /kept\s*\?\s*\{ reply: spoken\.reply, memoryIntent: \{ tool: name, rawArgs: args \} \}\s*:\s*\{ reply: spoken\.reply \}/.test(handler))

  console.log('\n4. The checked path, driven')
  const outcome = { name: 'record_context_fact', args: { origin_verbatim_quote: 'rough few weeks' }, response: { status: 'kept_for_next_time' } }
  const legs: unknown[][] = []
  const model = (answers: string[]) => async (turns: unknown[]) => { legs.push(turns); const t = answers.shift(); return { ok: true as const, parts: t === undefined ? [] : [{ text: t }] } }
  const opts = { contents: [], callGemini: model([]), outcome, nudge: SAVE_NUDGE, floor: 'Thanks for telling me.', preferFirstLegText: true, forbid: [ANNOUNCES_THE_SAVE] }
  legs.length = 0
  const own = await resolveToolReply({ ...opts, firstParts: [{ text: 'That sounds like a lot to carry.' }, { functionCall: { name: 'record_context_fact', args: {} } }] as never })
  check("the coach's own text beside the save is used, at no extra call", own.reply === 'That sounds like a lot to carry.' && own.source === 'first_leg' && legs.length === 0, own)
  legs.length = 0
  const announced = await resolveToolReply({ ...opts, callGemini: model(["Rough weeks happen. Let's go light this week."]), firstParts: [{ text: 'Saved to memory!' }] as never })
  check('an announcing first text is refused and the round trip answers', announced.reply === "Rough weeks happen. Let's go light this week." && announced.source === 'round_trip' && legs.length === 1, announced)
  check('...and the round trip was given the save brief', JSON.stringify(legs[0] ?? []).includes('never mention saving'))
  legs.length = 0
  const silent = await resolveToolReply({ ...opts, callGemini: model([]), firstParts: [] as never })
  check('a coach that says nothing at all falls to the floor, never an empty reply', silent.reply === 'Thanks for telling me.' && silent.source === 'floor', silent)

  console.log('\n5. The note a save leaves')
  const EXAM_LABEL = 'Compensatory exercise pattern (90m cardio after overeating) & extreme restriction (600 kcal rest day)'
  const EXAM_SAID = "I did 90 minutes of cardio after dinner too because I'd overeaten"
  check("the exam's clinical label is replaced by her own words", contextNoteText(EXAM_LABEL, EXAM_SAID) === `“${EXAM_SAID}”`, contextNoteText(EXAM_LABEL, EXAM_SAID))
  const verdicts = ['Restrictive eating', 'Binge eating after work', 'Shows signs of low mood', 'Possible eating disorder', 'Extreme dieting', 'Obsessive about calories', 'Pattern of skipping meals', 'Avoidant behaviour around food']
  check('...and so is every judging label', verdicts.every(v => contextNoteText(v, 'what I said').startsWith('“')), verdicts.filter(v => !contextNoteText(v, 'what I said').startsWith('“')))
  const kind = ['Training for a wedding in June — wants extra encouragement', 'Having a rough few weeks', 'Busy few weeks at work', 'Likes being pushed hard']
  check('a plain, kind label stays as the coach wrote it', kind.every(k => contextNoteText(k, 'x') === k), kind.map(k => contextNoteText(k, 'x')))
  check('no label at all falls back to her words', contextNoteText('', 'new job') === '“new job”')
  const long = contextNoteText('Extreme', 'word '.repeat(40))
  check('her words are cut short on a word, with an ellipsis', long.length <= 82 && long.endsWith('…”') && !/wor…/.test(long), long)
  const ctx = (() => { const a = chat.indexOf("if (intent.tool === 'record_context_fact') {"); const b = a < 0 ? -1 : chat.indexOf("if (intent.tool === 'record_fact')", a); return a >= 0 && b > a ? chat.slice(a, b) : '' })()
  check('the chat keeps and shows the checked text, never the raw label',
    /const displayText = contextNoteText\(String\(args\.display_text \|\| ''\), rawPhrase\)/.test(ctx) && /createContextFact\(\{ profileId, source: 'chat', rawPhrase, displayText \}\)/.test(ctx) && /detail: displayText/.test(ctx))
  check('...and its own line is warm, never "Saved: <label>"', /text: 'Thanks for telling me\.'/.test(ctx) && !/Saved: \$\{/.test(ctx))
  const decl = (() => { const a = idx.indexOf('name: "record_context_fact"'); return a < 0 ? '' : idx.slice(a, a + 1500) })()
  check("the coach is told the label is plain, kind words, never clinical", /plain, kind words/.test(decl) && /Never a clinical, diagnostic or judging label/.test(decl))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`save reply: ${failures} check(s) failed`); process.exit(1) }
  console.log('save reply: all checks passed')
}
main()
