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
import { GLYPH, STATE_LABEL } from '../src/lib/week-glyphs'
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
  renderToStaticMarkup(React.createElement(HomeWeekStrip, { days, todayName: 'Tuesday' }))
const DOT = 'size-[6px]'

// ---------------------------------------------------------------------------
console.log('\n[1] Today\'s cell, state by state')
// ---------------------------------------------------------------------------
{
  const cell = cellFor(render(week('due')), 'Tuesday', 'due')
  check('a day that is due today is the dot — the one state the dot means', cell.includes(DOT) && !cell.includes(GLYPH.due), cell)
}
for (const state of ['swapped', 'moved', 'done', 'partial', 'rest_chosen', 'missed'] as DayGlyphState[]) {
  const cell = cellFor(render(week(state)), 'Tuesday', state)
  check(`today ${state} writes ${GLYPH[state]}, not the dot`, cell.includes(GLYPH[state]) && !cell.includes(DOT), cell)
}
{
  // Today still LOOKS like today: the ring and the wash survive whatever the
  // glyph says, or the eye loses which cell is now.
  const cell = cellFor(render(week('swapped')), 'Tuesday', 'swapped')
  check('...and the cell still carries today\'s ring', /border:1px solid rgba\(var\(--glow-rgb\), ?\.45\)/.test(cell), cell)
}

// ---------------------------------------------------------------------------
console.log('\n[2] Every other day is exactly as before')
// ---------------------------------------------------------------------------
{
  const html = render(week('due', { Thursday: 'due', Monday: 'done', Saturday: 'swapped' }))
  check('a due day that is not today is the glyph, not the dot', cellFor(html, 'Thursday', 'due').includes(GLYPH.due) && !cellFor(html, 'Thursday', 'due').includes(DOT))
  check('a finished day shows ✓', cellFor(html, 'Monday', 'done').includes(GLYPH.done))
  check('a swapped day shows ⇄', cellFor(html, 'Saturday', 'swapped').includes(GLYPH.swapped))
  check('no day is drawn twice', (html.match(/role="img"/g) ?? []).length === 7)
}

// ---------------------------------------------------------------------------
console.log('\n[3] The two strips use the one rule for today')
// ---------------------------------------------------------------------------
// The shared vocabulary file exists so the marks cannot drift; today's cell
// is the rule that DID drift. Both strips must carry it verbatim.
for (const rel of ['src/components/HomeWeekStrip.tsx', 'src/components/exercise/WeekContextRow.tsx']) {
  const code = strip(readFileSync(rel, 'utf8'))
  check(`${rel} draws the dot only for a day that is today AND due`, /isToday && d\.state === 'due' \?/.test(code))
  check(`...and never the bare today test the old Home strip had`, !/\{isToday \? \(/.test(code))
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
