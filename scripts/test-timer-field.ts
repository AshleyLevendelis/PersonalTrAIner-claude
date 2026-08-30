// ---------------------------------------------------------------------------
// Gate: the round timer's phase is legible, and the finished state exists.
//
// Design handoff "Timer colour states", treatment 2a. The running timer used
// to signal its phase with a text colour and nothing else — a phone-in-hand
// signal for something you read from three to five metres away. It now floods
// the Tools tab: mint working, amber resting, red finished.
//
// THE BUG THE DESIGN COULD NOT HAVE KNOWN ABOUT, and the reason this file
// checks the hook and not only the pixels. The handoff's state-management
// section says isRoundComplete is available from useTimers and no hook change
// is needed. It was not usable: the cue effect persists `running: false` the
// instant a round completes, and the derived round state was gated on
// `running`, so on the very next render isRoundComplete fell back to false
// and stayed there. The finished state lasted one render. TimersPanel's own
// "All rounds complete" line had never been reachable for the same reason —
// the same dead-branch shape the audit found behind the Confirm button.
//
// So section 1 pins the derivation: completion is a fact about elapsed time,
// not about whether a clock is still ticking.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { computeRoundState, totalRoundSeconds } from '../src/lib/timer-engine'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const EPOCH = new Date(0).toISOString()
const cfg = { rounds: 3, workSeconds: 10, restSeconds: 5 }
const at = (seconds: number) => computeRoundState(cfg, EPOCH, seconds * 1000)

console.log('\n1. Every phase is reachable, and completion holds')
{
  check('it starts in work', at(0).currentPhase === 'work' && !at(0).isComplete, at(0))
  check('it reaches rest', at(12).currentPhase === 'rest', at(12))
  check('it reaches round 2', at(16).currentRound === 2, at(16))

  // rounds*work + (rounds-1)*rest = 30 + 10 = 40s. Never rounds*(work+rest).
  const total = totalRoundSeconds(cfg)
  check(`the run is ${total}s — the last round has no rest after it`, total === 40, total)
  check('it completes at the total', at(total).isComplete, at(total))
  // THE ONE THAT MATTERS. Derived from elapsed, so it does not evaporate.
  check('...and STAYS complete well past it', at(total + 60).isComplete, at(total + 60))
  check('...still naming the final round', at(total + 60).currentRound === cfg.rounds, at(total + 60))
}

console.log('\n2. The hook derives that state whether or not the clock runs')
{
  const hook = stripComments(readFileSync(join(ROOT, 'src/hooks/useTimers.tsx'), 'utf8'))
  const derivation = hook.slice(hook.indexOf('const roundState = useMemo'), hook.indexOf('const isActive'))
  check('the round derivation exists to check', derivation.length > 100)
  // THE EXACT REGRESSION: the memo's opening guard used to include
  // `!record.running`, so completion died one render after it fired. Checked
  // against that FIRST guard line only — an earlier version of this check
  // matched anywhere in the memo and so tripped on the unrelated
  // "nothing has elapsed yet" guard further down, failing on correct code.
  const openingGuard = derivation.slice(0, derivation.indexOf('return null') + 'return null'.length)
  check('the opening guard does not require the clock to be running',
    !/record\.running/.test(openingGuard), openingGuard)
  check('...and reads banked time when it is not', /record\.accumulatedMs/.test(derivation))
  check('completion banks the elapsed total, so the finished state survives',
    /isComplete\)[\s\S]{0,400}accumulatedMs: totalRoundSeconds/.test(hook))
}

console.log('\n3. Pause moves the anchor — it does not erase the round')
{
  const hook = stripComments(readFileSync(join(ROOT, 'src/hooks/useTimers.tsx'), 'utf8'))
  check('there is a round-specific pause', /const pauseRound = useCallback/.test(hook))
  check('...and resume', /const resumeRound = useCallback/.test(hook))
  // stop() clears startedAtIso, which for round mode is the single source of
  // truth for round and phase — using it here would erase the round, not
  // pause it. The field must not call it.
  const field = stripComments(readFileSync(join(ROOT, 'src/components/timers/RoundField.tsx'), 'utf8'))
  check('the field pauses with pauseRound, never with stop()',
    /timers\.pauseRound\(\)/.test(field) && !/timers\.stop\(\)/.test(field))
  check('resume re-anchors to now minus what was banked',
    /getAppNow\(profileId\)\.getTime\(\) - record\.accumulatedMs/.test(hook))
}

console.log('\n4. The field is coloured from tokens, never from hexes')
{
  const field = readFileSync(join(ROOT, 'src/components/timers/RoundField.tsx'), 'utf8')
  const code = stripComments(field)
  check('work is the accent', /work: \{ bg: 'var\(--primary\)'/.test(code))
  check('rest is the warn role', /rest: \{ bg: 'var\(--role-warn\)'/.test(code))
  check('finished is destructive', /done: \{ bg: 'var\(--destructive\)'/.test(code))
  // A hardcoded hex would survive a theme change and stop matching the app.
  check('no colour is hardcoded', !/#[0-9a-fA-F]{6}/.test(code), (code.match(/#[0-9a-fA-F]{6}/g) ?? []).slice(0, 4))

  const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8')
  for (const token of ['--phase-work-ink', '--phase-rest-ink', '--phase-done-ink']) {
    check(`${token} is a real token`, new RegExp(`${token}:`).test(css))
  }
  check('the inks are defined once, outside any theme block — the phase must not follow the theme',
    (css.match(/--phase-work-ink:/g) ?? []).length === 1)
}

console.log('\n5. It says what it is doing, out loud and truthfully')
{
  const field = stripComments(readFileSync(join(ROOT, 'src/components/timers/RoundField.tsx'), 'utf8'))
  // Colour alone is not a signal for everyone.
  check('the state is announced, not only coloured', /role="status"/.test(field) && /aria-live/.test(field))
  check('...naming the round, the phase and the time', /aria-label=\{`\$\{roundLabel\}/.test(field))
  check('the decorative ring is hidden from assistive tech', /aria-hidden/.test(field))

  // THE LAST ROUND HAS NO REST AFTER IT. The prototype's copy promised one on
  // every work phase, which is untrue on the final round.
  check('the final round does not promise a rest that never comes',
    /round >= config\.rounds/.test(field) && /Last round/.test(field))
  check('...and earlier rounds name the REAL rest length, not a fixed number',
    /\$\{config\.restSeconds\}s rest next/.test(field))
  check('the clock ceils, so it never reads 0:00 with time left',
    /Math\.ceil\(ms \/ 1000\)/.test(field))
}

console.log('\n6. The dock is never covered, and a live round owns the tab')
{
  const field = stripComments(readFileSync(join(ROOT, 'src/components/timers/RoundField.tsx'), 'utf8'))
  check('the field stops at the tab bar rather than guessing a number',
    /bottom: TAB_BAR_HEIGHT_PX/.test(field))

  const tools = stripComments(readFileSync(join(ROOT, 'src/components/ToolsTab.tsx'), 'utf8'))
  check('a running round replaces the tab content', /if \(roundHoldsScreen\)/.test(tools))
  check('...and so does a finished one, so the red state holds the screen',
    /timers\.running \|\| timers\.isRoundComplete/.test(tools))

  // The old text-colour view would otherwise sit underneath as a second,
  // unreachable copy of the same screen.
  const panel = stripComments(readFileSync(join(ROOT, 'src/components/timers/TimersPanel.tsx'), 'utf8'))
  check('the superseded running view is gone, not left as a duplicate',
    !/All rounds complete/.test(panel) && !/const isRunning = timers\.running/.test(panel))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll timer-field checks passed.')
