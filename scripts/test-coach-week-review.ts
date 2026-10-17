// ---------------------------------------------------------------------------
// test:coach-week-review — the coach reviews the week the screens count (run 7, 15 Oct 2026, M50).
//
// Sam asked "how did my week go". The coach said no meals were logged (Saturday's breakfast was), that Sam
// trained Thursday, Friday and Saturday (the Exercise tab said 0 of 4 done) and answered in five paragraphs.
// It had been handed raw set rows and meal totals and built its own week from them.
//
// Now each coach turn is handed the strip's own two weeks, Monday to Sunday (her 15 Oct ruling), one line per
// day in the strip's words with that day's logged meals. This holds:
//   1. the block says what the strip says, day by day, and the count is the strip's count
//   2. a logged meal shows on its day; an unreadable meal read never reads as "nothing logged"
//   3. the wiring: every turn reads the weeks through readTrainingWeeks (Home's reader) and sends the block
//   4. the prompt shows it, says "could not be read" when it was not, and asks for a short answer from it
// Whether the deployed coach OBEYS is model behaviour and stays the exam's to judge.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import type { TrainingWeekDay, DayGlyphState } from '../src/hooks/useTrainingWeek'
import type { EatenDay } from '../src/lib/meal-store'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const day = (date: string, i: number, state: DayGlyphState, extra: Partial<TrainingWeekDay> = {}): TrainingWeekDay =>
  ({ date, dayName: NAMES[i], state, ...extra }) as TrainingWeekDay
const sets = (n: number) => Array.from({ length: n }, () => ({})) as TrainingWeekDay['workingLogs']

