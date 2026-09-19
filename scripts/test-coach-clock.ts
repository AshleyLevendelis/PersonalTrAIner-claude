// ---------------------------------------------------------------------------
// Gate: THE COACH KNOWS WHAT TIME IT IS, AND NEVER CLAIMS TO KNOW WHEN SHE
// USUALLY TRAINS.
//
// Ashley, 17 Sep 2026, at 17:58 on her phone: "It was 6 pm. And the app was
// asking if I was going to hit my morning session. It isn't aware of the time."
// Three consecutive turns said "this morning".
//
// MEASURED, and the obvious diagnosis was WRONG. The clock reaching the model
// was correct all along — the client sends her own local time. Three other
// things were not:
//
//   1. THE APP INVENTED A FACT ABOUT HER AND THEN REASONED FROM IT.
//      `preferred_time` is written as the literal 'morning' for every account
//      at onboarding (onboarding-slots.ts, whose own comment says the question
//      is "No longer asked"). It reached the deployed prompt in THREE places —
//      once under USER PROFILE as a claim about her, once on the CONTEXT line
//      beside the correct clock, and once inside the only time-of-day
//      reasoning rule in the prompt. Nobody ever asked her when she trains.
//
//   2. THE SECTION HEADED "TEMPORAL AWARENESS" WAS THE ONE THAT WAS WRONG.
//      It gave the time ONLY as a raw UTC ISO instant — an hour behind her
//      clock in British summer, with no timezone note and no time-of-day word
//      anywhere in it. The two correct statements lived elsewhere and were
//      quieter than the two assertions that she trains mornings.
//
//   3. ONE WRONG "MORNING" BECAME ALL DAY'S. History is restored with no date
//      filter and sent as bare {role, content}, so the coach's own 8am turn
//      containing "this morning" sat in the window looking exactly like the
//      sentence before this one. Turn 2 mirrored turn 1, turn 3 mirrored 2.
//
// WHY A GATE AND NOT JUST A FIX: every one of those is a claim in a template
// literal or a field on an object. Nothing would notice any of them coming
// back. What this CANNOT check is whether the model then behaves — that is the
// coach exam's job, and it is blind here for its own reason, recorded below.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { partOfDay, stampTurnTime, STAMP_AFTER_MINUTES } from '../src/lib/chat-plan-context'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

