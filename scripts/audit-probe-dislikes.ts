import { containsPhrase } from '../src/lib/meal-ingredients'
import { FOOD_DB } from '../src/lib/food-db'

const names = FOOD_DB.map(f => f.name)
console.log(`food DB entries: ${names.length}`)

const cases: { typed: string; shouldCatch: RegExp; label: string }[] = [
  { typed: 'nuts',          shouldCatch: /almond|cashew|walnut|peanut|pistachio|hazelnut|pecan/i, label: 'nut-bearing foods' },
  { typed: 'dairy',         shouldCatch: /milk|cheese|yog|butter|cream|whey/i,                    label: 'dairy foods' },
  { typed: 'almond butter', shouldCatch: /almond/i,                                               label: 'almond products' },
  { typed: 'seafood',       shouldCatch: /salmon|tuna|cod|prawn|shrimp|crab|mussel|haddock|mackerel|sardine/i, label: 'seafood' },
  { typed: 'red meat',      shouldCatch: /beef|lamb|steak|mince|pork/i,                           label: 'red meats' },
  { typed: 'gluten',        shouldCatch: /bread|pasta|couscous|flour|wheat|barley|noodle|oat/i,   label: 'gluten-ish grains' },
  { typed: 'soy',           shouldCatch: /soy|tofu|edamame|tempeh|miso/i,                         label: 'soy foods' },
  { typed: 'eggs',          shouldCatch: /\begg/i,                                                label: 'egg foods' },
  { typed: 'onions',        shouldCatch: /onion|shallot|scallion|leek/i,                          label: 'onion family' },
  { typed: 'spicy food',    shouldCatch: /chilli|chili|jalape|cayenne|sriracha|harissa|paprika/i, label: 'spicy items' },
  { typed: 'mushrooms',     shouldCatch: /mushroom/i,                                             label: 'mushrooms' },
]

let totalMeant = 0, totalCaught = 0
for (const c of cases) {
  const meant = names.filter(n => c.shouldCatch.test(n))
  if (meant.length === 0) { console.log(`\n"${c.typed}": no DB entries match the intent — skipped`); continue }
  const caught = meant.filter(n => containsPhrase(n, [], c.typed))
  const missed = meant.filter(n => !caught.includes(n))
  totalMeant += meant.length; totalCaught += caught.length
  console.log(`\n"${c.typed}" -> ${c.label}: catches ${caught.length}/${meant.length} (${Math.round(100*caught.length/meant.length)}%)`)
  if (missed.length) console.log(`   MISSED: ${missed.slice(0, 8).join(', ')}${missed.length > 8 ? `, +${missed.length - 8} more` : ''}`)
}
console.log(`\nOVERALL: ${totalCaught}/${totalMeant} foods the user plainly meant are matched (${Math.round(100*totalCaught/totalMeant)}%)`)

// --- Second half: would the app's OWN smarter resolver have caught them? ---
import { lookupIngredient } from '../src/lib/food-db'
console.log('\n\n=== The app already owns a better matcher and the dislike filter does not use it ===')
const singulars = ['eggs', 'onions', 'mushrooms', 'almonds', 'tomatoes', 'potatoes', 'chickpeas', 'olives']
for (const typed of singulars) {
  const viaSubstring = names.filter(n => containsPhrase(n, [], typed)).length
  const viaLookup = lookupIngredient(typed)
  console.log(`  "${typed}": substring match -> ${viaSubstring} foods | lookupIngredient -> ${viaLookup ? `"${viaLookup.name}"` : 'no match'}`)
}
