// ---------------------------------------------------------------------------
// verify:program-titles — ON THE WEEK LIST, A WORKOUT'S NAME IS THE HEADLINE AND ITS EXERCISES HANG BENEATH IT.
//
// Ashley, 10 Nov 2026, of the Full Program's week list: "It's not very clearly visible at first glance which are a
// title of a workout and which are the exercises themselves."
//
// Measured on the screen before the change: the workout's name was 15.5px semibold, the main lift under it 13px in
// nearly the same white, and an opened day's exercise names 15px medium in full white, starting 13px to the LEFT of
// the title they belong to. Three things of about one size, the children outdented from the parent.
//
// What this reads off the real screen at 390px (and again at 320px):
//   - the workout's name is the largest and heaviest text in its row, and larger than any exercise name beneath it;
//   - the line under it is quieter (smaller, not the title's colour) and says what it is: the main lift;
//   - an opened day's exercises start to the RIGHT of the title's left edge, on a rail, under an "Exercises" label
//     that counts them;
//   - nothing runs off the side.
// It does not judge taste. It holds the three measurable things that made the two kinds of line look alike.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const { ev, shoot, check, until, wait, go, clickAt, finish, send } = await startDriver({ port: 9889, page: 'real.html', name: 'program-titles' })

const READ = `(() => {
  const px = el => parseFloat(getComputedStyle(el).fontSize)
  const rows = [...document.querySelectorAll('[data-program-day]')].map(row => {
    const title = row.querySelector('[data-program-title]')
    const main = row.querySelector('[data-program-main]')
    const t = title ? getComputedStyle(title) : null
    return {
      day: row.getAttribute('data-program-day'),
      kind: title?.getAttribute('data-program-title') ?? null,
      title: title?.textContent.trim() ?? null,
      titlePx: title ? px(title) : null,
      titleWeight: t ? Number(t.fontWeight) : null,
      titleColor: t?.color ?? null,
      titleLeft: title ? Math.round(title.getBoundingClientRect().left) : null,
      twoTone: title ? title.querySelectorAll('span').length > 0 : false,
      main: main?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
      mainPx: main ? px(main) : null,
      mainColor: main ? getComputedStyle(main).color : null,
      // TEXT ONLY: the rail and the bar are empty spans that inherit the page's 16px and draw no words.
      biggestOther: Math.max(0, ...[...row.querySelectorAll('span')].filter(s => (!title || (!title.contains(s) && !s.contains(title))) && [...s.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 0)).map(px)),
    }
  })
  const body = document.querySelector('[data-program-day-body]')
  const names = body ? [...body.querySelectorAll('[data-exercise-name], .line-clamp-2')].filter(n => n.classList.contains('line-clamp-2')) : []
  const rail = body ? getComputedStyle(body) : null
  return {
    rows,
    open: body ? {
      left: Math.round(body.getBoundingClientRect().left),
      railPx: parseFloat(rail.borderLeftWidth),
      heading: body.querySelector('[data-testid="program-exercises-heading"]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
      names: names.map(n => ({ text: n.textContent.trim(), px: px(n), left: Math.round(n.getBoundingClientRect().left) })),
    } : null,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }
})()`

console.log('\nTHE WEEK LIST: WHICH LINE IS THE WORKOUT, WHICH ARE ITS EXERCISES\n')
await go('&tour=off', '#/exercise/program')
await until(() => ev(`document.querySelectorAll('[data-program-day]').length`), v => v === 7, 80)
await wait(800)
const closed = await ev(READ)
const training = closed.rows.filter(r => r.kind === 'workout')
const resting = closed.rows.filter(r => r.kind === 'rest')
check('the week is up: seven days, some trained and some not', closed.rows.length === 7 && training.length >= 3 && resting.length >= 1, closed.rows.map(r => `${r.day}:${r.kind}`))
check('every workout\'s name is drawn at 17px or more, bold', training.every(r => r.titlePx >= 17 && r.titleWeight >= 700), training.map(r => [r.title, r.titlePx, r.titleWeight]))
check('...and is the LARGEST text in its row (it was within 2.5px of the line under it)', training.every(r => r.titlePx >= r.biggestOther + 4), training.map(r => [r.title, r.titlePx, r.biggestOther]))
check('...with its last word in the accent, as Home and Exercise draw a workout\'s name', training.filter(r => r.title.includes(' ')).every(r => r.twoTone) && training.some(r => r.title.includes(' ')), training.map(r => [r.title, r.twoTone]))
check('a rest day\'s label stays small and quiet: it is not a workout', resting.every(r => r.titlePx <= 14 && r.titleWeight < 600), resting.map(r => [r.title, r.titlePx, r.titleWeight]))
const withMain = training.filter(r => r.main)
check('the line under a workout says what it is: the main lift', withMain.length >= 3 && withMain.every(r => /^Main lift /i.test(r.main)), withMain.map(r => r.main))
check('...smaller than the name, and not in the name\'s colour', withMain.every(r => r.mainPx <= r.titlePx - 4 && r.mainColor !== r.titleColor), withMain.map(r => [r.mainPx, r.mainColor, r.titleColor]))
check('nothing runs off the side at 390px', closed.overflow <= 0, closed.overflow)
await shoot('program-titles-closed')

// OPEN A DAY: its exercises belong to the workout above them.
const first = training[0]
await clickAt(`document.querySelector('[data-program-day=${JSON.stringify(first.day)}]')`)
await until(() => ev(`!!document.querySelector('[data-program-day-body]')`), v => v === true, 30)
await wait(500)
const opened = await ev(READ)
const o = opened.open
await shoot('program-titles-open')
check('the opened day shows its exercises', !!o && o.names.length >= 3, o?.names.map(n => n.text))
check('...under a label that says so and counts them', !!o && new RegExp(`^Exercises ?${o.names.length}$`, 'i').test(o.heading ?? ''), o?.heading)
check('...each starting to the RIGHT of the workout\'s name (they used to start 13px to its left)', !!o && o.names.every(n => n.left > first.titleLeft), { title: first.titleLeft, names: o?.names.map(n => n.left) })
check('...on a rail that ties them to it', !!o && o.railPx >= 2 && o.left >= first.titleLeft, { rail: o?.railPx, left: o?.left, title: first.titleLeft })
check('...and every exercise name smaller than the workout\'s', !!o && o.names.every(n => n.px < first.titlePx), { title: first.titlePx, names: o?.names.map(n => n.px) })
check('still nothing off the side with a day open', opened.overflow <= 0, opened.overflow)

// A SMALL PHONE: the same holds, and nothing is pushed off the screen by the deeper indent.
await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 2, mobile: true })
await wait(600)
const small = await ev(READ)
await shoot('program-titles-320')
check('at 320px the exercises are still to the right of the name, and nothing runs off the side', !!small.open && small.open.names.every(n => n.left > small.rows.find(r => r.day === first.day).titleLeft) && small.overflow <= 0, { overflow: small.overflow })
check('...and each exercise name still has room to be read (120px or more)', await ev(`[...document.querySelectorAll('[data-program-day-body] .line-clamp-2')].every(n => n.getBoundingClientRect().width >= 120 || n.scrollWidth <= n.clientWidth + 1)`) === true, await ev(`[...document.querySelectorAll('[data-program-day-body] .line-clamp-2')].map(n => Math.round(n.getBoundingClientRect().width))`))

await finish('On the week list a workout\'s name is the headline, and its exercises hang beneath it.')
