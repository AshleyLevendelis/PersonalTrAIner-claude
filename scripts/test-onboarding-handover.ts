// ---------------------------------------------------------------------------
// ONBOARDING HANDS THE APP OVER BEFORE THE MEALS, NOT AFTER THEM.
//
// Ashley, on her phone, having just finished onboarding: a full-screen spinner
// reading "Building your meal pools..." and nothing else — no tabs, no plan,
// no way past it. Her question was whether the app and its tour could load
// while the meals finish in the background.
//
// They could, and the wait was worse than it looked. By the time that spinner
// appeared the training plan was already generated AND already written to the
// database; the only work left was meal generation, which is up to three
// sequential edge-function calls against a 45s abort each. The blocking was
// never designed — the whole-app gate is `!profile`, and setProfile simply
// happened to sit below the meal `await` along with every other state commit,
// including the one that arms the tour.
//
// SO THE FEATURE *IS* AN ORDERING, which is why it needs a gate of its own.
// Nothing in the suite renders App or completes onboarding in a browser (the
// closest, test-onboarding-reachable, steers TO the onboarding screen and
// stops there), so there is no runtime check that would notice these lines
// drifting back below the await. tsc will not: both orders compile, both
// orders run, and the only symptom is a minute of spinner that no test sees.
// A source-order assertion is a weak instrument in general and the right one
// here — it is testing the exact property that was wrong.
//
// The other half is the hazards the reordering introduced, each of which is a
// real defect that source order alone would happily allow:
//
//   §2  the insert-failure path still commits, or a user whose profile did not
//       save is bounced back into onboarding with the warning nowhere
//   §3  the late result cannot land on the wrong profile, or overwrite meals
//       something else put there while it was in flight
//   §4  a failure says so, instead of the console.error a blocking screen
//       could get away with
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 200)}` : ''}`) }
}

const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
/** Comments record why the order is what it is; they must not be able to satisfy a check about the order itself. */
const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const handlerStart = code.indexOf('const handleOnboardingComplete = async')
const handlerEnd = code.indexOf('const persistLegacyExercisePlan', handlerStart)
const handler = code.slice(handlerStart, handlerEnd)

