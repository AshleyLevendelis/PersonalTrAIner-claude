// ---------------------------------------------------------------------------
// Gate: THE COACH MAY NOT DESCRIBE A DAY THAT IS NOT HERS (1 Nov 2026).
//
// Reported live with a screenshot. Sunday 11:22, a rest day, nothing logged all
// week. She tapped Home's "What should I focus on for the rest of today?" and the
// coach answered "Since it's late in the evening and you've just wrapped up your
// workout, your main focus for the rest of tonight ...". The prompt carried
// "Sunday 11:21 AM (morning)" and "Workout Logged Today: No"; the model wrote
// over both. Nothing compared the reply with the facts.
//
// This gate EXECUTES the detector (src/lib/today-claim.ts), the server's retry
// path (tool-reply.ts against a scripted model), and holds the wiring by source:
// the two copies identical, chat-gemini passing the check to both reply paths,
// the client sending trained_today from the strip's working sets and running its
// own copy before the screen. It cannot prove the deployed model obeys: that is
// the exam's, and the reach proof on the client is verify:today-claim.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import { detectTodayClaim, todayClaimFloor, todayClaimNudge, type TodayFacts } from '../src/lib/today-claim'
import { resolvePlainReply, resolveToolReply, type ReplyCheck } from '../supabase/functions/chat-gemini/tool-reply.ts'
import type { GeminiLegResult, GeminiPart } from '../supabase/functions/_shared/gemini-parts.ts'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else {
    failures++
    console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`)
  }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

const SUNDAY: TodayFacts = { partOfDay: 'morning', trainedToday: false, dayName: 'Sunday', clock: '11:21 AM', userMessage: 'What should I focus on for the rest of today?' }
const HER_REPLY = "Since it's late in the evening and you've just wrapped up your workout, your main focus for the rest of tonight should be getting a good meal in to kickstart recovery, staying hydrated, and winding down for sleep.\n\nFor post-workout nutrition tonight, your plan has a solid Lean Beef Bolognese with Spaghetti lined up for dinner to hit your protein and replenish your glycogen.\n\nDid you manage to get some food in after your session?"

async function main() {
  // -------------------------------------------------------------------------
  console.log('\n1. Her reply, verbatim, is refused — on both counts')
  // -------------------------------------------------------------------------
  const c1 = detectTodayClaim(HER_REPLY, SUNDAY)
  check('on a Sunday morning it is refused for the time of day', c1?.kind === 'part_of_day' && c1.claimed === 'evening', c1)
  const c2 = detectTodayClaim(HER_REPLY, { ...SUNDAY, partOfDay: 'evening' })
  check('in the evening it is still refused: nothing was trained today', c2?.kind === 'trained_today', c2)
  const c3 = detectTodayClaim(HER_REPLY, { ...SUNDAY, partOfDay: 'evening', trainedToday: true })
  check('in the evening after a real session it passes (both facts true)', c3 === null, c3)

  // -------------------------------------------------------------------------
  console.log('\n2. Every way of saying it is a time it is not')
  // -------------------------------------------------------------------------
  const wrongTime = [
    "It's getting late in the evening, so keep dinner light.",
    'Good evening! Water first.',
    'Evening — how was the day?',
    'Your focus for the rest of tonight is sleep.',
    'Since it is night now, skip the coffee.',
    'Good afternoon — lunch is next.',
  ]
  for (const t of wrongTime) check(`refused in the morning: "${t}"`, detectTodayClaim(t, SUNDAY)?.kind === 'part_of_day', detectTodayClaim(t, SUNDAY))
  check('the same greeting is fine when it IS that time', detectTodayClaim('Good evening! Water first.', { ...SUNDAY, partOfDay: 'evening' }) === null)
  check('"it\'s morning" passes in the morning', detectTodayClaim("It's morning, so a big breakfast makes sense.", SUNDAY) === null)
  check('"night" counts as evening (17:00 on)', detectTodayClaim("It's late at night, wind down.", { ...SUNDAY, partOfDay: 'evening' }) === null)

  // -------------------------------------------------------------------------
  console.log('\n3. Every way of saying she trained today, when she did not')
  // -------------------------------------------------------------------------
  const trained = [
    "You've just finished your session, so get protein in.",
    'You completed today\'s workout, nice.',
    "Since you've trained, carbs are fine now.",
    "You've worked out today, so drink up.",
    'Great session today.',
    'Well done on your workout.',
    'Post-workout nutrition tonight is the bolognese.',
    "Now that you've been to the gym, rest up.",
  ]
  for (const t of trained) check(`refused with nothing logged: "${t}"`, detectTodayClaim(t, { ...SUNDAY, userMessage: 'what now?' })?.kind === 'trained_today', detectTodayClaim(t, SUNDAY))

  // -------------------------------------------------------------------------
  console.log('\n4. Advice, plans, questions and her own news pass')
  // -------------------------------------------------------------------------
  const fine = [
    'Have the bolognese tonight, it lines up with your protein.',
    "Once you've finished your session, get some protein in.",
    'If you train tonight, a post-workout meal with carbs helps.',
    'When you finish your workout, eat within a couple of hours.',
    'Morning sessions suit some people.',
    'Did you get your workout in?',
    'Have you finished your session yet?',
    "It's a rest day, so focus on food and water.",
    "You're about 450ml behind on water for this time of day.",
    "You'll have finished your session by six, so eat after.",
    'Tomorrow is Full Body Power — a good night\'s sleep helps it.',
  ]
  for (const t of fine) check(`passes: "${t}"`, detectTodayClaim(t, SUNDAY) === null, detectTodayClaim(t, SUNDAY))
  check('her own news ("I just did a 5k") lets the coach acknowledge it before anything is saved',
    detectTodayClaim('Great session today — how did the 5k feel?. Nice work today.', { ...SUNDAY, userMessage: 'I just did a 5k run' }) === null)
  check('...but her news never excuses a wrong time of day',
    detectTodayClaim("Since it's late in the evening, rest up.", { ...SUNDAY, userMessage: 'I just did a 5k run' })?.kind === 'part_of_day')
  check('an unknown fact checks nothing (null in, nothing refused)',
    detectTodayClaim(HER_REPLY, { partOfDay: null, trainedToday: null }) === null)

  // -------------------------------------------------------------------------
  console.log('\n5. The retry states the facts; the floor states the day')
  // -------------------------------------------------------------------------
  const nudge = todayClaimNudge(c1!, SUNDAY)
  check('the retry names the wrong claim and the facts', /evening or night/.test(nudge) && /Sunday morning/.test(nudge) && /11:21 AM/.test(nudge) && /Nothing has been trained or logged today/.test(nudge), nudge)
  check('the trained retry says they have not trained', /trained or finished a workout today\. They have not/.test(todayClaimNudge({ kind: 'trained_today', sentence: '' }, SUNDAY)))
  const floor = todayClaimFloor(SUNDAY)
  check('the floor owns the slip and says the day as it is, with nothing invented', /had your day wrong/.test(floor) && /Sunday morning/.test(floor) && /nothing logged yet today/.test(floor) && detectTodayClaim(floor, SUNDAY) === null, floor)

  // -------------------------------------------------------------------------
  console.log('\n6. The server: refused, retried WITH the facts, floored — on a plain turn and a tool turn')
  // -------------------------------------------------------------------------
  const text = (t: string): GeminiPart[] => [{ text: t }]
  const ok = (parts: GeminiPart[]): GeminiLegResult => ({ ok: true, parts })
  const scripted = (steps: GeminiLegResult[]) => {
    const calls: unknown[][] = []
    return { calls, callGemini: async (turns: unknown[]) => { calls.push(turns); const s = steps.shift(); if (!s) throw new Error('over-called'); return s } }
  }
  const checks: ReplyCheck[] = [{
    test: t => { const c = detectTodayClaim(t, SUNDAY); return c ? `${c.kind}:${c.claimed ?? ''}: ${c.sentence}` : null },
    nudge: why => todayClaimNudge(why.startsWith('part_of_day') ? { kind: 'part_of_day', sentence: '', claimed: 'evening' } : { kind: 'trained_today', sentence: '' }, SUNDAY),
    floor: todayClaimFloor(SUNDAY),
  }]
  {
    const m = scripted([ok(text('It is a rest day, so dinner and water are the focus. The bolognese is a good dinner.'))])
    const r = await resolvePlainReply({ contents: [], firstParts: text(HER_REPLY), callGemini: m.callGemini, floor: 'F', checks })
    check('plain turn: her reply is refused and the retry is used', r.source === 'round_trip' && /rest day/.test(r.reply), r)
    check('...and the retry was sent the FACTS, not a bare try-again', JSON.stringify(m.calls[0] ?? []).includes('Sunday morning') && JSON.stringify(m.calls[0] ?? []).includes('Nothing has been trained'))
  }
  {
    const m = scripted([ok(text("Good evening — you've just finished your session."))])
    const r = await resolvePlainReply({ contents: [], firstParts: text(HER_REPLY), callGemini: m.callGemini, floor: 'F', checks })
    check('plain turn: wrong twice falls to the check\'s own floor, not the generic one', r.source === 'floor' && r.reply === todayClaimFloor(SUNDAY), r)
  }
  {
    const m = scripted([ok(text(HER_REPLY)), ok(text('Logged — a rest day, and dinner is the bolognese.'))])
    const r = await resolveToolReply({ contents: [], firstParts: [], callGemini: m.callGemini, floor: 'TOOL FLOOR', outcome: { name: 'log_water', args: {}, response: {} }, checks })
    check('tool turn: a refused round trip gets one retry with the facts', r.source === 'round_trip' && /rest day/.test(r.reply) && JSON.stringify(m.calls[1] ?? []).includes('Sunday morning'), r)
  }
  {
    const m = scripted([ok(text(HER_REPLY)), ok(text(HER_REPLY))])
    const r = await resolveToolReply({ contents: [], firstParts: [], callGemini: m.callGemini, floor: 'TOOL FLOOR', outcome: { name: 'log_water', args: {}, response: {} }, checks })
    check('tool turn: wrong twice ships the tool\'s own template (it says only what the tool did)', r.source === 'floor' && r.reply === 'TOOL FLOOR', r)
  }

  // -------------------------------------------------------------------------
  console.log('\n7. Wiring, by source')
  // -------------------------------------------------------------------------
  const app = read('../src/lib/today-claim.ts')
  const deno = read('../supabase/functions/_shared/today-claim.ts')
  check('the two copies are identical', app === deno)
  const fn = strip(read('../supabase/functions/chat-gemini/index.ts'))
  check('chat-gemini hands the check to every tool reply', /resolveToolReply\(\{[^}]*checks: todayChecks/.test(fn))
  check('...and to the plain reply', /resolvePlainReply\(\{[\s\S]{0,400}checks: todayChecks/.test(fn))
  check('...built from the clock, the client\'s trained_today and her own message', /partOfDay: typeof context\.current_part_of_day/.test(fn) && /context\.trained_today/.test(fn) && /userMessage: typeof message === "string"/.test(fn))
  check('the example that set the scene in the evening no longer does', !/fit your evening nicely/.test(fn))
  check('...and the examples are labelled as voice only, never a source for the day', /never take the time of day, a session, or whether they have trained from an example/.test(fn))
  const chat = strip(read('../src/components/ChatAssistant.tsx'))
  check('the client sends trained_today', /trained_today: trainedToday/.test(chat))
  check('"Workout Logged Today" counts the strip\'s working sets, not every row (warm-ups out)',
    /workoutLoggedToday = \(todayCell\?\.workingLogs\?\.length \?\? 0\) > 0/.test(chat) && !/workoutLogHistory\.includes\(todayStr\)/.test(chat))
  check('the client runs its own copy before the screen, with her message', /detectTodayClaim\(result\.reply \?\? '', facts\)/.test(chat) && /userMessage: userSaid/.test(chat) && /return \{ text: todayClaimFloor\(facts\) \}/.test(chat))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.error(`today claim: ${failures} check(s) failed`); process.exit(1) }
  console.log('today claim: all checks passed')
}

main().catch(e => { console.error(e); process.exit(1) })
