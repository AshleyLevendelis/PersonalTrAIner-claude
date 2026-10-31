// ---------------------------------------------------------------------------
// test:home-2c — Home as the tab polish handoff draws it (design 2c, 31 Oct 2026), under her ruling
// "build, keep my rulings" (docs/plans/tab-polish-oct31.md).
//
// RENDERED where it can be (React's own static render of the real components), read off the source only for
// wiring that has no markup (which control opens what):
//   1. "Session N of M": today's place among the week's counted training days; a rest day is never "session N"
//   2. the week inside the card: seven cells, today outlined whatever happened today, a dot or a dash by state,
//      the letters under them, the boundary mark kept
//   3. the session card, state by state: the eyebrow and right-hand status, the name's last word in mint, the
//      set bar only once started, the count said once, the Start button inside the card above the week
//   4. the coach line: boxless, on both paths (an adaptation alone; the tips rotating), with its two chips
//   5. the ring row: four rings (no sleep), each its own button; steps opens the entry, the rest Nutrition;
//      a ring with no target is an empty track, never a verdict
//   6. one card for the latest PR and tomorrow, the rest of progress one tap away under it; tomorrow said once
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TrainingWeekDay, DayGlyphState } from '../src/hooks/useTrainingWeek'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
// 2026-09-07 is a Monday.
const week = (states: DayGlyphState[], planWeeks?: number[]): TrainingWeekDay[] => DAYS.map((dayName, i) => ({
  date: `2026-09-${String(7 + i).padStart(2, '0')}`, dayName, state: states[i],
  swappedForActivity: null, movedTo: null, movedFrom: null, session: null, workingLogs: [],
  ...(planWeeks ? { planWeek: planWeeks[i] } : {}),
}) as unknown as TrainingWeekDay)

