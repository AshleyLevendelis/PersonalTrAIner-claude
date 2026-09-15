// ---------------------------------------------------------------------------
// "KNOW WHEN TO SUGGEST ADDING A SESSION AND WHEN SOMETHING IS MENTIONED IN
// PASSING." — Ashley, 15 Sep 2026.
//
// And her ruling the same day, from three options: offer it ONLY when she
// sounds definite. She chose the coach judging over asking every time.
//
// THE SPLIT THIS GATE EXISTS TO HOLD, because it is the honest consequence of
// that ruling and it is easy to lose:
//
//   - The coach staying QUIET when it should have offered is a miss that
//     costs nothing on the plan, cannot be inspected (there is no turn to
//     look at), and is therefore GRADED by the coach exam, not blocked here.
//   - Putting a session on her plan off "I might" is a WRITE. That direction
//     is enforced in code, and §2 below is where.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. §1 and §3 are behavioural — real
// functions, real plan objects. §2 and §4 are source checks, and a source
// check can never prove a branch is REACHED; verify:cardio-session drives the
// real chat and reads the screenshot.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { setSupabaseClient } from '../src/lib/supabase'
import { isHedged, HEDGE_PHRASES } from '../src/lib/definite-mention'
import { executeCardioSession } from '../src/lib/pending-action-executor'
import { isScheduledDay, prescriptionLine, dayDetail } from '../src/lib/activity-day'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'

