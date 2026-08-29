// ---------------------------------------------------------------------------
// Gate: Exercise's field (design handoff v2 §4).
//
// Two things the handoff singles out, and both are gated here rather than
// trusted:
//
//   §8 step 1 — "Small glyphs on the Exercise week strip must be solid ink —
//   that one has regressed twice." So the strip's field variant is checked for
//   solid ink on both the day letter and the glyph, not merely for existing.
//
//   §4 — both arcs are ink "because 'sets' and 'program progress' are the only
//   facts in the app with no assigned colour". They must stay distinguishable
//   by ink WEIGHT, never by one of them acquiring a hue.
//
//   §2/§4 — "Home and Exercise must not read as the same screen." Home states
//   the day and names the session once, inside a list row; Exercise states the
//   session, at 38px.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildExerciseField } from '../src/lib/exercise-field'
import { FIELD_INK } from '../src/lib/field-ink'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const strip = (f: string) => readFileSync(join(ROOT, f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const base = {
  sessionName: 'Push & Press', setsLogged: 4, setsPlanned: 18,
  estimatedMinutes: 52, weekNumber: 3, totalWeeks: 16, isRestDay: false,
}

console.log('\n1. The handoff\'s own example')
{
  const m = buildExerciseField(base)
  check('4 / 18 sets', m.setsLogged === 4 && m.setsPlanned === 18)
  check('the session is named', m.sessionName === 'Push & Press')
  check('time LEFT, scaled by sets still to do', m.minutesLeft === Math.round(52 * (1 - 4 / 18)), m.minutesLeft)
  check('the bar is the real ratio', Math.abs(m.progress - 4 / 18) < 1e-9)
  check('the CTA continues rather than starts', m.ctaLabel === 'Continue session')
}

console.log('\n2. Both arcs are ink — separated by weight, never by a colour')
{
  const m = buildExerciseField(base)
  check('two arcs', m.arcs.length === 2, m.arcs.map(a => a.label))
  check('sets is solid ink at r92/w9', m.arcs[0].color === undefined && m.arcs[0].radius === 92 && m.arcs[0].width === 9)
  check('program is ink at the secondary rung, r76/w6',
    m.arcs[1].radius === 76 && m.arcs[1].width === 6 && m.arcs[1].color?.includes('--field-ink'), m.arcs[1].color)
  check('...and that rung is the documented .32', FIELD_INK.secondaryArc === 0.32)
  check('neither arc borrows a chart colour',
    m.arcs.every(a => !a.color || !a.color.includes('--chart')), m.arcs.map(a => a.color))
  check('the program arc is week/total', Math.abs(m.arcs[1].value - 3 / 16) < 1e-9)
}

console.log('\n3. A rest day states no session')
{
  const rest = buildExerciseField({ ...base, isRestDay: true })
  check('no session name', rest.sessionName === null)
  check('no CTA', rest.ctaLabel === null)
  const done = buildExerciseField({ ...base, setsLogged: 18 })
  check('a finished session offers no CTA either', done.ctaLabel === null)
  check('...and its bar is full, not over', done.progress === 1)
}

console.log('\n4. Logged sets can never exceed planned')
{
  const over = buildExerciseField({ ...base, setsLogged: 99 })
  check('clamped', over.setsLogged === 18 && over.progress === 1, [over.setsLogged, over.progress])
  const none = buildExerciseField({ ...base, setsPlanned: 0, setsLogged: 0, estimatedMinutes: 40 })
  check('a zero-set day cannot divide by zero', Number.isFinite(none.progress) && none.minutesLeft === null)
}

console.log('\n5. The week strip in the field: SOLID ink glyphs (regressed twice)')
{
  const src = strip('src/components/exercise/WeekContextRow.tsx')
  check('the strip has a field variant', /variant\?: 'canvas' \| 'field'/.test(readFileSync(join(ROOT, 'src/components/exercise/WeekContextRow.tsx'), 'utf8')))
  check('the day letter is SOLID ink on the field', /style=\{onField \? \{ color: 'var\(--field-ink\)' \} : undefined\}/.test(src))
  check('...and so is the glyph', (src.match(/color: 'var\(--field-ink\)'/g) ?? []).length >= 2,
    (src.match(/color: 'var\(--field-ink\)'/g) ?? []).length)
  check('cells are 32px on the ink .12 fill', /width: 32, height: 32/.test(src) && /ink\('cellFill'\)/.test(src))
  check('today is bordered 1.5px solid ink', /1\.5px solid var\(--field-ink\)/.test(src))
  check('it is still tappable — a navigator, not a record', /onClick=\{\(\) => \{ if \(!isToday\) onSelectDay/.test(src))
}

console.log('\n6. Home and Exercise must not read as the same screen')
{
  const home = strip('src/components/Dashboard.tsx')
  const ex = strip('src/components/exercise/TodayPanel.tsx')
  check('Exercise states the session at 38px', /text-\[38px\]/.test(ex))
  check('Home does NOT repeat it at headline size', !/text-\[38px\]/.test(home))
  check('Home names the session once, inside its list row',
    /Finish \$\{session\.focus\}/.test(strip('src/lib/home-field.ts')))
  check('Home\'s strip stays a canvas record — no field variant',
    !/variant="field"/.test(home))
  check('Exercise\'s strip is the field navigator', /variant="field"/.test(ex))
}

console.log('\n7. The bar and its track both come from the ladder')
{
  const ex = strip('src/components/exercise/TodayPanel.tsx')
  check('the 5px bar sits on ink barTrack', /h-\[5px\]/.test(ex) && /ink\('barTrack'\)/.test(ex))
  check('...and its fill is solid ink', /background: 'var\(--field-ink\)'/.test(ex))
  check('no hand-picked alpha anywhere in the panel', !/rgba\(\s*var\(--field-ink/.test(ex))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll exercise-field checks passed.')
