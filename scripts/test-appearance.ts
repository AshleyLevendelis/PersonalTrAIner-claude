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
import { DEFAULT_APPEARANCE, getAppearance, type ThemeName } from '../src/lib/appearance-store'
import {
  THEME_PREVIEWS, ACCENT_PREVIEWS, THEME_ORDER, ACCENT_ORDER,
  THEME_INKS, CONTRAST_FLOORS, resolveAccentColor,
  contrastRatio, luminance, CONTRAST_FLOOR,
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
// FIVE themes since 27 Nov 2026 (Ashley: keep Nightshift, replace the other eight with violet-backed themes in red,
// purple, blue and green), nine accent chips (8 hues + "Match theme"). Pinned so the number is a decision.
check('...and there are five themes and nine accent chips (sanity check on this check)',
  THEME_ORDER.length === 5 && ACCENT_ORDER.length === 9, { themes: THEME_ORDER.length, accents: ACCENT_ORDER.length })
check('...of which eight accents are hues and one is "Match theme"',
  ACCENT_ORDER.filter(a => a !== 'theme').length === 8)
check('...Nightshift first, then red, purple, blue, green in his order',
  THEME_ORDER.join(',') === 'nightshift,ruby,amethyst,sapphire,emerald', THEME_ORDER)

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

// THE EIGHT RETIRED THEMES, read through the app's own reader off a stored record: each lands on the new theme of
// its accent's family, never on a value no rule paints. Daylight had no violet twin and goes to the default.
{
  const mem = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: k => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v) }, removeItem: k => { mem.delete(k) },
    clear: () => mem.clear(), key: () => null, get length() { return mem.size },
  } as Storage
  const readAs = (theme: string) => { mem.clear(); mem.set('fitplan_appearance_v2', JSON.stringify({ glow: 'full', theme, accent: 'theme' })); return getAppearance().theme }
  for (const [from, to] of [
    ['ember', 'ruby'], ['rosewood', 'ruby'], ['linen', 'ruby'], ['graphite', 'amethyst'],
    ['midnight', 'sapphire'], ['frost', 'sapphire'], ['field', 'emerald'], ['daylight', 'nightshift'],
  ] as const) check(`a saved ${from} opens as ${to}`, readAs(from) === to, readAs(from))
  check('a current theme reads back as itself', readAs('sapphire') === 'sapphire')
  check('an unknown theme falls back to Nightshift', readAs('neon') === 'nightshift')
}

console.log('\n3. The palette data and index.css agree\n')
for (const name of THEME_ORDER) {
  check(`${name} has a [data-theme] block`, new RegExp(`\\[data-theme="${name}"\\]`).test(css))
  const p = THEME_PREVIEWS[name]
  // The canvas is the one value a wrong preview would misrepresent most.
  check(`  ...and its --background matches the preview (${p.canvas})`,
    new RegExp(`\\[data-theme="${name}"\\][\\s\\S]{0,900}?--background:\\s*${p.canvas};`, 'i').test(css), p.canvas)
  // AND ITS ACCENT. Found by mutation: pinning only the canvas let index.css
  // and the preview disagree about --theme-primary without a word, which is
  // the exact drift this duplication was justified by a gate against — and
  // the exact value Ashley's ruling just changed in two files at once. The
  // preview would then paint a colour the app does not use, on the one screen
  // whose entire job is showing you what you are choosing.
  check(`  ...and its --theme-primary matches the preview (${p.accent})`,
    new RegExp(`\\[data-theme="${name}"\\][\\s\\S]{0,1400}?--theme-primary:\\s*${p.accent};`, 'i').test(css), p.accent)
  check(`  ...and its --primary-text is its accent`,
    new RegExp(`\\[data-theme="${name}"\\][\\s\\S]{0,1600}?--primary-text:\\s*var\\(--theme-primary\\);`, 'i').test(css))
  check(`  ...and it defines --num-hero, --primary-foreground and the three role-ai tints`,
    ['--num-hero', '--primary-foreground', '--role-ai-bg', '--role-ai-border', '--role-ai-text'].every(tok =>
      new RegExp(`\\[data-theme="${name}"\\][\\s\\S]{0,1800}?${tok}:`, 'i').test(css)))
}
// ...AND NOTHING THEME-DEPENDENT IS LEFT IN :root. --role-ai-text lived there
// as one pale lilac for every canvas and measured 1.5:1 on paper; a token that
// has to change per theme cannot have a global default, or the theme that
// forgets to override it fails silently.
{
  const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('[data-glow="off"]'))
  for (const tok of ['--role-ai-text', '--role-ai-bg', '--role-ai-border']) {
    check(`${tok} no longer has a :root value`, !new RegExp(`^\\s*${tok}:`, 'm').test(rootBlock))
  }
  check('--role-ai itself stays global (the hue is not theme-dependent)', /^\s*--role-ai:/m.test(rootBlock))
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

