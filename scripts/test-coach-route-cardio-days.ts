// CARDIO DAYS A WEEK, FROM THE CHAT (28 Nov 2026, coach-awareness audit (b) 6). Held by behaviour: the card's title and
// detail are Profile's rebuild offer for the same patch, the days named are the plan's own split for the new count,
// what the app does differently is said (never refused), and only nonsense, no change, or over the setting's limit
// stops it.
import { planCardioDays, readCardioDays, CARDIO_DAYS_REFUSALS } from '../src/lib/coach-routes/cardio-days'
import { cardioSplitFor } from '../src/lib/cardio-days'
import { detectPlanInvalidation } from '../src/lib/plan-invalidation'
import type { UserProfile } from '../src/lib/types'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const profile = (n: number, extra: Partial<UserProfile> = {}) => ({
  training_days: WEEK.map((day, i) => ({ day, available: i < n })),
  training_experience: 'intermediate', recovery_capacity: 'moderate', concurrent_activities: [],
  cardio_days_per_week: 0, running_goal: null, injuries: [], ...extra,
}) as unknown as UserProfile

console.log('1. His words for the count')
check('digits and words', readCardioDays('2') === 2 && readCardioDays('two') === 2 && readCardioDays('three days') === 3)
check('"none" and "no cardio days" are zero', readCardioDays('none') === 0 && readCardioDays('no cardio days') === 0)
check('"a cardio day" is one', readCardioDays('a cardio day') === 1)
check('anything else is asked', readCardioDays('some') === null && readCardioDays('lots') === null)
check('an unreadable count asks how many', (p => !p.ok && p.reason === CARDIO_DAYS_REFUSALS.count)(planCardioDays(profile(5), 'some')))

console.log('2. The card is Profile\'s own offer, and the days are the plan\'s own split')
{
  const pr = profile(5)
  const p = planCardioDays(pr, 'two')
  const offer = detectPlanInvalidation(pr, { cardio_days_per_week: 2 })
  check('plans', p.ok, p)
  if (p.ok) {
    check('title and detail are detectPlanInvalidation\'s, word for word', !!offer && p.title === offer.title && p.detail === offer.detail, { p, offer })
    check('the patch is the one Profile saves', p.patch.cardio_days_per_week === 2)
    const split = cardioSplitFor({ ...pr, cardio_days_per_week: 2 })
    const named = (split?.cardioDays ?? []).every(c => p.lines.some(l => l.toLowerCase().includes(c.day.toLowerCase())))
    check('every cardio day the plan would build is named, with its kind', !!split && split.cardioDays.length === 2 && named && p.lines.some(l => /intervals/.test(l)), { lines: p.lines, split })
    check('the lifting days are named too', !!split && p.lines.some(l => l.startsWith('Lifting:') && split.liftDays.every(d => l.toLowerCase().includes(d))), p.lines)
    check('row before and after', p.row.before === '0' && p.row.after === '2', p.row)
  }
  const off = planCardioDays(profile(5, { cardio_days_per_week: 2 }), 'none')
  check('taking them out: Profile\'s "take the cardio days out" offer, no day lines', off.ok && /Take the cardio days out/.test(off.title) && off.lines.length === 0, off)
}

console.log('3. Said, never refused: lifting keeps two, a running goal wins')
{
  const few = planCardioDays(profile(3), 3)
  check('3 asked on 3 days: allowed, and the card says the plan builds 1, not 3', few.ok && few.given === 1 && /lifting keeps at least two, so the plan builds 1 cardio day, not 3/.test(few.lines.join(' ')), few)
  const two = planCardioDays(profile(2), 1)
  check('on 2 days: allowed, and the card says none are built', two.ok && two.given === 0 && /builds no cardio days, not 1/.test(two.lines.join(' ')), two)
  const run = planCardioDays(profile(5, { running_goal: 'run_5k' as never }), 2)
  check('with a running goal: allowed, and said to be set aside, no day lines', run.ok && /stay set aside until you take the running goal off/.test(run.lines.join(' ')) && !run.lines.some(l => l.startsWith('Cardio:')), run)
}

console.log('4. Only nonsense, no change or over the limit stops it')
{
  const same = planCardioDays(profile(5, { cardio_days_per_week: 2 }), 'two')
  check('the same count: said, nothing planned', !same.ok && same.reason === CARDIO_DAYS_REFUSALS.same(2), same)
  const zero = planCardioDays(profile(5), 'none')
  check('none when there are none: said', !zero.ok && zero.reason === CARDIO_DAYS_REFUSALS.same(0), zero)
  const four = planCardioDays(profile(6), 4)
  check('four: the setting\'s limit said, with three offered', !four.ok && four.reason === CARDIO_DAYS_REFUSALS.overThree, four)
}

console.log(`${ran} checks ran`)
if (failures > 0) { console.log(`${failures} failed`); process.exit(1) }
console.log('PASS')
