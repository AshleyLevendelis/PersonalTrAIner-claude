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
  THEME_PREVIEWS, ACCENT_PREVIEWS, THEME_ORDER, ACCENT_ORDER, DARK_THEME_ORDER, LIGHT_THEME_ORDER,
  THEME_INKS, ACCENT_INKS, CONTRAST_FLOORS, resolveAccentColor, resolveInkOnFill,
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
// NINE themes, nine accent chips (8 hues + "Match theme"). The handoff's
// overview says "themes 5 -> 8" and its floors line says "all 8 themes", but
// its own body adds four to the shipped five and its settings spec draws
// "Dark (6)" and "Light (3)" — 9. The prototype's data has 6 dark + 3 light
// too. Built to the lists, which agree with each other, not to the arithmetic
// in the summary; pinned here so the number is a decision rather than a
// drifting count.
check('...and there are nine themes and nine accent chips (sanity check on this check)',
  THEME_ORDER.length === 9 && ACCENT_ORDER.length === 9, { themes: THEME_ORDER.length, accents: ACCENT_ORDER.length })
check('...of which eight accents are hues and one is "Match theme"',
  ACCENT_ORDER.filter(a => a !== 'theme').length === 8)
check('...split six dark and three light, which is what the sheet draws',
  DARK_THEME_ORDER.length === 6 && LIGHT_THEME_ORDER.length === 3
  && DARK_THEME_ORDER.every(t => !isLightTheme(t)) && LIGHT_THEME_ORDER.every(t => isLightTheme(t)),
  { dark: DARK_THEME_ORDER, light: LIGHT_THEME_ORDER })

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
  // AND ITS ACCENT. Found by mutation: pinning only the canvas let index.css
  // and the preview disagree about --theme-primary without a word, which is
  // the exact drift this duplication was justified by a gate against — and
  // the exact value Ashley's ruling just changed in two files at once. The
  // preview would then paint a colour the app does not use, on the one screen
  // whose entire job is showing you what you are choosing.
  check(`  ...and its --theme-primary matches the preview (${p.accent})`,
    new RegExp(`\\[data-theme="${name}"\\][\\s\\S]{0,1400}?--theme-primary:\\s*${p.accent};`, 'i').test(css), p.accent)
  // AND ITS TEXT STEP. Found by mutation: reverting index.css's
  // --primary-text for daylight to the value this round replaced left every
  // check green, because the floors read the TS palette and the palette was
  // still right. The app would have painted the old, failing colour while a
  // green gate said otherwise — the precise drift §3 exists to stop, on the
  // one token this round is about.
  const wantText = p.accentText === p.accent ? 'var\\(--theme-primary\\)' : p.accentText
  check(`  ...and its --primary-text matches the preview (${p.accentText})`,
    new RegExp(`\\[data-theme="${name}"\\][\\s\\S]{0,1600}?--primary-text:\\s*${wantText};`, 'i').test(css), p.accentText)
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

console.log('\n4. A light canvas changes two things, by rule not by combination\n')
// THREE LIGHT THEMES NOW, and the store and the palette have to agree about
// which — the store's flag drives the CSS rules, the palette's drives the
// preview, and a theme light in one and dark in the other previews a canvas
// the app will not paint.
for (const t of THEME_ORDER) {
  check(`${t}: the store and the palette agree on light vs dark (${isLightTheme(t) ? 'light' : 'dark'})`,
    isLightTheme(t) === THEME_PREVIEWS[t].light)
}
check('daylight, linen and frost are the light ones',
  THEME_ORDER.filter(t => isLightTheme(t)).join(',') === 'daylight,linen,frost',
  THEME_ORDER.filter(t => isLightTheme(t)))
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

