// ---------------------------------------------------------------------------
// Gate: the field is readable on every theme and every accent.
//
// Handoff v2 §1 gives an ink alpha ladder "measured, not guessed" — text >=13px
// at .78, 10-12px at .88, smaller and every week-strip glyph solid — and warns
// that "every contrast failure this design went through came from a hand-picked
// alpha". It also proposes --field = --primary-2.
//
// Measured before building: on 11 of this app's 15 theme x accent grounds that
// ladder cannot be met with ANY ink, black or white included. The ladder was
// measured on mint, which is unusually forgiving; most of the other grounds are
// mid-lightness saturated colours where nothing sits readably on top.
//
// Ashley's ruling, 30 Aug 2026: auto-adjust per theme. So --field is the same
// HUE at the nearest lightness that carries the ladder, which is why mint, lime
// and amber move by 0 and the reference design renders exactly as drawn.
//
// This file re-measures all 15 rather than trusting that arithmetic, because
// the whole point of the ruling is that a hand-picked value is what fails.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { contrastRatio } from '../src/lib/appearance-palette'
import { FIELD_INK } from '../src/lib/field-ink'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8')

const hexToRgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] as const }
const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
/** What the eye sees at an alpha: the ink composited onto its own ground. */
const blend = (inkHex: string, ground: string, a: number) => {
  const [ir, ig, ib] = hexToRgb(inkHex), [gr, gg, gb] = hexToRgb(ground)
  return toHex(ir * a + gr * (1 - a), ig * a + gg * (1 - a), ib * a + gb * (1 - a))
}

/** Every (field, ink) pair the app can actually render. */
function grounds(): { name: string; field: string; ink: string }[] {
  const out: { name: string; field: string; ink: string }[] = []
  for (const theme of ['nightshift', 'ember', 'field', 'graphite', 'daylight']) {
    const block = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{[\\s\\S]*?\\n\\}`))
    if (!block) continue
    const f = block[0].match(/--theme-field:\s*(#[0-9A-Fa-f]{6})/)
    const i = block[0].match(/--theme-field-ink:\s*(#[0-9A-Fa-f]{6})/)
    if (f && i) out.push({ name: `theme:${theme}`, field: f[1], ink: i[1] })
  }
  for (const accent of ['mint', 'coral', 'violet', 'sky', 'lime']) {
    const line = css.match(new RegExp(`\\[data-accent="${accent}"\\][^\\n]*`))
    if (!line) continue
    for (const step of ['deep', 'dark'] as const) {
      const f = line[0].match(new RegExp(`--accent-field-${step}:\\s*(#[0-9A-Fa-f]{6})`))
      const i = line[0].match(new RegExp(`--accent-field-ink-${step}:\\s*(#[0-9A-Fa-f]{6})`))
      if (f && i) out.push({ name: `accent:${accent}-${step}`, field: f[1], ink: i[1] })
    }
  }
  return out
}

console.log('\n1. Every ground the app can render carries the ladder')
{
  const all = grounds()
  check('all 5 themes and 5 accents x 2 steps are declared', all.length === 15, all.length)
  const bad: string[] = []
  for (const g of all) {
    const solid = contrastRatio(g.field, g.ink)
    const a88 = contrastRatio(g.field, blend(g.ink, g.field, FIELD_INK.textSmall))
    const a78 = contrastRatio(g.field, blend(g.ink, g.field, FIELD_INK.text))
    if (solid < 7 || a88 < 5.5 || a78 < 4.5) {
      bad.push(`${g.name} solid=${solid.toFixed(2)} .88=${a88.toFixed(2)} .78=${a78.toFixed(2)}`)
    }
  }
  check('solid >= 7:1, .88 >= 5.5:1, .78 >= 4.5:1 on every one', bad.length === 0, bad)
  // The reference design must be untouched where it was already sound.
  const mint = all.find(g => g.name === 'theme:nightshift')
  check("the default theme's field is still the handoff's own #3ED3AA",
    mint?.field.toUpperCase() === '#3ED3AA', mint?.field)
}

