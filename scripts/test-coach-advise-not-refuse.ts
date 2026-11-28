/**
 * THE COACH OFFERS WITH THE REASON; IT REFUSES ONLY THE HARD STOPS (advise-then-allow fix 21, his ruling 28 Nov 2026:
 * "fix everything one by one and keep the hard stops").
 *
 * The coach's instructions held training refusals that are not one of his four hard stops: "never suggest adding
 * cardio or a finisher" on a class day, "never offer propose_volume_change because of the sport", "Never add finger
 * loading" for a climber, and a fallback that sent a training change to a screen. Each now reads "not unasked; if THEY
 * ask, offer it with the reason". The hard stops and the data-safety rule (a started session is not redrawn) stay.
 *
 * Source checks only: whether the model OBEYS is the coach exam's to judge, after the chat-gemini deploy.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const fn = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
let ran = 0
let failures = 0
const check = (label: string, ok: boolean) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}`) }
}

console.log('\n1. The general rule is there')
check('asked for something the plan advises against, the coach offers it with the reason', /ASKED FOR SOMETHING THE PLAN ADVISES AGAINST, OFFER IT WITH THE REASON/.test(fn))
check('a change a tool can make is never declined or sent to a screen; only the hard stops are refused', /A training change a tool can make is never declined and never sent to a screen/.test(fn)
  && /only the hard stops are refused \(pain that is sharp, one-sided or worsening; a move their injuries rule out; the pregnancy rules; the load limits\)/.test(fn))
check('...and the screen fallback is ONLY for what no tool does', /ONLY when they want something you have NO tool for, say plainly you cannot do it from chat/.test(fn))

console.log('\n2. The refusals that were not hard stops now offer with the reason')
check('a class day: no cardio or finisher suggested unasked, offered with the reason when asked', /do not suggest adding cardio or a finisher there yourself \(if THEY ask for one, offer it with the reason/.test(fn) && !/so never suggest adding cardio or a finisher there,/.test(fn))
check('the sport\'s volume: never suggested by the coach, offered if he still asks for less', /never suggest propose_volume_change yourself "because of" the sport/.test(fn) && /if they still ask for less, offer it with that reason/.test(fn) && !/never offer propose_volume_change "because of"/.test(fn))
check('a climber\'s finger loading: not added unasked, offered with the reason when asked', /Never add finger loading yourself; if they ask for it, offer it with the reason/.test(fn) && !/Never add finger loading\./.test(fn))

console.log('\n3. What stays a stop stays one')
check('pain red flags still never reach an injury tool', /Never call either injury tool for this tier\./.test(fn))
check('a started session is still not redrawn (data safety, kept)', /a session they have started is not redrawn/.test(fn))

console.log('\n4. His rulings and the reviewers\' wording (28 Nov 2026)')
check('never mention price: no "this app is free", and he is told the coach cannot speak to pricing', !/this app is free/i.test(fn) && /NEVER MENTION PRICE \(his ruling, 28 Nov 2026[^\n]*say you can't speak to pricing, and never state a price, "free" or a plan/.test(fn))
check('deleting an account is on the does-not-exist list', /deleting their account \(nothing in the app does it on request\)/.test(fn))
check('body composition: the tape, never "the scale is the best way"', /a tape round the waist shows the composition better; never call the scale "the best way"/.test(fn))
check('a safety or medical reply is still a text, two to four lines', /A SAFETY OR MEDICAL REPLY IS STILL A TEXT\./.test(fn) && /Two to four short lines: what you can say, the professional named once, the next step\./.test(fn))
check('pain is asked which kind before any ease-off card (his 15 Sep three)', /Never on the first mention of pain: \\"it hurts when I press\\" is asked which kind first/.test(fn))
check('a how-to has one cue about THEM', /one of them about THEM: their working weight, an injury on their list, or what their last log shows/.test(fn))
check('calories burned never move the food target, and an estimate is said as one', /calories burned are shown for interest: they never change the food target/.test(fn))

console.log(`\ncoach-advise-not-refuse: ${ran} checks ran`)
if (failures > 0) { console.error(`coach-advise-not-refuse: ${failures} check(s) FAILED`); process.exit(1) }
console.log('coach-advise-not-refuse: all checks passed')
