/**
 * Gate: an untagged allergen (celery, sesame, mustard, lupin, sulphites)
 * recorded as a food dislike gets a caveat on its RECEIPT, naming the
 * hidden forms — not just a silent "recorded" row.
 *
 * WHY THE RECEIPT AND NOT THE MODEL'S WORDS: chat-gemini's ALLERGEN_HONESTY_
 * BLOCK instructs the coach to say this caveat in words and offer the
 * hidden forms — but record_fact's server handler always returns
 * `reply: ""` (the receipt speaks, by design, the same D1 shape every
 * propose_ and record_ tool uses), so whatever the model writes on that turn
 * never reaches the user regardless of the prompt. Found by the first real
 * coach-exam run, 23 Sep 2026: "avoid sesame" was saved with nothing said
 * about the app having no automated check for it at all — the exact false-
 * reassurance outcome the exam case exists to catch. Fixed deterministically
 * in resolveAndSaveMemory's receipt-building instead, so it fires whether or
 * not the model said anything that turn.
 *
 * `resolveAndSaveMemory` is a closure inside ChatAssistant.tsx (uses
 * `profile`, `mealPlan` from component scope), so it can't be imported and
 * called directly — this gate reads the source instead, the established
 * pattern for logic embedded in this file's closures. NOT browser-driven:
 * driving it live needs either a real model call or a way to inject a
 * confirmed record_fact proposal into the harness's pending-actions store,
 * neither of which exists yet. Source-verified only; say so rather than
 * claiming more.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

console.log('\n1. The five untagged allergens (from chat-gemini\'s own list) all have hidden forms named\n')
{
  const at = src.indexOf('UNTAGGED_ALLERGEN_HIDDEN_FORMS')
  const tableEnd = src.indexOf('}', at)
  const table = src.slice(at, tableEnd + 1)
  check('table found (sanity check)', table.length > 50, table.length)
  for (const allergen of ['celery', 'sesame', 'mustard', 'lupin', 'sulphite']) {
    check(`names hidden forms for ${allergen}`, new RegExp(`\\b${allergen}s?:\\s*'[^']+'`).test(table), table)
  }
}

console.log('\n2. The caveat fires ONLY for a food dislike, in the branch that builds its receipt\n')
{
  const fnAt = src.indexOf('const resolveAndSaveMemory =')
  const fnBody = src.slice(fnAt, fnAt + 8000)
  const foodPrefAt = fnBody.indexOf("if (kind === 'food_preference' && polarity === 'dislike')")
  check('the food_preference/dislike branch exists (sanity check)', foodPrefAt !== -1, foodPrefAt)
  const stillPresentAt = fnBody.indexOf('stillPresent', foodPrefAt)
  const hiddenFormsAt = fnBody.indexOf('UNTAGGED_ALLERGEN_HIDDEN_FORMS', foodPrefAt)
  check('the lookup is used inside that branch, after the "still has it" check', hiddenFormsAt !== -1 && stillPresentAt !== -1 && stillPresentAt < hiddenFormsAt)
  // Scoped by targetPhrase, not the raw origin quote — the same word the
  // filter itself matches on, per ALLERGEN_HONESTY_BLOCK's own "purely on
  // the word said" description.
  const lookupLine = fnBody.slice(hiddenFormsAt, fnBody.indexOf(']', hiddenFormsAt) + 1)
  check('keyed off targetPhrase, lowercased and trimmed — the same word the filter matches on',
    /targetPhrase\.trim\(\)\.toLowerCase\(\)/.test(lookupLine), lookupLine)
}

console.log('\n3. The receipt row is honest: says there is no check, and names the hidden forms\n')
{
  const at = src.indexOf('No automated check for this one')
  check('the row label says plainly there is no check', at !== -1)
  const detailSlice = src.slice(at, at + 400)
  check('...and the detail says it works only on the exact word', /works only on the exact word/i.test(detailSlice), detailSlice.slice(0, 200))
  check('...and names the hidden forms it found', /hiddenForms/.test(detailSlice))
  check('...and invites the user to add them, rather than adding them unasked (I1: only the client writes, and never silently)',
    /if you want those added too/i.test(detailSlice))
}

console.log('\n4. An ORDINARY dislike (not in the table) never gets this row — a plain object lookup returns undefined for anything else, checked directly\n')
{
  const table: Record<string, string> = {
    sesame: 'tahini, hummus, and halva',
    celery: 'stock cubes and stock',
    mustard: 'mayonnaise, salad dressings, and curry sauces',
    lupin: 'lupin flour, used in some gluten-free breads and pasta',
    sulphite: 'dried fruit, wine, and wine vinegar',
    sulphites: 'dried fruit, wine, and wine vinegar',
  }
  for (const ordinary of ['broccoli', 'mushrooms', 'olives', 'nuts', 'gluten', 'dairy']) {
    check(`"${ordinary}" is not in the table (a real ordinary dislike, or a TAGGED allergen with its own separate honesty rule)`, table[ordinary] === undefined)
  }
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nAn untagged allergen dislike gets an honest receipt, with the hidden forms named — whether or not the model said anything.\n')