console.log('\n2. The ladder is a set of constants, not per-component literals')
{
  check('the documented rungs are all present',
    FIELD_INK.text === 0.78 && FIELD_INK.textSmall === 0.88 && FIELD_INK.textTiny === 1
    && FIELD_INK.hairline === 0.22 && FIELD_INK.keyline === 0.55)
  check('ring tracks sit in the documented .15-.17 band',
    FIELD_INK.ringTrack >= 0.15 && FIELD_INK.ringTrack <= 0.17, FIELD_INK.ringTrack)
  // "Every contrast failure this design went through came from a hand-picked
  // alpha" — so a component must not be able to invent one.
  const comps = ['src/components/field/Field.tsx', 'src/components/field/FieldRing.tsx']
    .map(f => readFileSync(join(ROOT, f), 'utf8'))
    .map(s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'))
    .join('\n')
  check('no component hand-picks an rgba alpha on the ink', !/rgba\(\s*var\(--field-ink/.test(comps))
  check('...and every alpha it does use comes from the ladder',
    !/color-mix\(in srgb, var\(--field-ink\) \d/.test(comps))
}

console.log('\n3. The field means ownership — Tools must not have one')
{
  const tools = readFileSync(join(ROOT, 'src/components/ToolsTab.tsx'), 'utf8')
  check('Tools renders no field while idle', !/<Field[\s>]/.test(tools))
  // Comments stripped: Field.tsx's own doc comment says "there is deliberately
  // no variant=none", which satisfied this check against the raw file. That is
  // the same self-satisfying-check trap this session has hit repeatedly, caught
  // here by the gate within a minute of the file being written.
  const fieldSrc = readFileSync(join(ROOT, 'src/components/field/Field.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('...and the component offers no "no field" variant to fake it with',
    !/variant/.test(fieldSrc))
}

console.log('\n4. The field is full-bleed, and square where it meets the top')
{
  // Reported live: the first build rendered as an inset rounded card floating
  // below the settings gear, which read — correctly — as the design not having
  // been applied at all. §1: "A full-bleed band ... square top corners (it
  // meets the status bar)", and the prototype's own field is the first child
  // of the phone frame with no radius of its own.
  const field = readFileSync(join(ROOT, 'src/components/field/Field.tsx'), 'utf8')
  check('no corner radius', /borderRadius: 0/.test(field))
  check('...and it breaks out of the page gutter', /marginLeft: -16/.test(field) && /marginRight: -16/.test(field))
  check('...and out of the top padding, so it reaches the top', /marginTop: -48/.test(field))
  // Those numbers only work while <main> keeps that padding.
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  check('the page gutter is still px-4 pt-12, which those offsets cancel',
    /<main className="max-w-6xl mx-auto px-4 pt-12/.test(app))
  // The fixed settings gear now lands on a light accent band.
  check('the settings gear takes field ink on the tabs that have one',
    /TABS_WITH_FIELD\.has\(activeTab\) \? 'var\(--field-ink\)'/.test(app))
  check("...and Tools is not in that set, because it has no field",
    /const TABS_WITH_FIELD = new Set\(\['dashboard', 'nutrition', 'exercise'\]\)/.test(app))
}

console.log('\n5. Arcs are computed from real values')
{
  const ring = readFileSync(join(ROOT, 'src/components/field/FieldRing.tsx'), 'utf8')
  check('the dasharray is derived from the value', /circumference \* v/.test(ring))
  check('...and the value is clamped so an over-target ledger cannot wrap',
    /Math\.max\(0, Math\.min\(1, arc\.value\)\)/.test(ring))
  check('a coloured arc gets its 3px ink keyline', /strokeWidth=\{arc\.width \+ 3\}/.test(ring))
  check('...and the headline arc is solid ink instead', /isHeadline \? 'var\(--field-ink\)'/.test(ring))
  check('arcs start at 12 o\'clock with round caps',
    /rotate\(-90/.test(ring) && /strokeLinecap="round"/.test(ring))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll field-contrast checks passed.')
