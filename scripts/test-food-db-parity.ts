/**
 * Gate: the two food databases agree about allergens.
 *
 * There are TWO copies of the food database. src/lib/food-db.ts is what the
 * app reads; supabase/functions/_shared/food-db.ts is what meal generation
 * reads, and it exists because a Deno edge function cannot import across the
 * src/lib boundary. Nothing kept them in step.
 *
 * That matters most for allergens, and it is why this gate was written BEFORE
 * the five untagged allergens were tagged rather than after: a tag added to
 * one file protects nothing in the other, and the result would look finished.
 * A half-safe allergen filter is worse than an obviously missing one, because
 * it gets trusted.
 *
 * Measured when this was written: 332 foods app-side, 323 server-side — 9
 * app-only, 0 server-only. This asserts the direction that matters (nothing
 * servable is untagged relative to the app's view) rather than demanding the
 * files be identical, which they are not and need not be.
 *
 * Parsed from source rather than imported: the edge-function copy is Deno
 * code with Deno-style imports, so a plain tsx import of it is not portable.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

/** Every `f('name', [...], {...}, 'cat', { tags })` entry, name -> allergen tags. */
function parseFoods(rel: string): Map<string, Set<string>> {
  const src = readFileSync(join(ROOT, rel), 'utf8')
  const out = new Map<string, Set<string>>()
  // The tag object is the 5th argument. Rather than parse arguments properly,
  // take the whole single-line entry and pull `contains_*: true` out of it —
  // every allergen tag lives in that object and nowhere else on the line.
  for (const line of src.split('\n')) {
    const m = /^\s*f\('([^']+)'/.exec(line)
    if (!m) continue
    const tags = new Set([...line.matchAll(/(contains_[a-z_]+):\s*true/g)].map(t => t[1]))
    out.set(m[1], tags)
  }
  return out
}

const app = parseFoods('src/lib/food-db.ts')
const server = parseFoods('supabase/functions/_shared/food-db.ts')

console.log('\n1. Both copies parsed')
check('the app copy has foods', app.size > 200, app.size)
check('the server copy has foods', server.size > 200, server.size)

console.log('\n2. Nothing meal generation can serve is missing from the app copy')
{
  // The server copy is what actually ends up on a plate. A food it has and
  // the app does not is one the app cannot reason about at all.
  const serverOnly = [...server.keys()].filter(n => !app.has(n))
  check('no server-only foods', serverOnly.length === 0, serverOnly)
}

console.log('\n3. Shared foods carry IDENTICAL allergen tags')
{
  // The one that matters. A food tagged contains_sesame in the app and
  // untagged on the server is filtered in the UI and served on the plate.
  const mismatches: string[] = []
  for (const [name, appTags] of app) {
    const serverTags = server.get(name)
    if (!serverTags) continue
    const a = [...appTags].sort().join(',')
    const b = [...serverTags].sort().join(',')
    if (a !== b) mismatches.push(`${name}: app[${a || 'none'}] vs server[${b || 'none'}]`)
  }
  check('every shared food agrees on its allergen tags', mismatches.length === 0, mismatches.slice(0, 10))
  check(`...and there were enough shared foods to mean something`,
    [...app.keys()].filter(n => server.has(n)).length > 200)
}

console.log('\n4. The known allergen ingredients are tagged in BOTH')
{
  // Named explicitly because these four are why this work exists: they were
  // real, servable entries with empty tag sets.
  for (const [food, tag] of [
    ['celery', 'contains_celery'],
    ['mustard', 'contains_mustard'],
    ['sesame oil', 'contains_sesame'],
    ['sesame seeds', 'contains_sesame'],
  ] as [string, string][]) {
    check(`"${food}" is ${tag} in the app copy`, app.get(food)?.has(tag) === true, [...(app.get(food) ?? [])])
    check(`"${food}" is ${tag} on the server`, server.get(food)?.has(tag) === true, [...(server.get(food) ?? [])])
  }
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll food-db parity checks passed.\n')
