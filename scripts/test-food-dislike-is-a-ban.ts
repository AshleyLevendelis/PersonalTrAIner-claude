// ---------------------------------------------------------------------------
// Gate: a food you say you dislike is never served to you again.
//
// Ashley typed "I don't like almond butter" and the app answered "not keen on
// almond butter — recorded — biases suggestions, nothing removed". Then she
// regenerated, the meal changed, and it looked fixed.
//
// It was not. Three things were wrong at once:
//
//   1. A SOFT FOOD DISLIKE HAD NO READER ANYWHERE. There is a compiler for
//      hard food dislikes, one for soft food LIKES, one for soft EXERCISE
//      dislikes — and none for a soft food dislike. It was written, shown
//      back in the memory screen, and consulted by nothing, including the
//      regenerate. Her meal changed by coincidence; the almond butter could
//      return on the next one.
//   2. So "biases suggestions" was FALSE. The same defect
//      compileSoftExercisePreferences already records against itself: a claim
//      naming a consumer that does not exist.
//   3. The "today's plan still has it" warning and the swap offer were both
//      gated on hardness === 'hard', so the mild filing silenced them.
//
// Ashley's ruling, offered the alternative of building the missing bias:
// "treat it as don't serve it."
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { compileFoodDislikes, compileSoftFoodPreferences, compileSoftExercisePreferences, compileExerciseExclusions } from '../src/lib/fact-compiler'
import type { UserFactRow } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const fact = (o: Partial<UserFactRow>): UserFactRow => ({
  id: 'x', profile_id: 'p', kind: 'food_preference', source: 'chat',
  raw_phrase: '', display_text: '', polarity: 'dislike', hardness: 'soft',
  resolved_refs: [], ...o,
} as UserFactRow)

console.log('\n1. Ashley\'s exact row now filters — no migration, no re-typing')
{
  // The row her account already holds, filed soft because of how she phrased it.
  const hers = fact({ polarity: 'dislike', hardness: 'soft', resolved_refs: ['almond butter'] })
  check('the soft row she already has is now a filter', compileFoodDislikes([hers]).includes('almond butter'))
  const explicit = fact({ polarity: 'dislike', hardness: 'hard', resolved_refs: ['almond butter'] })
  check('...and an explicitly-worded ban still is', compileFoodDislikes([explicit]).includes('almond butter'))
  check('...so how she phrased it no longer changes the outcome',
    JSON.stringify(compileFoodDislikes([hers])) === JSON.stringify(compileFoodDislikes([explicit])))
}

console.log('\n2. It bans food dislikes, and nothing else')
{
  const likes = fact({ polarity: 'like', hardness: 'soft', resolved_refs: ['salmon'] })
  check('a food they LIKE is never turned into a ban', !compileFoodDislikes([likes]).includes('salmon'))
  check('...and still reaches the likes bias', compileSoftFoodPreferences([likes]).includes('salmon'))

  const softEx = fact({ kind: 'exercise_preference', polarity: 'dislike', hardness: 'soft', resolved_refs: ['Burpees'] })
  check('a mild EXERCISE dislike stays mild', !compileExerciseExclusions([softEx]).includes('Burpees'))
  check('...and still reaches swap ranking', compileSoftExercisePreferences([softEx]).disliked.includes('Burpees'))
  check('...and is not swept into the food filter', compileFoodDislikes([softEx]).length === 0)

  const hardEx = fact({ kind: 'exercise_preference', polarity: 'dislike', hardness: 'hard', resolved_refs: ['Lunges'] })
  check('a hard exercise exclusion is untouched', compileExerciseExclusions([hardEx]).includes('Lunges'))
}

console.log('\n3. Nothing recorded about food can be inert again')
{
  // The property, not the instance: every combination of a food dislike must
  // land in the filter. This is what "read by nothing" failed.
  const both = (['hard', 'soft'] as const).map(h =>
    compileFoodDislikes([fact({ polarity: 'dislike', hardness: h, resolved_refs: ['mushrooms'] })]))
  check('every hardness of food dislike reaches the filter', both.every(r => r.includes('mushrooms')), both)
  check('...and duplicates collapse', compileFoodDislikes([
    fact({ hardness: 'soft', resolved_refs: ['egg'] }), fact({ hardness: 'hard', resolved_refs: ['egg'] }),
  ]).length === 1)
  check('...and a row that resolved to nothing adds nothing',
    compileFoodDislikes([fact({ resolved_refs: [] })]).length === 0)
}

const src = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log('\n4. The client decides this, not the model')
// A prompt is advisory and needs a deploy. The guarantee has to be the half
// that ships with the app.
check('a food dislike is forced hard on the way in',
  /kind === 'food_preference' && polarity === 'dislike'\s*\n\s*\? 'hard'/.test(src))
// Sliced to the record_fact preference branch, not searched file-wide: there
// are five `const displayText` in this component and a file-wide indexOf found
// the first one, 40 lines ABOVE the code under test. A positional check keyed
// on a non-unique string is a check about the wrong code.
{
  const from = src.indexOf("if (kind === 'food_preference' || kind === 'exercise_preference') {")
  const to = src.indexOf('const row = await createFact(', from)
  const branch = from >= 0 && to > from ? src.slice(from, to) : ''
  check('the record_fact preference branch was located', branch.length > 0, { from, to })
  check('...and hardness is settled before the receipt wording reads it',
    branch.indexOf("? 'hard'") < branch.indexOf('const displayText'))
  check('...with the override inside that branch, not somewhere else',
    /kind === 'food_preference' && polarity === 'dislike'/.test(branch))
}
check('...so the receipt says "won\'t eat/do", not "not keen on"',
  /hardness === 'hard' \? "won't eat\/do" : 'not keen on'/.test(src))

console.log('\n5. The warning that stayed silent is no longer gated on hardness')
check('today\'s-plan check runs for any food dislike',
  /if \(kind === 'food_preference' && polarity === 'dislike'\) \{/.test(src))
check('...and no longer requires it to have been filed as hard',
  !/kind === 'food_preference' && hardness === 'hard' && polarity === 'dislike'/.test(src))

console.log('\n6. The model is told, so its reply matches what happened')
const prompt = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
check('food dislikes are called out as always hard', /which is ALWAYS hard however mildly they put it/.test(prompt))
check('...with the app named as the thing that enforces it', /The app enforces this itself and will override a soft value/.test(prompt))
check('...and the exception scoped to dislikes only', /This exception is for food DISLIKES only/.test(prompt))
check('the soft/hard distinction survives for everything else',
  /'soft' = a lean, not a ban/.test(prompt))

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}

console.log('\nAll food-dislike checks passed.')
