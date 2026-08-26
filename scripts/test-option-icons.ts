// ---------------------------------------------------------------------------
// No two options in one question may share an icon — unless the whole list
// shares one on purpose.
//
// FOUND BY LOOKING, which is the point. `npm run render:screens` put the real
// onboarding questions on screen for the first time, and two collisions were
// visible immediately:
//
//   dietaryPreferences   🐟  ← Pescatarian  /  Fish-Free
//   injuries             💪  ← Shoulders    /  Elbows
//
// The first is the serious one: ONE icon standing for both "I eat fish" and
// "I cannot eat fish", on the allergen path. The second sits on the question
// that drives injury filtering. Neither is cosmetic — both are places where a
// mis-tap has a consequence, and an icon exists precisely so the list can be
// scanned without reading every label.
//
// No gate could have caught them, because every other gate in this repo
// reasons about values and tags. `value` was correct in both cases; only the
// picture was wrong. So this checks the pictures.
//
// UNIFORM LISTS ARE EXEMPT, and the distinction is the whole design of this
// check. trainingDays is seven 📅 and mealsPerDay is three 🍽️ — there, the
// icon is a shared frame and the LABEL carries every bit of meaning ("Mon"
// vs "Tue"). A duplicate is only a defect when the icons are supposed to
// distinguish; a list where they all match cannot mislead anyone about which
// is which. Exempted by the property "all of them are identical", never by
// naming the slot — a hand-maintained allowlist would have to be edited to
// stay honest, and would eventually be edited to stay quiet.
// ---------------------------------------------------------------------------

import { ONBOARDING_SLOTS } from '../src/lib/onboarding-slots'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

console.log('\n1. Within one question, an icon means one thing')

let listsChecked = 0
let uniformLists = 0

for (const def of ONBOARDING_SLOTS) {
  const options = def.options
  if (!options || options.length < 2) continue

  const icons = options.map(o => (o as { icon?: string }).icon ?? '')
  const distinct = new Set(icons)

  // The uniform case: every option carries the same icon, so it is decoration
  // around a label that does the distinguishing.
  if (distinct.size === 1) {
    uniformLists++
    check(`${def.key} — uniform icon set (${options.length}× ${icons[0]}), label carries the meaning`, true)
    continue
  }

  listsChecked++
  const byIcon = new Map<string, string[]>()
  options.forEach((o, i) => {
    const icon = icons[i]
    if (!byIcon.has(icon)) byIcon.set(icon, [])
    byIcon.get(icon)!.push(String(o.label))
  })
  const collisions = [...byIcon].filter(([, labels]) => labels.length > 1)
  check(
    `${def.key} — ${options.length} options, ${distinct.size} distinct icons`,
    collisions.length === 0,
    collisions.map(([icon, labels]) => `${icon} used for ${labels.join(' AND ')}`).join(' | '),
  )

  // An empty icon is not a collision but is still a hole in the same surface.
  check(`${def.key} — every option has an icon`, icons.every(i => i.length > 0),
    options.filter((_, i) => !icons[i]).map(o => String(o.label)).join(', '))
}

console.log('\n2. The check is not vacuous')
check(`there are lists where icons must distinguish (${listsChecked})`, listsChecked >= 8, String(listsChecked))
check(`...and uniform lists are recognised rather than flagged (${uniformLists})`, uniformLists >= 1, String(uniformLists))

console.log('\n3. The two that started this, named so a revert is loud')
{
  const diet = ONBOARDING_SLOTS.find(s => s.key === 'dietaryPreferences')!.options!
  const iconOf = (label: string) => (diet.find(o => o.label === label) as { icon?: string } | undefined)?.icon
  check('Pescatarian and Fish-Free do not share an icon — opposite meanings on the allergen path',
    iconOf('Pescatarian') !== iconOf('Fish-Free'),
    `${iconOf('Pescatarian')} vs ${iconOf('Fish-Free')}`)

  const inj = ONBOARDING_SLOTS.find(s => s.key === 'injuries')!.options!
  const injIcon = (label: string) => (inj.find(o => o.label === label) as { icon?: string } | undefined)?.icon
  check('Shoulders and Elbows do not share an icon — this list drives injury filtering',
    injIcon('Shoulders') !== injIcon('Elbows'),
    `${injIcon('Shoulders')} vs ${injIcon('Elbows')}`)
}

console.log('\n4. Icons are presentation — the values they sit beside are untouched')
{
  // The real safety property. An icon change must never move a value, because
  // values ARE the enforcement contract (diet-rules' FORBIDDEN_TAGS keys, and
  // the injury codes every filter matches on).
  const diet = ONBOARDING_SLOTS.find(s => s.key === 'dietaryPreferences')!.options!
  const inj = ONBOARDING_SLOTS.find(s => s.key === 'injuries')!.options!
  const dietValues = diet.map(o => String(o.value)).sort()
  const injValues = inj.map(o => String(o.value)).sort()
  check(`dietary values unchanged (${dietValues.length})`,
    dietValues.join(',') === [
      'dairy-free', 'egg-free', 'fish-free', 'gluten-free', 'halal', 'keto', 'kosher',
      'low-carb', 'low-fodmap', 'mediterranean', 'nut-free', 'paleo', 'pescatarian',
      'shellfish-free', 'soy-free', 'vegan', 'vegetarian',
    ].join(','), dietValues.join(','))
  check(`injury values unchanged (${injValues.length})`,
    injValues.join(',') === ['ankles', 'elbows', 'hips', 'knees', 'lower_back', 'neck', 'shoulders', 'wrists'].join(','),
    injValues.join(','))
}

console.log(failures === 0 ? '\nAll option-icon checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
