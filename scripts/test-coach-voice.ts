// ---------------------------------------------------------------------------
// ONE VOICE — the gate for the half of it that can be measured for free.
//
// `CLAUDE.md` carried "One voice, every time — tone probes only; UNGUARDED"
// until 15 Sep 2026, and the tag was right for a reason worth stating: every
// probe that observes the coach's voice posts to the deployed edge function and
// needs credentials a cloud session does not have, so the one thing measuring
// voice could never run here. Meanwhile several hundred sentences the APP puts
// in the coach's mouth — card leads, receipts, refusals, floors — were measured
// by nothing at all. `docs/audits/the-coachs-own-words-2026-09-15.md` counted
// them and found three grammars for one job, eight wordings of one failure, and
// three narrators in one file.
//
// This is that half, held. It says nothing about the model's own voice, which
// stays probe-only and still unrun.
//
// WHAT IT PINS, and each is a PROPERTY rather than a sentence. `test:chat-app-
// reality` is the cautionary tale in this repo: it asserted the prompt MENTIONED
// the grocery list, the list moved off the Tools tab, the gate stayed green on a
// prompt that had gone stale, and then failed the CORRECTED prompt. A gate that
// pins wording does not merely miss a drift — it can enforce one. So nothing
// here asserts what any sentence SAYS.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { ask, whichOne, didNotSave, couldNot, SCOPE, GOAL_TERMS, RECEIPTS } from '../src/lib/coach-voice'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
/** Comments are BLANKED, never deleted — a deleted line renumbers everything after it. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
   .split('\n').map(l => (/^\s*\/\//.test(l) ? '' : l)).join('\n')

const VOICE = 'src/lib/coach-voice.ts'

// ---------------------------------------------------------------------------
console.log('\n[1] The phrasebook stays cheap to import\n')
// ---------------------------------------------------------------------------
// `tradeoff-shape.ts:1-22` records what a careless import here costs: pulling
// edit-tradeoff into the nutrition sheet dragged the 5,000-line exercise
// catalogue and the plan scorer into the main chunk and tripped test:bundle.
// This module is imported by the chat client AND the nutrition path, so it must
// not become that seam again.
//
// The property is TRANSITIVE WEIGHT, not "no imports". A rule of "type-only
// imports, nothing else" would be easy to write and wrong: the one runtime
// re-export (edit-reason, itself a leaf) costs nothing and prevents a second
// copy of the safety text.
const HEAVY = ['exercise-db', 'exercise-plan', 'quality-score', 'supabase', 'meal-']
// BOTH EDGES. The first version matched only `import … from './x'` and missed
// `export { … } from './x'` — which is this module's ONLY runtime edge, so the
// graph came back empty and check 1 passed while measuring nothing. Caught by
// the companion check below, which exists for exactly this.
const runtimeImportsOf = (file: string): string[] =>
  [...strip(read(file)).matchAll(/^(?:import|export)\s+(?!type\b)[\s\S]*?from\s+'(\.[^']+)'/gm)]
    .map(m => m[1])
const resolveFrom = (file: string, spec: string) => {
  const base = join(dirname(file), spec)
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    try { if (statSync(resolve(process.cwd(), c)).isFile()) return c } catch { /* next */ }
  }
  return null
}
const graph: string[] = []
const walk = (file: string, seen = new Set<string>()) => {
  if (seen.has(file)) return
  seen.add(file)
  for (const spec of runtimeImportsOf(file)) {
    const r = resolveFrom(file, spec)
    if (!r) continue
    graph.push(r)
    walk(r, seen)
  }
}
walk(VOICE)
const heavyHits = graph.filter(g => HEAVY.some(h => g.includes(h)))
check('nothing heavy is reachable from it at runtime', heavyHits.length === 0, heavyHits)
// A POSITIVE CONTROL, because "empty" is now the CORRECT answer. The first
// version asserted the graph was non-empty, on the reasoning that an empty
// result probably meant a broken walker — true at the time, since the module
// re-exported the safety text. Removing that dead re-export made the module a
// true leaf, and the guard then failed on exactly the state it wanted.
// So the walker is proved on a file KNOWN to have runtime imports instead, and
// the phrasebook is then allowed to be empty.
const controlGraph: string[] = []
{
  const keep = graph.slice()
  graph.length = 0
  walk('src/lib/edit-tradeoff.ts')
  controlGraph.push(...graph)
  graph.length = 0
  graph.push(...keep)
}
check('...and the walker works, proved on a module that really does import things',
  controlGraph.length > 0, controlGraph.length)
check('...so the phrasebook importing nothing at runtime is a fact, not a broken read',
  graph.length === 0, graph)

