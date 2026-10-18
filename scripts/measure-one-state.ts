// measure:one-state — how many of the library's dishes are written cooked, and how far each moves when its lines are
// weighed raw or dry (runs 7-10, H36/M64, 18 Oct 2026). The main nutrient is carried line by line (weighedFactor), so
// calories move by a few percent except chicken thigh. RUN ON 18 OCT, before the library was rewritten as bought: 229
// of 1,578 lines in 168 of 290 dishes; largest change to a dish: calories -15.6% (thigh), protein -6.8%, carbs -3.4%.
// The library was then rewritten raw and dry, so it now reports 0 (test:one-state holds that). Her own stored pools
// are not readable from a cloud session, so they are not in this count. docs/plans/one-state-raw-dry.md.
async function main() {
  const { MEAL_LIBRARY } = await import('../src/lib/meal-library-data')
  const { parseIngredientLines } = await import('../src/lib/portion-scaler')
  const { computeMealMacros } = await import('../src/lib/food-db')
  const { asWeighedLines } = await import('../src/lib/as-weighed')
  let lines = 0, converted = 0, dishesMoved = 0
  const worst = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  const worstRel = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  const examples: string[] = []
  for (const dish of MEAL_LIBRARY) {
    const parsed = parseIngredientLines(dish.ingredients)
    const weighed = asWeighedLines(parsed)
    lines += parsed.length
    const n = weighed.filter((l, i) => l.name !== parsed[i].name).length
    converted += n
    if (n === 0) continue
    dishesMoved++
    const a = computeMealMacros(parsed), b = computeMealMacros(weighed)
    const d = { calories: b.kcal - a.kcal, protein: b.protein - a.protein, carbs: b.carbs - a.carbs, fat: b.fat - a.fat }
    for (const k of Object.keys(worst) as (keyof typeof worst)[]) {
      const base = k === 'calories' ? a.kcal : (a as unknown as Record<string, number>)[k]
      if (Math.abs(d[k]) > Math.abs(worst[k])) worst[k] = Math.round(d[k] * 10) / 10
      if (base > 0 && Math.abs(d[k]) / base * 100 > Math.abs(worstRel[k])) worstRel[k] = Math.round((d[k] / base) * 1000) / 10
    }
    if (examples.length < 3) examples.push(`${dish.name}: ${parsed.map(l => `${l.quantity}${l.unit} ${l.name}`).join(', ')} -> ${weighed.map(l => `${l.quantity}${l.unit} ${l.name}`).join(', ')}`)
  }
  console.log(`library: ${MEAL_LIBRARY.length} dishes, ${lines} lines`)
  console.log(`written cooked and weighed raw or dry on read: ${converted} lines in ${dishesMoved} dishes`)
  console.log(`largest change to a dish (absolute): ${JSON.stringify(worst)}`)
  console.log(`largest change to a dish (% of that number): ${JSON.stringify(worstRel)}`)
  for (const e of examples) console.log(`  e.g. ${e}`)
}
main().catch(e => { console.error(e); process.exit(1) })
