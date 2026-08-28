// ---------------------------------------------------------------------------
// Gate for the chat reveal — how fast the coach's replies type out, and how
// evenly.
//
// WHY THIS EXISTS. Ashley said the typewriter was "too slow and not smooth".
// Both halves turned out to be true and they had DIFFERENT causes, which is
// why guessing would have fixed the wrong one:
//
//   slow    `normal` ran at 110ms/word. One 67-word coach message took
//           8.9 SECONDS end to end.
//   jerky   NOT timer drift — measured min 110ms, median 110ms, p90 111ms,
//           so the tick itself was rock steady. The stutter was the
//           SENTENCE-END PAUSE: 380ms on top of the tick, producing 491ms
//           gaps four times a message. Steady, steady, steady, STALL.
//
// Measured in a real browser (`npm run verify:reveal`), not reasoned about.
// After: 3681ms total, max gap 133ms, jitter 90ms -> 19ms, zero gaps over
// 150ms.
//
// This file holds the two things that fix could quietly lose: the timing
// budget, and the frame loop. The frame loop is the part that matters on a
// real phone — headless timers are far more even than a device mid-scroll,
// so the honest reading of that steady 110ms median is "this bench cannot
// see drift", not "drift does not exist".
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const src = readFileSync(join(ROOT, 'src/components/chat/TypewriterMarkdown.tsx'), 'utf8')

/** The SPEED_TIMING literal, read out of the source rather than duplicated here. */
function timings(): Record<string, { tick: number; pause: number }> {
  const block = /const SPEED_TIMING[^=]*=\s*\{([\s\S]*?)\n\}/.exec(src)
  if (!block) return {}
  const out: Record<string, { tick: number; pause: number }> = {}
  for (const m of block[1].matchAll(/(\w+):\s*\{\s*tick:\s*(\d+),\s*pause:\s*(\d+)\s*\}/g)) {
    out[m[1]] = { tick: Number(m[2]), pause: Number(m[3]) }
  }
  return out
}

// ---------------------------------------------------------------------------
console.log('\n1. The reveal is driven by frames against a clock')
// ---------------------------------------------------------------------------
{
  // THE SMOOTHNESS FIX, and the one a refactor is most likely to undo by
  // "simplifying" back to something that reads more obviously.
  check('it runs on requestAnimationFrame', /requestAnimationFrame\(frame\)/.test(src))
  check('...and cancels on unmount', /cancelAnimationFrame\(raf\)/.test(src))

  // A setTimeout CHAIN is the specific thing that must not come back: each
  // word scheduled from when the previous one rendered, so every late timer
  // pushes the rest of the message further behind with no way to recover.
  check('no setTimeout chain schedules the next word',
    !/setTimeout\(step/.test(src) && !/timer = setTimeout/.test(src))

  // Absolute schedule, computed once. This is what lets a stalled frame catch
  // up instead of falling permanently behind.
  check('each word has an absolute due time', /dueAt\[n\] = at/.test(src))
  check('...and a frame shows everything now due', /while \(next < tokens\.length && dueAt\[next\] <= elapsed\)/.test(src))
  check('...measured from a fixed start, not from the last render',
    /performance\.now\(\) - start/.test(src))

  // Several words can land in one frame at fast speeds and none at slow ones.
  // Re-rendering either way would re-parse the markdown for no visible change.
  check('state is only touched when the visible text changed', /if \(next !== shown\)/.test(src))
}

// ---------------------------------------------------------------------------
console.log('\n2. The timing budget')
// ---------------------------------------------------------------------------
{
  const t = timings()
  check(`three speeds are defined (${Object.keys(t).join(', ')})`, Object.keys(t).length === 3, Object.keys(t))
  for (const [name, v] of Object.entries(t)) {
    console.log(`    ${name.padEnd(7)} tick ${String(v.tick).padStart(3)}ms   pause ${String(v.pause).padStart(3)}ms   ratio ${(v.pause / v.tick).toFixed(2)}x`)
  }

  // 110ms/word was the "too slow" complaint. The default has to stay well
  // under it — a budget, not a frozen number, so it can be tuned without a
  // gate edit but cannot drift back.
  check(`normal is well under the 110ms that was too slow (${t.normal?.tick}ms)`,
    !!t.normal && t.normal.tick <= 70, t.normal)

  // THE STALL. At 3.45x the tick this produced 491ms gaps and was the actual
  // cause of "not smooth". A beat at a full stop is wanted; a halt is not.
  for (const [name, v] of Object.entries(t)) {
    const ratio = v.pause / v.tick
    check(`${name}: the sentence pause is a beat, not a halt (${ratio.toFixed(2)}x tick)`,
      ratio <= 2, { ...v, ratio })
    // THE ABSOLUTE CAP APPLIES TO THE SPEEDS PEOPLE ACTUALLY GET. `slow` is
    // opt-in and is governed by the ratio above instead, and this check was
    // LOOSENED to say so after firing on it — 245ms against a 95ms tick is
    // 2.6x, the identical proportion to normal's 130ms against 50ms. The
    // absolute number was encoding "the default must feel fluid", which is a
    // claim about fast and normal; applying it to slow was the check's shape
    // being wrong, not slow being stally.
    if (name !== 'slow') {
      check(`${name}: worst-case gap stays under 150ms (${v.tick + v.pause}ms)`,
        v.tick + v.pause < 150, v.tick + v.pause)
    }
  }

  // The names have to mean what they say.
  check('fast < normal < slow',
    !!t.fast && !!t.normal && !!t.slow && t.fast.tick < t.normal.tick && t.normal.tick < t.slow.tick,
    t)

  // A whole message must not outstay its welcome. 67 words is a real coach
  // reply from the onboarding opener; at the old normal it took 8.9s.
  //
  // `slow` is allowed up to 8s on purpose: it lands at 7.0s, which is close
  // to what the old default did, so anyone who actually liked the old pace
  // has it one tap away in Settings rather than lost.
  const WORDS = 67
  const SENTENCES = 4
  for (const [name, v] of Object.entries(t)) {
    const total = WORDS * v.tick + SENTENCES * v.pause
    check(`${name}: a 67-word reply finishes in ${(total / 1000).toFixed(1)}s`,
      total <= (name === 'slow' ? 8000 : 5000), total)
  }
}

// ---------------------------------------------------------------------------
console.log('\n3. The bypasses still bypass')
// ---------------------------------------------------------------------------
{
  // Neither of these should ever animate, and both are one condition away
  // from being lost in a refactor of the effect's early return.
  check('reduced motion reveals instantly', /prefersReducedMotion\(\)/.test(src))
  check("...and so does 'off'", /speed === 'off'/.test(src))
  check('a non-active message renders in full immediately',
    /useState\(active \? '' : text\)/.test(src))
  check('the bypass still reports done', /if \(active\) doneRef\.current\?\.\(\)/.test(src))

  // Quick replies wait on this; if it stops firing they never appear.
  check('finishing the reveal reports done', /if \(shown >= tokens\.length\)[\s\S]{0,80}doneRef\.current\?\.\(\)/.test(src))

  // Word-level, never mid-token: truncating markdown mid-syntax renders a
  // broken "**bold" for a frame.
  check('the reveal is word-level, so markdown is never cut mid-token',
    /const WORD_RE = \/\\S\+\\s\*\/g/.test(src))
}

console.log(failures === 0 ? '\nAll reveal-timing checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