// ---------------------------------------------------------------------------
console.log('\n[2] EVERY proposal card asks — none is silent\n')
// ---------------------------------------------------------------------------
// THE CHECK THAT WOULD HAVE CAUGHT THE NINE. Before 15 Sep 2026 half the
// builders rendered a bare before/after table with no spoken line, the exercise
// swap among them, and nothing noticed because nothing was looking.
//
// The builder list is DERIVED from the source, never written here: a list in
// this file would be one the next new card could quietly fail to join, which is
// exactly how the nine accumulated.
const chat = strip(read('src/components/ChatAssistant.tsx'))
const builderNames = [...chat.matchAll(/const (build\w*Proposal) = /g)].map(m => m[1])
check('it found the builders to check (derived, not listed here)', builderNames.length >= 15, builderNames.length)
const starts = builderNames.map(n => chat.indexOf(`const ${n} = `))
const bodies = builderNames.map((n, i) => chat.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : chat.length))
const silent = builderNames.filter((_, i) => !/\blead:/.test(bodies[i]))
check('every builder emits a lead', silent.length === 0, silent)
const notAsking = builderNames.filter((_, i) => /\blead:/.test(bodies[i]) && !/ask\(/.test(bodies[i]))
check('...and every lead is built through ask(), not hand-written', notAsking.length === 0, notAsking)

// ---------------------------------------------------------------------------
console.log('\n[3] One grammar, proved by running it\n')
// ---------------------------------------------------------------------------
// EXECUTED, not read. A source check could confirm the string "Want me to"
// appears and learn nothing about what a person sees. Ashley chose this grammar
// on 15 Sep 2026 from three, with the card mocked up for each.
check('ask() opens the same way every time', ask('take X out of Monday').startsWith('Want me to '), ask('x'))
check('...and always ends as a question', ask('do the thing').endsWith('?'), ask('do the thing'))
check('...and cannot be half-applied — punctuation the caller left is normalised',
  ask('do the thing.') === ask('do the thing') && ask('do the thing?') === ask('do the thing'),
  [ask('do the thing.'), ask('do the thing?')])
// The chips and the cards drifted apart for weeks: a card said "I'll mark Monday
// as a rest day… Shall I?" while the chip for the SAME action said "Want me to
// mark that as a rest day?", 945 lines away in one file.
const chipTexts = [...chat.matchAll(/return '(Want me to [^']+)'/g)].map(m => m[1])
check('the quick-reply chips use the card grammar too', chipTexts.length > 0, chipTexts.length)
check('...all of them', chipTexts.every(t => t.startsWith('Want me to ') && t.endsWith('?')), chipTexts)

// ---------------------------------------------------------------------------
console.log('\n[4] Every export is CALLED, not merely imported\n')
// ---------------------------------------------------------------------------
// WRITTEN BECAUSE test:no-dead-code MISSED THIS, 15 Sep 2026. Three exports of
// mine — whichOne, RECEIPTS, SCOPE — were dead for a whole commit: two imported
// into ChatAssistant and never called, one imported nowhere. That gate catches
// an unreferenced export, so it looks like it covers the class, but an unused
// IMPORT and an exported const nobody imports both slip past it, and tsc does
// not catch them either (noUnusedLocals is off).
//
// It matters beyond tidiness: a phrasebook entry no surface reads is the exact
// defect the audit's Finding 6 recorded — GOAL_NOUN, four goals, one call site,
// inside a string nothing renders. Words written for a person that no person
// ever sees.
const SRC = 'src'
const allSources: string[] = []
const collect = (d: string) => {
  for (const e of readdirSync(resolve(process.cwd(), d))) {
    const p = join(d, e)
    if (statSync(resolve(process.cwd(), p)).isDirectory()) collect(p)
    else if (/\.tsx?$/.test(p) && p !== VOICE) allSources.push(p)
  }
}
collect(SRC)
const corpus = allSources.map(f => strip(read(f))).join('\n')
const exported = [...read(VOICE).matchAll(/^export (?:const|function) (\w+)/gm)].map(m => m[1])
check('it found the exports to check', exported.length >= 7, exported)
for (const name of exported) {
  // USED, which is not the same as CALLED. The first version required a
  // trailing ( [ or . — right for ask() and RECEIPTS[], wrong for a plain
  // string constant like NOT_LOADED_YET, which is passed as a value and
  // never called. It reported both constants dead when both had five call
  // sites. A bare mention is the correct test here, and it is still sound
  // because the corpus has its comments blanked and its import lines removed:
  // the two things that could satisfy a name-match without using it.
  const used = new RegExp(`\\b${name}\\b`).test(corpus.replace(/^\s*import[\s\S]*?from '[^']+'$/gm, ''))
  check(`${name} is called somewhere outside the phrasebook`, used)
}

// ---------------------------------------------------------------------------
console.log('\n[5] The safety text has exactly one copy\n')
// ---------------------------------------------------------------------------
// Ashley's pain ruling of 15 Sep 2026 is a rule about the APP: every surface
// where somebody says something hurts asks the same three questions, and the
// third answer names a professional and changes nothing. A second copy of those
// words would be a second thing to drift, and the half that drifted would be the
// half nobody re-read. Same shape as test:coach-rules-sync.
const voiceSrc = read(VOICE)
// THIS CHECK PINNED A MECHANISM AND HAD TO GO. It required the phrasebook to
// RE-EXPORT the safety text — but nobody imported it from here, so the
// re-export was dead code, and it was the module's only runtime edge, which
// tipped test:bundle's re-download to its ceiling. The rule was never "re-export
// it"; it was "do not keep a second copy", which the check below states directly.
check('the phrasebook does not own safety text at all',
  !/RED_FLAG_ADVICE|HURT_KINDS/.test(strip(voiceSrc).replace(/^import[\s\S]*?$/gm, '')),
  strip(voiceSrc).match(/.{0,60}(RED_FLAG_ADVICE|HURT_KINDS).{0,40}/)?.[0])
// THE QUOTE CLASS MUST RESPECT WHICH QUOTE OPENED THE STRING. A flat [^'"`]
// stops at the apostrophe in "That's", so this matched four characters, failed
// the {20,} and reported the safety text missing. Second time today the same
// bug bit — the first was in test:what-happened this morning — which is why it
// is written down here rather than just fixed.
const advice = read('src/lib/edit-reason.ts').match(/RED_FLAG_ADVICE =\s*(['"`])((?:(?!\1).){20,})/)
check('...and the one copy is where it always was', !!advice, advice?.[2]?.slice(0, 60))
check('...and the phrasebook does not contain a second copy of it',
  advice ? !strip(voiceSrc).includes(advice[2].slice(0, 40)) : false)

// ---------------------------------------------------------------------------
console.log('\n[6] The narrator is one person\n')
// ---------------------------------------------------------------------------
// The audit found "I", "We", a bare "Couldn't" and the passive reporting the
// same class of failure inside src/App.tsx alone.
check('couldNot() speaks in the first person', couldNot('do that').startsWith("I couldn't "), couldNot('do that'))
check('didNotSave() names what failed', didNotSave('The swap').startsWith('The swap'), didNotSave('The swap'))
// IT MUST NOT CLAIM NOTHING CHANGED. It did in its first draft, which reads as
// reassuring and is false at pending-action-executor.ts:1025 — the shorten path
// pushes to `landed` and returns the new mesocycle BEFORE saving, so the session
// on screen really is shorter and only the persistence failed. That sentence
// would have contradicted the landed line printed beside it.
check('...and does not claim the app is unchanged, which is not true at every call site',
  !/nothing (has )?changed|unchanged/i.test(didNotSave('The swap')), didNotSave('The swap'))
check('whichOne() asks about the thing, not "which one"', whichOne('exercise', 'move').includes('exercise'), whichOne('exercise', 'move'))

// ---------------------------------------------------------------------------
console.log('\n[7] The tables are complete and distinct\n')
// ---------------------------------------------------------------------------
// A receipt title pair with a missing half, or two kinds sharing a sentence,
// is how the register collapsed in the first place.
const kinds = Object.keys(RECEIPTS)
check('every receipt kind has both halves', kinds.every(k => !!RECEIPTS[k].done && !!RECEIPTS[k].failed), kinds.length)
check('...successes are short — what happened, not a sentence',
  kinds.every(k => RECEIPTS[k].done.split(' ').length <= 3),
  kinds.filter(k => RECEIPTS[k].done.split(' ').length > 3).map(k => RECEIPTS[k].done))
check('...failures all speak in the first person',
  kinds.every(k => RECEIPTS[k].failed.startsWith("I couldn't")),
  kinds.filter(k => !RECEIPTS[k].failed.startsWith("I couldn't")).map(k => RECEIPTS[k].failed))
const goals = Object.keys(GOAL_TERMS) as (keyof typeof GOAL_TERMS)[]
check('every goal has its own words', goals.length === 4 && goals.every(g => !!GOAL_TERMS[g].noun && !!GOAL_TERMS[g].whyProtein), goals)
check('...and no two goals share a noun', new Set(goals.map(g => GOAL_TERMS[g].noun)).size === goals.length)
check('the three scopes say three different things',
  new Set([SCOPE.today('Monday'), SCOPE.thisWeek('Monday'), SCOPE.restOfBlock]).size === 3)

console.log(failures === 0 ? '\nOne voice, in the words the app writes itself.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
