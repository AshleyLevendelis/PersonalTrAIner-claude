// ---------------------------------------------------------------------------
// A TILE MUST NOT NAME A TIMER THE APP DOES NOT HAVE.
//
// Ashley, 12 Sep 2026, from the live app: "under rest timers the app shows
// emom and tabata but these timers dont exist". They did not. The Tools tile
// read "Rounds & intervals — EMOM, Tabata, laps" and behind it were three
// number inputs: no presets, no EMOM, and laps on a different tab entirely.
//
// WHY NOTHING CAUGHT IT. test:says-what-it-contains reads PROSE GENERATED FROM
// A PLAN — week notes, the coach's summary, the first-run intro — against a
// plan that contains no lifting. Every word on that tile is a hardcoded string
// in a component, generated from nothing, so it was outside that gate by
// construction. It is the third subtitle in ToolsTab.tsx to have promised
// something absent; the other two were caught by reading, which is not a
// method.
//
// So this gate reads the SUBTITLE and the PRESET TABLE together, and fails
// when they disagree in either direction. It is deliberately not a list of
// banned words: a blocklist only ever catches the mistake you already made.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { ROUND_PRESETS, describeRoundPreset, totalRoundSeconds, computeRoundState, leadInMsOf } from '../src/lib/timer-engine'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

console.log('\n1. Every preset is a real, runnable round')
for (const p of ROUND_PRESETS) {
  const { rounds, workSeconds, restSeconds } = p.config
  check(`${p.key}: positive, whole numbers`,
    Number.isInteger(rounds) && rounds > 0 && Number.isInteger(workSeconds) && workSeconds > 0
    && Number.isInteger(restSeconds) && restSeconds > 0, p.config)
  // DRIVEN THROUGH THE ENGINE, not just inspected. A preset that the engine
  // cannot advance through is not a preset, and the arithmetic is the only
  // thing that proves the label's numbers describe the timer that runs.
  const start = '2026-09-12T09:00:00.000Z'
  const t0 = new Date(start).getTime()
  const first = computeRoundState(p.config, start, t0 + 1000)
  check(`${p.key}: round 1 is under way one second in`,
    first.currentRound === 1 && !first.isComplete, first)
  const atEnd = computeRoundState(p.config, start, t0 + totalRoundSeconds(p.config) * 1000 + 1000)
  check(`${p.key}: it finishes after its own stated length`, atEnd.isComplete === true, atEnd)
}

console.log('\n2. The numbers under each name are the numbers it runs')
for (const p of ROUND_PRESETS) {
  // The property, not the format: whatever the sub-line says, the three
  // numbers in it must be the three numbers in the config, in that order.
  const nums = (describeRoundPreset(p).match(/\d+/g) ?? []).map(Number)
  check(`${p.key}: "${describeRoundPreset(p)}" states its own config`,
    nums.length === 3 && nums[0] === p.config.rounds && nums[1] === p.config.workSeconds && nums[2] === p.config.restSeconds,
    { nums, config: p.config })
}

console.log('\n3. Tabata is Tabata')
{
  // The one preset named after a protocol with a fixed, published definition.
  // A "Tabata" button that is not 8 x 20/10 is a wrong claim of exactly the
  // kind this file exists for.
  const tabata = ROUND_PRESETS.find(p => p.key === 'tabata')
  check('it exists', !!tabata)
  check('...and is 8 rounds of 20s work / 10s rest',
    tabata?.config.rounds === 8 && tabata?.config.workSeconds === 20 && tabata?.config.restSeconds === 10, tabata?.config)
  // NOT 240 SECONDS, AND THAT IS NOT A BUG. Tabata is published as four
  // minutes because the definition counts eight rests; this engine never runs
  // a trailing rest (totalRoundSeconds is rounds*work + (rounds-1)*rest, so a
  // boxing session does not end with a minute of sitting down). So the block
  // ends when the eighth work interval does: 8x20 + 7x10 = 230, plus the
  // get-ready countdown. Pinned on the engine's rule rather than on 230, so
  // changing the lead-in does not fail this and changing the RULE does.
  // The first version of this check asserted 240 and failed — the check was
  // wrong, not the timer, and the app displays no duration for a preset at all.
  const noTrailingRest = tabata
    ? totalRoundSeconds(tabata.config) - leadInMsOf(tabata.config) / 1000
      === tabata.config.rounds * tabata.config.workSeconds + (tabata.config.rounds - 1) * tabata.config.restSeconds
    : false
  check('...and ends when the last work interval does, with no rest hanging off the end', noTrailingRest,
    tabata ? totalRoundSeconds(tabata.config) : null)
}

console.log('\n4. The Tools tile and the presets agree, both ways')
{
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const tools = strip(readFileSync('src/components/ToolsTab.tsx', 'utf8'))
  const sub = /label: 'Rounds & intervals', sub: '([^']*)'/.exec(tools)?.[1] ?? ''
  check('the tile still has a subtitle to check', sub.length > 0, sub)

  // EMOM IS THE NAMED ABSENCE. Ashley's decision, 12 Sep 2026: presets yes,
  // EMOM no, because its rest is the remainder of the minute and this engine
  // has only a fixed work/rest pair. So the word must not reappear on the
  // tile until something implements it — pinned on the ENGINE, not on a
  // hardcoded "no": add a real emom preset and this check stops objecting.
  const hasEmomBehind = ROUND_PRESETS.some(p => /emom/i.test(p.key) || /emom/i.test(p.label))
  check('the tile does not say EMOM while nothing implements it',
    hasEmomBehind || !/emom/i.test(sub), sub)

  // Every protocol NAME on the tile must be a preset that exists. Words that
  // are plain English ("your own", "and") are not claims; a capitalised or
  // slashed protocol name is. Matched against the preset labels rather than a
  // fixed list, so adding a preset widens what the tile may say by itself.
  const labels = ROUND_PRESETS.map(p => p.label.toLowerCase())
  const claims = (sub.match(/[A-Z][a-z]+|\d+\/\d+/g) ?? []).map(w => w.toLowerCase())
  const unbacked = claims.filter(c => !labels.some(l => l.includes(c)))
  check('every protocol the tile names is a preset that exists', unbacked.length === 0, { sub, unbacked, labels })

  // AND THE OTHER DIRECTION. Laps are REAL — their own tab in the same sheet,
  // one across from Round — so this is not the EMOM case. It is a tile named
  // "Rounds & intervals" advertising the tab next door, which sends someone
  // looking for laps to a screen of work/rest inputs. Kept as a check because
  // a tile should describe what it opens, not its neighbour.
  check('the rounds tile describes itself, not the lap tab beside it',
    !/lap/i.test(sub), sub)
}

console.log('\n5. The panel actually renders them')
{
  const panel = readFileSync('src/components/timers/TimersPanel.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('the round panel maps the preset table rather than hardcoding buttons',
    /ROUND_PRESETS\.map/.test(panel), null)
  check('...each showing its own numbers', /describeRoundPreset\(p\)/.test(panel), null)
  // FILLS, DOES NOT START. A preset that started the timer on tap would run
  // four minutes of work from a single mis-tap, with the numbers never shown.
  check('...and tapping one fills the fields instead of starting the timer',
    /onClick=\{\(\) => applyPreset\(p\)\}/.test(panel) && !/onClick=\{\(\) => timers\.startRound/.test(panel), null)
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nEvery timer the app names is a timer the app has.\n')