/** A note explaining why something was removed must not satisfy the check that it was removed. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const PROMPT = stripComments(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
const CLIENT = stripComments(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
const ONBOARDING = stripComments(readFileSync('src/lib/onboarding-slots.ts', 'utf8'))

console.log('\n[1] A turn carries when it was said')
{
  // FIXTURES ARE MEASURED FROM ONE ANCHOR, never from the machine's calendar —
  // this gate has to give the same answer on a Tuesday.
  const now = new Date('2026-09-16T17:58:00')
  const at = (iso: string) => new Date(iso).toISOString()

  const live = stampTurnTime('how did that feel?', at('2026-09-16T17:41:00'), now)
  check('a turn from minutes ago is left exactly as it was — a live conversation is not annotated',
    live === 'how did that feel?', live)

  const earlier = stampTurnTime('ready to get after those deadlifts?', at('2026-09-16T08:12:00'), now)
  check('a turn from earlier today says so', earlier.startsWith('[said earlier today,') && earlier.endsWith('ready to get after those deadlifts?'), earlier)
  check('...and names the part of day it was actually said in, not the part of day it is now',
    earlier.includes('morning') && !earlier.includes('evening'), earlier)

  const yesterday = stampTurnTime('see you tomorrow', at('2026-09-15T20:30:00'), now)
  check('a turn from another day names the day', /^\[said on Tuesday evening, /.test(yesterday), yesterday)

  // THE THRESHOLD IS A PROPERTY, NOT A NUMBER TYPED TWICE: derived from the
  // exported constant, so moving the constant moves the check with it.
  const justInside = stampTurnTime('x', at(new Date(now.getTime() - (STAMP_AFTER_MINUTES - 5) * 60_000).toISOString()), now)
  const justOutside = stampTurnTime('x', at(new Date(now.getTime() - (STAMP_AFTER_MINUTES + 5) * 60_000).toISOString()), now)
  check('the threshold bites: just inside it is untouched, just outside it is stamped',
    justInside === 'x' && justOutside !== 'x', { justInside, justOutside })

  // A MISSING TIMESTAMP MUST NEVER FABRICATE ONE, and must never throw — this
  // runs on every turn the coach is ever sent.
  // AN IMPORT IS NOT A USE. Everything above exercises the function directly,
  // and would stay green with the call site deleted — which is precisely the
  // defect, since the whole point is the turns the COACH is sent. So require
  // the call, on the history map, with the message's own content.
  check('the history sent to the coach is actually stamped', /stampTurnTime\(m\.content/.test(CLIENT), 
    CLIENT.split('\n').filter(l => l.includes('stampTurnTime')).slice(0, 3))
  check('...against the app clock rather than a fresh Date', /const historyNow = getAppNow\(/.test(CLIENT))
  check('no timestamp means no claim about when it was said', stampTurnTime('x', null, now) === 'x')
  check('...and an unparseable one is the same', stampTurnTime('x', 'not-a-date', now) === 'x')

  // ONE PLACE DECIDES WHAT PART OF THE DAY IT IS. Derived from partOfDay's own
  // output rather than re-stating "evening starts at 5", so a second opinion
  // about when the evening begins cannot appear without failing here.
  //
  // BOTH BRANCHES, and that is not belt-and-braces — it is a miss this gate
  // actually had. The first version stamped every hour against a `now` on the
  // NEXT day, so all six cases went through the other-day branch and the
  // same-day branch was never exercised. A mutation that gave the same-day
  // branch its own hand-rolled opinion about when evening starts was MISSED,
  // applied and running, with all 29 checks green. Found by breaking it.
  for (const hour of [7, 11, 13, 16, 17, 21]) {
    const said = new Date(2026, 8, 16, hour, 5)
    const otherDay = stampTurnTime('x', said.toISOString(), new Date(2026, 8, 17, 12, 0))
    const sameDay = stampTurnTime('x', said.toISOString(), new Date(2026, 8, 16, 23, 30))
    check(`${hour}:05 is stamped "${partOfDay(hour)}" on another day, the same word the plan header uses`,
      otherDay.includes(partOfDay(hour)), { hour, otherDay })
    check(`...and "${partOfDay(hour)}" earlier the same day too, from the same one place`,
      sameDay.includes(partOfDay(hour)) && sameDay.startsWith('[said earlier today,'), { hour, sameDay })
  }
}

console.log('\n[2] The coach is told her local time, in words')
{
  check('the client sends the part of day', /current_part_of_day:\s*partOfDay\(/.test(CLIENT))
  check('...computed from the app clock, not the machine clock', /current_part_of_day:\s*partOfDay\(now\.getHours\(\)\)/.test(CLIENT))
  check('...and the prompt reads it', PROMPT.includes('context.current_part_of_day'))
  check('the prompt states the local clock string as the current time', PROMPT.includes('context.current_time_formatted'))

  // The UTC instant may still be there for arithmetic, but it must not be the
  // app's ANSWER to "what time is it" — that was the whole defect.
  const temporal = PROMPT.slice(PROMPT.indexOf('=== TEMPORAL AWARENESS ==='), PROMPT.indexOf('=== EXERCISE COACHING INTELLIGENCE ==='))
  check('the TEMPORAL AWARENESS section exists and was found', temporal.length > 200 && temporal.includes('TEMPORAL AWARENESS'), temporal.length)
  check('...and it leads with her own clock, not a UTC instant',
    temporal.indexOf('context.current_time_formatted') > -1 &&
    temporal.indexOf('context.current_time_formatted') < temporal.indexOf('context.current_date'),
    { local: temporal.indexOf('context.current_time_formatted'), utc: temporal.indexOf('context.current_date') })
  check('...and where the UTC instant survives, it is labelled as not the time of day',
    /never reason about time of day from it/i.test(temporal))
}

console.log('\n[3] Nothing claims to know when she trains')
{
  // THE FIELD STILL EXISTS — the column is NOT NULL and dropping it is a
  // migration, which is Ashley's word and her machine. What must not exist is
  // the app STATING it to the coach as a fact about her.
  check('onboarding still writes the column (it is NOT NULL) ...', /preferred_time:\s*'morning'/.test(ONBOARDING))
  check('...but the deployed prompt never states a preferred or usual training time',
    !/preferred_time|Preferred Time|preferred training time|preferred window|usual training time is/i.test(PROMPT),
    PROMPT.split('\n').filter(l => /preferred_time|Preferred Time|preferred training time|preferred window/i.test(l)).slice(0, 3))
  check('...and it says outright that the app does not know',
    /YOU DO NOT KNOW WHEN THIS PERSON USUALLY TRAINS/.test(PROMPT))

  // A WORKED EXAMPLE IS A RULE. The prompt's own transcript used to demonstrate
  // exactly the reasoning the rule now forbids — "(evening, preferred training
  // time is morning...)" — so an example that contradicts its rule is a check
  // in its own right, not a tidy-up.
  const examples = PROMPT.match(/^User: .*$/gm) ?? []
  check('there are worked examples to check, so this is not vacuous', examples.length > 5, examples.length)
  check('no worked example reasons from a preferred training time',
    !examples.some(l => /preferred training time/i.test(l)), examples.filter(l => /preferred training time/i.test(l)))
}

console.log('\n[4] What this gate cannot prove')
{
  // Recorded as a check so it is read rather than skipped: this is source
  // property, not behaviour. Whether the model then SAYS "this morning" at
  // 6pm can only be measured against the deployed function, which needs
  // credentials a cloud session does not have — and the coach exam cannot see
  // it either, because every one of its 20 cases is set at 9:15 AM.
  const base = JSON.parse(readFileSync('scripts/exam-cases/_base-context.json', 'utf8'))
  const hour = Number(String(base.current_time_formatted ?? '').match(/(\d+)/)?.[1] ?? 0)
  const isMorning = /AM/i.test(String(base.current_time_formatted ?? ''))
  check('the coach exam is pinned to one fixed hour, so it is structurally blind to this',
    typeof base.current_time_formatted === 'string' && hour > 0, base.current_time_formatted)
  check('...and that hour is the MORNING, which is why no exam case could ever have caught it',
    isMorning, base.current_time_formatted)
}

if (failures > 0) { console.error(`\n${failures} check(s) FAILED.`); process.exit(1) }
console.log('\nThe coach knows the time, and claims nothing about when she trains.')
