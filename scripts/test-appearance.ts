/**
 * Gate for the appearance system.
 *
 * THE BUG IT STARTED FROM. `AccentOverride` included 'theme' and
 * DEFAULT_APPEARANCE.accent was 'theme', but ACCENT_OPTIONS listed only the
 * five hues — so there was no control anywhere returning you to your theme's
 * own accent. Tapping one was permanent short of clearing localStorage. The
 * type said the state existed; nothing let a person reach it.
 *
 * That shape — a value the model allows and the UI cannot produce — is what
 * §1 checks in both directions.
 *
 * §3 exists because appearance-palette.ts deliberately duplicates index.css:
 * the sheet has to paint a theme it is not wearing, and custom properties
 * cannot be read from a theme that is not applied. Duplication is only safe
 * while something asserts the copies agree.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_APPEARANCE, isLightTheme, resolveGlow, type ThemeName, type AccentOverride } from '../src/lib/appearance-store'
import {
  THEME_PREVIEWS, ACCENT_PREVIEWS, THEME_ORDER, ACCENT_ORDER,
  resolveAccentColor, contrastRatio, luminance, CONTRAST_FLOOR,
} from '../src/lib/appearance-palette'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8')
const store = readFileSync(join(ROOT, 'src/lib/appearance-store.ts'), 'utf8')
const sheet = readFileSync(join(ROOT, 'src/components/AppearanceSection.tsx'), 'utf8')
const profile = readFileSync(join(ROOT, 'src/components/ProfileScreen.tsx'), 'utf8')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 240)}` : ''}`) }
}

console.log('\n1. Every value the type allows is reachable, and vice versa\n')
check('"Match theme" is offered as a control', ACCENT_ORDER.includes('theme'))
check('...and it is FIRST, where a default belongs', ACCENT_ORDER[0] === 'theme')
check('...and it is the shipped default', DEFAULT_APPEARANCE.accent === 'theme')
check('every accent the type allows has a chip', ACCENT_ORDER.length === Object.keys(ACCENT_PREVIEWS).length,
  { order: ACCENT_ORDER.length, previews: Object.keys(ACCENT_PREVIEWS).length })
check('every theme the type allows has a card', THEME_ORDER.length === Object.keys(THEME_PREVIEWS).length)
check('...and there are five of each kind (sanity check on this check)',
  THEME_ORDER.length === 5 && ACCENT_ORDER.length === 6, { themes: THEME_ORDER.length, accents: ACCENT_ORDER.length })

console.log('\n2. Retired accent values migrate rather than vanishing\n')
// Read the map out of the source: importing it would need it exported purely
// for a test, and its correctness is what matters, not its visibility.
for (const [from, to] of [['orange', 'coral'], ['yellowgreen', 'lime'], ['blue', 'sky'], ['purple', 'violet'], ['mint', 'mint']]) {
  check(`${from} → ${to}`, new RegExp(`${from}:\\s*'${to}'`).test(store))
}
check('an unknown value falls back to theme, not to a hue',
  /return DEFAULT_APPEARANCE\.accent/.test(store) && DEFAULT_APPEARANCE.accent === 'theme')
check('the retired names are gone from the live set',
  !ACCENT_ORDER.some(a => (['orange', 'yellowgreen', 'blue', 'purple'] as string[]).includes(a)), ACCENT_ORDER)

console.log('\n3. The palette data and index.css agree\n')
for (const name of THEME_ORDER) {
  check(`${name} has a [data-theme] block`, new RegExp(`\\[data-theme="${name}"\\]`).test(css))
  const p = THEME_PREVIEWS[name]
  // The canvas is the one value a wrong preview would misrepresent most.
  check(`  ...and its --background matches the preview (${p.canvas})`,
    new RegExp(`\\[data-theme="${name}"\\][\\s\\S]{0,900}?--background:\\s*${p.canvas};`, 'i').test(css), p.canvas)
}
for (const a of ACCENT_ORDER) {
  if (a === 'theme') {
    check('theme defines NO accent block, so the theme shows through',
      !/\[data-accent="theme"\]\s*\{/.test(css))
    continue
  }
  const bright = ACCENT_PREVIEWS[a].bright!
  check(`${a} block carries its bright value ${bright}`,
    new RegExp(`\\[data-accent="${a}"\\][^}]*--accent-bright:\\s*${bright};`, 'i').test(css))
}

console.log('\n4. A light canvas changes two things, by rule not by combination\n')
check('daylight is flagged light', isLightTheme('daylight' as ThemeName) && THEME_PREVIEWS.daylight.light)
check('every other theme is not', THEME_ORDER.filter(t => t !== 'daylight').every(t => !isLightTheme(t)))
check('the accent dark step is one rule keyed off the canvas flag',
  /\[data-canvas="light"\]\[data-accent\]:not\(\[data-accent="theme"\]\)/.test(css))
check('...and it is not written per theme × accent',
  !/\[data-theme="daylight"\]\[data-accent="/.test(css))
check('a dark theme resolves an accent to its bright end',
  resolveAccentColor('nightshift', 'lime') === ACCENT_PREVIEWS.lime.bright)
check('a light theme resolves the SAME accent to its dark step',
  resolveAccentColor('daylight', 'lime') === ACCENT_PREVIEWS.lime.dark)
check('"Match theme" borrows the theme, on both canvases',
  resolveAccentColor('daylight', 'theme') === THEME_PREVIEWS.daylight.accent &&
  resolveAccentColor('ember', 'theme') === THEME_PREVIEWS.ember.accent)

console.log('\n5. Glow is clamped at resolve time, never in the stored record\n')
check('full glow becomes subtle on a light canvas',
  resolveGlow({ glow: 'full', theme: 'daylight', accent: 'theme' }) === 'subtle')
check('...and is untouched on a dark one',
  resolveGlow({ glow: 'full', theme: 'nightshift', accent: 'theme' }) === 'full')
check('off stays off (the clamp only ever lowers)',
  resolveGlow({ glow: 'off', theme: 'daylight', accent: 'theme' }) === 'off')
check('the preference itself is never rewritten — no save inside the clamp',
  !/resolveGlow[\s\S]{0,400}?saveAppearance/.test(store))
check('the sheet says so beside the heading', /clamped to subtle on/.test(sheet))

console.log('\n6. The contrast guard measures rather than asserts\n')
check('black on white is 21:1', Math.round(contrastRatio('#000000', '#FFFFFF')) === 21)
check('a colour against itself is 1:1', Math.round(contrastRatio('#5BE9C2', '#5BE9C2')) === 1)
check('luminance is ordered', luminance('#FFFFFF') > luminance('#808080') && luminance('#808080') > luminance('#000000'))
// THE HANDOFF'S EXAMPLE IS WRONG, and measuring is how that surfaced. Its
// verification step says the warning fires on "Field + Lime ... 2.4:1".
// Field + Lime measures 13.9:1 — bright lime on a near-black canvas is one of
// the highest-contrast pairs in the whole set, and it is high BECAUSE of the
// retune the same document specifies ("higher-chroma lime separates it").
// Asserted here so nobody re-introduces a "fix" to match the wrong number.
const fieldLime = contrastRatio(resolveAccentColor('field', 'lime'), THEME_PREVIEWS.field.canvas)
check(`Field + Lime is comfortably ABOVE the floor, not below it (${fieldLime.toFixed(1)}:1)`,
  fieldLime > CONTRAST_FLOOR * 2, fieldLime)

// WHERE IT ACTUALLY FIRES, swept rather than assumed. A guard nobody can
// trigger is the tautological-control failure this repo keeps finding, so the
// count is pinned: if it reaches 0 the guard has gone vacuous, and if it
// climbs, a palette change has made something unreadable.
const under: string[] = []
for (const th of THEME_ORDER) {
  for (const ac of ACCENT_ORDER) {
    const r = contrastRatio(resolveAccentColor(th, ac), THEME_PREVIEWS[th].canvas)
    if (r < CONTRAST_FLOOR) under.push(`${th}+${ac} ${r.toFixed(1)}:1`)
  }
}
console.log(`     under ${CONTRAST_FLOOR}:1 → ${under.join(', ') || '(none)'}`)
check('the guard is reachable — some combination trips it', under.length > 0, under)
check('...and it is not tripping across the board', under.length <= 4, under)
// Both failing pairs are Daylight resolving to deep mint (#00A88A) on paper:
// 'theme' and 'mint' are the same colour there. Recorded, not silently
// "fixed" by editing a token the handoff specifies — see BACKLOG.
check('the failures are Daylight-on-paper, the case the floor exists for',
  under.every(u => u.startsWith('daylight+')), under)

check('the guard exists and is a warning, not a block',
  /CONTRAST_FLOOR/.test(sheet) && !/disabled=\{lowContrast/.test(sheet))

console.log('\n7. The sheet is wired, and chat settings left it\n')
check('ProfileScreen renders the section', /<AppearanceSection appearance=\{appearance\} \/>/.test(profile))
check('order is theme → action colour → glow',
  profile.indexOf('AppearanceSection') > 0 &&
  sheet.indexOf('>Theme<') < sheet.indexOf('>Action colour<') &&
  sheet.indexOf('>Action colour<') < sheet.indexOf('>Glow<'))
check('a live Home preview sits above the controls',
  sheet.indexOf('HomePreview') < sheet.indexOf('>Theme<'))
check('there is a reset back to the shipped default', /appearance\.reset/.test(sheet))
// Reveal speed is a chat behaviour. It must have LEFT appearance, not just
// exist somewhere — checked by position, since both live in one file.
const revealAt = profile.indexOf('Chat reveal speed')
const toneAt = profile.indexOf('Tone &amp; context')
check('chat reveal speed moved out of Appearance', revealAt > toneAt && toneAt > 0, { revealAt, toneAt })
check('...and still exists (not deleted in the move)', revealAt > 0)

console.log('\n8. Status colour never moves with a cosmetic choice\n')
check('water stays --chart-3 in the preview, not the accent', /#5AA9E6|--chart-3/.test(sheet))
check('the accent never overwrites --destructive or --role-warn',
  !/--destructive:\s*var\(--theme-primary/.test(css) && !/--role-warn[^:]*:\s*var\(--theme-primary/.test(css))

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nAppearance: every value reachable, every preview honest.\n')
