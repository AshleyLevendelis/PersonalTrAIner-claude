// ---------------------------------------------------------------------------
// HOME'S WEEK STRIP WRITES WHAT HAPPENED TODAY.
//
// Ashley, 8 Sep 2026, from the live app: "still not moving markers or marking
// a day as muay thai or missed." The Exercise strip HAD been drawing ⇄ and →
// correctly; Home's strip drew a plain dot for today whatever its state, so on
// the one screen she opens first, the day she had just swapped or moved looked
// exactly like a day with nothing done. The two strips share a glyph file
// precisely so they cannot mean different things by the same mark — and then
// disagreed on the only cell that matters on the day.
//
// Rendered through React itself (renderToStaticMarkup), not read off the
// source: the property is what a cell CONTAINS for a given state, and a regex
// over JSX would pass for a ternary that happened to mention the right words.
// ---------------------------------------------------------------------------
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import { HomeWeekStrip } from '../src/components/HomeWeekStrip'
import { STATE_LABEL } from '../src/lib/week-glyphs'
import type { TrainingWeekDay, DayGlyphState } from '../src/hooks/useTrainingWeek'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
// 2026-09-07 is a Monday.
const week = (todayState: DayGlyphState, others: Partial<Record<string, DayGlyphState>> = {}): TrainingWeekDay[] =>
  DAYS.map((dayName, i) => ({
    date: `2026-09-${String(7 + i).padStart(2, '0')}`,
    dayName,
    state: dayName === 'Tuesday' ? todayState : (others[dayName] ?? 'rest'),
    swappedForActivity: null, movedTo: null, movedFrom: null, session: null,
  }) as unknown as TrainingWeekDay)

/** The one cell for a day, by the sentence a screen reader gets for it. */
const cellFor = (html: string, dayName: string, state: DayGlyphState): string => {
  const label = `aria-label="${dayName}: ${STATE_LABEL[state]}"`
  const at = html.indexOf(label)
  if (at < 0) return ''
  const end = html.indexOf('</div>', at)
  return html.slice(at, end)
}
const render = (days: TrainingWeekDay[]) =>
  renderToStaticMarkup(React.createElement(HomeWeekStrip, { days, todayName: 'Tuesday', done: 1, planned: 4 }))
const lookOf = (html: string, dayName: string, state: DayGlyphState): string | null => {
  const label = `aria-label="${dayName}: ${STATE_LABEL[state]}"`
  const at = html.indexOf(label)
  if (at < 0) return null
  return html.slice(at, at + 200).match(/data-look="(\w+)"/)?.[1] ?? null
}

// ---------------------------------------------------------------------------
// RE-ANCHORED 10 Oct 2026 (design handoff 2a): the glyphs became circles with
// the day's letter, and STATE is carried by the circle's look. The 8 Sep
// property is unchanged and is what is checked: today's cell says what
// happened today, and only a day still due today wears today's ring.
console.log('\n[1] Today\'s cell, state by state')
// ---------------------------------------------------------------------------
{
  check('a day that is due today wears today\'s ring — the one state that ring means', lookOf(render(week('due')), 'Tuesday', 'due') === 'today')
}
const EXPECT: Partial<Record<DayGlyphState, string>> = { swapped: 'done', moved: 'away', done: 'done', partial: 'partial', rest_chosen: 'rest', missed: 'missed' }
for (const state of ['swapped', 'moved', 'done', 'partial', 'rest_chosen', 'missed'] as DayGlyphState[]) {
  const look = lookOf(render(week(state)), 'Tuesday', state)
  check(`today ${state} looks ${EXPECT[state]}, not today's ring`, look === EXPECT[state], look)
}
{
  const html = render(week('swapped'))
  check('...and every cell is still SPOKEN by its full state (dayLabel)', html.includes('aria-label="Tuesday: swapped for another activity"'), html.slice(0, 200))
}

// ---------------------------------------------------------------------------
console.log('\n[2] Every other day')
// ---------------------------------------------------------------------------
{
  const html = render(week('due', { Thursday: 'due', Monday: 'done', Saturday: 'swapped', Sunday: 'missed' }))
  check('a due day that is not today is a plain circle, not today\'s ring', lookOf(html, 'Thursday', 'due') === 'due')
  check('a finished day is filled', lookOf(html, 'Monday', 'done') === 'done')
  check('a swapped day counts as done', lookOf(html, 'Saturday', 'swapped') === 'done')
  check('a missed day is the warn ring', lookOf(html, 'Sunday', 'missed') === 'missed')
  check('a rest day is sunken', lookOf(html, 'Wednesday', 'rest') === 'rest')
  check('no day is drawn twice', (html.match(/role="img"/g) ?? []).length === 7)
  check('the week count sits beside them', /data-home-week-count[^>]*>1\/4</.test(html), html.slice(-200))
}

// ---------------------------------------------------------------------------
console.log('\n[3] The two strips use the one rule for today')
// ---------------------------------------------------------------------------
{
  const home = strip(readFileSync('src/components/HomeWeekStrip.tsx', 'utf8'))
  check('Home asks the look function, which gives today\'s ring only to a day still due',
    /weekCircleLook\(d, isToday\)/.test(home) && /case 'due': return isToday \? 'today' : 'due'/.test(home))
  const ex = strip(readFileSync('src/components/exercise/WeekContextRow.tsx', 'utf8'))
  // 2c: Exercise's strip marks the day ON SCREEN (today, or a peek) with the
  // hollow accent dot; every other day gets its state's dot, and a due day's
  // is plain — the accent belongs to the day being looked at, never to "due".
  check('src/components/exercise/WeekContextRow.tsx gives the accent dot only to the day on screen, and a due day a plain one',
    /\{isSelected \? \(\s*<span aria-hidden className="size-\[5px\] rounded-full" style=\{\{ boxShadow: 'inset 0 0 0 1px var\(--primary\)' \}\}/.test(ex)
    && /due: \{ background: 'var\(--text-dim\)' \}/.test(ex))
  check('...and never the bare today test the old Home strip had', !/\{isToday \? \(/.test(ex))
}

// ---------------------------------------------------------------------------
console.log('\n[4] Every reader of the week takes the refresh token')
// ---------------------------------------------------------------------------
// The strip was write-blind on 3 Sep and the Exercise tab and the chat were
// still write-blind on 8 Sep: a move confirmed in the chat did not reach the
// panel until a remount, and the chat's own list of moves went stale for its
// next proposal. The hook's fifth argument is the fix; this pins that every
// call site passes one, so the next reader cannot quietly opt out.
const callers = execSync(`grep -rl "useTrainingWeek(" src --include=*.tsx`, { encoding: 'utf8' }).split('\n').filter(Boolean)
check('there are readers to check', callers.length >= 3, callers)
for (const file of callers) {
  const code = strip(readFileSync(file, 'utf8'))
  for (const m of code.matchAll(/useTrainingWeek\(([^)]*)\)/g)) {
    const args = m[1].split(',').map(a => a.trim()).filter(Boolean)
    check(`${file} passes the refresh token (${args.length} args)`, args.length >= 5, m[0])
  }
}

console.log(failures === 0 ? '\nAll home-week-strip checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
