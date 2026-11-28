// FREESTYLE A DAY, FROM THE CHAT (28 Nov 2026, coach-awareness audit (b) 5). Held by behaviour: the date comes from his
// words inside the screen controller's own window, the card asks and never announces, Apply and Undo are the screen
// controller's own mark and clear, and the receipts are the screen's words.
import { planFreestyle, confirmFreestyle, undoFreestyle, freestyleDateFor, FREESTYLE_REFUSALS } from '../src/lib/coach-routes/freestyle'
import { FREESTYLE_WORDS, type FreestyleController } from '../src/lib/freestyle'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
// Saturday 28 Nov 2026 and the six days after it, as the controller's window.
const DATES = ['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04']

async function main() {
  console.log('1. The day, from his words, inside the window only')
  check('today and tomorrow', freestyleDateFor('today', DATES) === '2026-11-28' && freestyleDateFor('Tomorrow', DATES) === '2026-11-29')
  check('a weekday name is the first in the window', freestyleDateFor('Wednesday', DATES) === '2026-12-02' && freestyleDateFor('wed', DATES) === '2026-12-02')
  check('"Saturday" said on a Saturday is today', freestyleDateFor('saturday', DATES) === '2026-11-28')
  check('"this Friday" is Friday', freestyleDateFor('this friday', DATES) === '2026-12-04')
  check('a date in the window', freestyleDateFor('2026-12-01', DATES) === '2026-12-01')
  check('a date outside it is null', freestyleDateFor('2026-12-05', DATES) === null)
  check('nonsense is null', freestyleDateFor('someday', DATES) === null && freestyleDateFor('fr', DATES) === null)

  console.log('2. The card: asks, says what the screen says, and what stays')
  const none = { dates: DATES, isFreestyleOn: () => false }
  {
    const p = planFreestyle({ day: 'Wednesday', want: 'freestyle' }, none)
    check('plans', p.ok, p)
    if (p.ok) {
      check('asks, names the day', /^Want me to make Wednesday freestyle\?/.test(p.lead), p.lead)
      check('says it is that day only and judged on protein and calories', /that day only/.test(p.lead) && /protein and calories only/.test(p.lead), p.lead)
      check('a day ahead says nothing about what is logged today', !/already logged today/.test(p.lead), p.lead)
      check('row before and after', p.row.before === 'the plan' && p.row.after === 'freestyle', p.row)
    }
    const t = planFreestyle({ day: 'today', want: 'freestyle' }, none)
    check('today: what is already logged stays', t.ok && /already logged today stays/.test(t.lead) && /^Want me to make today freestyle\?/.test(t.lead), t)
    const back = planFreestyle({ day: 'tomorrow', want: 'plan' }, { dates: DATES, isFreestyleOn: d => d === '2026-11-29' })
    check('back to the plan asks too', back.ok && /^Want me to put tomorrow back on the plan\?/.test(back.lead) && back.row.before === 'freestyle', back)
  }

  console.log('3. Refusals: only what cannot be done')
  {
    const out = planFreestyle({ day: '2026-12-10', want: 'freestyle' }, none)
    check('outside the window: the screen\'s own sentence', !out.ok && out.reason === FREESTYLE_WORDS.outsideWindow, out)
    const vague = planFreestyle({ day: 'soon', want: 'freestyle' }, none)
    check('no day: asked which', !vague.ok && vague.reason === FREESTYLE_REFUSALS.day, vague)
    const already = planFreestyle({ day: 'today', want: 'freestyle' }, { dates: DATES, isFreestyleOn: () => true })
    check('already freestyle: said', !already.ok && already.reason === FREESTYLE_REFUSALS.already('Today'), already)
    const onPlan = planFreestyle({ day: 'Monday', want: 'plan' }, none)
    check('already on the plan: said', !onPlan.ok && onPlan.reason === FREESTYLE_REFUSALS.notFreestyle('Monday'), onPlan)
  }

  console.log('4. Apply and Undo are the screen controller\'s own calls')
  {
    const calls: string[] = []
    let failMark = false
    const ctl: FreestyleController = {
      dates: DATES,
      mark: async d => { calls.push(`mark ${d}`); return failMark ? { ok: false, reason: 'nope' } : { ok: true } },
      clear: async d => { calls.push(`clear ${d}`); return true },
    }
    const p = planFreestyle({ day: 'Wednesday', want: 'freestyle' }, none)
    if (!p.ok) { check('plan for apply', false, p); return }
    const done = await confirmFreestyle(ctl, p)
    check('Apply marks that date, with the screen\'s receipt', done.ok && calls[0] === 'mark 2026-12-02' && done.message === FREESTYLE_WORDS.marked('Wednesday'), { done, calls })
    const undone = await undoFreestyle(ctl, p)
    check('Undo clears the same date, with the screen\'s receipt', undone.ok && calls[1] === 'clear 2026-12-02' && undone.message === FREESTYLE_WORDS.cleared('Wednesday'), { undone, calls })
    failMark = true
    const failed = await confirmFreestyle(ctl, p)
    check('a failed mark says the controller\'s reason', !failed.ok && failed.message === 'nope', failed)
    const back = planFreestyle({ day: 'Wednesday', want: 'plan' }, { dates: DATES, isFreestyleOn: () => true })
    if (back.ok) {
      const r = await confirmFreestyle(ctl, back)
      check('back to the plan clears', r.ok && calls[calls.length - 1] === 'clear 2026-12-02', calls)
    } else check('back plan', false, back)
  }

  console.log(`${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} failed`); process.exit(1) }
  console.log('PASS')
}
void main()