console.log('\n1. The app is committed BEFORE the meal build, not after it')
{
  check('the handler was located, so these checks have teeth', handlerStart > 0 && handler.length > 2000, handler.length)

  const commitAt = handler.indexOf('commitPlan()')
  const buildAt = handler.indexOf('startInitialMealBuild(')
  check('the plan is committed through one named function', commitAt > 0, commitAt)
  check('the meal build is started through one named function', buildAt > 0, buildAt)
  // THE WHOLE FEATURE, AS ONE LINE.
  check('the app is handed over before the meals are started', commitAt > 0 && buildAt > 0 && commitAt < buildAt, { commitAt, buildAt })

  // The commits themselves. If any of these drifts out of commitPlan and back
  // below the build, that surface waits on meals again.
  const commitBody = /const commitPlan = \(\) => \{([\s\S]*?)\n {4}\}/.exec(handler)?.[1] ?? ''
  check('commitPlan was located', commitBody.length > 100, commitBody.length)
  for (const setter of ['setProfile(', 'setMacros(', 'setTourArmed(true)', 'setExercisePlan(', 'setMesocycle(', 'setMesocycleCreatedAt(', 'setLatestWeightKg(']) {
    check(`...and commits ${setter}`, commitBody.includes(setter), setter)
  }

  // Not awaited. An `await` here restores the exact bug: the function would
  // once again not return until the meals were done.
  check('the meal build is NOT awaited', !/await startInitialMealBuild/.test(handler))
  check('...and nothing else awaits generateMealPools inside the handler', !/await generateMealPools/.test(handler))

  // The blocking screen loses its second status line, because there is no
  // longer a meal phase to narrate.
  check('the blocking screen no longer narrates a meal phase', !/Building your meal pools/.test(code))
  check('...and still exists for the part that genuinely blocks', /setGeneratingStatus\('Calculating your macro targets/.test(code))
}

console.log('\n2. A profile that failed to save still gets the app')
{
  // The commits used to sit OUTSIDE `if (data)`, and that was load-bearing: a
  // failed insert sets unsavedProfileWarning and the app must still come up so
  // that warning has somewhere to render. Moving them inside — the obvious way
  // to write this change — drops that user back into onboarding instead.
  check('the insert failure still sets a warning', /setUnsavedProfileWarning\(/.test(handler))
  check('...and the app is still committed when there is no saved row', /if \(!data\) commitPlan\(\)/.test(handler))
  // Ordering: the id has to be on the profile before it is committed, or the
  // tour renders nothing and the tabs key off undefined. enrichedProfile is
  // mutated in place, so a later assignment would not even re-render.
  const idAt = handler.indexOf('enrichedProfile.id = data.id')
  check('the profile id is assigned before the commit', idAt > 0 && idAt < handler.indexOf('commitPlan()'), idAt)
}

console.log('\n3. A late result cannot land on the wrong profile or clobber newer meals')
{
  const buildFn = /const startInitialMealBuild = \([\s\S]*?\n {2}\}/.exec(code)?.[0] ?? ''
  check('startInitialMealBuild was located', buildFn.length > 400, buildFn.length)

  // The guard must be the ref, not `profile`. The .then closes over the render
  // that started the build, where profile is null and stays null — a
  // profile-state guard there would never fire, and would read as correct.
  check('the result is guarded on the live profile ref', /activeProfileIdRef\.current !== profileId/.test(buildFn))
  check('...not on the profile state, which is null in that closure forever',
    !/profile\?\.id === profileId|profile\?\.id !== profileId/.test(buildFn))
  check('the ref is kept in sync with the profile', /activeProfileIdRef\.current = profile\?\.id \?\? null/.test(code))
  // Set synchronously at commit time too: the build can resolve before React
  // flushes the mirror effect, and would then discard its own result.
  check('...and set synchronously at commit, so a fast build is not discarded',
    /activeProfileIdRef\.current = enrichedProfile\.id \?\? null/.test(code))

  // Merge, not replace. Four other things write mealPools; a build landing
  // late must not blank what one of them just put there.
  check('pools are merged per slot, not assigned wholesale', /setMealPools\(prev => \{/.test(buildFn))
  check('...and only where the new options are non-empty', /filled/.test(buildFn) && !/setMealPools\(result\.accepted\)/.test(buildFn))

  // The one meal path with no button to disable, because it is reached from
  // the coach chat rather than a control.
  check('find-more-options refuses while the first build is running',
    /if \(initialMealBuild\) return \{ added: \[\]/.test(code))
}

console.log('\n4. A failed background build says so')
{
  const buildFn = /const startInitialMealBuild = \([\s\S]*?\n {2}\}/.exec(code)?.[0] ?? ''
  check('a failure reaches the screen, not just the console', /setMealRegenerateError\(/.test(buildFn))
  // The distinction that matters most on this path: "nothing fits your
  // targets" is deterministic and worth naming a fix for; "could not reach the
  // generator" is transient and retrying really is the advice.
  check('...and keeps the reached-vs-unreachable split', /result\.generatorReached/.test(buildFn))
  // Neither line may claim an existing plan was preserved: on a first build
  // there is nothing to preserve. That wording belongs to the regenerate
  // handlers and is false here.
  const strings = [...buildFn.matchAll(/setMealRegenerateError\(\s*([\s\S]*?)\n\s*\)/g)].map(m => m[1])
  check('...without claiming an existing plan is unchanged',
    strings.length > 0 && !strings.some(s => /existing plan is unchanged|kept what you had/i.test(s)), strings.length)
  check('the build clears any stale error before it starts', /setMealRegenerateError\(null\)/.test(buildFn))
}

console.log('\n5. The meals area says it is building for ANY build, not just the first')
{
  // RE-ANCHORED 7 Sep 2026, and the reason is the whole point of this section.
  //
  // Yesterday this asserted an `initialBuild` prop: the building state existed
  // only for the background build after onboarding. The next morning Ashley
  // pressed "Generate meals" on the empty state. It ran for 34 seconds and
  // wrote thirteen meals — and for all 34 seconds the screen still read "No
  // meal plan generated yet" over a button wearing a small spinner, because a
  // user-pressed build was not "the first build". She reported it as dead.
  //
  // So the checks now pin the WIDER rule and, deliberately, forbid the narrow
  // one coming back: any build with nothing yet to show says so.
  const mealPlan = readFileSync(join(ROOT, 'src/components/MealPlan.tsx'), 'utf8')
  const nutrition = readFileSync(join(ROOT, 'src/components/NutritionDisplay.tsx'), 'utf8')

  const emptyBranch = /if \(activeSlots\.length === 0 && emptySlots\.length === 0\) \{([\s\S]*?)\n {2}\}/.exec(mealPlan)?.[1] ?? ''
  check('the empty branch was located (sanity check on this check)', emptyBranch.length > 200, emptyBranch.length)
  // Asserted as STRUCTURE, not as "the token appears somewhere". The first
  // version of this check tested `/\{isGenerating \?/` and passed happily with
  // the branch deleted, because the Generate button's own spinner icon is
  // `{isGenerating ? <Loader2 .../> : <RefreshCw .../>}` — the same token,
  // three lines further down, testing nothing. Two mutations survived on it.
  const choose = emptyBranch.indexOf('{isGenerating ? (')
  const building = emptyBranch.indexOf('Building your meals')
  const otherwise = emptyBranch.indexOf(') : (')
  const generate = emptyBranch.indexOf('Generate meals')
  check('a build in progress is what chooses what this branch renders', choose >= 0, choose)
  check('...with the building copy on the true side', choose < building && building < otherwise,
    { choose, building, otherwise })
  check('...and the Generate button only on the other side', otherwise < generate, { otherwise, generate })
  check('...while keeping the genuine empty state for when nothing is running',
    /No meal plan generated yet/.test(emptyBranch) && /Generate meals/.test(emptyBranch))
  // The narrow flag must not return. It is gone from both components, and a
  // first-build-only condition here is the defect, not a refinement of it.
  check('no first-build-only flag decides it any more',
    !/initialBuild/.test(mealPlan) && !/initialMealBuild/.test(nutrition))

  const appCode = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('App folds the background build into the flag the meals area reads',
    /isGeneratingMeals=\{isGeneratingMeals \|\| initialMealBuild\}/.test(appCode))
  check('...and the tour holds for any build with nothing to show, not just the first',
    /mealsPending=\{\(isGeneratingMeals \|\| initialMealBuild\) &&/.test(appCode))
}

console.log('\n6. A round that succeeds is saved before the next one is asked for')
{
  // THE BUG THIS SECTION EXISTS FOR, and it cost a real user a real plan.
  //
  // 6 Sep, 19:31 UTC: onboarding ran two generation rounds — 14.1s and 8.3s,
  // both HTTP 200, both producing meals — and then the page went away before
  // the third finished. persistPools was called ONCE, after the loop. Every
  // meal from both successful rounds was discarded, and Ashley woke up to an
  // empty Nutrition tab with nothing anywhere saying a thing had happened.
  //
  // Her ruling when asked what a partial plan should do: keep what it got.
  const gen = readFileSync(join(ROOT, 'src/lib/meal-generation.ts'), 'utf8')
  const loop = /for \(let round = 0; round < MAX_GENERATION_ROUNDS; round\+\+\) \{([\s\S]*?)\n {2}\}\n/.exec(gen)?.[1] ?? ''
  check('the generation loop was located (sanity check on this check)', loop.length > 500, loop.length)

  // The property, stated as position: the commit happens INSIDE the loop.
  check('each round commits what it won before the next request goes out',
    /commitProgress\(\)/.test(loop))
  check('...and the commit really writes, rather than only counting',
    /const commitProgress = async \(\) => \{[\s\S]{0,600}await persistPools\(/.test(gen))
  // A trailing-only persist is exactly what was there before. If the only
  // persistPools call drifts back below the loop, this fails.
  const afterLoop = gen.slice(gen.indexOf('const shortfalls = activeSlots'))
  check('...and nothing relies on a single write after the loop',
    !/await persistPools\(/.test(afterLoop), afterLoop.slice(0, 120))
  // "Find more options" is the one path that must NOT write per round: its
  // pool_index base is read up front, so repeated writes collide on it.
  check('the append path still writes once, at the end', /await appendPools\(/.test(afterLoop))
  check('...and is skipped by the per-round commit', /if \(!params\.appendToExisting\) await commitProgress\(\)/.test(loop))
}

console.log('\n7. A failed read of the meals does not masquerade as an empty one')
{
  // getPools answered a failed read with `{}`, which the Nutrition tab renders
  // as "No meal plan generated yet" — telling someone whose meals exist to go
  // and make them again, and pointing them at a button that deletes and
  // rewrites the plan they still had.
  const store = readFileSync(join(ROOT, 'src/lib/meal-store.ts'), 'utf8')
  check('there is a read that reports whether it worked', /export async function readPools\(/.test(store))
  check('...which says so rather than returning silence', /return \{ pools: \{\}, failed: true \}/.test(store))
  check('...and leaves a trace in the console too', /console\.error\('Reading meal pools failed/.test(store))
  check('getPools still exists for callers that genuinely want empty-on-failure',
    /export async function getPools\(/.test(store))

  const appCode = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('the restore path uses the reporting read', /readPools\(ownedId\)/.test(appCode))
  check('...and tells the user when it failed', /if \(restoredPools\.failed\)/.test(appCode))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nThe plan is handed over the moment it is built; the meals catch up on their own.\n')