console.log('\n4. Every theme is dark, and the paper rules went with the light ones\n')
check('no light-canvas rule is left in the stylesheet', !/data-canvas/.test(css))
check('...nor a light colour scheme', !/color-scheme:\s*light/.test(css))
check('...and the store never sets the flag', !/data-canvas/.test(store))
check('an accent override resolves to its bright end', resolveAccentColor('ruby', 'lime') === ACCENT_PREVIEWS.lime.bright)
check('"Match theme" borrows the theme', THEME_ORDER.every(t => resolveAccentColor(t, 'theme') === THEME_PREVIEWS[t].accent))
check('the stored glow is the glow applied (no clamp left to apply)', /setAttribute\('data-glow', record\.glow\)/.test(store))

console.log('\n5. The contrast guard measures rather than asserts\n')
check('black on white is 21:1', Math.round(contrastRatio('#000000', '#FFFFFF')) === 21)
check('a colour against itself is 1:1', Math.round(contrastRatio('#5BE9C2', '#5BE9C2')) === 1)
check('luminance is ordered', luminance('#FFFFFF') > luminance('#808080') && luminance('#808080') > luminance('#000000'))
// EVERY SHIPPED PAIR CLEARS THE FLOOR: nothing we ship asks a person to find a button they cannot see. (Until
// 27 Nov 2026 the light themes needed a separate, darker text step for this; every theme is dark now, so the
// accent the app paints is the one measured.)
const under: string[] = []
for (const th of THEME_ORDER) {
  for (const ac of ACCENT_ORDER) {
    const r = contrastRatio(resolveAccentColor(th, ac), THEME_PREVIEWS[th].canvas)
    if (r < CONTRAST_FLOOR) under.push(`${th}+${ac} ${r.toFixed(2)}:1`)
  }
}
check(`all ${THEME_ORDER.length * ACCENT_ORDER.length} shipped combinations clear ${CONTRAST_FLOOR}:1 AS TEXT`,
  under.length === 0, under)

// AND THE GUARD IS STILL REACHABLE — proven against a colour chosen to fail,
// not by requiring the shipped palette to contain one. Those are different
// claims, and conflating them is what made the first version of this check
// go red the moment the palette got better. A dormant guard on a safe palette
// is the goal; a guard that cannot fire at all is the defect.
check('the guard still fires on a colour that genuinely fails',
  contrastRatio('#3A2E6A', THEME_PREVIEWS.nightshift.canvas) < CONTRAST_FLOOR,
  contrastRatio('#3A2E6A', THEME_PREVIEWS.nightshift.canvas))

