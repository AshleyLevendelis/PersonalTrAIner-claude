// ---------------------------------------------------------------------------
// WEIGHT, WEEK BY WEEK on Home (his request 18 Nov 2026, "Add all three"). Whole app (app-boot.html, ?weigh-history:
// about four months of weigh-ins and one reading 9 kg off), real taps. PORT 9959. The Weight row opens a graph with a
// weekly-average line, a 3M / 6M / 1Y choice and a list of weeks; the figures are the ones the targets follow.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9959, page: 'app-boot.html', name: 'weight-history' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const tid = t => `document.querySelector('[data-testid="${t}"]')`
const btnText = re => `[...document.querySelectorAll('button')].find(b => ${re}.test(b.textContent.trim()))`
const weeks = () => ev(`[...document.querySelectorAll('[data-testid="weight-week"]')].map(li => ({ start: li.getAttribute('data-week'), label: li.querySelector('button').innerText, avg: parseFloat(li.getAttribute('data-avg')), shown: li.querySelector('[data-testid="weight-week-avg"]').innerText, change: li.querySelector('[data-testid="weight-week-change"]').innerText.trim() }))`)
const addDays = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10)

await go('&weigh-history')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btnText('/^Not now$/')})`)) { await clickAt(btnText('/^Not now$/')); await wait(500) }
await clickAt(`document.querySelector('[data-home-progress-toggle]')`); await wait(600)
const ROW = `document.querySelector('[data-home-weight] button')`
check('2. no history is drawn before the Weight row is opened', !(await ev(`!!${tid('weight-history')}`)))
await clickAt(ROW)
check('3. opening the Weight row draws the history', (await until(() => ev(`!!${tid('weight-history')}`), v => v === true, 40)) === true)
await wait(600)
check('4. 3M is chosen to start', (await ev(`${tid('weight-range-3M')}?.getAttribute('aria-pressed')`)) === 'true')
check('5. the graph draws a weekly-average line', (await ev(`(${tid('weight-chart-avg')}?.getAttribute('points') ?? '').split(' ').length`)) >= 10)

const w3 = await weeks()
check('6. the first week listed is "This week"', /^This week/.test(w3[0]?.label ?? ''), w3[0])
check('7. about thirteen weeks in three months', w3.length >= 13 && w3.length <= 15, w3.length)
check('8. weeks run newest first, a Monday each, seven days apart', w3.every((w, i) => i === 0 || addDays(w.start, 7) === w3[i - 1].start) && w3.every(w => new Date(w.start + 'T12:00:00Z').getUTCDay() === 1), w3.map(w => w.start))
// A week's change is its average less the week below it (the week before), with the arrow pointing the way it moved.
const changesAgree = w3.slice(0, -1).every((w, i) => {
  const prev = w3[i + 1], diff = w.avg - prev.avg, m = w.change.match(/^([\d.]+) kg ([↓↑])$/)
  if (Math.abs(diff) < 0.005) return w.change === 'no change'
  return !!m && Math.abs(+m[1] - Math.abs(diff)) <= 0.011 && m[2] === (diff < 0 ? '↓' : '↑')
})
check('9. each week\'s change is its average against the week before, with the right arrow', changesAgree, w3.map(w => `${w.avg} ${w.change}`))
check('10. the weight falls over the months, so most changes point down', w3.filter(w => /↓/.test(w.change)).length > w3.filter(w => /↑/.test(w.change)).length, w3.map(w => w.change))
check('11. the reading the targets set aside (93 kg) is left out of every week: no week jumps from its neighbour', w3.every((w, i) => i === 0 || Math.abs(w.avg - w3[i - 1].avg) < 0.8) && (await ev(`[...document.querySelectorAll('[data-testid="weight-chart-dot"]')].length`)) > 0, w3.map(w => w.avg))

// A week opened shows its days, and its average is the mean of those days.
const pick = w3[3] ?? { start: 'none', avg: NaN }
await clickAt(`document.querySelector('[data-testid="weight-week"][data-week="${pick.start}"] button')`); await wait(500)
const days = await ev(`[...document.querySelectorAll('[data-testid="weight-week"][data-week="${pick.start}"] [data-testid="weight-week-days"] li')].map(li => parseFloat(li.children[1].innerText))`)
const mean = days.reduce((s, x) => s + x, 0) / Math.max(1, days.length)
check('12. an opened week lists its weigh-ins, each day as "Sun, 30 Aug"', days.length >= 4 && days.length <= 7 && (await ev(`[...document.querySelectorAll('[data-testid="weight-week-days"] li')].every(li => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \\d{1,2} [A-Z][a-z]{2}$/.test(li.children[0].innerText))`)), days)
check('13. and its average is the mean of them, shown to one decimal', Math.abs(mean - pick.avg) <= 0.011 && pick.shown === `${pick.avg.toFixed(1)} kg`, { mean, avg: pick.avg })
await shoot('weight-history-3m')
await clickAt(`document.querySelector('[data-testid="weight-week"][data-week="${pick.start}"] button')`); await wait(300)
check('14. tapping it again closes it', (await ev(`document.querySelectorAll('[data-testid="weight-week-days"]').length`)) === 0)

await clickAt(tid('weight-range-1Y')); await wait(600)
const w1 = await weeks()
check('15. 1Y is chosen and 3M is not', (await ev(`${tid('weight-range-1Y')}?.getAttribute('aria-pressed')`)) === 'true' && (await ev(`${tid('weight-range-3M')}?.getAttribute('aria-pressed')`)) === 'false')
check('16. 1Y reaches back further: every weigh-in, about eighteen weeks', w1.length > w3.length && w1.length >= 17 && w1.length <= 20, { y: w1.length, m3: w3.length })
check('17. the weeks both ranges hold read the same', w3.slice(0, -1).every(w => w1.find(x => x.start === w.start)?.avg === w.avg))
check('18. the oldest week has nothing to compare with', w1[w1.length - 1]?.change === '', w1[w1.length - 1])
await shoot('weight-history-1y')
const widest = await ev(`Math.max(...[...document.querySelectorAll('[data-testid="weight-history"] *')].map(e => e.getBoundingClientRect().right))`)
check('19. nothing runs off a 390px screen', widest <= 390, widest)
const small = await ev(`[...document.querySelectorAll('[data-testid="weight-history"] button')].filter(b => b.getBoundingClientRect().height < 44).length`)
check('20. every control is at least 44px tall', small === 0, small)
await finish('verify:weight-history PASSED')