// A FAKE CLIENT, so §3 exercises the SAVE path rather than stopping short of
// it. The first version of this file used a profile with no id to stay off the
// network — which took the executor's "no profile" branch, so nothing landed
// and the receipt was empty. That was the gate being wrong, not the code, and
// it is exactly the "read the values, not the label" trap: the check was named
// after the receipt's wording and the value printed beside it said `[]`.
const written: { week: number }[] = []
setSupabaseClient({
  from: () => ({
    upsert: (row: Record<string, unknown>) => {
      written.push({ week: Number(row.week_number) })
      return Promise.resolve({ error: null })
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any)

let failures = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== '' ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1)
const stripImports = (src: string) => src.replace(/^\s*import\s[\s\S]*?from\s+['"][^'"]+['"]\s*$/gm, '')

const chat = stripComments(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
const client = stripImports(stripComments(readFileSync('src/components/ChatAssistant.tsx', 'utf8')))

console.log('cardio-session gate\n')

// -------------------------------------------------------------------------
console.log('1. Definite or a maybe — the rule, run')

const DEFINITE = [
  'Wednesday is my cardio day',
  'I run on Tuesdays',
  "I'm doing a bike ride Thursday",
  'I swim Saturday mornings',
  'Could you add a run on Friday',
  'Add cardio to Wednesday',
]
const HEDGED = [
  'I might do a bike ride Wednesday',
  'maybe a run on Thursday',
  "I've been thinking about swimming",
  'I could do a ride Friday',
  'not sure yet, possibly Wednesday',
  'if i have time I might run',
  'depends how I feel',
]
for (const m of DEFINITE) check(`definite: "${m}"`, isHedged(m) === false, m)
for (const m of HEDGED) check(`a maybe: "${m}"`, isHedged(m) === true, m)

// THE TRAPS. A bare-word list would fire on both of these, and both are
// ordinary things somebody says to a trainer.
check('"a mighty effort" is not a hedge (word boundaries, not substrings)', isHedged('that was a mighty effort') === false)
check('"back in May I ran" is not a hedge ("may" only as "i may"/"we may")', isHedged('back in May I ran a 10k') === false)
check('"could you add" is a request, not a hedge', isHedged('could you add a swim on Monday') === false)

// -------------------------------------------------------------------------
console.log('\n2. A maybe cannot produce a card')
// The enforced half of the ruling. Source-shaped, and the limit is stated at
// the top — but the PROPERTY here is specific enough to be worth pinning: the
// refusal reads the whole message, not the model's chosen quote.

const builder = client.slice(
  client.indexOf('const buildCardioSessionProposal'),
  client.indexOf('const buildRestDayProposal') > 0 ? client.indexOf('const buildRestDayProposal') : undefined,
)
check('the cardio builder exists to be checked (sanity check on this check)', builder.length > 200, builder.length)
check('it calls isHedged before building anything', /isHedged\s*\(/.test(builder))
check(
  '...on the WHOLE message, not the tool\'s own quote — a quote can drop the hedge',
  /isHedged\s*\(\s*userSaid\s*\)/.test(builder) && !/isHedged\s*\([^)]*origin_verbatim/.test(builder),
  builder.match(/isHedged\s*\([^)]*\)/)?.[0],
)
check('and the dispatcher hands it the message rather than defaulting to empty',
  /buildCardioSessionProposal\(result\.proposal\.rawArgs,\s*userSaid\)/.test(client))

// BUILD-TIME VALIDATION — the bug Ashley hit. record_fact formatted a label
// and only discovered at CONFIRM that it had nowhere to write, which is how
// she got "Which meal slot should that apply to? / Nothing was applied".
const returnsNullOn = ['activity', 'minutes', 'targetRpe', 'week', 'day']
check(`the builder refuses before showing a card, on every unusable arg (${returnsNullOn.length} guards)`,
  (builder.match(/return null/g) ?? []).length >= returnsNullOn.length,
  (builder.match(/return null/g) ?? []).length)
check('...including a minutes value that is not a usable number',
  /Number\.isFinite\(minutes\)/.test(builder) && /minutes <= 0/.test(builder))
check('...and an effort outside the scale', /targetRpe < 1 \|\| targetRpe > 10/.test(builder))

// -------------------------------------------------------------------------
console.log('\n3. What it writes, run against a real plan')

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const mkWeek = (n: number, block: number): MesocycleWeek => ({
  week_number: n, block_number: block, phase: 'Anatomical Adaptation',
  days: DAYS.map(d => ({
    day: d, focus: d === 'Monday' ? 'Upper Body' : 'Rest',
    exercises: d === 'Monday'
      ? [{ name: 'Bench Press', sets: 3, reps: '8-10', rest_seconds: 120, intensity: 'RPE 7' }]
      : [],
  })),
} as unknown as MesocycleWeek)
const meso = [mkWeek(1, 1), mkWeek(2, 1), mkWeek(3, 1), mkWeek(4, 1), mkWeek(5, 2)]
const profile = { id: '00000000-0000-4000-8000-000000000001' } as UserProfile
const wed = (w: MesocycleWeek) => w.days.find(d => d.day === 'Wednesday')!

const added = await executeCardioSession(profile, meso, {
  weekNumber: 1, dayName: 'Wednesday', activity: 'Cycle', minutes: 35, targetRpe: 3,
  reason: 'Zone 2 builds the engine without taxing your legs before Monday.', scope: 'permanent',
})
const day1 = wed(added.mesocycle[0])
check('the day carries a whole prescription', !!day1.plannedActivity, day1.plannedActivity)
check('...with the minutes and effort that were asked for, not a default',
  day1.plannedActivity?.duration === 35 && day1.plannedActivity?.targetRpe === 3, day1.plannedActivity)
check('...and the coach\'s reason, which is what the day shows underneath',
  (day1.plannedActivity?.reason ?? '').includes('Zone 2'), day1.plannedActivity?.reason)

// THE WHOLE POINT OF DOING THE RENDERING FIRST. These are the three functions
// the screens call; if the written shape were wrong they would show a blank
// card, which is the defect this feature exists downstream of.
check('the screens count it as a session', isScheduledDay(day1) === true)
check('...render it as a prescription', prescriptionLine(day1.plannedActivity!) === 'Cycle · 35m · RPE 3', prescriptionLine(day1.plannedActivity!))
check('...and preview it in minutes, never "0 exercises"', dayDetail(day1) === '35 minutes', dayDetail(day1))

check('"my cardio day" means every week of the block', !!wed(added.mesocycle[3]).plannedActivity)
check('...and stops at the block boundary', !wed(added.mesocycle[4]).plannedActivity)
check('...leaving the other days alone',
  added.mesocycle[0].days.filter(d => d.plannedActivity).length === 1,
  added.mesocycle[0].days.filter(d => d.plannedActivity).map(d => d.day))
check('nothing failed on the way', added.receipt.failed.length === 0, added.receipt.failed)
check('the receipt says what landed, in the words the day shows',
  added.receipt.landed.some(l => l.includes('Cycle') && l.includes('35')), added.receipt.landed)
check('...and the weeks it claims are the weeks it wrote',
  written.map(w => w.week).sort().join(',') === '1,2,3,4', written.map(w => w.week))

// A DAY THAT ALREADY TRAINS IS REFUSED. plannedActivity means "this activity
// is the WHOLE day", so writing one onto a lifting day would hide the lifting
// behind it on all three screens that lead with the prescription.
const onLift = await executeCardioSession(profile, meso, {
  weekNumber: 1, dayName: 'Monday', activity: 'Run', minutes: 30, targetRpe: 5, scope: 'permanent',
})
check('a day that already trains is refused, in a sentence', onLift.receipt.failed[0]?.error.includes('already has a session'), onLift.receipt.failed)
check('...and nothing was written to it', !wed(onLift.mesocycle[0]).plannedActivity && onLift.mesocycle[0].days.find(d => d.day === 'Monday')!.plannedActivity === undefined)

const noSuchDay = await executeCardioSession(profile, meso, {
  weekNumber: 1, dayName: 'Someday', activity: 'Run', minutes: 30, targetRpe: 5, scope: 'permanent',
})
check('a day that is not on the plan is refused rather than invented', noSuchDay.receipt.failed.length === 1, noSuchDay.receipt.failed)

// -------------------------------------------------------------------------
console.log('\n4. The coach asks first, and the prompt says the same words this file refuses on')

check('the tool is declared', /name: "propose_cardio_session"/.test(chat))
const decl = chat.slice(chat.indexOf('name: "propose_cardio_session"'), chat.indexOf('name: "ban_exercise"'))
check('minutes and effort are REQUIRED, so a card cannot say just "cardio"',
  /required:\s*\[[^\]]*"minutes"[^\]]*\]/.test(decl) && /required:\s*\[[^\]]*"target_rpe"[^\]]*\]/.test(decl),
  decl.match(/required:\s*\[[^\]]*\]/)?.[0])