async function main() {
  const { HomeWeekStrip, sessionOrdinal } = await import('../src/components/HomeWeekStrip')
  const { SessionHero, RingCell, HomeCoachNote } = await import('../src/components/Dashboard')

  console.log('\n1. "Session N of M"')
  const w = week(['done', 'rest', 'due', 'rest', 'due', 'moved', 'swapped'])
  check('today (Wednesday) is session 2 of 3: done Monday, due Wednesday and Friday; a moved or swapped day is not counted', JSON.stringify(sessionOrdinal(w, '2026-09-09')) === JSON.stringify({ n: 2, of: 3 }), sessionOrdinal(w, '2026-09-09'))
  check('a missed day still counts (it was a session of the plan): Wednesday after a missed Monday is 2 of 3', sessionOrdinal(week(['missed', 'rest', 'due', 'rest', 'due', 'rest', 'rest']), '2026-09-09')?.n === 2)
  check('a rest day is never "session N"', sessionOrdinal(w, '2026-09-08') === null)
  check('...nor a day whose session moved away', sessionOrdinal(w, '2026-09-12') === null)

  console.log('\n2. The week inside the card')
  const render = (days: TrainingWeekDay[], todayName = 'Wednesday') =>
    renderToStaticMarkup(React.createElement(HomeWeekStrip, { days, todayName, done: 1, planned: 3 }))
  const cell = (html: string, dayName: string) => {
    const at = html.indexOf(`aria-label="${dayName}:`)
    return at < 0 ? '' : html.slice(html.lastIndexOf('<span', at), html.indexOf('</span></span>', at))
  }
  const html = render(w)
  check('seven cells, each spoken by its state', (html.match(/role="img"/g) ?? []).length === 7 && html.includes('aria-label="Monday: done"'))
  check('today is outlined (marked) while still due, and holds the small dot', /data-today=""/.test(cell(html, 'Wednesday')) && /data-look="today"/.test(cell(html, 'Wednesday')) && /border-color:rgba\(var\(--glow-rgb\), \.45\)/.test(cell(html, 'Wednesday')), cell(html, 'Wednesday'))
  const doneToday = render(week(['done', 'rest', 'done', 'rest', 'due', 'rest', 'rest']))
  check('...and still outlined once done, while its content says done (not today\'s due dot)', /data-today=""/.test(cell(doneToday, 'Wednesday')) && /data-look="done"/.test(cell(doneToday, 'Wednesday')) && /●/.test(cell(doneToday, 'Wednesday')), cell(doneToday, 'Wednesday'))
  check('only today is outlined', (html.match(/data-today=""/g) ?? []).length === 1)
  check('a rest day holds a dash', /–/.test(cell(html, 'Tuesday')) && !/●/.test(cell(html, 'Tuesday')), cell(html, 'Tuesday'))
  check('a training day ahead holds a dot', /●/.test(cell(html, 'Friday')) && /data-look="due"/.test(cell(html, 'Friday')), cell(html, 'Friday'))
  const letters = [...html.matchAll(/<span(?: class="([^"]*)")?>([MTWFS])<\/span>/g)]
  check('the letters M T W T F S S sit under the cells, today\'s in mint', letters.map(m => m[2]).join('') === 'MTWTFSS' && /text-primary-text/.test(letters[2]?.[1] ?? '') && !/text-primary-text/.test(letters[0]?.[1] ?? ''), letters.map(m => m[0]))
  const boundary = render(week(['done', 'rest', 'due', 'due', 'rest', 'rest', 'rest'], [1, 1, 1, 2, 2, 2, 2]))
  check('where the training week changes, the boundary mark sits on the first day of the new one', /data-week-boundary="start"/.test(cell(boundary, 'Thursday')) && (boundary.match(/home-week-boundary-mark/g) ?? []).length === 1)

  console.log('\n3. The session card')
  const data = (status: string, extra: Record<string, unknown> = {}) => ({
    today: '2026-09-09', dayName: 'Wednesday',
    session: { status, focus: 'Full Body Power', sessionLength: '~45 min', minutesLeft: 25, exerciseCount: 4, movedTo: status === 'moved' ? { date: '2026-09-10', dayName: 'Thursday' } : null, ...extra },
  })
  const tally = { days: w, sessionsDone: 1, sessionsPlanned: 3 }
  const hero = (status: string, props: Record<string, unknown> = {}) => renderToStaticMarkup(React.createElement(SessionHero as React.FC<Record<string, unknown>>, {
    status: status === 'done' ? 'done' : status, data: data(status), week: tally, sessionGlance: '4 exercises · Deadlift from 72.5 kg',
    done: status === 'done', minutes: 46, setsLogged: status === 'not_started' ? 0 : status === 'done' ? 12 : 7, setsPlanned: 12, prCount: 0, topPr: null,
    cta: status === 'not_started' || status === 'in_progress' ? React.createElement('div', { 'data-home-cta': '' }, 'START') : false,
    ...props,
  }))
  const fresh = hero('not_started')
  check('not started: "Today · Session 2 of 3", the length on the right', /Today · Session 2 of 3/.test(text(fresh)) && /data-testid="home-session-length">~45 min</.test(fresh), text(fresh).slice(0, 120))
  check('...the name with its last word in mint', /data-home-title[^>]*>Full Body <span class="text-primary-text"[^>]*>Power<\/span>/.test(fresh), fresh.match(/data-home-title[^>]*>.*?<\/span><\/span>/)?.[0])
  check('...no set bar before the first set', !/data-home-set-progress/.test(fresh))
  check('...the Start button inside the card, under the name and above the week', fresh.indexOf('data-home-title') < fresh.indexOf('data-home-cta') && fresh.indexOf('data-home-cta') < fresh.indexOf('data-home-week') && fresh.indexOf('data-home-title') > 0)
  check('...and the card is the hero (the tour\'s anchor and the state it is in)', /data-tour="hero" data-home-hero="not_started"/.test(fresh))
  const going = hero('in_progress')
  check('in progress: the bar is drawn to the sets done (7 of 12 is 58%)', /data-home-set-progress[\s\S]*?width:58%/.test(going), going.match(/data-home-set-progress.{0,300}/)?.[0])
  check('..."7 of 12 sets" under it, and the minutes left on the right', /data-home-sets-label[^>]*>7 of 12 sets</.test(going) && /~25 min left/.test(text(going)))
  const finished = hero('done', { prCount: 1, topPr: 'Deadlift 75kg', onSummary: () => {} })
  check('done: "Done ✓" on the right, the bar full, no Start button', /Done ✓/.test(text(finished)) && /width:100%/.test(finished) && !/data-home-cta/.test(finished))
  check('...the count said once (the stats line, not the bar label too)', !/data-home-sets-label/.test(finished) && /12\/12 sets/.test(text(finished)), text(finished))
  check('...the glance (what she lifted) and the PR line kept, and the Summary door', /4 exercises · Deadlift from 72\.5 kg/.test(text(finished)) && /data-home-pr=""/.test(finished) && /data-home-summary/.test(finished))
  check('...and no Summary door when this phone has no finish card', !/data-home-summary/.test(hero('done')))
  const rest = renderToStaticMarkup(React.createElement(SessionHero as React.FC<Record<string, unknown>>, {
    status: 'rest', data: { ...data('rest'), today: '2026-09-08', dayName: 'Tuesday' }, week: tally, sessionGlance: '', done: false, minutes: null, setsLogged: 0, setsPlanned: 0, prCount: 0, topPr: null, cta: false,
  }))
  check('rest: "Rest day", the eyebrow says only "Today", the week\'s count on the right, no bar', /Rest <span[^>]*>day<\/span>/.test(rest) && /data-home-eyebrow="[^"]*">Today</.test(rest) && /1 of 3 sessions done/.test(text(rest)) && !/data-home-set-progress/.test(rest), text(rest).slice(0, 160))
  const moved = hero('moved', { cta: false })
  check('moved: "Moved to Thursday", the session named as waiting', /Moved to <span[^>]*>Thursday</.test(moved) && /Full Body Power is waiting for you on Thursday/.test(text(moved)))
  const unknown = hero('unknown', { cta: false })
  check('unknown: "Checking your plan…", no mint word, no Start button', /Checking your plan…/.test(text(unknown)) && !/text-primary-text"[^>]*>plan…/.test(unknown) && !/data-home-cta/.test(unknown))
  const home = strip(readFileSync('src/components/Dashboard.tsx', 'utf8'))
  check('the Start button is only handed in while it can start or continue (her showCta rule)', /cta=\{showCta && \(/.test(home) && /const showCta = status === 'not_started' \|\| status === 'in_progress'/.test(home))

  console.log('\n4. The coach line')
  const tips = [{ key: 'a', text: 'Your bench moved from 60 to 62.5 kg.', tag: 'Training', prefill: 'p' }, { key: 'b', text: 'Second tip.', tag: 'Today', prefill: 'q' }]
  const note = renderToStaticMarkup(React.createElement(HomeCoachNote, { tips }))
  check('the tips draw as the boxless coach line', /data-nudge-line/.test(note) && !/data-nudge-slim/.test(note))
  check('...with the two chips the design draws', /data-nudge-prompt[^>]*>What changed\?</.test(note) && /data-nudge-prompt[^>]*>Adjust today</.test(note), note.match(/data-nudge-prompt[^>]*>[^<]*/g))
  check('...and still a rotation she can step through ("Tip 1 of 2")', /Tip 1 of 2/.test(note))
  check('an adaptation is the same coach line, shown alone (never one tip among the rotation)', /\{trainerNudge\s*\? <TrainerNudge \{\.\.\.trainerNudge\} line\b[^>]*\/>\s*: plainTips\.length > 0 && <HomeCoachNote tips=\{plainTips\} \/>\}/.test(home))
  check('Home keeps its rotation rules: held while touched or focused, never under reduced motion', /onPointerDown=\{\(\) => setHeld\(true\)\}/.test(home) && /if \(count < 2 \|\| reduced \|\| held\) return/.test(home))

  console.log('\n5. The ring row')
  const ring = (share: number | null) => renderToStaticMarkup(React.createElement(RingCell, { k: 'water', share, color: 'blue', icon: React.createElement('i'), value: '0.8 L', label: 'water', onClick: () => {}, ariaLabel: 'Water' }))
  const quarter = ring(0.25)
  const dash = quarter.match(/stroke-dasharray="([\d.]+) ([\d.]+)"/)
  check('a ring is drawn to its share (a quarter of the way round)', !!dash && Math.abs(Number(dash[1]) / Number(dash[2]) - 0.25) < 0.001, dash?.[0])
  check('...a ring with no target is an empty track, marked so', /data-share="none"/.test(ring(null)) && /opacity="0"/.test(ring(null)))
  check('...and the ring, its value and its label are one button (44px tall at least)', /^<button type="button"[^>]*min-h-\[44px\][^>]*data-key-row="water"/.test(quarter) && /0\.8 L[\s\S]*water<\/span><\/span><\/button>$/.test(quarter))
  const cells = [...home.matchAll(/<RingCell k="(\w+)"[\s\S]*?\/>\n/g)].map(m => ({ k: m[1], src: m[0] }))
  check('four rings in one row: calories, protein, water, steps (no sleep: the app records none)', cells.map(c => c.k).join(',') === 'calories,protein,water,steps' && !/sleep/i.test(home) && /grid grid-cols-4[^"]*" data-home-today data-home-rings/.test(home), cells.map(c => c.k))
  check('steps opens the steps entry here; the other three open Nutrition (where water is logged)', /onClick=\{\(\) => setStepsOpen\(o => !o\)\}/.test(cells.find(c => c.k === 'steps')?.src ?? '') && cells.filter(c => c.k !== 'steps').every(c => /onClick=\{toNutrition\}/.test(c.src)))
  check('"N% of targets" is the mean of the four rings', /todaySoFarPercent\(\[calShare, proteinShare, waterShare, stepsShare\]\)/.test(home) && /data-testid="home-so-far">\{soFar == null \? '—' : `\$\{soFar\}%`\}/.test(home))

  console.log('\n6. One card: the latest PR and tomorrow, the rest one tap away')
  const cardAt = home.indexOf('data-home-highlights>')
  const card = cardAt < 0 ? '' : home.slice(cardAt, home.indexOf('</section>', cardAt))
  check('the latest PR and tomorrow are the two halves of one card', /data-home-latest-pr/.test(card) && /data-home-tomorrow/.test(card) && card.indexOf('data-home-latest-pr') < card.indexOf('data-home-tomorrow'))
  check('...the PR\'s figure through the phrasebook (a reps best is reps, never "0 kg")', /personalBest\(bestReadingOf\(latestPr\.metric, latestPr\.value, latestPr\.setReps\)\)/.test(card))
  check('...tomorrow its session and length, or a rest day, or a dash while the plan is unknown', /\{tomorrow \? \(tomorrow\.rest \? 'Rest day' : tomorrow\.focus\) : '—'\}/.test(card) && /`Tomorrow · ~\$\{tomorrow\.minutes\} min`/.test(home))
  const openAt = card.indexOf('{progressOpen && (')
  check('...and under them, one tap away: recent PRs, the weight with its weigh-in, the volume', openAt > card.indexOf('data-home-progress-toggle') && card.indexOf('data-home-progress-toggle') > 0
    && ['data-home-recent-prs', 'data-home-weight', '<WeighInCard ', 'data-home-volume'].every(s => card.indexOf(s) > openAt))
  check('tomorrow is said once (not in the glance line as well)', !/glanceParts\.push\([^)]*tomorrow/.test(home) && (home.match(/data-home-tomorrow/g) ?? []).length === 1)
  const dataSrc = strip(readFileSync('src/lib/dashboard-data.ts', 'utf8'))
  check('tomorrow\'s length is the estimator today\'s uses, and an unreadable day gives none rather than failing Home', /minutes: \(\(\) => \{ try \{ return dayLengthParts\(tomorrowWorkoutDay\)\.workMinutes \} catch \{ return null \} \}\)\(\)/.test(dataSrc))
  check('the next meal and the shopping card are still on Home, after the card', home.indexOf('data-home-next-meal') > cardAt && home.indexOf('<ShopDayCard') > cardAt && cardAt > 0)

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('Home draws design 2c and keeps every control and ruling.')
}
main().catch(e => { console.error(e); console.log(`\n${ran} checks ran`); process.exit(1) })
