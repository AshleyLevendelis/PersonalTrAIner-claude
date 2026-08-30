// Probe: text contrast per theme, measured with the app's own contrastRatio.
import { readFileSync } from 'fs'
import { contrastRatio } from '../src/lib/appearance-palette'

const css = readFileSync('src/index.css', 'utf8')
const themes = ['nightshift', 'ember', 'field', 'graphite', 'daylight']
function blockFor(theme: string): string {
  const sel = theme === 'nightshift' ? '[data-theme="nightshift"]' : `[data-theme="${theme}"]`
  const i = css.indexOf(sel)
  if (i < 0) return ''
  const open = css.indexOf('{', i)
  return css.slice(open, css.indexOf('\n}', open))
}
const tokenOf = (block: string, name: string) => new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{3,8})`).exec(block)?.[1] ?? null

console.log('WCAG AA needs 4.5:1 for normal text, 3:1 for large text (>=18.66px bold / 24px).\n')
const rows: string[] = []
for (const t of themes) {
  const b = blockFor(t)
  const bg = tokenOf(b, 'background')
  const fg = tokenOf(b, 'foreground')
  const muted = tokenOf(b, 'muted-foreground')
  const dim = tokenOf(b, 'text-dim')
  const deep = tokenOf(b, 'surface-deep')
  if (!bg || !fg) { console.log(`${t}: could not read tokens`); continue }
  const r = (a: string | null, c: string) => a ? contrastRatio(a, c) : NaN
  const line = (label: string, v: number, floor: number) =>
    `    ${label.padEnd(28)} ${v.toFixed(2).padStart(6)}:1  ${v >= floor ? 'pass' : `FAILS the ${floor}:1 floor`}`
  console.log(`${t}  (canvas ${bg})`)
  console.log(line('body text (foreground)', r(fg, bg), 4.5))
  console.log(line('secondary (muted-foreground)', r(muted, bg), 4.5))
  console.log(line('faintest (text-dim)', r(dim, bg), 4.5))
  console.log(line('body text on surface-deep', r(fg, deep ?? bg), 4.5))
  console.log(line('secondary on surface-deep', r(muted, deep ?? bg), 4.5))
  if (r(muted, bg) < 4.5) rows.push(`${t}: muted-foreground ${r(muted, bg).toFixed(2)}:1`)
  if (r(dim, bg) < 4.5) rows.push(`${t}: text-dim ${r(dim, bg).toFixed(2)}:1`)
  console.log('')
}
console.log(`Text colours below the 4.5:1 normal-text floor: ${rows.length}`)
for (const x of rows) console.log('  ' + x)
