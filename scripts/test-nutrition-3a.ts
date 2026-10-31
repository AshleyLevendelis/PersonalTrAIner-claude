/**
 * test:nutrition-3a — the Nutrition screen as design 3a (closed) and 3b (the recipe sheet), 31 Oct 2026.
 *
 * Her ruling on the handoff: "build, keep my rulings". Presentation only, and nothing the screen could do is gone.
 * This holds the parts a reader of the code can be wrong about without any picture looking different:
 *
 *   1. The method as numbered steps loses no word of the method it splits (the text it splits is the one the
 *      display-time checks already passed; a split that dropped a sentence would be a silent edit of a recipe).
 *   2. THE SHEET HOLDS EVERY CONTROL THE OPEN ROW HAD. The meal row used to open in place with swap, find more,
 *      regenerate, move, add a food, change a food, the heart, the log button, every warning and every Undo
 *      line. Each one is named here and must be inside the sheet; the row itself carries no change control.
 *   3. The rows: one list in the day's order from the same mealSections call, a status circle per state, and a
 *      later meal drawn in a softer ink that clears 4.5:1 on EVERY theme (read from the theme file, so a theme
 *      edit that sinks it fails here), never by lowering opacity.
 *   4. The "Today's meals" row: the grocery list's Nutrition door and the + that is "Log something else" (her
 *      M51 rule: off-plan food goes through the coach), moved there and not left behind as a second copy.
 *   5. The top card keeps her 17 Oct ruling: no rings here, the legend's rows in order, water logged from its row.
 *
 * What the screen DOES with all of this is verify:nutrition-3a (a real Chromium at 390px).
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { methodSteps } from '../src/lib/method-steps'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const meals = strip(read('src/components/MealPlan.tsx'))
const nut = strip(read('src/components/NutritionDisplay.tsx'))
const css = read('src/index.css')

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

// ---------------------------------------------------------------------------
console.log('\n1. The method as numbered steps loses nothing')
// ---------------------------------------------------------------------------
{
  const words = (s: string) => s.split(/\s+/).filter(Boolean)
  const para = 'Season the chicken and sear it skin-side down until golden, then finish it in the oven. Rest it before slicing.'
  check('a paragraph becomes a step per sentence', JSON.stringify(methodSteps(para)) === JSON.stringify([
    'Season the chicken and sear it skin-side down until golden, then finish it in the oven.', 'Rest it before slicing.',
  ]), methodSteps(para))
  const lines = '1. Rinse the rice and simmer, lid on.\n2) Pan-fry the chicken until golden.\nStep 3: Slice and serve over the rice.'
  check('a method written one step per line keeps its lines, and drops its own numbers (the sheet numbers them)',
    JSON.stringify(methodSteps(lines)) === JSON.stringify(['Rinse the rice and simmer, lid on.', 'Pan-fry the chicken until golden.', 'Slice and serve over the rice.']), methodSteps(lines))
  check('a decimal or a temperature does not end a step', methodSteps('Simmer for 1.5 hours at 90°C. Serve hot.').length === 2, methodSteps('Simmer for 1.5 hours at 90°C. Serve hot.'))
  check('one sentence is one step, and nothing is no steps', methodSteps('Stir it all together.').length === 1 && methodSteps('').length === 0 && methodSteps('  \n ').length === 0)
  // LOSSLESS: every word of the method is in exactly one step, in order (the numbering of a numbered line aside).
  const cases = [para, lines, 'Toast the oats! Then add the yoghurt? Top with berries.', 'Mix.\n\nBake until set.', 'Whisk the eggs. e.g. three. Cook gently.']
  const unnumbered = (m: string) => m.split(/\n+/).map(l => l.replace(/^\s*(?:step\s*)?\d+\s*[.):-]\s*/i, '')).join(' ')
  const lost = cases.filter(m => words(methodSteps(m).join(' ')).join(' ') !== words(unnumbered(m)).join(' '))
  check('no word of any method is lost or added by the split', lost.length === 0, lost)
  check('the sheet draws those steps from the one method value the display checks passed', /methodSteps\(method\)\.map\(/.test(meals) && /const method = option \? methodToShow\(/.test(meals))
}

// ---------------------------------------------------------------------------
console.log('\n2. The recipe sheet holds every control the open row had')
// ---------------------------------------------------------------------------
const sheetAt = meals.indexOf('{sheetOpen && option && (')
const sheetEnd = meals.indexOf('function MealStatus')
const sheet = sheetAt < 0 || sheetEnd < sheetAt ? '' : meals.slice(sheetAt, sheetEnd)
const rowStart = meals.indexOf('function MealSlotRow(')
const rowOnly = rowStart < 0 || sheetAt < rowStart ? '' : meals.slice(meals.indexOf('  return (', meals.indexOf('const sheetRef', rowStart)), sheetAt)
check('the sheet exists, inside the meal row (sanity check on every check below)', sheet.length > 0 && rowOnly.length > 0 && /data-meal-row=\{slot\}/.test(rowOnly), { sheetAt, sheetEnd, rowStart })
const controls: [string, RegExp][] = [
  ['"I ate this" — the log, and its undo ("Logged")', /onClick=\{handleLogToggle\}[\s\S]{0,1400}'I ate this'/],
  ['the heart', /onClick=\{\(\) => void handleFavouriteToggle\(\)\}[\s\S]{0,600}data-meal-favourite=/],
  ['its failure line', /data-testid="meal-favourite-error"/],
  ['every ingredient line, and its Change (the edit sheet)', /data-ingredient-row=\{line\}[\s\S]{0,1200}<MealFoodEditSheet/],
  ['what an edit did', /\{editNote && /],
  ['Add food, and its sheet', /data-testid="meal-food-add-open"[\s\S]{0,1200}<MealFoodAddSheet/],
  ['what an add did', /\{addNote && /],
  ['the cook-once lines', /COOK_ONCE\.lunch[\s\S]{0,400}COOK_ONCE\.dinner[\s\S]{0,800}cookAndKeep\(/],
  ['the method', /data-meal-method=\{option\.name\}/],
  ['the tags', /displayTags\(option\.tags\)\.map\(/],
  ['the "your plan now shows" line', /\{planMovedOn && \(/],
  ['Move, its sheet and its Undo', /data-testid="meal-move-open"[\s\S]{0,2400}<MealMoveSheet[\s\S]{0,2400}data-testid="meal-move-undo"/],
  ['Regenerate this meal', /onClick=\{handleRegenerate\}/],
  ['the swap list (each dish a button)', /otherOptions\.map\(alt =>[\s\S]{0,1200}onClick=\{\(\) => handleChoose\(alt\.name\)\}/],
  ['the restriction check on every dish offered', /checkAlternative\(alt\)/],
  ['More options (find more), and what it found', /await onFindMore\(slot\)[\s\S]{0,1200}\{findMoreNote && /],
  ['what a swap did to the rest of the day', /data-testid="swap-knock-on"/],
  ['the restriction warning', /\{blocked && !isLogged && restriction\?\.message && \(/],
  ['the logged-twice warning', /\{duplicated && \(/],
  ['a way to close it', /onClick=\{onToggle\}[\s\S]{0,300}aria-label="Close"/],
]
for (const [what, re] of controls) check(`the sheet has ${what}`, re.test(sheet))
check('the row itself has no log, swap or change control of its own (one place for each, the sheet)',
  !/handleLogToggle|handleChoose|setMoveOpen|setAddOpen|handleFavouriteToggle/.test(rowOnly) && (rowOnly.match(/onClick=\{handleRegenerate\}/g) ?? []).length <= 1
  && /\{!option && !upcoming && \(\s*<Button[^>]*onClick=\{handleRegenerate\}/.test(rowOnly))
check('a tap on the row opens the sheet (the row is one button)', /<button\s+type="button"\s+onClick=\{onToggle\}\s+disabled=\{!option\}\s+aria-haspopup="dialog"/.test(rowOnly))
check('the sheet is a modal dialog over a dimmed page that does not scroll under it',
  /role="dialog"\s+aria-modal="true"/.test(sheet) && /data-meal-sheet-scrim/.test(sheet) && /document\.body\.style\.overflow = 'hidden'/.test(meals))

// ---------------------------------------------------------------------------
console.log('\n3. The rows')
// ---------------------------------------------------------------------------
check('one list in the day\'s order, each row\'s state from the same mealSections call',
  /activeSlots\.map\(slot => rowFor\(slot, eatenSlots\.includes\(slot\) \? 'eaten' : slot === upNextSlot \? 'upnext' : 'later'\)\)/.test(meals)
  && /mealSections\(\{/.test(meals))
{
  const status = meals.slice(meals.indexOf('function MealStatus'), meals.indexOf('function MacroLine'))
  check('a 26px status circle: eaten filled with a tick, next a glowing ring, later a faint ring',
    (status.match(/size-\[26px\]/g) ?? []).length === 3 && /variant === 'eaten'[\s\S]{0,300}background: 'var\(--primary\)'[\s\S]{0,200}<Check/.test(status)
    && /variant === 'upnext'[\s\S]{0,200}border: '2px solid var\(--primary\)'[\s\S]{0,40}boxShadow/.test(status))
  check('...and never an opacity', !/opacity/.test(status))
}
{
  // THE SOFT INK, read from the code, then measured against every theme's page and sheet colours.
  const softInk = /color: soft \? 'var\(--([\w-]+)\)'/.exec(meals)?.[1] ?? null
  const full = /color: soft \? 'var\(--[\w-]+\)' : 'var\(--([\w-]+)\)'/.exec(meals)?.[1] ?? null
  check('a later meal\'s name is drawn in a theme colour of its own, not the full ink', !!softInk && !!full && softInk !== full, { softInk, full })
  check('...and no opacity is tied to it', !/soft[^\n]{0,160}opacity|opacity[^\n]{0,160}soft/.test(meals))
  const themes: Record<string, Record<string, string>> = {}
  for (const m of css.matchAll(/\[data-theme="([\w-]+)"\]\s*\{([\s\S]*?)\n\}/g)) {
    const vars: Record<string, string> = {}
    for (const v of m[2].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[v[1]] = v[2]
    themes[m[1]] = vars
  }
  const lum = (hex: string) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const names = Object.keys(themes)
  check('the theme file has its nine themes (sanity check on the contrast check below)', names.length === 9, names)
  const below = names.flatMap(t => {
    const ink = softInk ? themes[t][softInk] : undefined
    return (['background', 'surface-deep'] as const)
      .map(bg => ({ t, bg, ink, on: themes[t][bg], r: ink && themes[t][bg] ? Math.round(ratio(ink, themes[t][bg]) * 100) / 100 : 0 }))
      .filter(x => x.r < 4.5)
  })
  check('the later ink clears 4.5:1 on the page and on the sheet, in every theme', below.length === 0, below)
}

// ---------------------------------------------------------------------------
console.log('\n4. "Today\'s meals": the grocery pill and the +')
// ---------------------------------------------------------------------------
{
  const at = nut.indexOf('data-meals-header')
  const row = at < 0 ? '' : nut.slice(at, nut.indexOf('{upcomingDay ? (', at))
  check('the row carries the grocery list pill (the Nutrition door to the list)', /onClick=\{\(\) => \{ window\.location\.hash = groceryHash\(\) \}\}[\s\S]{0,400}data-grocery-pill/.test(row))
  check('...and the round + that starts "I also ate " in the coach (her M51 rule)', /setChatPrefill\('I also ate '\); window\.location\.hash = tabHash\('chat'\)[\s\S]{0,400}aria-label="Log something else"/.test(row))
  check('...which is today\'s only: an upcoming day has nothing to log', /\{!upcomingDay && \(\s*<button[\s\S]{0,400}setChatPrefill\('I also ate '\)/.test(row))
  check('it moved there: the meal list has no second "Log something else"', !/setChatPrefill|Log something else|data-log-something-else/.test(meals))
}

// ---------------------------------------------------------------------------
console.log('\n5. The top card keeps her rulings')
// ---------------------------------------------------------------------------
check('no rings on Nutrition (17 Oct: rings live on Home only)', !/<RingMeter|<circle/.test(nut))
check('the legend\'s rows are protein, carbs, fat, water, in that order',
  /<LegendRow k="protein"[\s\S]{0,300}<LegendRow k="carbs"[\s\S]{0,300}<LegendRow k="fat"[\s\S]{0,300}<LegendRow\s+k="water"/.test(nut))
check('the water row logs water: it opens the quick-add', /<LegendRow\s+k="water"[\s\S]{0,400}onClick=\{\(\) => setWaterOpen\(o => !o\)\}/.test(nut))
check('the calories left (or over) come from the phrasebook', /kcalLeftOrOver\(macros\.calories - eaten\.kcal\)/.test(nut) && /data-testid="kcal-left">kcal \{word\}/.test(nut))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
console.log('Nutrition 3a/3b: the sheet holds every control, the steps lose nothing, the later ink is readable on every theme.')