check('the guard exists and is a warning, not a block',
  /CONTRAST_FLOOR/.test(sheet) && !/disabled=\{lowContrast/.test(sheet))
check('the in-app guard measures the accent the app paints against the canvas',
  /const resolved = resolveAccentColor\(theme, accent\)/.test(sheet) && /contrastRatio\(resolved, t\.canvas\)/.test(sheet))

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
// exist somewhere.
//
// RE-ANCHORED 6 Sep 2026. This compared its position against the "Tone &
// context" heading, which the profile regrouping renamed and moved — so a
// correct screen went red on a heading string. The requirement was never
// about that heading: it is that the control is not inside AppearanceSection,
// which is what is checked now, by the component boundary rather than by a
// neighbouring word.
const revealAt = profile.indexOf('Chat reveal speed')
check('the reveal-speed control is in ProfileScreen at all (sanity check on this check)', revealAt > 0)
check('chat reveal speed moved out of Appearance',
  !/reveal|RevealSpeed/i.test(sheet), sheet.match(/.{0,40}reveal.{0,40}/i)?.[0])
check('...and still exists (not deleted in the move)', revealAt > 0)

console.log('\n8. Status colour never moves with a cosmetic choice\n')
check('water stays --chart-3 in the preview, not the accent', /#5AA9E6|--chart-3/.test(sheet))
check('the accent never overwrites --destructive or --role-warn',
  !/--destructive:\s*var\(--theme-primary/.test(css) && !/--role-warn[^:]*:\s*var\(--theme-primary/.test(css))

console.log('\n9. The seven contrast floors, measured for every theme\n')
// ---------------------------------------------------------------------------
// THE POINT OF THE WHOLE ROUND. Ashley: the light theme is hard to read. The
// cause was three tokens with no light value and an accent doing two jobs, and
// the way that stays fixed is a number per token per theme rather than an eye.
//
// Printed, not just asserted. A gate that says "ok" tells you nothing about
// how much room a value has; the table is what makes the next retune a
// decision instead of a guess.
// ---------------------------------------------------------------------------
{
  const COLS = [
    ['foreground', CONTRAST_FLOORS.foreground, (t: ThemeName) => [THEME_PREVIEWS[t].text, THEME_PREVIEWS[t].canvas]],
    ['tertiary', CONTRAST_FLOORS.textTertiary, (t: ThemeName) => [THEME_INKS[t].textTertiary, THEME_PREVIEWS[t].canvas]],
    ['muted', CONTRAST_FLOORS.mutedForeground, (t: ThemeName) => [THEME_PREVIEWS[t].muted, THEME_PREVIEWS[t].canvas]],
    ['prim-text', CONTRAST_FLOORS.primaryText, (t: ThemeName) => [THEME_PREVIEWS[t].accent, THEME_PREVIEWS[t].canvas]],
    ['num-hero', CONTRAST_FLOORS.numHero, (t: ThemeName) => [THEME_INKS[t].numHero, THEME_PREVIEWS[t].canvas]],
    ['ai-text', CONTRAST_FLOORS.roleAiText, (t: ThemeName) => [THEME_INKS[t].roleAiText, THEME_PREVIEWS[t].canvas]],
    ['on-fill', CONTRAST_FLOORS.primaryForeground, (t: ThemeName) => [THEME_INKS[t].primaryForeground, THEME_PREVIEWS[t].accent]],
  ] as const

  console.log('     theme      ' + COLS.map(c => `${c[0]}(${c[1]})`.padStart(14)).join(''))
  const below: string[] = []
  for (const t of THEME_ORDER) {
    const cells = COLS.map(([name, floor, pair]) => {
      const [fg, bg] = pair(t)
      const r = contrastRatio(fg, bg)
      if (r < floor) below.push(`${t}.${name} ${r.toFixed(2)} < ${floor}`)
      return `${r.toFixed(2)}${r < floor ? '!' : ' '}`.padStart(14)
    })
    console.log(`     ${t.padEnd(11)}${cells.join('')}`)
  }
  check(`all ${THEME_ORDER.length} themes clear all ${COLS.length} floors`, below.length === 0, below)
}

console.log('\n10. ...and every theme x accent pair, on the two the accent moves\n')
// An accent override replaces the fill and its words; the theme's own ink stays on the fill. Both floors hold for all
// 45 pairs, with NO named exceptions: the six light-canvas shortfalls went with the light themes.
{
  const textBelow: string[] = []
  const inkBelow: string[] = []
  for (const t of THEME_ORDER) {
    for (const a of ACCENT_ORDER) {
      const rText = contrastRatio(resolveAccentColor(t, a), THEME_PREVIEWS[t].canvas)
      if (rText < CONTRAST_FLOORS.primaryText) textBelow.push(`${t}+${a} ${rText.toFixed(2)}`)
      const rInk = contrastRatio(THEME_INKS[t].primaryForeground, resolveAccentColor(t, a))
      if (rInk < CONTRAST_FLOORS.primaryForeground) inkBelow.push(`${t}+${a} ${rInk.toFixed(2)}`)
    }
  }
  const pairs = THEME_ORDER.length * ACCENT_ORDER.length
  check(`all ${pairs} pairs clear primary-text / canvas >= ${CONTRAST_FLOORS.primaryText}`, textBelow.length === 0, textBelow)
  check(`all ${pairs} pairs clear primary-foreground / primary >= ${CONTRAST_FLOORS.primaryForeground}`, inkBelow.length === 0, inkBelow)
}

console.log('\n11. The ink table agrees with index.css\n')
// Same justification as §3: the floors above are measured on THEME_INKS, so a
// value that drifts from index.css would make every ratio a statement about a
// colour the app does not paint.
for (const t of THEME_ORDER) {
  const ink = THEME_INKS[t]
  for (const [tok, want] of [
    ['--text-tertiary', ink.textTertiary], ['--num-hero', ink.numHero],
    ['--role-ai-text', ink.roleAiText], ['--primary-foreground', ink.primaryForeground],
  ] as const) {
    check(`${t} ${tok} is ${want}`,
      new RegExp(`\\[data-theme="${t}"\\][\\s\\S]{0,1800}?${tok}:\\s*${want};`, 'i').test(css), want)
  }
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nAppearance: every value reachable, every preview honest.\n')