// EVERY SHIPPED PAIR CLEARS THE FLOOR. This started as "some combination
// trips it, and they are all Daylight" — a true statement about a palette
// that shipped a theme warning about its own colour. Ashley's ruling darkened
// Daylight's accent to #008C72, and mint's dark step with it for the same
// reason, so the honest assertion is now the stronger one: nothing we ship
// asks a person to find a button they cannot see.
// RE-ANCHORED ONTO THE TEXT STEP, 6 Sep 2026, and the reason is the whole
// point of the themes handoff. This measured the FILL against the canvas: the
// colour of a button. That number was doing two jobs and now does one —
// Daylight's fill is #19B894 (2.27:1 on paper, and correctly so: a filled
// button is judged by the ink ON it, not by its edge against the page), while
// the words are #00705B. Measuring the fill after the split would have
// demanded a button dark enough to be readable AS TEXT, which is how the
// theme ended up with one over-darkened colour doing neither job well.
//
// So: the guard measures --primary-text, per the handoff. The fill gets its
// own floor instead — primary-foreground against primary — in §9.
const under: string[] = []
for (const th of THEME_ORDER) {
  for (const ac of ACCENT_ORDER) {
    const r = contrastRatio(resolveAccentColor(th, ac, /* forText */ true), THEME_PREVIEWS[th].canvas)
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
  contrastRatio('#00A88A', THEME_PREVIEWS.daylight.canvas) < CONTRAST_FLOOR,
  contrastRatio('#00A88A', THEME_PREVIEWS.daylight.canvas))
// #008C72 is what Daylight shipped as its single accent, and it is the exact
// value this round replaced: it measured 3.8:1 as words, over the 3:1 button
// floor and UNDER the 4.5:1 floor for body copy — which is what Ashley was
// reading when she said the light theme was hard to read.
check('...and the value it used to ship with fails the TEXT floor it was used at',
  contrastRatio('#008C72', THEME_PREVIEWS.daylight.canvas) < 4.5,
  contrastRatio('#008C72', THEME_PREVIEWS.daylight.canvas).toFixed(2))
check('Daylight\'s text step clears that floor', contrastRatio(THEME_PREVIEWS.daylight.accentText, THEME_PREVIEWS.daylight.canvas) >= 4.5,
  contrastRatio(THEME_PREVIEWS.daylight.accentText, THEME_PREVIEWS.daylight.canvas).toFixed(2))
check('...and its fill is a separate, lighter colour', THEME_PREVIEWS.daylight.accent !== THEME_PREVIEWS.daylight.accentText)

check('the guard exists and is a warning, not a block',
  /CONTRAST_FLOOR/.test(sheet) && !/disabled=\{lowContrast/.test(sheet))
// AND IT MEASURES THE INK, NOT THE FILL. Found by mutation: pointing the
// guard back at the fill left every check green while the sheet warned about
// Daylight's own button at 2.27:1 — a theme complaining about itself, which
// is the failure this codebase already fixed once by over-darkening a colour.
// The floors below measure both; the SHEET must measure what a person reads.
check('the in-app guard measures --primary-text, not the fill',
  /resolveAccentColor\(theme, accent, \/\* forText \*\/ true\)/.test(sheet)
  && /contrastRatio\(ink, t\.canvas\)/.test(sheet))
check('...and still keeps the fill for the button and the glow sample',
  /const resolved = resolveAccentColor\(theme, accent\)/.test(sheet))

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
    ['prim-text', CONTRAST_FLOORS.primaryText, (t: ThemeName) => [THEME_PREVIEWS[t].accentText, THEME_PREVIEWS[t].canvas]],
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
// An accent override replaces --primary-text and, on a light canvas, the fill
// and the ink on it. Those two floors therefore have to hold for all 81 pairs,
// not just for each theme's own accent.
{
  const textBelow: string[] = []
  const inkBelow: string[] = []
  for (const t of THEME_ORDER) {
    const light = THEME_PREVIEWS[t].light
    for (const a of ACCENT_ORDER) {
      const rText = contrastRatio(resolveAccentColor(t, a, /* forText */ true), THEME_PREVIEWS[t].canvas)
      if (rText < CONTRAST_FLOORS.primaryText) textBelow.push(`${t}+${a} ${rText.toFixed(2)}`)
      const rInk = contrastRatio(resolveInkOnFill(t, a, light), resolveAccentColor(t, a))
      if (rInk < CONTRAST_FLOORS.primaryForeground) inkBelow.push(`${t}+${a} ${rInk.toFixed(2)}`)
    }
  }
  const pairs = THEME_ORDER.length * ACCENT_ORDER.length
  check(`all ${pairs} pairs clear primary-text / canvas >= ${CONTRAST_FLOORS.primaryText}`,
    textBelow.length === 0, textBelow)

  // ------------------------------------------------------------------------
  // SIX PAIRS MISS primary-foreground / primary, AND THEY ARE NAMED RATHER
  // THAN HIDDEN. The handoff assigns white ink to sky/violet/coral/rose on a
  // light canvas. White on coral's #E8493A is 3.86 and on rose's #E85A78 is
  // 3.41 — under the 4.5 floor, on each of the three light themes.
  //
  // Not silently retuned, per the handoff's own instruction to report a value
  // that cannot meet its floor rather than change it. Pinned as an exact set
  // so a SEVENTH failure is a red gate, and so these six go green only by
  // being fixed, not by being forgotten. Measured alternatives, for whoever
  // picks the fix:
  //   rose  — a mapping problem. #08281F (already assigned to four other
  //           accents) measures 4.62 on the same fill and clears it.
  //   coral — a fill problem. White 3.86, #08281F 4.08, #3A0A16 4.41; no ink
  //           in this palette clears 4.5 against #E8493A. Needs a darker
  //           --accent-dark, which is a hue call.
  // ------------------------------------------------------------------------
  const KNOWN_INK_SHORTFALLS = [
    'daylight+coral 3.86', 'daylight+rose 3.41',
    'linen+coral 3.86', 'linen+rose 3.41',
    'frost+coral 3.86', 'frost+rose 3.41',
  ]
  check(`${pairs - KNOWN_INK_SHORTFALLS.length} of ${pairs} pairs clear primary-foreground / primary >= ${CONTRAST_FLOORS.primaryForeground}`,
    inkBelow.slice().sort().join('; ') === KNOWN_INK_SHORTFALLS.slice().sort().join('; '),
    { measured: inkBelow, expected: KNOWN_INK_SHORTFALLS })
  check('...and the six that do not are only the two light-canvas reds',
    inkBelow.every(x => /\+(coral|rose) /.test(x)), inkBelow)
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
for (const [a, ink] of Object.entries(ACCENT_INKS)) {
  check(`accent ${a} declares --accent-on ${ink}`,
    new RegExp(`\\[data-accent="${a}"\\][^}]*--accent-on:\\s*${ink};`, 'i').test(css), ink)
}
check('the light rule maps --primary-foreground to it',
  /\[data-canvas="light"\]\[data-accent\]:not\(\[data-accent="theme"\]\)[\s\S]{0,400}?--primary-foreground:\s*var\(--accent-on\);/.test(css))

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nAppearance: every value reachable, every preview honest.\n')
