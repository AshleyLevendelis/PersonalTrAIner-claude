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
import { ROUND_PRESETS, describeRoundPreset, totalRoundSeconds, computeRoundState, leadInMsOf, roundStyleOf, intervalNoun, roundHeadline, roundDoneLabel, roundSubline } from '../src/lib/timer-engine'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

console.log('\n1. Every preset is a real, runnable round')
for (const p of ROUND_PRESETS) {
  const { rounds, workSeconds, restSeconds } = p.config
  // REST IS THE ONE THAT SPLITS BY STYLE. An EMOM's rest is zero and must be
  // — that zero is the protocol. An interval preset's zero would be a two-
  // phase timer flashing a REST screen that lasts no time, so it keeps its
  // floor of 1. Written as one check with two floors rather than skipping
  // EMOM, because a skipped preset is an unchecked preset.
  const restFloor = roundStyleOf(p.config) === 'emom' ? 0 : 1
  check(`${p.key}: positive, whole numbers (rest floor ${restFloor})`,
    Number.isInteger(rounds) && rounds > 0 && Number.isInteger(workSeconds) && workSeconds > 0
    && Number.isInteger(restSeconds) && restSeconds >= restFloor
    && (restFloor === 0 ? restSeconds === 0 : true), p.config)
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
  // An EMOM's sub-line carries TWO numbers, not three, and that is the point:
  // a third would be a rest interval the protocol does not have.
  const expected = roundStyleOf(p.config) === 'emom'
    ? [p.config.rounds, p.config.workSeconds]
    : [p.config.rounds, p.config.workSeconds, p.config.restSeconds]
  check(`${p.key}: "${describeRoundPreset(p)}" states its own config`,
    nums.length === expected.length && expected.every((n, i) => nums[i] === n),
    { nums, expected, config: p.config })
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
  // ALL-CAPS ACRONYMS COUNT. "EMOM" is the whole reason this file exists and
  // the first version of this regex could not see it — [A-Z][a-z]+ needs a
  // lowercase letter, so the one claim that started all of this would have
  // slipped straight through the check written to catch it.
  const claims = (sub.match(/[A-Z][a-z]+|[A-Z]{3,}|\d+\/\d+/g) ?? []).map(w => w.toLowerCase())
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

// ---------------------------------------------------------------------------
// EMOM — EVERY MINUTE ON THE MINUTE, built 12 Sep 2026 on Ashley's "finish the
// emom clock".
//
// I HAD SAID IT NEEDED A NEW ENGINE. It did not, and this section exists partly
// to keep that honest: with restSeconds 0 the cycle IS the interval, the phase
// never leaves 'work', and 10 x 60/0 completes at exactly 600s — which the
// engine did before a line of this was written. I reasoned about the protocol
// ("you rest whatever is left of the minute") instead of running
// computeRoundState, and concluded from that reasoning that a variable rest
// phase was required. The timer never tracks that rest; the athlete does.
// What actually blocked EMOM was the setup form's Math.max(1, ...) on rest,
// and nothing calling an interval a minute.
//
// So the checks below are about the two things that were really missing —
// zero rest surviving to the config, and the WORDS — plus the arithmetic, so
// the claim "the engine already did this" is proven rather than repeated.
// ---------------------------------------------------------------------------
console.log('\n6. EMOM is a real clock, not a relabelled round')
{
  const emom = ROUND_PRESETS.find(p => p.key === 'emom')
  const e2 = ROUND_PRESETS.find(p => p.key === 'e2mom')
  check('the EMOM preset exists', !!emom)
  check('...as ten sixty-second intervals with NO rest',
    emom?.config.rounds === 10 && emom?.config.workSeconds === 60 && emom?.config.restSeconds === 0, emom?.config)
  check('...and is marked as an EMOM rather than inferred from the zero',
    emom ? roundStyleOf(emom.config) === 'emom' : false, emom?.config.style)

  // THE ARITHMETIC, DRIVEN. Ten minutes is ten minutes: a new interval at
  // every boundary, no rest phase anywhere, complete on the tick.
  if (emom) {
    const start = '2026-09-12T09:00:00.000Z'
    const t0 = new Date(start).getTime()
    const at = (s: number) => computeRoundState(emom.config, start, t0 + s * 1000)
    check('minute 1 is running at one second', at(1).currentRound === 1 && !at(1).isComplete, at(1))
    check('minute 2 begins exactly at sixty seconds',
      at(60).currentRound === 2 && at(60).phaseRemainingMs === 60000, at(60))
    check('minute 10 is still running at 599s', at(599).currentRound === 10 && !at(599).isComplete, at(599))
    check('and it is done at 600s, not 601', at(600).isComplete === true && at(599).isComplete === false, at(600))
    check('no interval is ever a REST phase',
      [0, 1, 30, 59, 60, 121, 300, 599].every(s => at(s).currentPhase !== 'rest'),
      [0, 1, 30, 59, 60, 121, 300, 599].map(s => at(s).currentPhase))
    check('ten minutes of EMOM is ten minutes', totalRoundSeconds(emom.config) === 600,
      totalRoundSeconds(emom.config))
  }

  // THE WORDS, which is the only thing the flag decides.
  if (emom && e2) {
    check('a sixty-second EMOM counts in MINUTES', intervalNoun(emom.config) === 'minute', intervalNoun(emom.config))
    check('...and a two-minute one does NOT call them minutes',
      intervalNoun(e2.config) === 'interval', intervalNoun(e2.config))
    check('an ordinary interval session still says rounds',
      intervalNoun({ rounds: 8, workSeconds: 20, restSeconds: 10 }) === 'round')
    check('the headline uses that noun', roundHeadline(emom.config, 3) === 'Minute 3 of 10',
      roundHeadline(emom.config, 3))
    check('...and so does the finish line', roundDoneLabel(emom.config) === '10 of 10 minutes done',
      roundDoneLabel(emom.config))

    // THE ONE SENTENCE THAT WOULD BE A LIE. The interval version promises
    // "Ns rest next"; an EMOM has no rest to promise.
    const mid = roundSubline(emom.config, 'work', 3)
    check('a mid-EMOM never promises a rest', !/rest/i.test(mid), mid)
    check('...it says the next one starts instead', /next one starts/.test(mid), mid)
    check('an interval session DOES still promise its rest',
      /10s rest next/.test(roundSubline({ rounds: 8, workSeconds: 20, restSeconds: 10 }, 'work', 3)),
      roundSubline({ rounds: 8, workSeconds: 20, restSeconds: 10 }, 'work', 3))
    check('the last one never promises anything after it',
      !/rest next|next one starts/.test(roundSubline(emom.config, 'work', 10)), roundSubline(emom.config, 'work', 10))

    // AND THE SUB-LINE ON THE BUTTON. "10 × 60s / 0s" would put a rest
    // interval on the tile that the protocol does not have.
    check('the preset button shows an interval, not a zero rest',
      describeRoundPreset(emom) === '10 × every 60s', describeRoundPreset(emom))
    check('...while an interval preset still shows work / rest',
      /\d+s \/ \d+s/.test(describeRoundPreset(ROUND_PRESETS.find(p => p.key === 'tabata')!)))
  }
}

console.log('\n7. Zero rest survives the setup form, which is what blocked it')
{
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const panel = strip(readFileSync('src/components/timers/TimersPanel.tsx', 'utf8'))
  // THE ACTUAL BLOCKER, pinned. `Math.max(1, ...)` on rest made an EMOM
  // untypeable no matter what the engine could do.
  check('an EMOM start sends rest 0 rather than clamping it up to 1',
    /restSeconds: isEmom \? 0 : Math\.max\(1,/.test(panel), null)
  check('...and marks the style, so the words follow', /style: 'emom' as const/.test(panel), null)
  check('the rest box is not shown for an EMOM at all', /\{!isEmom && \(/.test(panel), null)
  check('...and the presets are what set the style', /setStyle\(roundStyleOf\(p\.config\)\)/.test(panel), null)

  const dock = strip(readFileSync('src/components/BottomDock.tsx', 'utf8'))
  check('the dock chip uses the same noun as the full-screen field',
    /roundHeadline\(timers\.roundConfig, timers\.currentRound\)/.test(dock), null)
  check("...and drops Work/Rest for an EMOM, which has no phase to name",
    /roundStyleOf\(timers\.roundConfig\) === 'emom' \? ''/.test(dock), null)

  const fieldSrc = strip(readFileSync('src/components/timers/RoundField.tsx', 'utf8'))
  check('the field takes its wording from the engine rather than a second copy',
    /const subline = roundSubline/.test(fieldSrc) && /roundHeadline\(config, timers\.currentRound\)/.test(fieldSrc), null)
}

// The tile may now say EMOM, because there is one. Same check as §4, read the
// other way: this is what "pinned on the engine, not on a hardcoded no" buys.
console.log('\n8. And the tile may finally say it')
{
  const hasEmom = ROUND_PRESETS.some(p => /emom/i.test(p.key))
  check('there is an EMOM behind the word now', hasEmom)
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nEvery timer the app names is a timer the app has.\n')