check('...and it says to carry what was already discussed',
  /already recommended|already established|conversation/i.test(decl))

const handler = chat.slice(chat.indexOf('if (name === "propose_cardio_session")'))
  .slice(0, chat.slice(chat.indexOf('if (name === "propose_cardio_session")')).indexOf('if (name === "ban_exercise")'))
check('the handler forwards the quote, which the client refusal needs',
  /origin_verbatim_quote:\s*args\.origin_verbatim_quote/.test(handler))

const section = chat.slice(chat.indexOf('=== 3g2.'), chat.indexOf('=== 4. TAG HYGIENE'))
check('the prompt has a section on when to ask (sanity check on this check)', section.length > 400, section.length)
check('...which says NO tool call on the asking turn', /NO TOOL CALL|Do NOT call propose_cardio_session on this turn/i.test(section))
check('...and gives the chips that make the ask tappable', /QUICK_REPLIES/.test(section))

// DERIVED, NOT WRITTEN TWICE. The prompt has to teach the model the same
// words the client refuses on. Rather than a second copy of the list in a
// Deno file that nothing executes, the list lives in one place and this
// asserts the prompt names every entry.
const missing = HEDGE_PHRASES.filter(h => !section.toLowerCase().includes(h.toLowerCase()))
check(`the prompt names every hedge the code refuses on (${HEDGE_PHRASES.length})`, missing.length === 0, missing)
// And the detector is proven: a phrase NOT on the list is not in the section
// either, so the check above is not passing because the section says everything.
check('...and the derivation is not vacuous — an unrelated word is absent',
  !section.toLowerCase().includes('pomegranate'))

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`)
process.exit(failures === 0 ? 0 : 1)
