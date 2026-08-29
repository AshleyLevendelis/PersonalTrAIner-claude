// ---------------------------------------------------------------------------
// Gate: Home's field answers "what's left today", derived (handoff v2 §2).
//
// Two rules the handoff states and this file enforces, because both are the
// kind that quietly rot once they live in JSX:
//   1. "Only list items that have no readout further down the page" — water,
//      calories, steps and the weigh-in all have rows on the canvas, so they
//      are never rows in the field. Water is ring-only.
//   2. "The count is derived from the list, never hardcoded."
// Plus §8 step 3: a rest day with everything logged must show a genuinely
// empty state, not "0 things left".
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildHomeField } from '../src/lib/home-field'
import type { DashboardData, TodaySession } from '../src/lib/dashboard-data'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const session = (o: Partial<TodaySession> = {}): TodaySession => ({
  status: 'in_progress', focus: 'Push & Press', exerciseNames: [],
  setsLogged: 4, setsPlanned: 18, exerciseCount: 6, estimatedMinutes: 45,
  ...o,
} as TodaySession)

const input = (o: Partial<DashboardData> = {}) => ({
  session: session(), proteinEaten: 88, proteinTarget: 160, hasNutritionTargets: true,
  waterMl: 1250, waterTargetMl: 2000, ...o,
} as Pick<DashboardData, 'session'|'proteinEaten'|'proteinTarget'|'hasNutritionTargets'|'waterMl'|'waterTargetMl'>)

console.log('\n1. The handoff\'s own example reproduces')
{
  const m = buildHomeField(input())
  check('two rows, not three — water is not one of them', m.count === 2, m.rows.map(r => r.key))
  check('...the count equals the list', m.count === m.rows.length)
  check('the session row names the session and its sets left',
    m.rows[0].label === 'Finish Push & Press' && m.rows[0].figure === '14 sets', m.rows[0])
  check('the protein row carries the violet swatch',
    m.rows[1].key === 'protein' && m.rows[1].swatch === 'var(--chart-2)' && m.rows[1].figure === '72 g', m.rows[1])
  check('the session row has NO swatch — sets have no colour of their own', m.rows[0].swatch === undefined)
}

console.log('\n2. Water is in the ring and never in the list')
{
  const m = buildHomeField(input())
  check('water is an arc', m.arcs.some(a => a.label === 'water'))
  check('...and never a row, on any input', !m.rows.some(r => (r.key as string) === 'water'))
  check('the three arcs are sets, protein, water in that order',
    m.arcs.map(a => a.label).join(',') === 'sets,protein,water', m.arcs.map(a => a.label))
  check('sets is the headline arc — solid ink, no colour', m.arcs[0].color === undefined)
  check('...at the handoff\'s radius and width', m.arcs[0].radius === 92 && m.arcs[0].width === 9)
  check('protein and water keep their own token colours',
    m.arcs[1].color === 'var(--chart-2)' && m.arcs[2].color === 'var(--chart-3)')
}

console.log('\n3. A rest day with everything logged is EMPTY, not zero')
{
  const rest = buildHomeField(input({
    session: session({ status: 'rest', focus: null, setsLogged: 0, setsPlanned: 0 }),
    proteinEaten: 170, proteinTarget: 160,
  }))
  check('no rows', rest.count === 0)
  check('...and it says so as an empty state', rest.empty === true)
  check('...with no CTA to press', rest.ctaLabel === null)
  // The ring still draws — the day still happened.
  check('the ring still renders water', rest.arcs.some(a => a.label === 'water'))
}

console.log('\n4. A finished session drops out of the list')
{
  const done = buildHomeField(input({ session: session({ status: 'done', setsLogged: 18, setsPlanned: 18 }) }))
  check('no session row once every set is logged', !done.rows.some(r => r.key === 'session'))
  check('...but protein still outstanding is still listed', done.rows.some(r => r.key === 'protein'))
  check('...and the count follows', done.count === 1)
}

console.log('\n5. Declined body metrics never produce a fabricated target')
{
  const declined = buildHomeField(input({ hasNutritionTargets: false, proteinTarget: 0, proteinEaten: 0 }))
  check('no protein row', !declined.rows.some(r => r.key === 'protein'))
  check('...and no protein arc either', !declined.arcs.some(a => a.label === 'protein'))
  check('the session row survives — it needs no body metric', declined.rows.some(r => r.key === 'session'))
}

console.log('\n6. Over-target values cannot wrap the ring or go negative')
{
  const over = buildHomeField(input({ proteinEaten: 400, proteinTarget: 160, waterMl: 9000 }))
  check('protein left never goes negative', !over.rows.some(r => r.key === 'protein'))
  check('...and the arc value is left raw for the ring to clamp',
    (over.arcs.find(a => a.label === 'protein')?.value ?? 0) > 1)
  const ring = readFileSync(join(ROOT, 'src/components/field/FieldRing.tsx'), 'utf8')
  check('...which the ring does', /Math\.min\(1, arc\.value\)/.test(ring))
}

console.log('\n7. The count cannot be hardcoded')
{
  const src = readFileSync(join(ROOT, 'src/lib/home-field.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('count is rows.length and nothing else', /count: rows\.length/.test(src))
  check('...and no caller can pass one in', !/count[?]?:\s*number/.test(src.split('export interface HomeFieldModel')[0]))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll home-field checks passed.')