async function main() {
  const { buildCoachWeekReview, weekReviewDates } = await import('../src/lib/coach-week-review')

  // Sam's week, as the Exercise tab drew it on Wed 14 Oct ("0 of 4 done, 2 to go"): Mon and Tue missed, Wed a rest
  // day, Thu and Sat to come. Last week: one done, one started, one moved, one swapped for a walk.
  const today = '2026-10-14'
  const thisWeek = [
    day('2026-10-12', 0, 'missed', { session: { focus: 'Lower Body' } as TrainingWeekDay['session'] }),
    day('2026-10-13', 1, 'missed', { markedMissed: true }),
    day('2026-10-14', 2, 'rest'),
    day('2026-10-15', 3, 'due'),
    day('2026-10-16', 4, 'rest'),
    day('2026-10-17', 5, 'due'),
    day('2026-10-18', 6, 'rest'),
  ]
  const lastWeek = [
    day('2026-10-05', 0, 'rest'),
    day('2026-10-06', 1, 'rest'),
    day('2026-10-07', 2, 'rest'),
    day('2026-10-08', 3, 'done', { workingLogs: sets(12) }),
    day('2026-10-09', 4, 'moved', { movedTo: { date: '2026-10-10', dayName: 'Saturday' } }),
    day('2026-10-10', 5, 'partial', { workingLogs: sets(1) }),
    day('2026-10-11', 6, 'swapped', { swappedForActivity: 'Walk' }),
  ]
  const eaten: Record<string, EatenDay> = { '2026-10-10': { kcal: 430.4, protein: 30, carbs: 40, fat: 12, meals: 1 } }
  const block = buildCoachWeekReview({ thisWeek, lastWeek }, eaten, today) ?? ''
  const lines = block.split('\n')
  const lineFor = (label: string) => lines.find(l => l.startsWith(`- ${label}`)) ?? ''
  console.log(`\n--- the block for Sam's week ---\n${block}\n---`)

  console.log('\n1. It says what the strip says')
  check('this week\'s count is the strip\'s: 0 of 4 done, 2 to go (missed days are not "to go")', /THIS WEEK \([^)]*\): 0 of 4 sessions done, 2 to go\./.test(block), lines.find(l => l.startsWith('THIS WEEK')))
  check('last week\'s count is the strip\'s: 1 of 2 done (a started one is owed; a moved and a swapped day are not)', /LAST WEEK \([^)]*\): 1 of 2 sessions done\./.test(block), lines.find(l => l.startsWith('LAST WEEK')))
  check('both weeks run Monday to Sunday', /LAST WEEK \(Mon 5 Oct to Sun 11 Oct\)/.test(block) && /THIS WEEK \(Mon 12 Oct to Sun 18 Oct\)/.test(block), lines.filter(l => /WEEK/.test(l)))
  check('Monday is missed, with its session named', /Mon 12 Oct: Lower Body — missed \(nothing logged\)/.test(lineFor('Mon 12 Oct')), lineFor('Mon 12 Oct'))
  check('...and a day she marked missed says so', /missed \(she said so\)/.test(lineFor('Tue 13 Oct')), lineFor('Tue 13 Oct'))
  check('today is marked today, and a rest day is a rest day', /Wed 14 Oct \(today\): rest day/.test(lineFor('Wed 14 Oct')), lineFor('Wed 14 Oct'))
  check('THIS week stops at today — no line for a day not yet lived', !lines.some(l => /^- (Thu 15 Oct|Sat 17 Oct|Sun 18 Oct)/.test(l)), lines)
  check('a done day is done with its working sets; a part-done one says started', /done \(12 working sets\)/.test(lineFor('Thu 8 Oct')) && /started, not finished \(1 working set\)/.test(lineFor('Sat 10 Oct')), [lineFor('Thu 8 Oct'), lineFor('Sat 10 Oct')])
  check('a moved day names where it went, a swapped one what for', /moved to Sat 10 Oct/.test(lineFor('Fri 9 Oct')) && /swapped for Walk/.test(lineFor('Sun 11 Oct')), [lineFor('Fri 9 Oct'), lineFor('Sun 11 Oct')])
  check('no line calls a rest or missed day trained', !lines.some(l => /(rest day|missed)/.test(l) && /\bdone\b/.test(l)), lines)

  console.log('\n2. Meals, as logged')
  check('the Saturday breakfast shows on Saturday (the coach said none were logged)', /Sat 10 Oct: .*meals: 1 logged entry, 430 kcal/.test(lineFor('Sat 10 Oct')), lineFor('Sat 10 Oct'))
  check('...and a day with nothing logged says so', /meals: nothing logged$/.test(lineFor('Mon 12 Oct')), lineFor('Mon 12 Oct'))
  const unread = buildCoachWeekReview({ thisWeek, lastWeek }, null, today) ?? ''
  check('a meal read that failed says "could not be read" on every day, never "nothing logged"', !/meals: nothing logged/.test(unread) && (unread.match(/meals: could not be read this turn/g) ?? []).length === 10, (unread.match(/could not be read/g) ?? []).length)
  check('an unread training week gives no block (the coach is told the week is unknown)', buildCoachWeekReview(null, eaten, today) === null && buildCoachWeekReview({ thisWeek: [], lastWeek }, eaten, today) === null)
  const dates = weekReviewDates(lastWeek, today)
  check('the meal totals asked for run from last Monday to today (an 8-day window never reached last Monday on a Wednesday)', dates[0] === '2026-10-05' && dates[dates.length - 1] === today && dates.length === 10, dates)

  console.log('\n3. The client reads the strip\'s weeks and sends them every turn')
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  check('the weeks come from readTrainingWeeks, the reader Home uses', /const reviewWeeks = profile\.id\s*\?\s*await readTrainingWeeks\(profile\.id, eatenToday, liveWeekDays/.test(chat))
  check('...the block is built from them and the meal totals for those dates', /buildCoachWeekReview\(reviewWeeks, await getEatenByDate\(profile\.id, weekReviewDates\(reviewWeeks\.lastWeek, eatenToday\)\)/.test(chat))
  check('...and the request carries it', /context: buildContext\(eatenByDay, weekReview\)/.test(chat) && /week_review: weekReview,/.test(chat) && /week_review_read: weekReview != null,/.test(chat))

  console.log('\n4. The coach is shown it and told how to use it')
  const prompt = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
  const at = prompt.indexOf('THEIR WEEK, AS THE APP COUNTS IT')
  const section = at < 0 ? '' : prompt.slice(at, prompt.indexOf('${buildDietarySafetyBlock', at))
  check('the block is rendered when it was read', /context\.week_review_read === true && typeof context\.week_review === 'string' \? `\nTHEIR WEEK, AS THE APP COUNTS IT/.test(prompt) && /\$\{context\.week_review\}/.test(section))
  check('...and "could not be read" when it was not, never assembled from history', /context\.week_review_read === false \? `\nTHEIR WEEK — could not be read this turn/.test(prompt) && /never assemble one from the workout history/.test(section))
  check('a week is Monday to Sunday in what the coach says', /A WEEK IS MONDAY TO SUNDAY/.test(section))
  check('a week question is answered from these lines alone: trained only if done or started', /READ IT FROM THESE LINES AND NOTHING ELSE/.test(section) && /A day is trained only if it says done or started/.test(section))
  check('...and a logged meal is never denied', /never say they logged no meals when a line here shows a logged entry/.test(section))
  check('a review is short: three short lines at most, no headers or paragraph per day', /three short lines at most/.test(section) && /No headers, no bullet list, no paragraph per day/.test(section))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('The coach reviews the week the screens count, from its own lines, briefly.')
}
main().catch(e => { console.error(e); process.exit(1) })
